/**
 * Mint the public signing link for a finalized contract.
 *
 * Authenticated and company-scoped: the token is always created by the
 * business, never by the customer. The counter-signature is auto-stamped from
 * the business profile at the same time, so the company side of the document
 * is already complete when the customer opens the link.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import { shareContract } from '@/lib/light-contracts-storage'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { companyId } = resolved.ctx

    const body = (await req.json()) as Record<string, unknown>
    const contractId = typeof body.id === 'string' ? body.id : ''
    if (!contractId) {
      return NextResponse.json({ error: 'Contract id is required.' }, { status: 400 })
    }

    // Business name for the auto-stamped company signature.
    const supabase = await createClient()
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('profile')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    const profile = (settingsRow?.profile ?? null) as { businessName?: string } | null

    const contract = await shareContract(
      companyId,
      contractId,
      profile?.businessName ?? '',
    )

    return NextResponse.json({ contract })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create signing link'
    console.error('[Light Contracts API] share failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
