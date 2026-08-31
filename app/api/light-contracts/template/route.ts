/**
 * Create, update and delete contract types.
 *
 * The wording is stored verbatim — it's legal text supplied by the user, so it
 * is never trimmed, reformatted, or normalized beyond a length cap.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import { deleteTemplate, saveTemplate } from '@/lib/light-contracts-storage'
import { isReservedFieldKey, normalizeFieldKey } from '@/lib/light-contracts'
import type { ContractFieldDef } from '@/lib/types'

/** Generous cap — long leases are normal, runaway payloads are not. */
const MAX_BODY_CHARS = 200_000

/** Enough to cover any real contract type; blocks unbounded field lists. */
const MAX_FIELDS = 40

const FIELD_TYPES = new Set<ContractFieldDef['type']>(['text', 'money', 'date', 'number'])

/**
 * Validate the field list.
 *
 * Keys are re-normalized server-side rather than trusted: a key becomes a
 * placeholder token and a jsonb object key, so anything outside
 * `[a-z0-9_]` is rejected at the boundary instead of being stored.
 */
function readFields(raw: unknown): ContractFieldDef[] | string {
  if (raw == null) return []
  if (!Array.isArray(raw)) return 'Fields must be a list.'
  if (raw.length > MAX_FIELDS) return `A contract type can have at most ${MAX_FIELDS} fields.`

  const out: ContractFieldDef[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') return 'Each field must be an object.'
    const r = item as Record<string, unknown>

    const key = normalizeFieldKey(typeof r.key === 'string' ? r.key : '')
    if (!key) return 'Every field needs a placeholder key.'
    if (isReservedFieldKey(key)) return `"${key}" is a reserved placeholder — pick another key.`
    if (seen.has(key)) return `Duplicate field key "${key}".`
    seen.add(key)

    const type = typeof r.type === 'string' ? (r.type as ContractFieldDef['type']) : 'text'
    if (!FIELD_TYPES.has(type)) return `"${type}" is not a valid field type.`

    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : key
    out.push({ key, label: label.slice(0, 80), type, required: r.required === true })
  }

  return out
}

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

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Give this contract type a name.' }, { status: 400 })
    }

    const fields = readFields(body.fields)
    if (typeof fields === 'string') {
      return NextResponse.json({ error: fields }, { status: 400 })
    }

    // The slug keys the row. Derived from the name only when absent, so
    // renaming a type edits it in place rather than creating a duplicate.
    const contractType =
      normalizeFieldKey(typeof body.contractType === 'string' ? body.contractType : '') ||
      normalizeFieldKey(name)
    if (!contractType) {
      return NextResponse.json(
        { error: 'Give this contract type a name using letters or numbers.' },
        { status: 400 },
      )
    }

    const template = await saveTemplate(resolved.ctx.companyId, {
      contractType,
      name,
      documentTitle: typeof body.documentTitle === 'string' ? body.documentTitle : '',
      numberPrefix: typeof body.numberPrefix === 'string' ? body.numberPrefix : '',
      body: body.body,
      fields,
    })
    return NextResponse.json({ template })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save contract type'
    console.error('[Light Contracts API] template PUT failed:', message)
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
      return NextResponse.json({ error: 'Contract type id is required.' }, { status: 400 })
    }

    await deleteTemplate(resolved.ctx.companyId, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete contract type'
    console.error('[Light Contracts API] template DELETE failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
