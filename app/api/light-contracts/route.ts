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
  updateContract,
  type ContractInput,
} from '@/lib/light-contracts-storage'

/** Coerce an untrusted JSON body into the shape storage expects. */
function readInput(body: Record<string, unknown>): ContractInput | string {
  const name = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  if (!name) return 'Customer name is required.'

  const price = body.price == null || body.price === '' ? null : Number(body.price)
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return 'Price must be a positive number.'
  }

  const termYears = body.termYears == null || body.termYears === '' ? null : Number(body.termYears)
  if (termYears != null && (!Number.isInteger(termYears) || termYears < 1 || termYears > 25)) {
    return 'Term length must be a whole number between 1 and 25 years.'
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const installDate = str(body.installDate)
  const takedownDate = str(body.takedownDate)
  if (installDate && takedownDate && takedownDate < installDate) {
    return 'Takedown date falls before the install date.'
  }

  return {
    customerId: str(body.customerId),
    customerName: name,
    serviceAddress: str(body.serviceAddress),
    customerEmail: str(body.customerEmail),
    customerPhone: str(body.customerPhone),
    price,
    termYears,
    installDate,
    takedownDate,
    notes: str(body.notes),
  }
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
    const input = readInput(body)
    if (typeof input === 'string') {
      return NextResponse.json({ error: input }, { status: 400 })
    }

    const contract = await createContract(resolved.ctx.companyId, input)
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

    const input = readInput(body)
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
