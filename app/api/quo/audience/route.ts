import { NextResponse } from 'next/server'
import { resolveSendContext, loadAudience } from '@/lib/quo-send'

/**
 * The deduped, opt-out-aware recipient list for the bulk composer.
 *
 * Computed server-side so the browser never needs the Quo key and cannot be the
 * source of truth for who is safe to text.
 */
export async function GET() {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const audience = await loadAudience(resolved.ctx.companyId)
    return NextResponse.json({
      fromNumber: resolved.ctx.fromNumber,
      ...audience,
    })
  } catch (err) {
    console.error(
      '[Quo audience] Unexpected error:',
      err instanceof Error ? err.message : 'unknown',
    )
    return NextResponse.json({ error: 'Failed to load recipients' }, { status: 500 })
  }
}
