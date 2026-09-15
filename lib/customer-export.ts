import type { Customer, Job } from '@/lib/types'
import { customerLifetimeValue } from '@/lib/ai/insights'

// SMS campaign CSV export.
//
// Two independent gates decide who lands in the list:
//   1. at least one job with the LITERAL status 'Completed' — Scheduled,
//      On the way, In progress do not count, and (per product decision) the
//      downstream Invoiced/Paid/Closed statuses do NOT count either.
//   2. a phone that is a real, valid 10-digit US number.
//
// Note the deliberate asymmetry: `completedJobCount` / `lastCompletedJobDate`
// use the strict 'Completed' gate, but `lifetimeValue` reuses the app's
// canonical `customerLifetimeValue` (which also counts Paid) so the dollar
// figure matches what the rest of the app shows for that customer.

export interface ExportRow {
  firstName: string
  lastName: string
  /** E.164, e.g. +15595551234. */
  phone: string
  /** YYYY-MM-DD of the most recent 'Completed' job. */
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

function toDateOnly(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10)
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? date : d.toISOString().slice(0, 10)
}

function isCompleted(status: string | undefined): boolean {
  return status === 'Completed'
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
    candidates.push({
      name: customer.name.trim() || '(unnamed)',
      firstName,
      lastName,
      phone,
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

  const rows: ExportRow[] = kept.map(({ name: _name, ...row }) => row)
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
        csvCell(r.lastCompletedJobDate),
        csvCell(r.completedJobCount),
        csvCell(r.lifetimeValue.toFixed(2)),
      ].join(','),
    )
  }
  return lines.join('\r\n')
}
