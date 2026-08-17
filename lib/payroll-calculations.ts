// =============================================================================
// Payroll Calculations for Phase 5
// Calculates payroll summaries from job_workers and time_entries
// =============================================================================

import { createClient, getCachedUser } from '@/lib/supabase/client'
import type { Employee, JobWorker, PayrollSummary } from './types'

function getSupabase() {
  return createClient()
}

// Get the current user's company ID
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

// =============================================================================
// Types
// =============================================================================

export interface PayrollEntry {
  id: string
  employeeId: string
  employeeName: string
  jobId: string
  jobDate: string
  customerName: string
  jobType: string
  jobPrice: number
  hoursWorked?: number
  amountEarned: number
  paid: boolean
  paidAt?: string
}

export interface PayrollPeriodSummary {
  periodStart: string
  periodEnd: string
  totalEarned: number
  totalPaid: number
  totalUnpaid: number
  totalHours: number
  employeeCount: number
  jobCount: number
  entries: PayrollEntry[]
  byEmployee: EmployeePayrollSummary[]
}

export interface EmployeePayrollSummary {
  employeeId: string
  employeeName: string
  payType: 'hourly' | 'per_job'
  payRate: number
  totalEarned: number
  totalPaid: number
  totalUnpaid: number
  totalHours: number
  jobCount: number
  entries: PayrollEntry[]
  paymentStatus: 'unpaid' | 'partial' | 'paid'
}

export interface TimeEntrySummary {
  employeeId: string
  memberId: string
  employeeName: string
  totalMinutes: number
  totalHours: number
  entriesCount: number
  byDate: {
    date: string
    minutes: number
    entries: number
  }[]
}

// =============================================================================
// PAYROLL ENTRIES FROM JOB_WORKERS
// =============================================================================

/**
 * Get payroll entries for a date range
 */
export async function getPayrollEntries(options?: {
  startDate?: string
  endDate?: string
  employeeId?: string
  paid?: boolean
}): Promise<PayrollEntry[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  let query = supabase
    .from('job_workers')
    .select(`
      id,
      job_id,
      employee_id,
      hours_worked,
      amount_earned,
      paid,
      paid_at,
      created_at,
      employees:employee_id (name, pay_type, pay_rate),
      jobs:job_id (date, job_type, price, customer_id, customers:customer_id (name))
    `)
    .eq('company_id', companyId)

  if (options?.employeeId) {
    query = query.eq('employee_id', options.employeeId)
  }

  if (options?.paid !== undefined) {
    query = query.eq('paid', options.paid)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching payroll entries:', error)
    return []
  }

  // Filter by date if specified
  let entries = data.map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employees?.name || 'Unknown',
    jobId: row.job_id,
    jobDate: row.jobs?.date || row.created_at,
    customerName: row.jobs?.customers?.name || 'Unknown',
    jobType: row.jobs?.job_type || 'Unknown',
    jobPrice: row.jobs?.price || 0,
    hoursWorked: row.hours_worked,
    amountEarned: row.amount_earned || 0,
    paid: row.paid || false,
    paidAt: row.paid_at,
  }))

  if (options?.startDate) {
    entries = entries.filter(e => e.jobDate >= options.startDate!)
  }

  if (options?.endDate) {
    entries = entries.filter(e => e.jobDate <= options.endDate!)
  }

  return entries
}

/**
 * Get unpaid payroll entries
 */
export async function getUnpaidPayroll(): Promise<PayrollEntry[]> {
  return getPayrollEntries({ paid: false })
}

/**
 * Get payroll summary for a period
 */
export async function getPayrollPeriodSummary(
  startDate: string,
  endDate: string
): Promise<PayrollPeriodSummary> {
  const entries = await getPayrollEntries({ startDate, endDate })

  // Group by employee
  const byEmployeeMap = new Map<string, PayrollEntry[]>()
  for (const entry of entries) {
    if (!byEmployeeMap.has(entry.employeeId)) {
      byEmployeeMap.set(entry.employeeId, [])
    }
    byEmployeeMap.get(entry.employeeId)!.push(entry)
  }

  // Get employee details.
  // BUGFIX: this filtered employees by company_id, but company_id is NULL on 12
  // of 13 live employee rows, so the lookup returned almost nothing and every
  // pay type/rate silently fell back to the 'per_job' / $0 defaults below.
  // Fetching by the employee ids actually present is both correct and narrower;
  // RLS still scopes the rows to the caller's company.
  const supabase = getSupabase()
  const employeeIds = Array.from(byEmployeeMap.keys()).filter(Boolean)

  const { data: employees } = employeeIds.length
    ? await supabase
        .from('employees')
        .select('id, name, pay_type, pay_rate')
        .in('id', employeeIds)
    : { data: [] as any[] }

  const employeeMap = new Map<string, any>()
  for (const emp of employees || []) {
    employeeMap.set(emp.id, emp)
  }

  // Build employee summaries
  const byEmployee: EmployeePayrollSummary[] = []
  for (const [employeeId, employeeEntries] of byEmployeeMap) {
    const employee = employeeMap.get(employeeId)
    const totalEarned = employeeEntries.reduce((sum, e) => sum + e.amountEarned, 0)
    const totalPaid = employeeEntries.filter(e => e.paid).reduce((sum, e) => sum + e.amountEarned, 0)
    const totalUnpaid = totalEarned - totalPaid
    const totalHours = employeeEntries.reduce((sum, e) => sum + (e.hoursWorked || 0), 0)

    let paymentStatus: 'unpaid' | 'partial' | 'paid'
    if (totalPaid === 0) {
      paymentStatus = 'unpaid'
    } else if (totalPaid >= totalEarned) {
      paymentStatus = 'paid'
    } else {
      paymentStatus = 'partial'
    }

    byEmployee.push({
      employeeId,
      employeeName: employee?.name || employeeEntries[0]?.employeeName || 'Unknown',
      payType: employee?.pay_type === 'hourly' ? 'hourly' : 'per_job',
      payRate: employee?.pay_rate || 0,
      totalEarned,
      totalPaid,
      totalUnpaid,
      totalHours,
      jobCount: employeeEntries.length,
      entries: employeeEntries,
      paymentStatus,
    })
  }

  // Sort by total earned descending
  byEmployee.sort((a, b) => b.totalEarned - a.totalEarned)

  // Calculate totals
  const totalEarned = entries.reduce((sum, e) => sum + e.amountEarned, 0)
  const totalPaid = entries.filter(e => e.paid).reduce((sum, e) => sum + e.amountEarned, 0)
  const totalHours = entries.reduce((sum, e) => sum + (e.hoursWorked || 0), 0)
  const uniqueJobs = new Set(entries.map(e => e.jobId))

  return {
    periodStart: startDate,
    periodEnd: endDate,
    totalEarned,
    totalPaid,
    totalUnpaid: totalEarned - totalPaid,
    totalHours,
    employeeCount: byEmployee.length,
    jobCount: uniqueJobs.size,
    entries,
    byEmployee,
  }
}

/**
 * Mark job_worker entries as paid
 */
export async function markPayrollPaid(
  entryIds: string[],
  paidAt?: string
): Promise<{ success: number; failed: number }> {
  const supabase = getSupabase()
  let success = 0
  let failed = 0

  for (const id of entryIds) {
    const { error } = await supabase
      .from('job_workers')
      .update({
        paid: true,
        paid_at: paidAt || new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('Error marking payroll entry as paid:', error)
      failed++
    } else {
      success++
    }
  }

  return { success, failed }
}

/**
 * Mark all unpaid entries for an employee as paid
 */
export async function markEmployeePayrollPaid(
  employeeId: string,
  paidAt?: string
): Promise<{ success: number; failed: number }> {
  const unpaidEntries = await getPayrollEntries({ employeeId, paid: false })
  const entryIds = unpaidEntries.map(e => e.id)
  return markPayrollPaid(entryIds, paidAt)
}

// =============================================================================
// TIME ENTRIES SUMMARY
// =============================================================================

/**
 * Get time entry summary for employees
 */
export async function getTimeEntrySummary(options?: {
  startDate?: string
  endDate?: string
  memberId?: string
}): Promise<TimeEntrySummary[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  let query = supabase
    .from('time_entries')
    .select(`
      id,
      member_id,
      entry_type,
      start_time,
      end_time,
      duration_minutes,
      duration_seconds,
      created_at,
      company_members:member_id (name, user_id)
    `)
    .eq('company_id', companyId)
    // BUGFIX: this filtered entry_type = 'clock', but the job timer only ever
    // writes 'work' | 'travel' | 'break', so it matched zero rows and every
    // payroll hour total silently came back as 0. Breaks are unpaid, so they
    // are excluded here rather than filtered out later.
    .in('entry_type', ['work', 'travel'])

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  const { data, error } = await query.order('start_time', { ascending: false })

  if (error) {
    console.error('Error fetching time entries:', error)
    return []
  }

  // Filter by date if specified
  let entries = data || []
  if (options?.startDate) {
    entries = entries.filter(e => e.start_time >= options.startDate!)
  }
  if (options?.endDate) {
    entries = entries.filter(e => e.start_time <= options.endDate!)
  }

  // The timer has written duration_seconds on some rows and duration_minutes on
  // others, and a still-running entry has neither. Resolve one trustworthy
  // minute value per entry instead of reading a single column that may be null.
  const entryMinutes = (e: any): number => {
    if (typeof e.duration_minutes === 'number' && e.duration_minutes > 0) {
      return e.duration_minutes
    }
    if (typeof e.duration_seconds === 'number' && e.duration_seconds > 0) {
      return e.duration_seconds / 60
    }
    if (e.start_time && e.end_time) {
      const ms = new Date(e.end_time).getTime() - new Date(e.start_time).getTime()
      if (Number.isFinite(ms) && ms > 0) return ms / 60000
    }
    // Still running: contributes nothing rather than a bogus negative.
    return 0
  }

  // Group by member
  const byMember = new Map<string, any[]>()
  for (const entry of entries) {
    const memberId = entry.member_id
    if (!byMember.has(memberId)) {
      byMember.set(memberId, [])
    }
    byMember.get(memberId)!.push(entry)
  }

  // Build summaries
  const summaries: TimeEntrySummary[] = []
  for (const [memberId, memberEntries] of byMember) {
    const firstEntry = memberEntries[0]
    const totalMinutes = memberEntries.reduce((sum, e) => sum + entryMinutes(e), 0)

    // Group by date
    const byDateMap = new Map<string, { minutes: number; entries: number }>()
    for (const entry of memberEntries) {
      const date = entry.start_time.split('T')[0]
      if (!byDateMap.has(date)) {
        byDateMap.set(date, { minutes: 0, entries: 0 })
      }
      const dayData = byDateMap.get(date)!
      dayData.minutes += entryMinutes(entry)
      dayData.entries++
    }

    const byDate = Array.from(byDateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date))

    summaries.push({
      employeeId: memberId, // Using member_id as the identifier
      memberId,
      employeeName: firstEntry.company_members?.name || 'Unknown',
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      entriesCount: memberEntries.length,
      byDate,
    })
  }

  return summaries.sort((a, b) => b.totalMinutes - a.totalMinutes)
}

// =============================================================================
// COMBINED PAYROLL + COMMISSIONS SUMMARY
// =============================================================================

export interface TeamMemberEarnings {
  employeeId: string
  memberId?: string
  name: string
  payrollEarned: number
  payrollPaid: number
  payrollUnpaid: number
  commissionsEarned: number
  commissionsPaid: number
  commissionsUnpaid: number
  totalEarned: number
  totalPaid: number
  totalUnpaid: number
  hoursWorked: number
  jobCount: number
  commissionCount: number
}

/**
 * Get combined payroll + commission earnings for team members
 */
export async function getTeamMemberEarnings(options?: {
  startDate?: string
  endDate?: string
}): Promise<TeamMemberEarnings[]> {
  // Get payroll data
  const payrollSummary = options?.startDate && options?.endDate
    ? await getPayrollPeriodSummary(options.startDate, options.endDate)
    : await getPayrollPeriodSummary(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      )

  // Get commission data (dynamically import to avoid circular dependency)
  const { getCommissionSummaryByEmployee } = await import('./commissions-storage')
  const commissionSummaries = await getCommissionSummaryByEmployee({
    startDate: options?.startDate,
    endDate: options?.endDate,
  })

  // Merge payroll and commission data by employee
  const earningsMap = new Map<string, TeamMemberEarnings>()

  // Add payroll data
  for (const emp of payrollSummary.byEmployee) {
    earningsMap.set(emp.employeeId, {
      employeeId: emp.employeeId,
      memberId: undefined,
      name: emp.employeeName,
      payrollEarned: emp.totalEarned,
      payrollPaid: emp.totalPaid,
      payrollUnpaid: emp.totalUnpaid,
      commissionsEarned: 0,
      commissionsPaid: 0,
      commissionsUnpaid: 0,
      totalEarned: emp.totalEarned,
      totalPaid: emp.totalPaid,
      totalUnpaid: emp.totalUnpaid,
      hoursWorked: emp.totalHours,
      jobCount: emp.jobCount,
      commissionCount: 0,
    })
  }

  // Add commission data
  for (const comm of commissionSummaries) {
    const existing = earningsMap.get(comm.employeeId)
    if (existing) {
      existing.commissionsEarned = comm.totalEarned
      existing.commissionsPaid = comm.totalPaid
      existing.commissionsUnpaid = comm.totalApproved + comm.totalPending
      existing.totalEarned += comm.totalEarned
      existing.totalPaid += comm.totalPaid
      existing.totalUnpaid += comm.totalApproved + comm.totalPending
      existing.commissionCount = comm.commissionCount
      if (comm.memberId) existing.memberId = comm.memberId
    } else {
      earningsMap.set(comm.employeeId, {
        employeeId: comm.employeeId,
        memberId: comm.memberId,
        name: comm.employeeName,
        payrollEarned: 0,
        payrollPaid: 0,
        payrollUnpaid: 0,
        commissionsEarned: comm.totalEarned,
        commissionsPaid: comm.totalPaid,
        commissionsUnpaid: comm.totalApproved + comm.totalPending,
        totalEarned: comm.totalEarned,
        totalPaid: comm.totalPaid,
        totalUnpaid: comm.totalApproved + comm.totalPending,
        hoursWorked: 0,
        jobCount: 0,
        commissionCount: comm.commissionCount,
      })
    }
  }

  return Array.from(earningsMap.values()).sort((a, b) => b.totalEarned - a.totalEarned)
}
