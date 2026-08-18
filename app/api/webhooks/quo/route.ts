import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  activityTypeFor,
  normalizePhone,
  parseQuoEvent,
  verifyQuoSignature,
} from '@/lib/quo-webhook'

/**
 * Quo webhook receiver.
 *
 * Contract we hold ourselves to:
 *  1. NEVER lose a delivery. We persist the raw payload first; matching a company,
 *     lead, or customer is best-effort and happens after the row exists.
 *  2. Idempotent. `quo_events.quo_event_id` is UNIQUE, so Quo's retries upsert
 *     rather than duplicate.
 *  3. Return 2xx for anything we've durably stored — including events we can't
 *     classify — so Quo stops retrying. Only signature failures and genuine
 *     storage errors return non-2xx.
 */

// Node runtime: we need `crypto` for HMAC verification.
export const runtime = 'nodejs'
// Never cache a webhook.
export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // Read the raw body BEFORE parsing — signature is computed over exact bytes.
  const body = await req.text()

  const secret = process.env.QUO_WEBHOOK_SECRET
  if (secret) {
    const result = verifyQuoSignature({
      body,
      svixId: req.headers.get('svix-id') ?? req.headers.get('webhook-id'),
      svixTimestamp:
        req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp'),
      svixSignature:
        req.headers.get('svix-signature') ?? req.headers.get('webhook-signature'),
      secret,
    })
    if (!result.ok) {
      console.error('[Quo Webhook] Signature verification failed:', result.reason)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    // Fail loudly in logs but keep accepting, so setup order (deploy URL before
    // secret) doesn't silently drop real events.
    console.warn(
      '[Quo Webhook] QUO_WEBHOOK_SECRET not set — accepting UNVERIFIED request. Set it to enable verification.',
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    // Malformed JSON will never succeed on retry, so 400 and stop.
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseQuoEvent(payload)
  if (!parsed) {
    // No usable event id: we can't dedupe it, so don't store it. 202 prevents an
    // infinite retry loop over a payload we structurally can't handle.
    console.warn('[Quo Webhook] Unrecognized payload shape, ignoring')
    return NextResponse.json({ received: true, stored: false }, { status: 202 })
  }

  const supabase = getSupabaseAdmin()

  // ── Resolve tenant from Quo's orgId via companies.settings->>'quo_org_id'
  let companyId: string | null = null
  if (parsed.quoOrgId) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('settings->>quo_org_id', parsed.quoOrgId)
      .maybeSingle()
    companyId = company?.id ?? null
  }

  // ── Best-effort match to an existing lead or customer by phone.
  // Both stay null when unmatched; the event is still recorded.
  let leadId: string | null = null
  let customerId: string | null = null

  if (parsed.contactNumber) {
    // Phone formats are inconsistent in this DB ('(559) 930-5181' vs '5599602286'),
    // so compare on the last 10 digits rather than raw equality.
    const suffix = parsed.contactNumber

    const customerQuery = supabase
      .from('customers')
      .select('id, phone')
      .not('phone', 'is', null)
    if (companyId) customerQuery.eq('company_id', companyId)
    const { data: customers } = await customerQuery.limit(500)
    customerId =
      customers?.find((c) => normalizePhone(c.phone) === suffix)?.id ?? null

    if (!customerId) {
      const leadQuery = supabase.from('leads').select('id, phone')
      if (companyId) leadQuery.eq('company_id', companyId)
      const { data: leads } = await leadQuery.limit(500)
      leadId = leads?.find((l) => normalizePhone(l.phone) === suffix)?.id ?? null
    }
  }

  // ── Persist the event (idempotent on quo_event_id)
  const { data: saved, error: saveError } = await supabase
    .from('quo_events')
    .upsert(
      {
        quo_event_id: parsed.quoEventId,
        company_id: companyId,
        quo_org_id: parsed.quoOrgId,
        event_type: parsed.eventType,
        kind: parsed.kind,
        direction: parsed.direction,
        status: parsed.status,
        from_number: parsed.fromNumber,
        to_number: parsed.toNumber,
        contact_number: parsed.contactNumber,
        body: parsed.body,
        duration_seconds: parsed.durationSeconds,
        recording_url: parsed.recordingUrl,
        occurred_at: parsed.occurredAt,
        raw: payload as Record<string, unknown>,
        lead_id: leadId,
        customer_id: customerId,
      },
      { onConflict: 'quo_event_id' },
    )
    .select('id, lead_activity_id')
    .single()

  if (saveError) {
    // Real storage failure — return 500 so Quo retries.
    console.error('[Quo Webhook] Failed to store event:', saveError.message)
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
  }

  // ── Mirror onto the lead timeline so calls/texts show up in the D2D flow.
  // Only when it resolved to a lead, and only once per event.
  const activityType = activityTypeFor(parsed.kind)
  if (leadId && activityType && companyId && !saved?.lead_activity_id) {
    // lead_activities.user_id is NOT NULL and a webhook has no session user, so
    // attribute the activity to the company owner.
    const { data: company } = await supabase
      .from('companies')
      .select('owner_user_id')
      .eq('id', companyId)
      .maybeSingle()

    if (company?.owner_user_id) {
      // Column set is subject / notes / metadata — there is no `description`.
      const dir = parsed.direction ?? 'incoming'
      const subject =
        parsed.kind === 'call'
          ? `${dir === 'outgoing' ? 'Outgoing' : 'Incoming'} call via Quo${
              parsed.status ? ` (${parsed.status})` : ''
            }`
          : `${dir === 'outgoing' ? 'Outgoing' : 'Incoming'} text via Quo`

      const notes =
        parsed.kind === 'call'
          ? parsed.durationSeconds != null
            ? `Duration: ${parsed.durationSeconds}s`
            : null
          : (parsed.body ?? null)

      const { data: activity, error: activityError } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          company_id: companyId,
          user_id: company.owner_user_id,
          activity_type: activityType,
          subject,
          notes,
          metadata: {
            source: 'quo',
            quo_event_id: parsed.quoEventId,
            event_type: parsed.eventType,
            direction: parsed.direction,
            from: parsed.fromNumber,
            to: parsed.toNumber,
            recording_url: parsed.recordingUrl,
          },
        })
        .select('id')
        .single()

      if (activityError) {
        // Non-fatal: the event is already stored, so don't trigger a retry.
        console.error(
          '[Quo Webhook] Could not create lead activity:',
          activityError.message,
        )
      } else if (activity) {
        await supabase
          .from('quo_events')
          .update({ lead_activity_id: activity.id })
          .eq('id', saved.id)
      }
    }
  }

  return NextResponse.json({
    received: true,
    stored: true,
    eventId: parsed.quoEventId,
    kind: parsed.kind,
    linked: { companyId, leadId, customerId },
  })
}

// Some providers probe the endpoint with GET before enabling delivery.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'quo-webhook' })
}
