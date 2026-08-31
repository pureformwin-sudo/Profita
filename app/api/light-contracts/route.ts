/**
 * Christmas lights lease contracts: list, create, update.
 *
 * Company scoping comes from `resolveSendContext()`, the same helper the
 * messaging and lead-scoring routes use, so a caller can only ever touch
 * their own tenant.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import {
  createContract,
  deleteContract,
  loadContractData,
  loadContractFieldDefs,
  updateContract,
  type ContractInput,
} from '@/lib/light-contracts-storage'
import { draftToRecord, emptyDraft, validateDraft } from '@/lib/light-contracts'
import type { ContractFieldDef } from '@/lib/types'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Coerce an untrusted JSON body into the shape storage expects.
 *
 * Validation runs through the same `validateDraft` the form uses, against the
 * field list the contract's type declares — so the server enforces exactly the
 * rules the user was shown, and a crafted request can't skip a required field
 * or smuggle in values for fields that don't exist.
 */
function readInput(
  body: Record<string, unknown>,
  fields: ContractFieldDef[],
): ContractInput | string {
  const rawValues = body.fieldValues
  const fieldValues: Record<string, string> = {}
  if (rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)) {
    for (const [k, v] of Object.entries(rawValues as Record<string, unknown>)) {
      if (typeof v === 'string') fieldValues[k] = v
      else if (typeof v === 'number') fieldValues[k] = String(v)
    }
  }

  const draft = {
    ...emptyDraft(),
    customerId: str(body.customerId).trim() || null,
    customerName: str(body.customerName),
    serviceAddress: str(body.serviceAddress),
    customerEmail: str(body.customerEmail),
    customerPhone: str(body.customerPhone),
    notes: str(body.notes),
    fieldValues,
  }

  const issues = validateDraft(draft, fields)
  if (issues.errors.length > 0) return issues.errors[0]

  return draftToRecord(draft, fields)
}

export async function GET() {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const data = await loadContractData(resolved.ctx.companyId)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load contracts'
    console.error('[Light Contracts API] GET failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const body = (await req.json()) as Record<string, unknown>

    // The type is required and must belong to this company — it supplies the
    // heading, prefix and field list that get frozen onto the contract.
    const templateId = str(body.templateId).trim()
    if (!templateId) {
      return NextResponse.json({ error: 'Contract type is required.' }, { status: 400 })
    }

    const { templates } = await loadContractData(resolved.ctx.companyId)
    const template = templates.find((t) => t.id === templateId)
    if (!template) {
      return NextResponse.json({ error: 'Contract type not found.' }, { status: 404 })
    }

    const input = readInput(body, template.fields)
    if (typeof input === 'string') {
      return NextResponse.json({ error: input }, { status: 400 })
    }

    const contract = await createContract(resolved.ctx.companyId, template, input)
    return NextResponse.json({ contract })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create contract'
    console.error('[Light Contracts API] POST failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const body = (await req.json()) as Record<string, unknown>
    const contractId = typeof body.id === 'string' ? body.id : ''
    if (!contractId) {
      return NextResponse.json({ error: 'Contract id is required.' }, { status: 400 })
    }

    // Validate against the fields this contract's own type declares, not a
    // client-supplied list.
    const fields = await loadContractFieldDefs(resolved.ctx.companyId, contractId)
    if (fields == null) {
      return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })
    }

    const input = readInput(body, fields)
    if (typeof input === 'string') {
      return NextResponse.json({ error: input }, { status: 400 })
    }

    const contract = await updateContract(resolved.ctx.companyId, contractId, input)
    return NextResponse.json({ contract })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update contract'
    console.error('[Light Contracts API] PUT failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Contract id is required.' }, { status: 400 })
    }

    await deleteContract(resolved.ctx.companyId, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete contract'
    console.error('[Light Contracts API] DELETE failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
