// =============================================================================
// Employee compensation history + time-based earnings
// =============================================================================
// Backed by scripts/40-employee-compensation-history.sql.
//
// Two deliberate boundaries:
//
//  1. job_workers stays authoritative for money already recorded ($9,982.40
//     live). Nothing here writes to it. Time-based figures are reported
//     ALONGSIDE it as "accrued labor", never merged into it, so historical
//     earnings are never rewritten.
//
//  2. Rates are resolved through effective-dated history, so editing someone's
//     rate today cannot retroactively change what last month cost.
// =============================================================================

import { createClient } from '@/lib/supabase/client'

function getSupabase() {
  return createClient()
}

// Missing table => migration 40 has not been run.
function isMissingTable(error: any): boolean {
  return error?.code === '42P01'
}

export type PayType = 'hourly' | 'per_job' | 'salary' | 'commission'

export interface CompensationRecord {
  id: string
  employeeId: string
  payType: PayType
  payRate: number
  commissionRate: number | null
  commissionType: string | null
  effectiveFrom: string
  effectiveTo: string | null
  note: string | null
  createdAt: string
  isCurrent: boolean
}

export interface EmployeeHours {
  employeeId: string
  employeeName: string
  workSeconds: number
  travelSeconds: number
  breakSeconds: number
  entryCount: number
  openEntries: number
  workHours: number
  travelHours: number
}

/** Mirrors unattributed_hours() exactly: it returns work_seconds + entry_count
 *  only. Reading fields the function does not return would render a confident
 *  0 rather than an absent value. */
export interface UnattributedHours {
  workSeconds: number
  entryCount: number
  workHours: number
}

export interface AccruedLabor {
  employeeId: string
  employeeName: string
  payType: PayType
  payRate: number
  workHours: number
  travelHours: number
  /** Hours x rate. Only meaningful for hourly staff. */
  accruedAmount: number
  /** True when pay type is not hourly, so hours x rate does not apply. */
  notHourly: boolean
}

export interface SetupState {
  needsMigration: boolean
}

const SETUP_SQL_HINT = 'scripts/40-employee-compensation-history.sql'

// -----------------------------------------------------------------------------
// Compensation history
// -----------------------------------------------------------------------------

export async function getCompensationHistory(
  employeeId: string,
): Promise<{ records: CompensationRecord[]; setup: SetupState }> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('employee_compensation_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false })

  if (error) {
    if (isMissingTable(error)) {
      console.log('[v0] compensation history table missing, run', SETUP_SQL_HINT)
      return { records: [], setup: { needsMigration: true } }
    }
    console.error('[v0] getCompensationHistory failed:', error.message)
    return { records: [], setup: { needsMigration: false } }
  }

  const records = (data ?? []).map((r: any) => ({
    id: r.id,
    employeeId: r.employee_id,
    payType: r.pay_type as PayType,
    payRate: Number(r.pay_rate ?? 0),
    commissionRate: r.commission_rate === null ? null : Number(r.commission_rate),
    commissionType: r.commission_type ?? null,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    note: r.note ?? null,
    createdAt: r.created_at,
    isCurrent: r.effective_to === null,
  }))

  return { records, setup: { needsMigration: false } }
}

/**
 * Record a rate change. The SQL trigger closes the previous open row at
 * effectiveFrom - 1 day, so history stays non-overlapping without the client
 * having to sequence two writes and risk a torn state.
 */
export async function addCompensationChange(input: {
  employeeId: string
  payType: PayType
  payRate: number
  commissionRate?: number | null
  commissionType?: string | null
  effectiveFrom: string
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.employeeId) return { ok: false, error: 'Missing employee' }
  if (!Number.isFinite(input.payRate) || input.payRate < 0) {
    return { ok: false, error: 'Pay rate must be zero or greater' }
  }
  if (!input.effectiveFrom) return { ok: false, error: 'Missing effective date' }

  const supabase = getSupabase()
  const { error } = await supabase.from('employee_compensation_history').insert({
    employee_id: input.employeeId,
    pay_type: input.payType,
    pay_rate: input.payRate,
    commission_rate: input.commissionRate ?? null,
    commission_type: input.commissionType ?? null,
    effective_from: input.effectiveFrom,
    note: input.note?.trim() ? input.note.trim() : null,
  })

  if (error) {
    if (isMissingTable(error)) {
      return { ok: false, error: `Run ${SETUP_SQL_HINT} first` }
    }
    console.error('[v0] addCompensationChange failed:', error.message)
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

// -----------------------------------------------------------------------------
// Hours from the job timer
// -----------------------------------------------------------------------------

export async function getEmployeeHours(options?: {
  startDate?: string
  endDate?: string
}): Promise<{ hours: EmployeeHours[]; setup: SetupState }> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('employee_hours_worked', {
    p_start: options?.startDate ?? null,
    p_end: options?.endDate ?? null,
  })

  if (error) {
    if (isMissingTable(error) || error.code === 'PGRST202') {
      return { hours: [], setup: { needsMigration: true } }
    }
    console.error('[v0] getEmployeeHours failed:', error.message)
    return { hours: [], setup: { needsMigration: false } }
  }

  const hours = (data ?? []).map((r: any) => {
    const workSeconds = Number(r.work_seconds ?? 0)
    const travelSeconds = Number(r.travel_seconds ?? 0)
    return {
      employeeId: r.employee_id,
      employeeName: r.employee_name ?? 'Unknown',
      workSeconds,
      travelSeconds,
      breakSeconds: Number(r.break_seconds ?? 0),
      entryCount: Number(r.entry_count ?? 0),
      openEntries: Number(r.open_entries ?? 0),
      workHours: workSeconds / 3600,
      travelHours: travelSeconds / 3600,
    }
  })

  return { hours, setup: { needsMigration: false } }
}

/**
 * Hours that could not be tied to an employee record.
 *
 * This is surfaced rather than discarded on purpose: every live timer hour is
 * currently unattributed, and silently reporting 0 total hours would look like
 * the feature works while hiding all the real data.
 */
export async function getUnattributedHours(options?: {
  startDate?: string
  endDate?: string
}): Promise<{ unattributed: UnattributedHours | null; setup: SetupState }> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('unattributed_hours', {
    p_start: options?.startDate ?? null,
    p_end: options?.endDate ?? null,
  })

  if (error) {
    if (isMissingTable(error) || error.code === 'PGRST202') {
      return { unattributed: null, setup: { needsMigration: true } }
    }
    console.error('[v0] getUnattributedHours failed:', error.message)
    return { unattributed: null, setup: { needsMigration: false } }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { unattributed: null, setup: { needsMigration: false } }

  const workSeconds = Number(row.work_seconds ?? 0)
  if (workSeconds === 0 && Number(row.entry_count ?? 0) === 0) {
    return { unattributed: null, setup: { needsMigration: false } }
  }

  return {
    unattributed: {
      workSeconds,
      entryCount: Number(row.entry_count ?? 0),
      workHours: workSeconds / 3600,
    },
    setup: { needsMigration: false },
  }
}

// -----------------------------------------------------------------------------
// Accrued labor = hours x effective rate
// -----------------------------------------------------------------------------

/**
 * Combine timer hours with each employee's rate.
 *
 * Reported separately from job_workers.amount_earned rather than reconciled
 * against it: job_workers records what was agreed per job, this records what
 * the logged time is worth. Merging them would double-count.
 */
export async function getAccruedLabor(options?: {
  startDate?: string
  endDate?: string
}): Promise<{ rows: AccruedLabor[]; setup: SetupState }> {
  const { hours, setup } = await getEmployeeHours(options)
  if (setup.needsMigration || hours.length === 0) {
    return { rows: [], setup }
  }

  const supabase = getSupabase()
  const ids = hours.map((h) => h.employeeId)

  // Resolve the rate as of the period end, so a raise today does not restate
  // an earlier period.
  const asOf = options?.endDate ?? new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('employee_compensation_history')
    .select('employee_id, pay_type, pay_rate, effective_from, effective_to')
    .in('employee_id', ids)
    .lte('effective_from', asOf)
    .order('effective_from', { ascending: false })

  if (error && !isMissingTable(error)) {
    console.error('[v0] getAccruedLabor rate lookup failed:', error.message)
  }

  // First row per employee wins (already ordered newest-first), honouring
  // effective_to so a closed window does not leak into a later period.
  const rateFor = new Map<string, { payType: PayType; payRate: number }>()
  for (const r of data ?? []) {
    if (rateFor.has(r.employee_id)) continue
    if (r.effective_to && r.effective_to < asOf) continue
    rateFor.set(r.employee_id, {
      payType: (r.pay_type ?? 'per_job') as PayType,
      payRate: Number(r.pay_rate ?? 0),
    })
  }

  const rows = hours.map((h) => {
    const rate = rateFor.get(h.employeeId)
    const payType = rate?.payType ?? 'per_job'
    const payRate = rate?.payRate ?? 0
    const isHourly = payType === 'hourly'
    return {
      employeeId: h.employeeId,
      employeeName: h.employeeName,
      payType,
      payRate,
      workHours: h.workHours,
      travelHours: h.travelHours,
      // Only hourly staff accrue by the hour. For everyone else this stays 0
      // instead of inventing a number from an unrelated per-job rate.
      accruedAmount: isHourly ? h.workHours * payRate : 0,
      notHourly: !isHourly,
    }
  })

  return { rows, setup: { needsMigration: false } }
}

// -----------------------------------------------------------------------------
// Identity linking
// -----------------------------------------------------------------------------

export interface LinkCandidate {
  memberId: string
  memberName: string
  memberEmail: string | null
  role: string | null
  userId: string | null
}

export async function getLinkCandidates(): Promise<LinkCandidate[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('company_members')
    .select('id, name, email, role, user_id')
    .order('name')

  if (error) {
    console.error('[v0] getLinkCandidates failed:', error.message)
    return []
  }

  return (data ?? []).map((r: any) => ({
    memberId: r.id,
    memberName: r.name ?? 'Unnamed',
    memberEmail: r.email ?? null,
    role: r.role ?? null,
    userId: r.user_id ?? null,
  }))
}

/**
 * Point an employee record at the team member who actually logs the time.
 *
 * Needed because no live timer user matches an employee record, so hours cannot
 * be attributed automatically. linked_user_id is copied from the member so
 * attribution works against time_entries.user_id, which is what the timer
 * actually writes (member_id is NULL on every existing row).
 */
export async function linkEmployeeToMember(
  employeeId: string,
  memberId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase()

  if (!memberId) {
    const { error } = await supabase
      .from('employees')
      .update({ member_id: null, linked_user_id: null })
      .eq('id', employeeId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  const { data: member, error: memberError } = await supabase
    .from('company_members')
    .select('id, user_id')
    .eq('id', memberId)
    .maybeSingle()

  if (memberError) return { ok: false, error: memberError.message }
  if (!member) return { ok: false, error: 'Team member not found' }

  const { error } = await supabase
    .from('employees')
    .update({ member_id: member.id, linked_user_id: member.user_id ?? null })
    .eq('id', employeeId)

  if (error) {
    // Unique index on member_id: one employee per member.
    if (error.code === '23505' || error.message.includes('duplicate')) {
      return { ok: false, error: 'That team member is already linked to another employee' }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
