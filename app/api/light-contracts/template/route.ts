/**
 * Save the reusable Christmas lights contract wording.
 *
 * The body is stored verbatim — it's legal text supplied by the user, so it is
 * never trimmed, reformatted, or normalized beyond a length cap.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import { saveTemplate } from '@/lib/light-contracts-storage'

/** Generous cap — long leases are normal, runaway payloads are not. */
const MAX_BODY_CHARS = 200_000

export async function PUT(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const body = (await req.json()) as Record<string, unknown>
    if (typeof body.body !== 'string') {
      return NextResponse.json({ error: 'Contract wording is required.' }, { status: 400 })
    }
    if (body.body.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { error: `Contract wording is too long (max ${MAX_BODY_CHARS.toLocaleString()} characters).` },
        { status: 400 },
      )
    }

    const name = typeof body.name === 'string' ? body.name : undefined
    const template = await saveTemplate(resolved.ctx.companyId, body.body, name)
    return NextResponse.json({ template })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save wording'
    console.error('[Light Contracts API] template PUT failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
