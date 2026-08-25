/**
 * Read scored leads, and set or clear a manual home-value override.
 *
 * Company scoping comes from `resolveSendContext()`, the same helper the
 * messaging routes use, so a caller can only ever touch their own tenant.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import { loadScoredLeads, saveOverride } from '@/lib/lead-scoring-storage'

export async function GET() {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const { leads, needsSetup } = await loadScoredLeads(resolved.ctx.companyId)
    return NextResponse.json({ leads, needsSetup })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load leads'
    console.error('[Lead Scoring API] GET failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const body = (await req.json().catch(() => null)) as {
      customerId?: string
      overrideHomeValue?: number | string | null
      overrideNote?: string | null
    } | null

    if (!body?.customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    // An empty string or null clears the override rather than storing 0 — those
    // mean different things and $0 would rank the customer at the bottom.
    const raw = body.overrideHomeValue
    let value: number | null = null
    if (raw != null && String(raw).trim() !== '') {
      const parsed = Number(String(raw).replace(/[$,\s]/g, ''))
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'Override must be a positive dollar amount.' },
          { status: 400 },
        )
      }
      if (parsed > 100_000_000) {
        return NextResponse.json(
          { error: 'Override looks too large to be a home value.' },
          { status: 400 },
        )
      }
      value = Math.round(parsed)
    }

    const note = body.overrideNote?.trim() ? body.overrideNote.trim().slice(0, 500) : null

    await saveOverride(resolved.ctx.companyId, body.customerId, value, note)
    return NextResponse.json({ ok: true, cleared: value == null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save override'
    console.error('[Lead Scoring API] PUT failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
