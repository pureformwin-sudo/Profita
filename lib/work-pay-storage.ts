// =============================================================================
// Work & Pay ledger
// =============================================================================
// Backed by scripts/42, 43, 45, 46.
//
// The core invariant, enforced in SQL and mirrored here:
//
//     outstanding = sum(earnings) - sum(payment_allocations)
//
// There is no "paid" boolean on an earning. A payment is a separate row that is
// ALLOCATED against specific earnings, so a partial payment is representable
// and "who do I still owe" is always derived, never stored and never guessed.
//
// All writes go through SQL functions (record_work_entry, apply_employee_payment)
// so a work entry can never exist without its earning, and a payment can never
// allocate more than it is worth. Doing that in TypeScript would leave the
// ledger corrupt if the browser died between two awaits.
// =============================================================================

import { createClient, getCachedUser } from '@/lib/supabase/client'
import type { CompType, PerJobLine, PaymentMethod } from '@/lib/work-pay-math'

function getSupabase() {
  return createClient()
}

// Missing table => migration 42 has not been run.
export function isMissingTable(error: any): boolean {
  return error?.code === '42P01' || error?.code === '42883'
}

// PostgREST can serialise numeric(10,2) as a string to preserve precision.
// Every money value from the DB goes through this.
function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

async function getUserCompanyId(): Promise<string | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (ownedCompany) return ownedCompany.id

  const { data: membership } = await supabase.rpc('get_my_membership')
  if (membership?.company_id) return membership.company_id

  return null
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

// Payment methods and comp-type labels live in lib/work-pay-math.ts so the
// pure math module and the storage layer can never drift apart.
export { PAYMENT_METHODS, COMP_TYPE_LABELS } from '@/lib/work-pay-math'
export type { PaymentMethod } from '@/lib/work-pay-math'

export interface EmployeeBalance {
  employeeId: string
  employeeName: string
  active: boolean
  totalEarned: number
  totalPaid: number
  outstanding: number
  unallocatedCredit: number
}

export interface WorkEntryJobLink {
  jobId: string
  jobLabel: string
  amountKind: 'standard' | 'custom' | 'bonus'
  amount: number | null
}

export interface WorkEntry {
  id: string
  employeeId: string
  employeeName: string
  workDate: string
  compType: CompType
  startTime: string | null
  endTime: string | null
  breakMinutes: number
  hoursOverride: number | null
  hours: number
  rateSnapshot: number | null
  flatAmount: number | null
  computedAmount: number
  notes: string | null
  entryMethod: 'manual' | 'clock'
  lockedAt: string | null
  jobs: WorkEntryJobLink[]
  // Derived from the ledger, not stored on the entry.
  amountPaid: number
  outstanding: number
}

export interface PaymentRecord {
  id: string
  employeeId: string
  employeeName: string
  amount: number
  paidOn: string
  method: string | null
  note: string | null
  isOpening: boolean
  payPeriodStart: string | null
  payPeriodEnd: string | null
  allocatedAmount: number
  unallocatedAmount: number
}

export interface WorkPaySummary {
  workingToday: number
  hoursThisWeek: number
  earnedThisWeek: number
  paidThisWeek: number
  totalOutstanding: number
}

export interface JobOption {
  id: string
  label: string
  scheduledDate: string | null
}

export interface WorkEntryFilters {
  employeeId?: string
  from?: string
  to?: string
  compType?: CompType
  payStatus?: 'all' | 'paid' | 'unpaid' | 'partial'
  jobId?: string
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export async function getEmployeeBalances(): Promise<EmployeeBalance[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('employee_balances')
  if (error) {
    if (isMissingTable(error)) throw error
    console.log('[v0] getEmployeeBalances error:', error.message)
    throw error
  }

  const rows = (data ?? []) as any[]
  const ids = rows.map((r) => r.employee_id)
  const nameById = new Map<string, { name: string; active: boolean }>()

  if (ids.length) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id,name,active')
      .in('id', ids)
    for (const e of emps ?? []) {
      nameById.set(e.id, { name: e.name, active: !!e.active })
    }
  }

  return rows.map((r) => ({
    employeeId: r.employee_id,
    employeeName: nameById.get(r.employee_id)?.name ?? 'Unknown',
    active: nameById.get(r.employee_id)?.active ?? false,
    totalEarned: num(r.total_earned),
    totalPaid: num(r.total_paid),
    outstanding: num(r.outstanding),
    unallocatedCredit: num(r.unallocated_credit),
  }))
}

/** Active employees, for the Add Work / Record Payment pickers. */
export async function getActiveEmployees(): Promise<{ id: string; name: string }[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('employees')
    .select('id,name')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data ?? []).map((e) => ({ id: e.id, name: e.name }))
}

/** Recent jobs for the "Jobs Worked" picker. */
export async function getJobOptions(limit = 200): Promise<JobOption[]> {
  const supabase = getSupabase()
  // jobs has customer_id (FK) and `date` - there is no customer_name/scheduled_date column.
  const { data, error } = await supabase
    .from('jobs')
    .select('id,job_type,date,customers(name)')
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((j: any) => ({
    id: j.id,
    label: [j.customers?.name, j.job_type].filter(Boolean).join(' - ') || 'Job',
    scheduledDate: j.date ?? null,
  }))
}

export async function getWorkEntries(filters: WorkEntryFilters = {}): Promise<WorkEntry[]> {
  const supabase = getSupabase()

  let query = supabase
    .from('employee_work_entries')
    .select(
      `id,employee_id,work_date,comp_type,start_time,end_time,break_minutes,
       hours_override,rate_snapshot,computed_amount,notes,entry_method,locked_at,
       work_entry_jobs(job_id,amount_kind,amount),
       employee_earnings(id,amount)`,
    )
    .order('work_date', { ascending: false })
    .limit(500)

  if (filters.employeeId) query = query.eq('employee_id', filters.employeeId)
  if (filters.compType) query = query.eq('comp_type', filters.compType)
  if (filters.from) query = query.gte('work_date', filters.from)
  if (filters.to) query = query.lte('work_date', filters.to)

  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) throw error
    console.log('[v0] getWorkEntries error:', error.message)
    throw error
  }

  const rows = (data ?? []) as any[]

  // Resolve names and job labels in bulk rather than per row.
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id)))
  const jobIds = Array.from(
    new Set(rows.flatMap((r) => (r.work_entry_jobs ?? []).map((j: any) => j.job_id))),
  )
  const earningIds = rows.flatMap((r) => (r.employee_earnings ?? []).map((e: any) => e.id))

  const [empRes, jobRes, allocRes] = await Promise.all([
    empIds.length
      ? supabase.from('employees').select('id,name').in('id', empIds)
      : Promise.resolve({ data: [] as any[] }),
    jobIds.length
      ? supabase.from('jobs').select('id,job_type,customers(name)').in('id', jobIds)
      : Promise.resolve({ data: [] as any[] }),
    earningIds.length
      ? supabase.from('payment_allocations').select('earning_id,amount').in('earning_id', earningIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const empName = new Map((empRes.data ?? []).map((e: any) => [e.id, e.name]))
  const jobLabel = new Map(
    (jobRes.data ?? []).map((j: any) => [
      j.id,
      [j.customers?.name, j.job_type].filter(Boolean).join(' - ') || 'Job',
    ]),
  )
  const paidByEarning = new Map<string, number>()
  for (const a of allocRes.data ?? []) {
    paidByEarning.set(a.earning_id, (paidByEarning.get(a.earning_id) ?? 0) + num(a.amount))
  }

  const entries: WorkEntry[] = rows.map((r) => {
    const earned = (r.employee_earnings ?? []).reduce((s: number, e: any) => s + num(e.amount), 0)
    const paid = (r.employee_earnings ?? []).reduce(
      (s: number, e: any) => s + (paidByEarning.get(e.id) ?? 0),
      0,
    )
    const computed = num(r.computed_amount)
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeName: empName.get(r.employee_id) ?? 'Unknown',
      workDate: r.work_date,
      compType: r.comp_type as CompType,
      startTime: r.start_time,
      endTime: r.end_time,
      breakMinutes: r.break_minutes ?? 0,
      hoursOverride: r.hours_override === null ? null : num(r.hours_override),
      hours: computeDisplayHours(r),
      rateSnapshot: r.rate_snapshot === null ? null : num(r.rate_snapshot),
      // There is no flat_amount column: for a flat entry the amount IS computed_amount.
    flatAmount: r.comp_type === 'flat' ? num(r.computed_amount) : null,
      computedAmount: computed,
      notes: r.notes,
      entryMethod: (r.entry_method ?? 'manual') as 'manual' | 'clock',
      lockedAt: r.locked_at,
      jobs: (r.work_entry_jobs ?? []).map((j: any) => ({
        jobId: j.job_id,
        jobLabel: jobLabel.get(j.job_id) ?? 'Job',
        amountKind: j.amount_kind,
        amount: j.amount === null ? null : num(j.amount),
      })),
      amountPaid: paid,
      outstanding: Math.round((earned - paid) * 100) / 100,
    }
  })

  // Pay-status and job filters are applied here because they depend on the
  // allocation rollup, which is not a column.
  return entries.filter((e) => {
    if (filters.jobId && !e.jobs.some((j) => j.jobId === filters.jobId)) return false
    const status = e.outstanding <= 0 ? 'paid' : e.amountPaid > 0 ? 'partial' : 'unpaid'
    if (filters.payStatus && filters.payStatus !== 'all' && filters.payStatus !== status) {
      return false
    }
    return true
  })
}

function computeDisplayHours(r: any): number {
  if (r.hours_override !== null && r.hours_override !== undefined) return num(r.hours_override)
  if (!r.start_time || !r.end_time) return 0
  const start = new Date(r.start_time).getTime()
  let end = new Date(r.end_time).getTime()
  if (end < start) end += 24 * 60 * 60 * 1000
  const gross = (end - start) / 3_600_000
  const net = gross - (r.break_minutes ?? 0) / 60
  return Math.max(0, Math.round(net * 100) / 100)
}

export async function getPayments(employeeId?: string): Promise<PaymentRecord[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('employee_payments')
    .select(
      `id,employee_id,amount,paid_on,method,memo,is_opening,pay_period_start,pay_period_end,
       payment_allocations(amount)`,
    )
    .order('paid_on', { ascending: false })
    .limit(300)

  if (employeeId) query = query.eq('employee_id', employeeId)

  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) throw error
    throw error
  }

  const rows = (data ?? []) as any[]
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id)))
  const { data: emps } = empIds.length
    ? await supabase.from('employees').select('id,name').in('id', empIds)
    : { data: [] as any[] }
  const empName = new Map((emps ?? []).map((e: any) => [e.id, e.name]))

  return rows.map((r) => {
    const amount = num(r.amount)
    const allocated = (r.payment_allocations ?? []).reduce(
      (s: number, a: any) => s + num(a.amount),
      0,
    )
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeName: empName.get(r.employee_id) ?? 'Unknown',
      amount,
      paidOn: r.paid_on,
      method: r.method,
      note: r.memo,
      isOpening: !!r.is_opening,
      payPeriodStart: r.pay_period_start,
      payPeriodEnd: r.pay_period_end,
      allocatedAmount: allocated,
      unallocatedAmount: Math.round((amount - allocated) * 100) / 100,
    }
  })
}

function startOfWeekISO(d = new Date()): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday start
  date.setDate(date.getDate() - diff)
  return date.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getWorkPaySummary(): Promise<WorkPaySummary> {
  const supabase = getSupabase()
  const weekStart = startOfWeekISO()
  const today = todayISO()

  const [entriesRes, paymentsRes, balances] = await Promise.all([
    supabase
      .from('employee_work_entries')
      .select('employee_id,work_date,computed_amount,start_time,end_time,break_minutes,hours_override')
      .gte('work_date', weekStart),
    supabase.from('employee_payments').select('amount,paid_on,is_opening').gte('paid_on', weekStart),
    getEmployeeBalances(),
  ])

  if (entriesRes.error && isMissingTable(entriesRes.error)) throw entriesRes.error

  const entries = (entriesRes.data ?? []) as any[]
  const payments = (paymentsRes.data ?? []) as any[]

  const workingToday = new Set(
    entries.filter((e) => e.work_date === today).map((e) => e.employee_id),
  ).size

  const hoursThisWeek = entries.reduce((s, e) => s + computeDisplayHours(e), 0)
  const earnedThisWeek = entries.reduce((s, e) => s + num(e.computed_amount), 0)
  // Opening payments are historical settlements, not money paid out this week.
  const paidThisWeek = payments
    .filter((p) => !p.is_opening)
    .reduce((s, p) => s + num(p.amount), 0)

  return {
    workingToday,
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
    earnedThisWeek: Math.round(earnedThisWeek * 100) / 100,
    paidThisWeek: Math.round(paidThisWeek * 100) / 100,
    totalOutstanding: Math.round(balances.reduce((s, b) => s + b.outstanding, 0) * 100) / 100,
  }
}

// -----------------------------------------------------------------------------
// Writes - all atomic, via SQL functions
// -----------------------------------------------------------------------------

export interface AddWorkEntryInput {
  employeeId: string
  workDate: string
  compType: CompType
  startTime?: string | null
  endTime?: string | null
  breakMinutes?: number
  hoursOverride?: number | null
  rate?: number | null
  flatAmount?: number | null
  notes?: string | null
  entryMethod?: 'manual' | 'clock'
  jobs?: PerJobLine[]
}

export async function addWorkEntry(input: AddWorkEntryInput): Promise<string> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) throw new Error('No company found for the current user.')

  const { data, error } = await supabase.rpc('record_work_entry', {
    p_company_id: companyId,
    p_employee_id: input.employeeId,
    p_work_date: input.workDate,
    p_comp_type: input.compType,
    p_start: input.startTime ?? null,
    p_end: input.endTime ?? null,
    p_break_minutes: input.breakMinutes ?? 0,
    p_hours_override: input.hoursOverride ?? null,
    p_rate: input.rate ?? null,
    p_flat_amount: input.flatAmount ?? null,
    p_notes: input.notes ?? null,
    p_entry_method: input.entryMethod ?? 'manual',
    p_jobs: input.jobs ?? [],
  })

  if (error) {
    console.log('[v0] addWorkEntry error:', error.message)
    throw error
  }
  return data as string
}

export interface RecordPaymentInput {
  employeeId: string
  amount: number
  paidOn: string
  method: PaymentMethod
  note?: string | null
  payPeriodStart?: string | null
  payPeriodEnd?: string | null
  createExpense?: boolean
  idempotencyKey?: string
}

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) throw new Error('No company found for the current user.')

  const { data, error } = await supabase.rpc('apply_employee_payment', {
    p_company_id: companyId,
    p_employee_id: input.employeeId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_method: input.method,
      p_memo: input.note ?? null,
    p_pay_period_start: input.payPeriodStart ?? null,
    p_pay_period_end: input.payPeriodEnd ?? null,
    p_expense_id: null,
    p_idempotency_key: input.idempotencyKey ?? null,
  })

  if (error) {
    console.log('[v0] recordPayment error:', error.message)
    throw error
  }
  return data as string
}

/** Deleting a payment un-applies its allocations via cascade. */
export async function deletePayment(paymentId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('employee_payments').delete().eq('id', paymentId)
  if (error) throw error
}

export async function deleteWorkEntry(entryId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('employee_work_entries').delete().eq('id', entryId)
  if (error) throw error
}
