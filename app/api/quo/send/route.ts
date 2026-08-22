import { type NextRequest, NextResponse } from 'next/server'
import {
  resolveSendContext,
  loadRecipients,
  sendToRecipient,
  renderTemplate,
} from '@/lib/quo-send'
import { normalizePhoneE164 } from '@/lib/quo-api'

/**
 * Send a single SMS from the company's Quo line.
 *
 * Two shapes are accepted:
 *   { customerId | leadId, body }  -> looks the contact up, enforces opt-out
 *   { phone, body }                -> ad-hoc number (still logged)
 *
 * The Quo API key is only ever read server-side inside lib/quo-api.
 */
export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { ctx } = resolved

    const payload = (await req.json().catch(() => null)) as {
      customerId?: string
      leadId?: string
      phone?: string
      body?: string
      appendStopFooter?: boolean
    } | null

    if (!payload) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const template = (payload.body ?? '').trim()
    if (!template) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }
    // SMS segments at 160 chars; refuse absurd payloads rather than surprising
    // the user with a long multi-segment bill.
    if (template.length > 1600) {
      return NextResponse.json(
        { error: 'Message is too long (max 1600 characters)' },
        { status: 400 },
      )
    }

    // --- contact-based send ---------------------------------------------------
    if (payload.customerId || payload.leadId) {
      const recipients = await loadRecipients(ctx.companyId, {
        customerIds: payload.customerId ? [payload.customerId] : [],
        leadIds: payload.leadId ? [payload.leadId] : [],
      })
      const recipient = recipients[0]
      if (!recipient) {
        // Either the id doesn't exist or it belongs to another company.
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      const outcome = await sendToRecipient(ctx, recipient, template, {
        appendStopFooter: payload.appendStopFooter ?? false,
      })

      return NextResponse.json(
        { result: outcome },
        { status: outcome.status === 'failed' ? 502 : 200 },
      )
    }

    // --- ad-hoc number send --------------------------------------------------
    const normalized = normalizePhoneE164(payload.phone)
    if (!normalized) {
      return NextResponse.json(
        { error: 'A valid customerId, leadId, or phone number is required' },
        { status: 400 },
      )
    }

    const outcome = await sendToRecipient(
      ctx,
      { id: normalized, kind: 'adhoc', name: null, phone: normalized },
      renderTemplate(template, { name: null }),
      { appendStopFooter: payload.appendStopFooter ?? false },
    )

    return NextResponse.json(
      { result: outcome },
      { status: outcome.status === 'failed' ? 502 : 200 },
    )
  } catch (err) {
    console.error(
      '[Quo send] Unexpected error:',
      err instanceof Error ? err.message : 'unknown',
    )
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
