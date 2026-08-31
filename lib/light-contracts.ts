/**
 * Service contracts: placeholder rendering and formatting.
 *
 * The contract wording lives in `contract_templates.body` and is supplied by
 * the user. Each template also declares its own custom fields, so a lights
 * lease can collect term/install/takedown while a roof wash collects a service
 * date and guarantee period — without either shape being baked in here.
 *
 * Pure functions only — no Supabase, so this is safe to import from both
 * server routes and client components.
 */

import type { ContractFieldDef, ContractTemplate, Customer, LightContract } from '@/lib/types'

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
 * Placeholders every contract has, regardless of service type.
 *
 * Deal-specific fields (price, dates, term) are NOT here — those come from the
 * template's own `fields` list via `contractFieldsFor`.
 */
export const CONTRACT_FIELDS: ContractField[] = [
  { key: 'customer_name', label: 'Customer name', origin: 'customer' },
  { key: 'service_address', label: 'Service address', origin: 'customer' },
  { key: 'customer_email', label: 'Customer email', origin: 'customer' },
  { key: 'customer_phone', label: 'Customer phone', origin: 'customer' },
  { key: 'notes', label: 'Additional terms', origin: 'deal' },
  { key: 'contract_number', label: 'Contract number', origin: 'computed' },
  { key: 'company_name', label: 'Your business name', origin: 'company' },
  { key: 'company_phone', label: 'Your business phone', origin: 'company' },
  { key: 'company_email', label: 'Your business email', origin: 'company' },
  { key: 'today', label: "Today's date", origin: 'computed', hint: 'Date the document is generated' },
]

/**
 * Extra placeholders derived automatically from a field's type.
 *
 * This is what keeps legacy lights wording working: the lights template
 * declares `price` (money) and `term_years` (number), so `{{price_plain}}` and
 * `{{term_years_words}}` keep resolving through the generic rule rather than
 * needing hardcoded special cases.
 */
function derivedFieldsFor(field: ContractFieldDef): ContractField[] {
  if (field.type === 'money') {
    return [
      {
        key: `${field.key}_plain`,
        label: `${field.label} (no symbol)`,
        origin: 'deal',
        hint: '1850.00',
      },
    ]
  }
  if (field.type === 'number') {
    return [
      {
        key: `${field.key}_words`,
        label: `${field.label} in words`,
        origin: 'deal',
        hint: 'three (3)',
      },
    ]
  }
  return []
}

const TYPE_HINTS: Record<ContractFieldDef['type'], string> = {
  money: 'Formatted as $1,850.00',
  date: 'November 14, 2026',
  number: '3',
  text: '',
}

/** Every placeholder valid for one template: universal + its own fields. */
export function contractFieldsFor(
  fields: ContractFieldDef[] | null | undefined,
): ContractField[] {
  const declared = fields ?? []
  const dealFields: ContractField[] = []
  for (const field of declared) {
    dealFields.push({
      key: field.key,
      label: field.label,
      origin: 'deal',
      hint: TYPE_HINTS[field.type] || undefined,
    })
    dealFields.push(...derivedFieldsFor(field))
  }
  // Universal fields first so the reference UI leads with the stable ones.
  return [...CONTRACT_FIELDS, ...dealFields]
}

/** The editable, per-customer terms of one deal. */
export interface ContractDraft {
  customerId: string | null
  customerName: string
  serviceAddress: string
  customerEmail: string
  customerPhone: string
  notes: string
  /** Values for the template's declared fields, keyed by field key. */
  fieldValues: Record<string, string>
}

export function emptyDraft(): ContractDraft {
  return {
    customerId: null,
    customerName: '',
    serviceAddress: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    fieldValues: {},
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

/** "three (3)" — the phrasing contracts normally use. */
export function formatNumberWords(value: number | null, unit?: string): string {
  if (value == null) return ''
  const word = value >= 0 && value <= 20 ? ONES[value] : String(value)
  const base = `${word} (${value})`
  if (!unit) return base
  return `${base} ${value === 1 ? unit : `${unit}s`}`
}

/**
 * Legacy helper kept for the lights wording: "three (3) years".
 *
 * The generic `{{term_years_words}}` path appends the unit from the field
 * label, but existing wording relies on this exact phrasing.
 */
export function formatTermWords(years: number | null): string {
  return formatNumberWords(years, 'year')
}

/** Format one field value according to its declared type. */
export function formatFieldValue(field: ContractFieldDef, raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (field.type === 'money') {
    const n = Number(value)
    return Number.isFinite(n) ? formatPrice(n) : value
  }
  if (field.type === 'date') return formatContractDate(value)
  return value
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function todayIso(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Strip a trailing plural so "Term length (years)" yields a "year" unit. */
function unitFromLabel(label: string): string | undefined {
  const match = label.match(/\(([a-z]+)\)\s*$/i)
  if (!match) return undefined
  const word = match[1].toLowerCase()
  return word.endsWith('s') ? word.slice(0, -1) : word
}

type ContractValueSource = Pick<
  LightContract,
  'contractNumber' | 'customerName' | 'serviceAddress' | 'customerEmail' | 'customerPhone' | 'notes'
> & {
  fieldValues?: Record<string, string> | null
}

/**
 * Build the substitution map for one contract.
 *
 * `fields` should be the field list frozen with the contract (or its template's
 * current list for a live draft), so a signed document keeps rendering with the
 * same field definitions it was created under.
 */
export function buildContractValues(
  contract: ContractValueSource,
  company: CompanyInfo,
  fields: ContractFieldDef[] | null | undefined,
): Record<string, string> {
  const values: Record<string, string> = {
    customer_name: contract.customerName ?? '',
    service_address: contract.serviceAddress ?? '',
    customer_email: contract.customerEmail ?? '',
    customer_phone: contract.customerPhone ?? '',
    notes: contract.notes ?? '',
    contract_number: contract.contractNumber ?? '',
    company_name: company.name ?? '',
    company_phone: company.phone ?? '',
    company_email: company.email ?? '',
    today: todayIso(),
  }

  const raw = contract.fieldValues ?? {}
  for (const field of fields ?? []) {
    const rawValue = raw[field.key]
    values[field.key] = formatFieldValue(field, rawValue)

    // Derived variants, matching derivedFieldsFor.
    const trimmed = (rawValue ?? '').trim()
    if (field.type === 'money') {
      const n = Number(trimmed)
      values[`${field.key}_plain`] = trimmed && Number.isFinite(n) ? n.toFixed(2) : ''
    } else if (field.type === 'number') {
      const n = Number(trimmed)
      values[`${field.key}_words`] =
        trimmed && Number.isFinite(n) ? formatNumberWords(n, unitFromLabel(field.label)) : ''
    }
  }

  return values
}

/** Placeholder tokens present in the wording that the engine doesn't know. */
export function findUnknownPlaceholders(
  body: string,
  fields: ContractFieldDef[] | null | undefined,
): string[] {
  const known = new Set(contractFieldsFor(fields).map((f) => f.key))
  const found = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = match[1]
    if (!known.has(key)) found.add(key)
  }
  return [...found]
}

/** Known placeholders used in the wording that have no value yet. */
export function findMissingValues(
  body: string,
  values: Record<string, string>,
  fields: ContractFieldDef[] | null | undefined,
): ContractField[] {
  const used = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) used.add(match[1])
  return contractFieldsFor(fields).filter((f) => used.has(f.key) && !values[f.key]?.trim())
}

/** Every placeholder token actually used in a body. */
export function placeholdersUsed(body: string): Set<string> {
  const used = new Set<string>()
  if (!body) return used
  for (const match of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) used.add(match[1])
  return used
}

/**
 * Substitute every `{{placeholder}}` in the wording.
 *
 * Unknown or empty placeholders are left visible as `[ label ]` rather than
 * silently blanked — a contract with a blank where a price should be is far
 * more dangerous than one with an obvious gap.
 */
export function renderContractBody(
  body: string,
  values: Record<string, string>,
  fields?: ContractFieldDef[] | null,
): string {
  if (!body) return ''
  const known = contractFieldsFor(fields)
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_full, key: string) => {
    const value = values[key]
    if (value != null && value !== '') return value
    const field = known.find((f) => f.key === key)
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateDraft(
  draft: ContractDraft,
  fields: ContractFieldDef[] | null | undefined,
): DraftIssues {
  const errors: string[] = []
  const warnings: string[] = []

  if (!draft.customerName.trim()) errors.push('Customer name is required.')

  const declared = fields ?? []
  for (const field of declared) {
    const raw = (draft.fieldValues[field.key] ?? '').trim()

    if (!raw) {
      if (field.required) errors.push(`${field.label} is required.`)
      else warnings.push(`No ${field.label.toLowerCase()} set.`)
      continue
    }

    if (field.type === 'money') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) errors.push(`${field.label} must be a positive number.`)
    } else if (field.type === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) errors.push(`${field.label} must be a number.`)
    } else if (field.type === 'date' && !DATE_RE.test(raw)) {
      errors.push(`${field.label} must be a valid date.`)
    }
  }

  // A later date field preceding an earlier one is almost always a typo in the
  // year — easy to do when a season spans a new year. Compare adjacent date
  // fields in declared order, which is the order the form presents them.
  const dateFields = declared.filter((f) => f.type === 'date')
  for (let i = 1; i < dateFields.length; i++) {
    const prev = dateFields[i - 1]
    const curr = dateFields[i]
    const a = (draft.fieldValues[prev.key] ?? '').trim()
    const b = (draft.fieldValues[curr.key] ?? '').trim()
    if (a && b && DATE_RE.test(a) && DATE_RE.test(b) && b < a) {
      errors.push(`${curr.label} falls before ${prev.label.toLowerCase()}.`)
    }
  }

  if (!draft.serviceAddress.trim()) {
    warnings.push('No service address — the contract will show a gap.')
  }

  return { errors, warnings }
}

/** Parse a draft into the shape the database expects. */
export function draftToRecord(
  draft: ContractDraft,
  fields: ContractFieldDef[] | null | undefined,
) {
  // Only persist values for fields the template actually declares, so stale
  // keys from a switched template can't linger in the snapshot.
  const fieldValues: Record<string, string> = {}
  for (const field of fields ?? []) {
    const raw = (draft.fieldValues[field.key] ?? '').trim()
    if (raw) fieldValues[field.key] = raw
  }

  // Keep the legacy `price` column populated when the template has a money
  // field called `price`, so existing reporting keeps working.
  const priceField = (fields ?? []).find((f) => f.key === 'price' && f.type === 'money')
  const priceRaw = priceField ? fieldValues.price : undefined
  const priceNum = priceRaw ? Number(priceRaw) : null

  return {
    customerId: draft.customerId,
    customerName: draft.customerName.trim(),
    serviceAddress: draft.serviceAddress.trim() || null,
    customerEmail: draft.customerEmail.trim() || null,
    customerPhone: draft.customerPhone.trim() || null,
    notes: draft.notes.trim() || null,
    fieldValues,
    price: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
  }
}

/**
 * Sequential per-company contract number, e.g. `RSW-2026-014`.
 *
 * The prefix comes from the template, so contract type is readable straight
 * off the number. Falls back to `LEC` when a template has none.
 */
export function buildContractNumber(prefix: string, year: number, sequence: number): string {
  const clean = (prefix || 'LEC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LEC'
  return `${clean}-${year}-${String(sequence).padStart(3, '0')}`
}

/**
 * The editable shape of one contract type.
 *
 * `contractType` is the stable per-company slug the row is keyed on. It is
 * derived from the name when creating and then never changed, so renaming a
 * type edits it in place instead of silently creating a second one.
 */
export interface TemplateDraft {
  contractType: string
  name: string
  documentTitle: string
  numberPrefix: string
  body: string
  fields: ContractFieldDef[]
}

/** Default field set offered when creating a brand-new template. */
export function defaultTemplateFields(): ContractFieldDef[] {
  return [
    { key: 'price', label: 'Price', type: 'money', required: false },
    { key: 'service_date', label: 'Service date', type: 'date', required: false },
  ]
}

/** Normalize a user-entered field key into a safe placeholder token. */
export function normalizeFieldKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/** Guard against a template field colliding with a universal placeholder. */
export function isReservedFieldKey(key: string): boolean {
  if (CONTRACT_FIELDS.some((f) => f.key === key)) return true
  // Derived suffixes are generated, so a raw field can't claim them.
  return key.endsWith('_plain') || key.endsWith('_words')
}

/** Pull the template metadata a contract should freeze at creation time. */
export function templateSnapshot(template: Pick<ContractTemplate, 'documentTitle' | 'numberPrefix' | 'fields'>) {
  return {
    documentTitle: template.documentTitle,
    numberPrefix: template.numberPrefix,
    fields: template.fields,
  }
}
