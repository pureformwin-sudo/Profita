import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  resolveSendContext,
  loadAudience,
  sendToRecipient,
  sendDelay,
  type SendOutcome,
} from '@/lib/quo-send'

/**
 * Hard ceiling on one bulk run. The current book is ~168 distinct numbers, so
 * this leaves room to grow while still refusing a runaway request that would
 * blow through the Quo rate limit and the serverless time budget.
 */
const MAX_BULK_RECIPIENTS = 500

export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { ctx } = resolved

    const payload = (await req.json().catch(() => null)) as {
      body?: string
      /** Normalized phone numbers chosen in the preview step. */
      phones?: string[]
      /** Required: the client must echo back what it thinks it's sending to. */
      confirmCount?: number
      appendStopFooter?: boolean
    } | null

    if (!payload) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const template = (payload.body ?? '').trim()
    if (!template) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }
    if (template.length > 1600) {
      return NextResponse.json(
        { error: 'Message is too long (max 1600 characters)' },
        { status: 400 },
      )
    }

    const selected = Array.isArray(payload.phones) ? payload.phones : []
    if (selected.length === 0) {
      return NextResponse.json({ error: 'No recipients selected' }, { status: 400 })
    }
    if (selected.length > MAX_BULK_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients (max ${MAX_BULK_RECIPIENTS})` },
        { status: 400 },
      )
    }

    // Rebuild the audience server-side rather than trusting the client's list.
    // This re-checks opt-out and company scope at send time, so a stale browser
    // tab cannot text someone who opted out a minute ago.
    const audience = await loadAudience(ctx.companyId)
    const wanted = new Set(selected)
    const targets = audience.entries.filter((e) => wanted.has(e.normalizedPhone))

    // Guard against the client and server disagreeing about the audience size.
    if (
      typeof payload.confirmCount === 'number' &&
      payload.confirmCount !== targets.length
    ) {
      return NextResponse.json(
        {
          error:
            'Recipient list changed since you reviewed it. Reload and confirm again.',
          expected: payload.confirmCount,
          actual: targets.length,
        },
        { status: 409 },
      )
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'None of the selected numbers are still valid recipients' },
        { status: 400 },
      )
    }

    const batchId = randomUUID()
    const results: SendOutcome[] = []

    // Sequential with a small delay: Quo allows 10 writes/sec, and a burst of
    // parallel requests would just trade throughput for 429s.
    for (let i = 0; i < targets.length; i += 1) {
      const entry = targets[i]
      const outcome = await sendToRecipient(
        ctx,
        {
          id: entry.id,
          kind: entry.kind,
          name: entry.name,
          phone: entry.normalizedPhone,
          optedOut: entry.optedOut,
        },
        template,
        { batchId, appendStopFooter: payload.appendStopFooter ?? true },
      )
      results.push(outcome)

      if (i < targets.length - 1) await sendDelay()
    }

    const summary = {
      batchId,
      total: results.length,
      sent: results.filter((r) => r.status === 'sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    }

    return NextResponse.json({ summary, results })
  } catch (err) {
    console.error(
      '[Quo bulk send] Unexpected error:',
      err instanceof Error ? err.message : 'unknown',
    )
    return NextResponse.json({ error: 'Bulk send failed' }, { status: 500 })
  }
}
