/**
 * Finalize or reopen a contract.
 *
 * Finalizing renders the wording server-side and freezes it onto the row, so
 * later template edits can't rewrite an agreement the customer already holds.
 * The client never supplies the rendered text.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import {
  finalizeContract,
  loadContractData,
  reopenContract,
} from '@/lib/light-contracts-storage'
import { buildContractValues, renderContractBody } from '@/lib/light-contracts'
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

    if (body.action === 'reopen') {
      const contract = await reopenContract(companyId, contractId)
      return NextResponse.json({ contract })
    }

    const { template, contracts } = await loadContractData(companyId)
    if (!template?.body?.trim()) {
      return NextResponse.json(
        { error: 'Add the contract wording before finalizing.' },
        { status: 400 },
      )
    }

    const target = contracts.find((c) => c.id === contractId)
    if (!target) {
      return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })
    }
    if (target.status === 'final') {
      return NextResponse.json({ contract: target })
    }

    // Business identity for the letterhead. Read directly rather than via
    // lib/storage, which uses the browser Supabase client.
    const supabase = await createClient()
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('profile')
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    const profile = (settingsRow?.profile ?? null) as
      | { businessName?: string; phone?: string; email?: string }
      | null

    const rendered = renderContractBody(
      template.body,
      buildContractValues(target, {
        name: profile?.businessName ?? '',
        phone: profile?.phone ?? '',
        email: profile?.email ?? '',
      }),
    )

    const contract = await finalizeContract(companyId, contractId, rendered)
    return NextResponse.json({ contract })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to finalize contract'
    console.error('[Light Contracts API] finalize failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
