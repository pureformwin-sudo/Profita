/**
 * Christmas lights lease contracts: placeholder rendering and formatting.
 *
 * The contract wording itself lives in `contract_templates.body` and is
 * supplied by the user. This module only knows how to substitute
 * {{placeholders}} in that wording and how to format the values.
 *
 * Pure functions only — no Supabase, so this is safe to import from both
 * server routes and client components.
 */

import type { Customer, LightContract } from '@/lib/types'

/** A field the user can drop into the contract wording. */
export interface ContractField {
  /** Placeholder token, e.g. `customer_name` for `{{customer_name}}`. */
  key: string
  label: string
  /** Where the value comes from, shown in the field reference UI. */
  origin: 'customer' | 'deal' | 'company' | 'computed'
  hint?: string
}

/**
 * Every placeholder the renderer understands. Shown in the UI as a copyable
 * reference so the wording and the engine can't drift apart.
 */
export const CONTRACT_FIELDS: ContractField[] = [
  { key: 'customer_name', label: 'Customer name', origin: 'customer' },
  { key: 'service_address', label: 'Service address', origin: 'customer' },
  { key: 'customer_email', label: 'Customer email', origin: 'customer' },
  { key: 'customer_phone', label: 'Customer phone', origin: 'customer' },
  { key: 'price', label: 'Price', origin: 'deal', hint: 'Formatted as $1,850.00' },
  { key: 'price_plain', label: 'Price (no symbol)', origin: 'deal', hint: '1850.00' },
  { key: 'term_years', label: 'Term length', origin: 'deal', hint: '3' },
  { key: 'term_years_words', label: 'Term length in words', origin: 'deal', hint: 'three (3) years' },
  { key: 'install_date', label: 'Install date', origin: 'deal', hint: 'November 14, 2026' },
  { key: 'takedown_date', label: 'Takedown date', origin: 'deal', hint: 'January 8, 2027' },
  { key: 'notes', label: 'Additional terms', origin: 'deal' },
  { key: 'contract_number', label: 'Contract number', origin: 'computed' },
  { key: 'company_name', label: 'Your business name', origin: 'company' },
  { key: 'company_phone', label: 'Your business phone', origin: 'company' },
  { key: 'company_email', label: 'Your business email', origin: 'company' },
  { key: 'today', label: "Today's date", origin: 'computed', hint: 'Date the document is generated' },
]

/** The editable, per-customer terms of one deal. */
export interface ContractDraft {
  customerId: string | null
  customerName: string
  serviceAddress: string
  customerEmail: string
  customerPhone: string
  price: string
  termYears: string
  installDate: string
  takedownDate: string
  notes: string
}

export function emptyDraft(): ContractDraft {
  return {
    customerId: null,
    customerName: '',
    serviceAddress: '',
    customerEmail: '',
    customerPhone: '',
    price: '',
    termYears: '',
    installDate: '',
    takedownDate: '',
    notes: '',
  }
}

/** Prefill the auto-filled fields from a customer record. */
export function draftFromCustomer(customer: Customer): ContractDraft {
  return {
    ...emptyDraft(),
    customerId: customer.id,
    customerName: customer.name ?? '',
    serviceAddress: customer.address ?? '',
    customerEmail: customer.email ?? '',
    customerPhone: customer.phone ?? '',
  }
}

export interface CompanyInfo {
  name: string
  phone: string
  email: string
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

export function formatPrice(value: number | null): string {
  return value == null ? '' : currency.format(value)
}

/**
 * Format a YYYY-MM-DD date without timezone drift.
 *
 * `new Date('2026-11-14')` parses as UTC midnight, which renders as Nov 13 in
 * US timezones. Splitting the parts sidesteps that entirely.
 */
export function formatContractDate(value: string | null): string {
  if (!value) return ''
  const parts = value.split('-')
  if (parts.length !== 3) return value
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return value
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format a signature timestamp for the document's date line.
 *
 * Unlike `formatContractDate`, this takes a full ISO instant (not a date-only
 * string), so normal Date parsing is correct here — there is no UTC-midnight
 * ambiguity to avoid. Includes the time because a signature is a point-in-time
 * legal act, and the timezone abbreviation so the stamp is unambiguous.
 */
export function formatSignedStamp(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
]

/** "three (3) years" — the phrasing contracts normally use. */
export function formatTermWords(years: number | null): string {
  if (years == null) return ''
  const word = years >= 0 && years <= 20 ? ONES[years] : String(years)
  return `${word} (${years}) ${years === 1 ? 'year' : 'years'}`
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function todayIso(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Build the substitution map for one contract. */
export function buildContractValues(
  contract: Pick<
    LightContract,
    | 'contractNumber'
    | 'customerName'
    | 'serviceAddress'
    | 'customerEmail'
    | 'customerPhone'
    | 'price'
    | 'termYears'
    | 'installDate'
    | 'takedownDate'
    | 'notes'
  >,
  company: CompanyInfo,
): Record<string, string> {
  return {
    customer_name: contract.customerName ?? '',
    service_address: contract.serviceAddress ?? '',
    customer_email: contract.customerEmail ?? '',
    customer_phone: contract.customerPhone ?? '',
    price: formatPrice(contract.price),
    price_plain: contract.price == null ? '' : contract.price.toFixed(2),
    term_years: contract.termYears == null ? '' : String(contract.termYears),
    term_years_words: formatTermWords(contract.termYears),
    install_date: formatContractDate(contract.installDate),
    takedown_date: formatContractDate(contract.takedownDate),
    notes: contract.notes ?? '',
    contract_number: contract.contractNumber ?? '',
    company_name: company.name ?? '',
    company_phone: company.phone ?? '',
    company_email: company.email ?? '',
    today: todayIso(),
  }
}

/** Placeholder tokens present in the wording that the engine doesn't know. */
export function findUnknownPlaceholders(body: string): string[] {
  const known = new Set(CONTRACT_FIELDS.map((f) => f.key))
  const found = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = match[1]
    if (!known.has(key)) found.add(key)
  }
  return [...found]
}

/** Known placeholders used in the wording that have no value yet. */
export function findMissingValues(body: string, values: Record<string, string>): ContractField[] {
  const used = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) used.add(match[1])
  return CONTRACT_FIELDS.filter((f) => used.has(f.key) && !values[f.key]?.trim())
}

/**
 * Substitute every `{{placeholder}}` in the wording.
 *
 * Unknown or empty placeholders are left visible as `[ label ]` rather than
 * silently blanked — a contract with a blank where a price should be is far
 * more dangerous than one with an obvious gap.
 */
export function renderContractBody(body: string, values: Record<string, string>): string {
  if (!body) return ''
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_full, key: string) => {
    const value = values[key]
    if (value != null && value !== '') return value
    const field = CONTRACT_FIELDS.find((f) => f.key === key)
    return `[ ${field ? field.label : key} ]`
  })
}

/** Split rendered wording into paragraphs for display. */
export function toParagraphs(rendered: string): string[] {
  return rendered.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface DraftIssues {
  /** Blocking problems — the contract can't be finalized. */
  errors: string[]
  /** Worth flagging but not blocking. */
  warnings: string[]
}

export function validateDraft(draft: ContractDraft): DraftIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (!draft.customerName.trim()) errors.push('Customer name is required.')

  if (draft.price.trim()) {
    const price = Number(draft.price)
    if (!Number.isFinite(price) || price < 0) errors.push('Price must be a positive number.')
  }

  if (draft.termYears.trim()) {
    const term = Number(draft.termYears)
    if (!Number.isInteger(term) || term < 1 || term > 25) {
      errors.push('Term length must be a whole number between 1 and 25 years.')
    }
  }

  // Takedown before install is almost always a typo in the year — easy to do
  // when a season spans a new year.
  if (draft.installDate && draft.takedownDate && draft.takedownDate < draft.installDate) {
    errors.push('Takedown date falls before the install date.')
  }

  if (!draft.serviceAddress.trim()) warnings.push('No service address — the contract will show a gap.')
  if (!draft.price.trim()) warnings.push('No price set.')
  if (!draft.termYears.trim()) warnings.push('No term length set.')

  return { errors, warnings }
}

/** Parse a draft into the numeric/nullable shape the database expects. */
export function draftToRecord(draft: ContractDraft) {
  const price = draft.price.trim() ? Number(draft.price) : null
  const termYears = draft.termYears.trim() ? Number(draft.termYears) : null
  return {
    customerId: draft.customerId,
    customerName: draft.customerName.trim(),
    serviceAddress: draft.serviceAddress.trim() || null,
    customerEmail: draft.customerEmail.trim() || null,
    customerPhone: draft.customerPhone.trim() || null,
    price: price != null && Number.isFinite(price) ? price : null,
    termYears: termYears != null && Number.isInteger(termYears) ? termYears : null,
    installDate: draft.installDate || null,
    takedownDate: draft.takedownDate || null,
    notes: draft.notes.trim() || null,
  }
}

/** Sequential per-company contract number, e.g. `CL-2026-014`. */
export function buildContractNumber(year: number, sequence: number): string {
  return `CL-${year}-${String(sequence).padStart(3, '0')}`
}
