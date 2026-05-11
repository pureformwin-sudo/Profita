// =============================================================================
// Commission Storage - CRUD for commissions and commission rules
// Phase 5: Team, Payroll, Roles, and Commissions
// =============================================================================

import { createClient, getCachedUser } from '@/lib/supabase/client'
import type {
  Commission,
  CommissionInput,
  CommissionWithDetails,
  CommissionRule,
  CommissionRuleInput,
  CommissionStatus,
  CommissionTrigger,
  CommissionSummary,
  CommissionPeriodSummary,
  CalculateCommissionParams,
  CalculatedCommission,
} from './commissions-types'

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
// COMMISSION RULES CRUD
// =============================================================================

/**
 * Get all commission rules for the current company
 */
export async function getCommissionRules(): Promise<CommissionRule[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  const { data, error } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching commission rules:', error)
    return []
  }

  return data.map(mapCommissionRuleFromDb)
}

/**
 * Get active commission rules for a specific trigger type
 */
export async function getActiveRulesForTrigger(
  triggerType: CommissionTrigger
): Promise<CommissionRule[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  const { data, error } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('company_id', companyId)
    .eq('trigger_type', triggerType)
    .eq('active', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('Error fetching active rules:', error)
    return []
  }

  return data.map(mapCommissionRuleFromDb)
}

/**
 * Get a single commission rule by ID
 */
export async function getCommissionRule(id: string): Promise<CommissionRule | null> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    console.error('Error fetching commission rule:', error)
    return null
  }

  return mapCommissionRuleFromDb(data)
}

/**
 * Create a new commission rule
 */
export async function addCommissionRule(
  input: CommissionRuleInput
): Promise<CommissionRule | null> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return null

  const { data, error } = await supabase
    .from('commission_rules')
    .insert({
      company_id: companyId,
      name: input.name,
      description: input.description || null,
      trigger_type: input.triggerType,
      rate_type: input.rateType,
      rate_value: input.rateValue,
      min_base_amount: input.minBaseAmount || null,
      max_commission: input.maxCommission || null,
      applies_to_roles: input.appliesToRoles || ['sales_rep'],
      active: input.active ?? true,
      priority: input.priority ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating commission rule:', error)
    return null
  }

  return mapCommissionRuleFromDb(data)
}

/**
 * Update a commission rule
 */
export async function updateCommissionRule(
  id: string,
  updates: Partial<CommissionRuleInput>
): Promise<CommissionRule | null> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.triggerType !== undefined) updateData.trigger_type = updates.triggerType
  if (updates.rateType !== undefined) updateData.rate_type = updates.rateType
  if (updates.rateValue !== undefined) updateData.rate_value = updates.rateValue
  if (updates.minBaseAmount !== undefined) updateData.min_base_amount = updates.minBaseAmount
  if (updates.maxCommission !== undefined) updateData.max_commission = updates.maxCommission
  if (updates.appliesToRoles !== undefined) updateData.applies_to_roles = updates.appliesToRoles
  if (updates.active !== undefined) updateData.active = updates.active
  if (updates.priority !== undefined) updateData.priority = updates.priority

  const { data, error } = await supabase
    .from('commission_rules')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating commission rule:', error)
    return null
  }

  return mapCommissionRuleFromDb(data)
}

/**
 * Delete a commission rule
 */
export async function deleteCommissionRule(id: string): Promise<boolean> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('commission_rules')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting commission rule:', error)
    return false
  }

  return true
}

// =============================================================================
// COMMISSIONS CRUD
// =============================================================================

/**
 * Get all commissions for the current company
 */
export async function getCommissions(options?: {
  status?: CommissionStatus | CommissionStatus[]
  employeeId?: string
  memberId?: string
  triggerType?: CommissionTrigger
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<Commission[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  let query = supabase
    .from('commissions')
    .select('*')
    .eq('company_id', companyId)

  if (options?.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status)
    } else {
      query = query.eq('status', options.status)
    }
  }

  if (options?.employeeId) {
    query = query.eq('employee_id', options.employeeId)
  }

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (options?.triggerType) {
    query = query.eq('trigger_type', options.triggerType)
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate)
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate)
  }

  query = query.order('created_at', { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching commissions:', error)
    return []
  }

  return data.map(mapCommissionFromDb)
}

/**
 * Get commissions with joined details (employee name, customer, etc.)
 */
export async function getCommissionsWithDetails(options?: {
  status?: CommissionStatus | CommissionStatus[]
  employeeId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<CommissionWithDetails[]> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return []

  let query = supabase
    .from('commissions')
    .select(`
      *,
      employees:employee_id (name),
      company_members:member_id (name),
      commission_rules:rule_id (name),
      jobs:job_id (job_type, customers:customer_id (name)),
      invoices:invoice_id (invoice_number)
    `)
    .eq('company_id', companyId)

  if (options?.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status)
    } else {
      query = query.eq('status', options.status)
    }
  }

  if (options?.employeeId) {
    query = query.eq('employee_id', options.employeeId)
  }

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate)
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate)
  }

  query = query.order('created_at', { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching commissions with details:', error)
    return []
  }

  return data.map((row: any) => ({
    ...mapCommissionFromDb(row),
    employeeName: row.employees?.name,
    memberName: row.company_members?.name,
    ruleName: row.commission_rules?.name,
    customerName: row.jobs?.customers?.name,
    jobType: row.jobs?.job_type,
    invoiceNumber: row.invoices?.invoice_number,
  }))
}

/**
 * Get a single commission by ID
 */
export async function getCommission(id: string): Promise<Commission | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    console.error('Error fetching commission:', error)
    return null
  }

  return mapCommissionFromDb(data)
}

/**
 * Create a new commission record
 */
export async function addCommission(input: CommissionInput): Promise<Commission | null> {
  const supabase = getSupabase()
  const companyId = await getUserCompanyId()
  if (!companyId) return null

  const { data, error } = await supabase
    .from('commissions')
    .insert({
      company_id: companyId,
      employee_id: input.employeeId || null,
      member_id: input.memberId || null,
      rule_id: input.ruleId || null,
      lead_id: input.leadId || null,
      job_id: input.jobId || null,
      invoice_id: input.invoiceId || null,
      payment_id: input.paymentId || null,
      trigger_type: input.triggerType,
      amount: input.amount,
      rate: input.rate,
      rate_type: input.rateType,
      base_amount: input.baseAmount,
      status: input.status || 'pending',
      earned_at: input.earnedAt || null,
      notes: input.notes || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating commission:', error)
    return null
  }

  return mapCommissionFromDb(data)
}

/**
 * Update a commission record
 */
export async function updateCommission(
  id: string,
  updates: Partial<{
    status: CommissionStatus
    earnedAt: string
    approvedAt: string
    approvedBy: string
    paidAt: string
    paidBy: string
    payoutReference: string
    notes: string
  }>
): Promise<Commission | null> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.earnedAt !== undefined) updateData.earned_at = updates.earnedAt
  if (updates.approvedAt !== undefined) updateData.approved_at = updates.approvedAt
  if (updates.approvedBy !== undefined) updateData.approved_by = updates.approvedBy
  if (updates.paidAt !== undefined) updateData.paid_at = updates.paidAt
  if (updates.paidBy !== undefined) updateData.paid_by = updates.paidBy
  if (updates.payoutReference !== undefined) updateData.payout_reference = updates.payoutReference
  if (updates.notes !== undefined) updateData.notes = updates.notes

  const { data, error } = await supabase
    .from('commissions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating commission:', error)
    return null
  }

  return mapCommissionFromDb(data)
}

/**
 * Mark a commission as earned
 */
export async function markCommissionEarned(id: string): Promise<Commission | null> {
  return updateCommission(id, {
    status: 'earned',
    earnedAt: new Date().toISOString(),
  })
}

/**
 * Mark a commission as approved
 */
export async function approveCommission(id: string, approvedBy: string): Promise<Commission | null> {
  return updateCommission(id, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy,
  })
}

/**
 * Mark a commission as paid
 */
export async function markCommissionPaid(
  id: string,
  paidBy: string,
  payoutReference?: string
): Promise<Commission | null> {
  return updateCommission(id, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    paidBy,
    payoutReference,
  })
}

/**
 * Void a commission
 */
export async function voidCommission(id: string, reason?: string): Promise<Commission | null> {
  const commission = await getCommission(id)
  if (!commission) return null

  return updateCommission(id, {
    status: 'void',
    notes: reason ? `${commission.notes || ''}\nVoided: ${reason}`.trim() : commission.notes,
  })
}

/**
 * Bulk mark commissions as paid
 */
export async function bulkMarkCommissionsPaid(
  ids: string[],
  paidBy: string,
  payoutReference?: string
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (const id of ids) {
    const result = await markCommissionPaid(id, paidBy, payoutReference)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed }
}

/**
 * Delete a commission (soft delete not implemented - just void instead)
 */
export async function deleteCommission(id: string): Promise<boolean> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('commissions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting commission:', error)
    return false
  }

  return true
}

// =============================================================================
// COMMISSION SUMMARIES
// =============================================================================

/**
 * Get commission summary by employee
 */
export async function getCommissionSummaryByEmployee(options?: {
  startDate?: string
  endDate?: string
}): Promise<CommissionSummary[]> {
  const commissions = await getCommissionsWithDetails({
    startDate: options?.startDate,
    endDate: options?.endDate,
  })

  // Group by employee
  const byEmployee = new Map<string, CommissionWithDetails[]>()
  
  for (const commission of commissions) {
    const key = commission.employeeId || 'unassigned'
    if (!byEmployee.has(key)) {
      byEmployee.set(key, [])
    }
    byEmployee.get(key)!.push(commission)
  }

  const summaries: CommissionSummary[] = []

  for (const [employeeId, employeeCommissions] of byEmployee) {
    const firstWithName = employeeCommissions.find(c => c.employeeName)
    
    summaries.push({
      employeeId,
      employeeName: firstWithName?.employeeName || 'Unassigned',
      memberId: employeeCommissions[0]?.memberId,
      totalEarned: employeeCommissions
        .filter(c => ['earned', 'approved', 'paid'].includes(c.status))
        .reduce((sum, c) => sum + c.amount, 0),
      totalPending: employeeCommissions
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + c.amount, 0),
      totalApproved: employeeCommissions
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + c.amount, 0),
      totalPaid: employeeCommissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + c.amount, 0),
      commissionCount: employeeCommissions.filter(c => c.status !== 'void').length,
      commissions: employeeCommissions,
    })
  }

  return summaries.sort((a, b) => b.totalEarned - a.totalEarned)
}

/**
 * Get commission period summary
 */
export async function getCommissionPeriodSummary(
  startDate: string,
  endDate: string
): Promise<CommissionPeriodSummary> {
  const commissions = await getCommissions({
    startDate,
    endDate,
  })

  const byEmployee = await getCommissionSummaryByEmployee({ startDate, endDate })

  return {
    periodStart: startDate,
    periodEnd: endDate,
    totalCommissions: commissions.filter(c => c.status !== 'void').length,
    totalAmount: commissions
      .filter(c => c.status !== 'void')
      .reduce((sum, c) => sum + c.amount, 0),
    byStatus: {
      pending: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
      earned: commissions.filter(c => c.status === 'earned').reduce((sum, c) => sum + c.amount, 0),
      approved: commissions.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0),
      paid: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0),
      void: commissions.filter(c => c.status === 'void').reduce((sum, c) => sum + c.amount, 0),
    },
    byEmployee,
  }
}

// =============================================================================
// COMMISSION CALCULATION
// =============================================================================

/**
 * Calculate commission amount based on rule and optional employee override
 */
export function calculateCommission(params: CalculateCommissionParams): CalculatedCommission {
  const { baseAmount, rule, employeeCommissionRate, employeeCommissionType } = params

  // Check minimum base amount
  if (rule.minBaseAmount && baseAmount < rule.minBaseAmount) {
    return {
      amount: 0,
      rate: 0,
      rateType: rule.rateType,
      baseAmount,
      ruleId: rule.id,
      appliedCap: false,
    }
  }

  // Use employee override if provided, otherwise use rule
  const rateType = employeeCommissionType || rule.rateType
  const rate = employeeCommissionRate ?? rule.rateValue

  // Calculate commission amount
  let amount: number
  if (rateType === 'percentage') {
    amount = baseAmount * (rate / 100)
  } else {
    amount = rate
  }

  // Apply cap if set
  let appliedCap = false
  if (rule.maxCommission && amount > rule.maxCommission) {
    amount = rule.maxCommission
    appliedCap = true
  }

  // Round to 2 decimal places
  amount = Math.round(amount * 100) / 100

  return {
    amount,
    rate,
    rateType,
    baseAmount,
    ruleId: rule.id,
    appliedCap,
  }
}

// =============================================================================
// DB MAPPERS
// =============================================================================

function mapCommissionRuleFromDb(row: any): CommissionRule {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    triggerType: row.trigger_type,
    rateType: row.rate_type,
    rateValue: row.rate_value,
    minBaseAmount: row.min_base_amount,
    maxCommission: row.max_commission,
    appliesToRoles: row.applies_to_roles || [],
    active: row.active,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCommissionFromDb(row: any): Commission {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    memberId: row.member_id,
    ruleId: row.rule_id,
    leadId: row.lead_id,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    triggerType: row.trigger_type,
    amount: row.amount,
    rate: row.rate,
    rateType: row.rate_type,
    baseAmount: row.base_amount,
    status: row.status,
    earnedAt: row.earned_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    payoutReference: row.payout_reference,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
