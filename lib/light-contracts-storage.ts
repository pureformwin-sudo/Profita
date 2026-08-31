/**
 * Persistence for service contracts.
 *
 * Two tables: `contract_templates` holds reusable wording — one row per company
 * per contract type, so a company can keep roof wash, window cleaning and
 * lights templates side by side — and `light_contracts` holds one row per
 * customer agreement.
 *
 * The `light_contracts` name is historical; contracts are not lights-specific.
 *
 * Customer name/address and the template's title, prefix and field definitions
 * are all copied onto each contract rather than joined, so an executed
 * agreement keeps the exact terms it was signed under even if the customer
 * record or the template later changes.
 */

import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import type {
  ContractFieldDef,
  ContractTemplate,
  LightContract,
  LightContractStatus,
} from '@/lib/types'
import { buildContractNumber } from '@/lib/light-contracts'

/**
 * 32 bytes of CSPRNG entropy, url-safe. This token is the ONLY thing standing
 * between the public internet and a customer's contract, so it must not be
 * derived from the contract id, timestamp, or anything else guessable.
 */
function generateShareToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Postgres "relation does not exist" — migration hasn't been run. */
const MISSING_TABLE = '42P01'

/** Postgres unique violation — a contract type already exists. */
const UNIQUE_VIOLATION = '23505'

type TemplateRow = {
  id: string
  contract_type: string
  name: string
  body: string
  document_title: string | null
  number_prefix: string | null
  fields: unknown
  created_at: string
  updated_at: string
}

type ContractRow = {
  id: string
  customer_id: string | null
  contract_number: string
  customer_name: string
  service_address: string | null
  customer_email: string | null
  customer_phone: string | null
  notes: string | null
  template_id: string | null
  document_title: string | null
  number_prefix: string | null
  field_values: unknown
  field_defs: unknown
  price: string | number | null
  term_years: number | null
  install_date: string | null
  takedown_date: string | null
  body_snapshot: string | null
  status: string
  finalized_at: string | null
  share_token: string | null
  shared_at: string | null
  signature_kind: string | null
  signature_name: string | null
  signature_image: string | null
  signed_at: string | null
  company_signature_name: string | null
  company_signed_at: string | null
  created_at: string
  updated_at: string
}

/** numeric columns arrive as strings over the wire. */
function num(v: string | number | null): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

const FIELD_TYPES = new Set(['text', 'money', 'date', 'number'])

/**
 * Coerce a jsonb column into a field list.
 *
 * jsonb is schemaless, so a hand-edited row could contain anything. Anything
 * that isn't a well-formed field is dropped rather than trusted, because a
 * malformed `type` would silently change how a value is formatted on a legal
 * document.
 */
export function parseFieldDefs(raw: unknown): ContractFieldDef[] {
  if (!Array.isArray(raw)) return []
  const out: ContractFieldDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const key = typeof r.key === 'string' ? r.key.trim() : ''
    if (!key) continue
    const type = typeof r.type === 'string' && FIELD_TYPES.has(r.type) ? r.type : 'text'
    out.push({
      key,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim() : key,
      type: type as ContractFieldDef['type'],
      required: r.required === true,
    })
  }
  return out
}

/** Coerce a jsonb column into a flat string map. */
function parseFieldValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'string') out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

function toTemplate(row: TemplateRow): ContractTemplate {
  return {
    id: row.id,
    contractType: row.contract_type,
    name: row.name,
    body: row.body ?? '',
    documentTitle: row.document_title?.trim() || row.name.toUpperCase(),
    numberPrefix: row.number_prefix?.trim() || 'LEC',
    fields: parseFieldDefs(row.fields),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toStatus(value: string): LightContractStatus {
  return value === 'final' || value === 'signed' ? value : 'draft'
}

function toContract(row: ContractRow): LightContract {
  return {
    id: row.id,
    customerId: row.customer_id,
    contractNumber: row.contract_number,
    customerName: row.customer_name,
    serviceAddress: row.service_address,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    templateId: row.template_id,
    // Fall back to the number's own prefix so a contract predating the
    // migration still renders a sane heading rather than an empty one.
    documentTitle: row.document_title?.trim() || 'SERVICE AGREEMENT',
    numberPrefix:
      row.number_prefix?.trim() || row.contract_number.split('-')[0] || 'LEC',
    fieldValues: parseFieldValues(row.field_values),
    fieldDefs: parseFieldDefs(row.field_defs),
    price: num(row.price),
    termYears: row.term_years,
    installDate: row.install_date,
    takedownDate: row.takedown_date,
    bodySnapshot: row.body_snapshot,
    status: toStatus(row.status),
    finalizedAt: row.finalized_at,
    shareToken: row.share_token,
    sharedAt: row.shared_at,
    signatureKind: row.signature_kind === 'typed' || row.signature_kind === 'drawn'
      ? row.signature_kind
      : null,
    signatureName: row.signature_name,
    signatureImage: row.signature_image,
    signedAt: row.signed_at,
    companySignatureName: row.company_signature_name,
    companySignedAt: row.company_signed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface LoadContractsResult {
  /** Every saved contract type for this company. */
  templates: ContractTemplate[]
  contracts: LightContract[]
  /** True when the tables are absent, so the UI can show setup SQL. */
  needsSetup: boolean
}

export async function loadContractData(companyId: string): Promise<LoadContractsResult> {
  const supabase = await createClient()

  const [templatesRes, contractsRes] = await Promise.all([
    supabase
      .from('contract_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
    supabase
      .from('light_contracts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ])

  if (templatesRes.error?.code === MISSING_TABLE || contractsRes.error?.code === MISSING_TABLE) {
    return { templates: [], contracts: [], needsSetup: true }
  }
  if (templatesRes.error) throw new Error(templatesRes.error.message)
  if (contractsRes.error) throw new Error(contractsRes.error.message)

  return {
    templates: ((templatesRes.data ?? []) as TemplateRow[]).map(toTemplate),
    contracts: ((contractsRes.data ?? []) as ContractRow[]).map(toContract),
    needsSetup: false,
  }
}

/**
 * The field definitions an existing contract must be validated against.
 *
 * A draft is validated against its TEMPLATE's current fields, so adding a
 * field to a type immediately applies to drafts. Anything already issued is
 * validated against its own frozen defs — though those are immutable anyway.
 */
export async function loadContractFieldDefs(
  companyId: string,
  contractId: string,
): Promise<ContractFieldDef[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('light_contracts')
    .select('status, field_defs, contract_templates(fields)')
    .eq('company_id', companyId)
    .eq('id', contractId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const row = data as unknown as {
    status: string
    field_defs: unknown
    contract_templates: { fields: unknown } | null
  }

  if (row.status === 'draft' && row.contract_templates) {
    return parseFieldDefs(row.contract_templates.fields)
  }
  return parseFieldDefs(row.field_defs)
}

export interface TemplateInput {
  /** Stable slug identifying the contract type within the company. */
  contractType: string
  name: string
  documentTitle: string
  numberPrefix: string
  body: string
  fields: ContractFieldDef[]
}

/**
 * Create or update one contract type.
 *
 * Keyed on (company, contract_type), so saving an existing type edits it in
 * place and a new slug adds a new template to the library.
 */
export async function saveTemplate(
  companyId: string,
  input: TemplateInput,
): Promise<ContractTemplate> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contract_templates')
    .upsert(
      {
        company_id: companyId,
        contract_type: input.contractType,
        name: input.name.trim() || 'Service Agreement',
        document_title:
          input.documentTitle.trim() || (input.name.trim() || 'Service Agreement').toUpperCase(),
        number_prefix: input.numberPrefix.trim().toUpperCase() || 'LEC',
        body: input.body,
        fields: input.fields,
      },
      { onConflict: 'company_id,contract_type' },
    )
    .select('*')
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error('A contract type with that name already exists.')
    }
    throw new Error(error.message)
  }
  return toTemplate(data as TemplateRow)
}

/**
 * Delete a contract type.
 *
 * Existing contracts survive: `template_id` is ON DELETE SET NULL and every
 * contract carries its own frozen title, prefix and field definitions, so
 * removing a template can't alter or orphan an executed agreement.
 */
export async function deleteTemplate(companyId: string, templateId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contract_templates')
    .delete()
    .eq('company_id', companyId)
    .eq('id', templateId)

  if (error) throw new Error(error.message)
}

export interface ContractInput {
  customerId: string | null
  customerName: string
  serviceAddress: string | null
  customerEmail: string | null
  customerPhone: string | null
  notes: string | null
  /** Raw values for the template's declared fields. */
  fieldValues: Record<string, string>
  /** Mirrored to the legacy `price` column when the template has one. */
  price: number | null
}

/**
 * Next contract number for the company, scoped to prefix and year.
 *
 * Derived from the highest existing number rather than a row count, so
 * deleting a contract can't cause a collision with an existing one. Scoping to
 * the prefix means each contract type numbers independently: RSW-2026-001 and
 * WC-2026-001 can both exist.
 */
async function nextContractNumber(companyId: string, rawPrefix: string): Promise<string> {
  const supabase = await createClient()
  const year = new Date().getFullYear()
  // Round-trip through the builder so the query prefix and the generated
  // number can't disagree about sanitization.
  const sample = buildContractNumber(rawPrefix, year, 1)
  const prefix = sample.slice(0, sample.lastIndexOf('-') + 1)

  const { data, error } = await supabase
    .from('light_contracts')
    .select('contract_number')
    .eq('company_id', companyId)
    .like('contract_number', `${prefix}%`)
    .order('contract_number', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)

  const highest = (data ?? [])[0]?.contract_number as string | undefined
  const lastSeq = highest ? Number(highest.slice(prefix.length)) : 0
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1
  return buildContractNumber(rawPrefix, year, next)
}

export async function createContract(
  companyId: string,
  template: ContractTemplate,
  input: ContractInput,
): Promise<LightContract> {
  const supabase = await createClient()
  const contractNumber = await nextContractNumber(companyId, template.numberPrefix)

  const { data, error } = await supabase
    .from('light_contracts')
    .insert({
      company_id: companyId,
      customer_id: input.customerId,
      contract_number: contractNumber,
      customer_name: input.customerName,
      service_address: input.serviceAddress,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      notes: input.notes,
      // Snapshot the template's identity now. Editing or deleting the template
      // later must not retitle, renumber or relabel this document.
      template_id: template.id,
      document_title: template.documentTitle,
      number_prefix: template.numberPrefix,
      field_values: input.fieldValues,
      field_defs: template.fields,
      price: input.price,
      status: 'draft',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toContract(data as ContractRow)
}

/**
 * Update a draft's terms.
 *
 * Finalized contracts are immutable — the guard is here as well as in the UI
 * so an executed agreement can't be altered by a stray API call.
 */
export async function updateContract(
  companyId: string,
  contractId: string,
  input: ContractInput,
): Promise<LightContract> {
  const supabase = await createClient()

  const { data: existing, error: readErr } = await supabase
    .from('light_contracts')
    .select('status')
    .eq('company_id', companyId)
    .eq('id', contractId)
    .maybeSingle()

  if (readErr) throw new Error(readErr.message)
  if (!existing) throw new Error('Contract not found.')
  if (existing.status === 'signed') {
    throw new Error('This contract has been signed and can no longer be edited.')
  }
  if (existing.status === 'final') {
    throw new Error('This contract is finalized and can no longer be edited.')
  }

  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      customer_id: input.customerId,
      customer_name: input.customerName,
      service_address: input.serviceAddress,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      notes: input.notes,
      field_values: input.fieldValues,
      price: input.price,
    })
    .eq('company_id', companyId)
    .eq('id', contractId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toContract(data as ContractRow)
}

/**
 * Freeze the wording onto the contract and mark it final.
 *
 * The snapshot is what makes the record trustworthy later: editing the
 * template afterwards won't rewrite an agreement the customer already has.
 *
 * Finalize — not creation — is the real freeze point, so the title, prefix and
 * field definitions are re-stamped from the template here too. A draft created
 * before a template edit would otherwise be rendered with stale labels.
 */
export async function finalizeContract(
  companyId: string,
  contractId: string,
  renderedBody: string,
  template: ContractTemplate | null,
): Promise<LightContract> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      body_snapshot: renderedBody,
      status: 'final',
      finalized_at: new Date().toISOString(),
      ...(template
        ? {
            document_title: template.documentTitle,
            field_defs: template.fields,
          }
        : {}),
    })
    .eq('company_id', companyId)
    .eq('id', contractId)
    .eq('status', 'draft') // no-op if already final
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toContract(data as ContractRow)
}

/**
 * Reopen a finalized contract for editing, clearing the frozen wording.
 *
 * A signed contract is never reopenable — doing so would destroy the
 * signature evidence attached to wording the customer actually agreed to.
 * The `.neq('status', 'signed')` filter enforces this at the query level even
 * if the pre-check races.
 */
export async function reopenContract(
  companyId: string,
  contractId: string,
): Promise<LightContract> {
  const supabase = await createClient()

  const { data: existing, error: readErr } = await supabase
    .from('light_contracts')
    .select('status')
    .eq('company_id', companyId)
    .eq('id', contractId)
    .maybeSingle()

  if (readErr) throw new Error(readErr.message)
  if (!existing) throw new Error('Contract not found.')
  if (existing.status === 'signed') {
    throw new Error(
      'This contract has been signed and cannot be reopened. Create a new contract instead.',
    )
  }

  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      status: 'draft',
      body_snapshot: null,
      finalized_at: null,
      // Invalidate any link already sent out.
      share_token: null,
      shared_at: null,
    })
    .eq('company_id', companyId)
    .eq('id', contractId)
    .neq('status', 'signed')
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toContract(data as ContractRow)
}

/**
 * Mint (or return) the public signing link for a finalized contract.
 *
 * Only finalized contracts can be shared: sharing a draft would let the
 * customer sign wording that is still being edited. The token is minted once
 * and reused so re-sending the same contract doesn't invalidate a link the
 * customer may already have open.
 */
export async function shareContract(
  companyId: string,
  contractId: string,
  companyName: string,
): Promise<LightContract> {
  const supabase = await createClient()

  const { data: existing, error: readErr } = await supabase
    .from('light_contracts')
    .select('status, share_token, body_snapshot')
    .eq('company_id', companyId)
    .eq('id', contractId)
    .maybeSingle()

  if (readErr) throw new Error(readErr.message)
  if (!existing) throw new Error('Contract not found.')
  if (existing.status === 'draft') {
    throw new Error('Finalize the contract before sending it for signature.')
  }
  if (!existing.body_snapshot) {
    throw new Error('This contract has no frozen wording to sign.')
  }

  // Already shared — hand back the existing link untouched.
  if (existing.share_token) {
    const { data, error } = await supabase
      .from('light_contracts')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', contractId)
      .single()
    if (error) throw new Error(error.message)
    return toContract(data as ContractRow)
  }

  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      share_token: generateShareToken(),
      shared_at: new Date().toISOString(),
      // Counter-signature is auto-stamped: the company party is always us.
      company_signature_name: companyName || null,
      company_signed_at: companyName ? new Date().toISOString() : null,
    })
    .eq('company_id', companyId)
    .eq('id', contractId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toContract(data as ContractRow)
}

export async function deleteContract(companyId: string, contractId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('light_contracts')
    .delete()
    .eq('company_id', companyId)
    .eq('id', contractId)

  if (error) throw new Error(error.message)
}
