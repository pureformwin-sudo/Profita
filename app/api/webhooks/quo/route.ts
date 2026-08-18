import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  activityTypeFor,
  normalizePhone,
  parseQuoEvent,
  verifyQuoSignature,
} from '@/lib/quo-webhook'
import { lookupQuoContactName } from '@/lib/quo-api'

/**
 * Quo (formerly OpenPhone) webhook receiver.
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

/**
 * Log the FULL raw payload once per cold start so field names can be confirmed
 * against real traffic before the mapping is finalized. Set QUO_LOG_RAW=true to
 * log every event instead of just the first.
 */
let hasLoggedRawPayload = false

function logRawPayload(body: string) {
  const always = process.env.QUO_LOG_RAW === 'true'
  if (hasLoggedRawPayload && !always) return
  hasLoggedRawPayload = true
  console.log(
    '[Quo Webhook] ===== RAW INCOMING PAYLOAD (verify field names below) =====',
  )
  console.log(body)
  console.log('[Quo Webhook] ===== END RAW PAYLOAD =====')
}

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

  logRawPayload(body)

  const secret = process.env.QUO_WEBHOOK_SIGNING_SECRET
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
      '[Quo Webhook] No signing secret set — accepting UNVERIFIED request. Set QUO_WEBHOOK_SIGNING_SECRET to enable verification.',
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

  // ── Resolve tenant. Needed for scoping and for the NOT NULL user_id on new rows.
  //
  // Primary key is the Quo-owned business number, NOT an org id. Quo's API exposes
  // no organization identifier anywhere, and its dashboard test payloads omit
  // context.orgId entirely — so an org-id-only lookup can never resolve for test
  // sends and is undiscoverable for real ones. The business number is present on
  // every payload (it is whichever side of from/to is not the contact) and is
  // readable from GET /v1/phone-numbers, so it is both stable and discoverable.
  // orgId is still honored as a fallback in case Quo populates it on live events.
  let companyId: string | null = null
  let ownerUserId: string | null = null

  const businessNumber = normalizePhone(
    parsed.direction === 'outgoing' ? parsed.fromNumber : parsed.toNumber,
  )

  if (businessNumber) {
    const { data: byPhone } = await supabase
      .from('companies')
      .select('id, owner_user_id, settings')
      .not('settings->>quo_phone_number', 'is', null)
      .limit(200)
    const hit = byPhone?.find(
      (c) =>
        normalizePhone(
          (c.settings as Record<string, unknown> | null)?.quo_phone_number as
            | string
            | null,
        ) === businessNumber,
    )
    companyId = hit?.id ?? null
    ownerUserId = hit?.owner_user_id ?? null
  }

  if (!companyId && parsed.quoOrgId) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, owner_user_id')
      .eq('settings->>quo_org_id', parsed.quoOrgId)
      .maybeSingle()
    companyId = company?.id ?? null
    ownerUserId = company?.owner_user_id ?? null
  }

  // ── Match by phone: lead first, then customer.
  //
  // Phone formats are inconsistent in this DB ('(559) 930-5181' vs '5599602286',
  // and leads.phone uses '' rather than NULL), so compare on the last 10 digits
  // instead of raw equality. Results are ordered by created_at so a number that
  // matches several records always resolves to the SAME (oldest) one rather than
  // attaching randomly.
  let leadId: string | null = null
  let customerId: string | null = null
  let createdLead = false

  if (parsed.contactNumber) {
    const suffix = parsed.contactNumber

    // Scope to the company but ALSO include rows with a NULL company_id: most
    // legacy leads in this database predate multi-tenancy (9 of 10 have no
    // company_id). A strict `.eq('company_id', ...)` hides them, which would make
    // the webhook auto-create duplicate leads for contacts that already exist.
    const scope = companyId ? `company_id.eq.${companyId},company_id.is.null` : null

    const leadQuery = supabase
      .from('leads')
      .select('id, phone, created_at')
      .order('created_at', { ascending: true })
    if (scope) leadQuery.or(scope)
    const { data: leads } = await leadQuery.limit(1000)
    leadId = leads?.find((l) => normalizePhone(l.phone) === suffix)?.id ?? null

    // Check customers too — not to link the activity, but to avoid creating a
    // duplicate lead for someone who is already a customer.
    const customerQuery = supabase
      .from('customers')
      .select('id, phone, created_at')
      .not('phone', 'is', null)
      .order('created_at', { ascending: true })
    if (scope) customerQuery.or(scope)
    const { data: customers } = await customerQuery.limit(1000)
    customerId =
      customers?.find((c) => normalizePhone(c.phone) === suffix)?.id ?? null

    // ── Auto-create a lead only when NEITHER a lead nor a customer matches.
    // Requires a resolved company (leads.user_id is NOT NULL); an unmapped org
    // still gets its event stored, just unlinked.
    if (!leadId && !customerId && companyId && ownerUserId) {
      const name = (await lookupQuoContactName(
        parsed.fromNumber ?? parsed.toNumber ?? suffix,
      )) ?? `Quo contact ${suffix.slice(0, 3)}-${suffix.slice(3, 6)}-${suffix.slice(6)}`

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          user_id: ownerUserId,
          name,
          phone: parsed.fromNumber ?? suffix,
          // Both values are CHECK-constrained; 'phone'/'callback' are valid.
          source: 'phone',
          status: 'callback',
          notes: `Auto-created from inbound Quo ${parsed.kind}.`,
        })
        .select('id')
        .single()

      if (leadError) {
        // Non-fatal: still store the event, just unlinked.
        console.error('[Quo Webhook] Could not auto-create lead:', leadError.message)
      } else if (newLead) {
        leadId = newLead.id
        createdLead = true
      }
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

  // ── Log onto the lead timeline so calls/texts show up in the D2D flow.
  // Only when it resolved to a lead, and only once per event.
  const activityType = activityTypeFor(parsed.kind)
  if (leadId && activityType && companyId && ownerUserId && !saved?.lead_activity_id) {
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
        // lead_activities.user_id is NOT NULL and a webhook has no session user,
        // so attribute the activity to the company owner.
        user_id: ownerUserId,
        activity_type: activityType,
        subject,
        notes,
        // NOTE: lead_activities has no `occurred_at` column (only created_at), so
        // Quo's own event timestamp is preserved in metadata instead.
        metadata: {
          source: 'quo',
          quo_event_id: parsed.quoEventId,
          event_type: parsed.eventType,
          direction: parsed.direction,
          occurred_at: parsed.occurredAt,
          from: parsed.fromNumber,
          to: parsed.toNumber,
          duration_seconds: parsed.durationSeconds,
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

  return NextResponse.json({
    received: true,
    stored: true,
    eventId: parsed.quoEventId,
    kind: parsed.kind,
    linked: { companyId, leadId, customerId, createdLead },
  })
}

// Some providers probe the endpoint with GET before enabling delivery.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'quo-webhook' })
}
