/**
 * Persistence for Christmas lights lease contracts.
 *
 * Two tables: `contract_templates` holds the reusable wording (one row per
 * company), `light_contracts` holds one row per customer agreement.
 *
 * Customer name/address are copied onto each contract rather than joined, so
 * an executed agreement keeps the terms it was signed under even if the
 * customer record later changes.
 */

import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import type { ContractTemplate, LightContract, LightContractStatus } from '@/lib/types'
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

const CONTRACT_TYPE = 'christmas_lights'

type TemplateRow = {
  id: string
  contract_type: string
  name: string
  body: string
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
  price: string | number | null
  term_years: number | null
  install_date: string | null
  takedown_date: string | null
  notes: string | null
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

function toTemplate(row: TemplateRow): ContractTemplate {
  return {
    id: row.id,
    contractType: row.contract_type,
    name: row.name,
    body: row.body ?? '',
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
    price: num(row.price),
    termYears: row.term_years,
    installDate: row.install_date,
    takedownDate: row.takedown_date,
    notes: row.notes,
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
  template: ContractTemplate | null
  contracts: LightContract[]
  /** True when the tables are absent, so the UI can show setup SQL. */
  needsSetup: boolean
}

export async function loadContractData(companyId: string): Promise<LoadContractsResult> {
  const supabase = await createClient()

  const [templateRes, contractsRes] = await Promise.all([
    supabase
      .from('contract_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('contract_type', CONTRACT_TYPE)
      .maybeSingle(),
    supabase
      .from('light_contracts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ])

  if (templateRes.error?.code === MISSING_TABLE || contractsRes.error?.code === MISSING_TABLE) {
    return { template: null, contracts: [], needsSetup: true }
  }
  if (templateRes.error) throw new Error(templateRes.error.message)
  if (contractsRes.error) throw new Error(contractsRes.error.message)

  return {
    template: templateRes.data ? toTemplate(templateRes.data as TemplateRow) : null,
    contracts: ((contractsRes.data ?? []) as ContractRow[]).map(toContract),
    needsSetup: false,
  }
}

/** Save the boilerplate wording. One row per company, so this upserts. */
export async function saveTemplate(
  companyId: string,
  body: string,
  name?: string,
): Promise<ContractTemplate> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contract_templates')
    .upsert(
      {
        company_id: companyId,
        contract_type: CONTRACT_TYPE,
        name: name?.trim() || 'Christmas Lights Lease',
        body,
      },
      { onConflict: 'company_id,contract_type' },
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return toTemplate(data as TemplateRow)
}

export interface ContractInput {
  customerId: string | null
  customerName: string
  serviceAddress: string | null
  customerEmail: string | null
  customerPhone: string | null
  price: number | null
  termYears: number | null
  installDate: string | null
  takedownDate: string | null
  notes: string | null
}

/**
 * Next contract number for the company, scoped to the current year.
 *
 * Derived from the highest existing number rather than a row count, so
 * deleting a contract can't cause a collision with an existing one.
 */
async function nextContractNumber(companyId: string): Promise<string> {
  const supabase = await createClient()
  const year = new Date().getFullYear()
  const prefix = `CL-${year}-`

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
  return buildContractNumber(year, next)
}

export async function createContract(
  companyId: string,
  input: ContractInput,
): Promise<LightContract> {
  const supabase = await createClient()
  const contractNumber = await nextContractNumber(companyId)

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
      price: input.price,
      term_years: input.termYears,
      install_date: input.installDate,
      takedown_date: input.takedownDate,
      notes: input.notes,
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
      price: input.price,
      term_years: input.termYears,
      install_date: input.installDate,
      takedown_date: input.takedownDate,
      notes: input.notes,
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
 */
export async function finalizeContract(
  companyId: string,
  contractId: string,
  renderedBody: string,
): Promise<LightContract> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      body_snapshot: renderedBody,
      status: 'final',
      finalized_at: new Date().toISOString(),
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
