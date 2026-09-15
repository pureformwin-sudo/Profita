import type { Customer } from '@/lib/types'

/**
 * Pure customer name/phone data-quality engine. No I/O — every function here is
 * deterministic and unit-testable so the audit can be sanity-checked with a
 * script against the live customer set without touching the database.
 */

export type CleanupFlagReason =
  | 'casing'
  | 'whitespace'
  | 'missing_last_name'
  | 'junk_name'
  | 'two_people'
  | 'non_numeric_phone'
  | 'name_in_phone'
  | 'phone_format'
  | 'missing_phone'

export interface CleanupSuggestion {
  customerId: string
  currentName: string
  currentPhone: string
  /** Proposed name, or the current name when nothing better is known. */
  suggestedName: string
  /** Proposed phone; null means "clear this field". */
  suggestedPhone: string | null
  reasons: CleanupFlagReason[]
  /** Only safe, mechanical fixes (casing/whitespace/phone reformat). */
  autoFixed: boolean
  /** A human should look before this is written. */
  needsReview: boolean
}

// Tokens that stay lowercase inside a multi-word name.
const LOWER_CONNECTORS = new Set(['and', 'of', 'the', 'für', 'von'])
// Placeholder junk people type when they don't have a real name.
const PLACEHOLDER_NAMES = new Set([
  'test',
  'tester',
  'n/a',
  'na',
  'none',
  'unknown',
  'xxx',
  'xx',
  'asdf',
  'customer',
  'no name',
  'noname',
])
// Explicit "two people in one record" separators.
const TWO_PEOPLE_RE = /\s(?:and|&|\+)\s|\s*[/&+]\s*/i

/** Title-case a single whitespace-free token, preserving name particles. */
function titleCaseToken(token: string, isFirst: boolean): string {
  if (token.length === 0) return token

  const lower = token.toLowerCase()

  // Connectors stay lowercase unless they lead the name.
  if (!isFirst && LOWER_CONNECTORS.has(lower)) return lower

  // Preserve an already-mixed-case token the user typed deliberately
  // (e.g. "McDonald", "DeVries") — only fix all-lower or all-UPPER tokens.
  const letters = token.replace(/[^A-Za-z]/g, '')
  const isAllLower = letters.length > 0 && letters === letters.toLowerCase()
  const isAllUpper = letters.length > 0 && letters === letters.toUpperCase()
  if (!isAllLower && !isAllUpper) return token

  // Scottish/Irish "Mc" + capital.
  if (lower.startsWith('mc') && lower.length > 2) {
    return 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3)
  }
  // "O'Brien" style.
  if (lower.startsWith("o'") && lower.length > 2) {
    return "O'" + lower.charAt(2).toUpperCase() + lower.slice(3)
  }
  // Hyphenated (Smith-Jones) and apostrophe parts each get capitalized.
  return lower.replace(/(^|[-'])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

/**
 * Title-case a full name string. Splits on whitespace, keeps `&`/`/` separators
 * as their own visible tokens so "art&mary" becomes "Art & Mary".
 */
export function titleCaseName(name: string): string {
  const spaced = name.replace(/\s*([&/+])\s*/g, ' $1 ')
  const parts = spaced.split(/\s+/).filter(Boolean)
  return parts
    .map((part, i) => {
      if (part === '&' || part === '/' || part === '+') return part
      return titleCaseToken(part, i === 0)
    })
    .join(' ')
}

/** Trim, collapse internal whitespace, and title-case. */
export function normalizeName(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, ' ')
  if (collapsed.length === 0) return ''
  return titleCaseName(collapsed)
}

/**
 * Normalize a US phone number to `(999) 999-9999`. Returns null when the value
 * has no usable 10/11-digit number (so the caller can flag rather than fake).
 */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  let ten = digits
  if (digits.length === 11 && digits.startsWith('1')) ten = digits.slice(1)
  if (ten.length !== 10) return null
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

function isJunkName(normalized: string): boolean {
  if (normalized.length === 0) return true
  if (PLACEHOLDER_NAMES.has(normalized.toLowerCase())) return true
  // Nothing but punctuation/digits — no letters at all.
  if (!/[A-Za-z]/.test(normalized)) return true
  return false
}

function hasLetters(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

function isSingleWord(normalized: string): boolean {
  return normalized.split(/\s+/).filter(Boolean).length === 1
}

/**
 * Audit a batch of customers. Every row yields a suggestion; rows that are
 * already clean come back with `autoFixed:false, needsReview:false` and no
 * reasons, so the caller can partition them into a "looks clean" bucket.
 */
export function auditCustomers(customers: Customer[]): CleanupSuggestion[] {
  return customers.map((c) => auditCustomer(c))
}

function auditCustomer(customer: Customer): CleanupSuggestion {
  const currentName = customer.name ?? ''
  const currentPhone = customer.phone ?? ''
  const reasons: CleanupFlagReason[] = []

  const normalizedName = normalizeName(currentName)
  let suggestedName = normalizedName
  let suggestedPhone: string | null = currentPhone.trim() || null

  // --- Name-shape flags (do not by themselves force a suggestion) ---
  const nameIsJunk = isJunkName(normalizedName)
  if (nameIsJunk) {
    reasons.push('junk_name')
    suggestedName = '' // nothing trustworthy to propose
  }

  const nameHasTwoPeople = !nameIsJunk && TWO_PEOPLE_RE.test(currentName.trim())
  if (nameHasTwoPeople) reasons.push('two_people')

  // --- Casing / whitespace (safe auto-fix) ---
  const trimmedCollapsed = currentName.trim().replace(/\s+/g, ' ')
  if (!nameIsJunk) {
    if (currentName !== trimmedCollapsed) reasons.push('whitespace')
    if (trimmedCollapsed !== normalizedName) reasons.push('casing')
  }

  // --- Phone audit ---
  const phoneTrimmed = currentPhone.trim()
  const phoneHasDigits = /\d/.test(phoneTrimmed)
  const phoneHasLetters = hasLetters(phoneTrimmed)

  let phoneIsAlpha = false
  if (phoneTrimmed.length === 0) {
    reasons.push('missing_phone')
    suggestedPhone = null
  } else if (phoneHasLetters && !phoneHasDigits) {
    // Pure alphabetic phone — almost always a misfiled last name.
    phoneIsAlpha = true
    reasons.push('non_numeric_phone')
    suggestedPhone = null
  } else {
    const normalizedPhone = normalizePhone(phoneTrimmed)
    if (normalizedPhone) {
      suggestedPhone = normalizedPhone
      if (normalizedPhone !== phoneTrimmed) reasons.push('phone_format')
    } else {
      // Has digits but not a valid 10/11-digit US number — can't safely fix.
      reasons.push('phone_format')
    }
  }

  // --- Cross-field: single-word name + alphabetic phone = last name misfiled ---
  const nameInPhone =
    phoneIsAlpha && !nameIsJunk && !nameHasTwoPeople && isSingleWord(normalizedName)
  if (nameInPhone) {
    reasons.push('name_in_phone')
    suggestedName = `${normalizedName} ${titleCaseName(phoneTrimmed)}`.trim()
    suggestedPhone = null
  }

  // --- Missing last name (only when we didn't just build one from the phone) ---
  if (!nameIsJunk && !nameHasTwoPeople && !nameInPhone && isSingleWord(normalizedName)) {
    reasons.push('missing_last_name')
  }

  // A suggestion is auto-fixable only when every reason is mechanical AND we
  // actually produced a concrete replacement value.
  const AUTO_REASONS: CleanupFlagReason[] = ['casing', 'whitespace', 'phone_format']
  const REVIEW_REASONS = new Set<CleanupFlagReason>([
    'missing_last_name',
    'junk_name',
    'two_people',
    'non_numeric_phone',
    'name_in_phone',
    'missing_phone',
  ])

  const hasReviewReason = reasons.some((r) => REVIEW_REASONS.has(r))
  // A dangling phone_format with no concrete suggestion also needs eyes.
  const phoneFormatUnresolved =
    reasons.includes('phone_format') && suggestedPhone === null && phoneHasDigits

  const needsReview = hasReviewReason || phoneFormatUnresolved
  const hasChange =
    suggestedName !== currentName || (suggestedPhone ?? '') !== currentPhone
  const autoFixed =
    !needsReview &&
    hasChange &&
    reasons.length > 0 &&
    reasons.every((r) => AUTO_REASONS.includes(r))

  return {
    customerId: customer.id,
    currentName,
    currentPhone,
    suggestedName,
    suggestedPhone,
    reasons,
    autoFixed,
    needsReview,
  }
}

/** Human-friendly label for a flag reason (used by the UI). */
export const REASON_LABELS: Record<CleanupFlagReason, string> = {
  casing: 'Casing',
  whitespace: 'Extra spaces',
  missing_last_name: 'No last name',
  junk_name: 'Junk / placeholder',
  two_people: 'Two people',
  non_numeric_phone: 'Letters in phone',
  name_in_phone: 'Last name in phone',
  phone_format: 'Phone format',
  missing_phone: 'No phone',
}
