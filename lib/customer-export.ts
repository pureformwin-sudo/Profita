import type { Customer, Job } from '@/lib/types'
import { customerLifetimeValue } from '@/lib/ai/insights'

// SMS campaign CSV export.
//
// Two independent gates decide who lands in the list:
//   1. at least one job whose work was actually delivered — Completed,
//      Invoiced, Paid, or Closed. Scheduled / On the way / In progress do not
//      count. This matches the app's canonical EARNED_JOB_STATUSES
//      (lib/lead-scoring-storage.ts): a finished job progresses
//      Completed → Invoiced → Paid → Closed, so all four mean the work was
//      done. (Cancelled/dead work is never a job status — it lives in the
//      leads domain as 'lost' — so nothing delivered is wrongly included.)
//   2. a phone that is a real, valid 10-digit US number.
//
// `completedJobCount` / `lastCompletedJobDate` count these earned jobs, and
// `lifetimeValue` reuses the app's canonical `customerLifetimeValue`, so the
// dollar figure matches what the rest of the app shows for that customer.

export interface ExportRow {
  firstName: string
  lastName: string
  /** E.164, e.g. +15595551234. */
  phone: string
  // Address is stored as one free-text field on the customer, so these five
  // columns are a best-effort parse (see parseAddress). Any column may be blank
  // when it can't be derived; the row still exports.
  addressLine1: string
  unit: string
  city: string
  state: string
  zip: string
  /** YYYY-MM-DD of the most recent earned (Completed/Invoiced/Paid/Closed) job. */
  lastCompletedJobDate: string
  completedJobCount: number
  lifetimeValue: number
}

/** One phone shared by 2+ customer records; only the kept row is exported. */
export interface PhoneCollision {
  phone: string
  kept: { name: string; lifetimeValue: number }
  dropped: { name: string; lifetimeValue: number }[]
}

export interface ExportStats {
  total: number
  passed: number
  excludedNoCompleted: number
  excludedBadPhone: number
  deduped: number
  collisions: PhoneCollision[]
  /** Of the exported (passed) rows, how many have no address on file. */
  missingAddress: number
}

export interface ExportResult {
  rows: ExportRow[]
  stats: ExportStats
}

/** First whitespace-delimited token is the first name; the remainder is the last name. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Convert a raw phone value to E.164 (`+1XXXXXXXXXX`), or null if it is not a
 * valid North American number.
 *
 * Rejects: wrong digit count, placeholders (all-identical digits like
 * 5555555555 / 0000000000), and NANP-invalid numbers (area code or exchange
 * whose leading digit is 0 or 1).
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return null
  // All-identical digits (0000000000, 5555555555, 1111111111, …).
  if (/^(\d)\1{9}$/.test(digits)) return null
  // NANP: area code and exchange must both start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null
  return `+1${digits}`
}

export interface ParsedAddress {
  line1: string
  unit: string
  city: string
  state: string
  zip: string
}

// USPS state/territory abbreviations, plus full names mapped to them, so a
// trailing "California" or "CA" both resolve to "CA".
const STATE_ABBRS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])
const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
}

// Street-type suffixes used to find where the street ends and the city begins
// when there is no comma to separate them.
const STREET_SUFFIXES = new Set([
  'ave', 'avenue', 'st', 'street', 'rd', 'road', 'dr', 'drive', 'ln', 'lane',
  'blvd', 'boulevard', 'ct', 'court', 'cir', 'circle', 'way', 'pl', 'place',
  'ter', 'terrace', 'pkwy', 'parkway', 'hwy', 'highway', 'loop', 'trail', 'trl',
  'run', 'path', 'pass', 'row', 'walk', 'sq', 'square',
])
const DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'north', 'south', 'east', 'west', 'ne', 'nw', 'se', 'sw'])

const norm = (t: string) => t.replace(/[.,]/g, '').toLowerCase()

const EMPTY_ADDRESS: ParsedAddress = { line1: '', unit: '', city: '', state: '', zip: '' }

/**
 * Best-effort parse of a single free-text address into five columns. The stored
 * data is inconsistent (street only, "street, city", or fully qualified), so
 * this is heuristic, not authoritative: it peels the zip, state, and unit off
 * the end, then splits line1 from city using commas when present and a
 * street-suffix heuristic otherwise. Any field may come back empty.
 */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  if (!raw) return { ...EMPTY_ADDRESS }
  let s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return { ...EMPTY_ADDRESS }

  const stripTail = (x: string) => x.replace(/[\s,]+$/, '')

  // 1. ZIP (5 or 5-4) at the very end.
  let zip = ''
  const zipM = s.match(/\b(\d{5})(?:-\d{4})?\s*$/)
  if (zipM) {
    zip = zipM[1]
    s = stripTail(s.slice(0, zipM.index))
  }

  // 2. State abbreviation or full name at the end.
  let state = ''
  const lower = s.toLowerCase()
  const twoLetter = s.match(/[A-Za-z]{2}\s*$/)
  if (twoLetter && STATE_ABBRS.has(twoLetter[0].trim().toUpperCase())) {
    state = twoLetter[0].trim().toUpperCase()
    s = stripTail(s.slice(0, twoLetter.index))
  } else {
    for (const [name, abbr] of Object.entries(STATE_NAMES)) {
      if (lower === name || lower.endsWith(' ' + name)) {
        state = abbr
        s = stripTail(s.slice(0, s.length - name.length))
        break
      }
    }
  }

  // 3. Secondary unit designator anywhere in what remains.
  let unit = ''
  const unitM = s.match(/\b(?:apt|apartment|unit|suite|ste|bldg|building|lot|rm|room|space|spc|trlr)\b\.?\s*#?\s*([A-Za-z0-9-]+)/i)
  if (unitM) {
    unit = unitM[1]
    s = (s.slice(0, unitM.index) + ' ' + s.slice(unitM.index! + unitM[0].length)).replace(/\s+/g, ' ').trim()
  } else {
    const hashM = s.match(/#\s*([A-Za-z0-9-]+)/)
    if (hashM) {
      unit = hashM[1]
      s = (s.slice(0, hashM.index) + ' ' + s.slice(hashM.index! + hashM[0].length)).replace(/\s+/g, ' ').trim()
    }
  }
  s = stripTail(s)

  // 4. Split line1 from city.
  let line1 = s
  let city = ''
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
    line1 = parts[0] ?? ''
    city = parts.slice(1).join(', ')
  } else if (state || zip) {
    // No comma but a geographic tail existed, so a trailing city is likely.
    // Split just after the last street suffix (absorbing a trailing directional
    // like "west" into the street), leaving the rest as the city.
    const tokens = s.split(' ')
    let suffixIdx = -1
    for (let i = 0; i < tokens.length; i++) {
      if (STREET_SUFFIXES.has(norm(tokens[i]))) suffixIdx = i
    }
    if (suffixIdx >= 0) {
      let end = suffixIdx
      if (end + 1 < tokens.length && DIRECTIONALS.has(norm(tokens[end + 1]))) end++
      if (end + 1 < tokens.length) {
        line1 = tokens.slice(0, end + 1).join(' ')
        city = tokens.slice(end + 1).join(' ')
      }
    }
  }

  return { line1: line1.trim(), unit: unit.trim(), city: city.trim(), state, zip }
}

function toDateOnly(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10)
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? date : d.toISOString().slice(0, 10)
}

// Mirrors EARNED_JOB_STATUSES in lib/lead-scoring-storage.ts: every status that
// means the work was actually delivered. Kept as a local literal set (rather
// than imported) so this pure, browser-safe module has no storage-layer deps.
const EARNED_JOB_STATUSES = new Set(['Completed', 'Invoiced', 'Paid', 'Closed'])

function isCompleted(status: string | undefined): boolean {
  return status !== undefined && EARNED_JOB_STATUSES.has(status)
}

/**
 * Build the campaign list from already-fetched (session-scoped) customers and
 * jobs. Pure and synchronous so it can be unit-tested and run in the browser.
 */
export function buildExportList(customers: Customer[], jobs: Job[]): ExportResult {
  const stats: ExportStats = {
    total: customers.length,
    passed: 0,
    excludedNoCompleted: 0,
    excludedBadPhone: 0,
    deduped: 0,
    collisions: [],
    missingAddress: 0,
  }

  // Index completed jobs by customer once, so the scan is O(jobs + customers).
  const completedByCustomer = new Map<string, Job[]>()
  for (const job of jobs) {
    if (!isCompleted(job.status)) continue
    const list = completedByCustomer.get(job.customerId)
    if (list) list.push(job)
    else completedByCustomer.set(job.customerId, [job])
  }

  interface Candidate extends ExportRow {
    name: string
    hasAddress: boolean
  }
  const candidates: Candidate[] = []

  for (const customer of customers) {
    const completed = completedByCustomer.get(customer.id) ?? []
    if (completed.length === 0) {
      stats.excludedNoCompleted++
      continue
    }
    const phone = toE164(customer.phone)
    if (!phone) {
      stats.excludedBadPhone++
      continue
    }
    const lastDate = completed
      .map((j) => toDateOnly(j.date))
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0]
    const { firstName, lastName } = splitName(customer.name)
    const rawAddress = (customer.address ?? '').trim()
    const addr = parseAddress(rawAddress)
    candidates.push({
      name: customer.name.trim() || '(unnamed)',
      firstName,
      lastName,
      phone,
      addressLine1: addr.line1,
      unit: addr.unit,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      hasAddress: rawAddress.length > 0,
      lastCompletedJobDate: lastDate,
      completedJobCount: completed.length,
      lifetimeValue: customerLifetimeValue(customer.id, jobs),
    })
  }

  // Dedupe by phone: keep the highest lifetime value (tie-break: more completed
  // jobs, then more recent completed job).
  const byPhone = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const list = byPhone.get(c.phone)
    if (list) list.push(c)
    else byPhone.set(c.phone, [c])
  }

  const kept: Candidate[] = []
  for (const [phone, group] of byPhone) {
    if (group.length === 1) {
      kept.push(group[0])
      continue
    }
    const ranked = [...group].sort((a, b) => {
      if (b.lifetimeValue !== a.lifetimeValue) return b.lifetimeValue - a.lifetimeValue
      if (b.completedJobCount !== a.completedJobCount)
        return b.completedJobCount - a.completedJobCount
      return a.lastCompletedJobDate < b.lastCompletedJobDate ? 1 : -1
    })
    const [winner, ...losers] = ranked
    kept.push(winner)
    stats.deduped += losers.length
    stats.collisions.push({
      phone,
      kept: { name: winner.name, lifetimeValue: winner.lifetimeValue },
      dropped: losers.map((l) => ({ name: l.name, lifetimeValue: l.lifetimeValue })),
    })
  }

  kept.sort((a, b) =>
    a.lastCompletedJobDate < b.lastCompletedJobDate
      ? 1
      : a.lastCompletedJobDate > b.lastCompletedJobDate
        ? -1
        : 0,
  )

  stats.passed = kept.length
  stats.missingAddress = kept.filter((c) => !c.hasAddress).length

  const rows: ExportRow[] = kept.map(({ name: _name, hasAddress: _hasAddress, ...row }) => row)
  return { rows, stats }
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize rows to CSV with the exact column order the spec requires. */
export function toCsv(rows: ExportRow[]): string {
  const header = [
    'first_name',
    'last_name',
    'phone',
    'address_line1',
    'unit',
    'city',
    'state',
    'zip',
    'last_completed_job_date',
    'completed_job_count',
    'lifetime_value',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.firstName),
        csvCell(r.lastName),
        csvCell(r.phone),
        csvCell(r.addressLine1),
        csvCell(r.unit),
        csvCell(r.city),
        csvCell(r.state),
        csvCell(r.zip),
        csvCell(r.lastCompletedJobDate),
        csvCell(r.completedJobCount),
        csvCell(r.lifetimeValue.toFixed(2)),
      ].join(','),
    )
  }
  return lines.join('\r\n')
}
