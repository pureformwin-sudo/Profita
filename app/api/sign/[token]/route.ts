/**
 * Public signing endpoint. No authentication — the share token is the
 * credential. See lib/contract-signing.ts for the security rationale.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { loadContractByToken, signContract } from '@/lib/contract-signing'

/** Never cache a contract's signing state. */
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const contract = await loadContractByToken(token)

  if (!contract) {
    return NextResponse.json(
      { error: 'This contract link is not valid.' },
      { status: 404, headers: NO_STORE },
    )
  }

  return NextResponse.json({ contract }, { headers: NO_STORE })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const body = await request.json()

    // Light provenance so a signature can be defended later. `x-forwarded-for`
    // may carry a proxy chain; the first entry is the client.
    const forwarded = request.headers.get('x-forwarded-for') ?? ''
    const ip = forwarded.split(',')[0].trim() || null

    const result = await signContract({
      token,
      kind: body?.kind,
      name: String(body?.name ?? ''),
      image: body?.image ?? null,
      ip,
      userAgent: request.headers.get('user-agent'),
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_STORE },
      )
    }

    return NextResponse.json({ contract: result.contract }, { headers: NO_STORE })
  } catch (err) {
    console.error('[v0] sign request failed:', err)
    return NextResponse.json(
      { error: 'Could not record the signature.' },
      { status: 500, headers: NO_STORE },
    )
  }
}
