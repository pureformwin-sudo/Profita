/**
 * Commission Trigger Functions - Phase 5.5
 * 
 * Non-blocking commission automation that:
 * - Triggers on payment_received, invoice_paid, job_created, lead_created
 * - Finds sales rep through the data chain
 * - Prevents duplicates with rule+entity checks
 * - Never fails the parent operation (log errors only)
 */

import { createClient } from '@/lib/supabase/client'
import { getActiveRulesForTrigger, addCommission } from '@/lib/commissions-storage'
import type { CommissionRule, CommissionTrigger, CommissionInput } from '@/lib/commissions-types'

// =============================================================================
// Helper: Calculate commission amount
// =============================================================================

function calculateCommissionAmount(
  baseAmount: number,
  rule: CommissionRule
): { amount: number; skipped: boolean; reason?: string } {
  // Check min base amount
  if (rule.minBaseAmount && baseAmount < rule.minBaseAmount) {
    return { amount: 0, skipped: true, reason: `Base amount $${baseAmount} < min $${rule.minBaseAmount}` }
  }

  let amount: number
  if (rule.rateType === 'percentage') {
    amount = baseAmount * (rule.rateValue / 100)
  } else {
    amount = rule.rateValue
  }

  // Apply max commission cap
  if (rule.maxCommission && amount > rule.maxCommission) {
    amount = rule.maxCommission
  }

  // Skip if calculated amount is 0 or negative
  if (amount <= 0) {
    return { amount: 0, skipped: true, reason: 'Calculated amount is 0 or negative' }
  }

  return { amount, skipped: false }
}

// =============================================================================
// Helper: Check if commission already exists (duplicate prevention)
// =============================================================================

async function commissionExists(
  supabase: ReturnType<typeof createClient>,
  ruleId: string,
  entityType: 'payment' | 'invoice' | 'job' | 'lead',
  entityId: string
): Promise<boolean> {
  const column = `${entityType}_id`
  
  const { data } = await supabase
    .from('commissions')
    .select('id')
    .eq('rule_id', ruleId)
    .eq(column, entityId)
    .maybeSingle()

  return !!data
}

// =============================================================================
// Helper: Find employee info (sales rep) through chain
// =============================================================================

interface EmployeeInfo {
  employeeId: string
  role?: string
}

async function findSalesRepFromLead(
  supabase: ReturnType<typeof createClient>,
  leadId: string
): Promise<EmployeeInfo | null> {
  const { data: lead } = await supabase
    .from('leads')
    .select('owner_employee_id')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead?.owner_employee_id) return null

  // Get employee role
  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('id', lead.owner_employee_id)
    .maybeSingle()

  if (!employee) return null

  return { employeeId: employee.id, role: employee.role || undefined }
}

async function findSalesRepFromJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string
): Promise<EmployeeInfo | null> {
  // First try: job -> lead_id -> lead.owner_employee_id
  const { data: job } = await supabase
    .from('jobs')
    .select('lead_id')
    .eq('id', jobId)
    .maybeSingle()

  if (job?.lead_id) {
    // Jobs are directly linked to leads via lead_id
    const { data: lead } = await supabase
      .from('leads')
      .select('owner_employee_id')
      .eq('id', job.lead_id)
      .maybeSingle()

    if (lead?.owner_employee_id) {
      const { data: employee } = await supabase
        .from('employees')
        .select('id, role')
        .eq('id', lead.owner_employee_id)
        .maybeSingle()

      if (employee) {
        return { employeeId: employee.id, role: employee.role || undefined }
      }
    }
  }

  // Second try: Check job_workers for the first assigned employee
  const { data: jobWorkers } = await supabase
    .from('job_workers')
    .select('employee_id, employees(id, role)')
    .eq('job_id', jobId)
    .limit(1)

  if (jobWorkers?.[0]?.employee_id) {
    const emp = jobWorkers[0].employees as any
    return { employeeId: jobWorkers[0].employee_id, role: emp?.role || undefined }
  }

  return null
}

async function findSalesRepFromInvoice(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string
): Promise<{ employee: EmployeeInfo | null; jobId?: string; baseAmount: number }> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('job_id, total')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    return { employee: null, baseAmount: 0 }
  }

  const baseAmount = Number(invoice.total) || 0

  if (invoice.job_id) {
    const employee = await findSalesRepFromJob(supabase, invoice.job_id)
    return { employee, jobId: invoice.job_id, baseAmount }
  }

  return { employee: null, baseAmount }
}

async function findSalesRepFromPayment(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string | null,
  jobId: string | null,
  paymentAmount: number
): Promise<{ employee: EmployeeInfo | null; invoiceId?: string; jobId?: string; baseAmount: number }> {
  // If we have an invoice, trace through it
  if (invoiceId) {
    const result = await findSalesRepFromInvoice(supabase, invoiceId)
    return { ...result, invoiceId }
  }

  // If we have a job directly, trace through it
  if (jobId) {
    const employee = await findSalesRepFromJob(supabase, jobId)
    return { employee, jobId, baseAmount: paymentAmount }
  }

  // No chain to follow
  return { employee: null, baseAmount: paymentAmount }
}

// =============================================================================
// Trigger: Payment Received
// =============================================================================

export async function triggerCommissionForPayment(payment: {
  id: string
  invoiceId: string | null
  jobId: string | null
  amount: number
}): Promise<void> {
  try {
    const supabase = createClient()
    
    // Get active rules for payment_received
    const rules = await getActiveRulesForTrigger('payment_received')
    if (rules.length === 0) return

    // Find sales rep through chain
    const { employee, invoiceId, jobId, baseAmount } = await findSalesRepFromPayment(
      supabase,
      payment.invoiceId,
      payment.jobId,
      payment.amount
    )

    if (!employee) {
      console.log('[Commission] No sales rep found for payment:', payment.id)
      return
    }

    // Process each rule
    for (const rule of rules) {
      // Check role eligibility
      if (rule.appliesToRoles.length > 0 && employee.role) {
        if (!rule.appliesToRoles.includes(employee.role)) {
          console.log('[Commission] Employee role', employee.role, 'not in rule roles:', rule.appliesToRoles)
          continue
        }
      }

      // Check for duplicate
      const exists = await commissionExists(supabase, rule.id, 'payment', payment.id)
      if (exists) {
        console.log('[Commission] Skipping duplicate for payment:', payment.id, 'rule:', rule.id)
        continue
      }

      // Calculate commission
      const calc = calculateCommissionAmount(baseAmount, rule)
      if (calc.skipped) {
        console.log('[Commission] Skipped:', calc.reason)
        continue
      }

      // Create commission with 'earned' status (payment already complete)
      const input: CommissionInput = {
        employeeId: employee.employeeId,
        ruleId: rule.id,
        paymentId: payment.id,
        invoiceId: invoiceId,
        jobId: jobId,
        triggerType: 'payment_received',
        amount: calc.amount,
        rate: rule.rateValue,
        rateType: rule.rateType,
        baseAmount,
        status: 'earned',
        earnedAt: new Date().toISOString(),
      }

      const created = await addCommission(input)
      if (created) {
        console.log('[Commission] Created payment_received commission:', created.id, 'amount:', calc.amount)
      }
    }
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[Commission] Error in triggerCommissionForPayment:', error)
  }
}

// =============================================================================
// Trigger: Invoice Paid
// =============================================================================

export async function triggerCommissionForInvoicePaid(invoice: {
  id: string
  jobId: string | null
  total: number
}): Promise<void> {
  try {
    const supabase = createClient()
    
    // Get active rules for invoice_paid
    const rules = await getActiveRulesForTrigger('invoice_paid')
    if (rules.length === 0) return

    // Find sales rep through chain
    let employee: EmployeeInfo | null = null
    if (invoice.jobId) {
      employee = await findSalesRepFromJob(supabase, invoice.jobId)
    }

    if (!employee) {
      console.log('[Commission] No sales rep found for invoice:', invoice.id)
      return
    }

    const baseAmount = Number(invoice.total) || 0

    // Process each rule
    for (const rule of rules) {
      // Check role eligibility
      if (rule.appliesToRoles.length > 0 && employee.role) {
        if (!rule.appliesToRoles.includes(employee.role)) {
          continue
        }
      }

      // Check for duplicate
      const exists = await commissionExists(supabase, rule.id, 'invoice', invoice.id)
      if (exists) {
        console.log('[Commission] Skipping duplicate for invoice:', invoice.id, 'rule:', rule.id)
        continue
      }

      // Calculate commission
      const calc = calculateCommissionAmount(baseAmount, rule)
      if (calc.skipped) {
        console.log('[Commission] Skipped:', calc.reason)
        continue
      }

      // Create commission with 'earned' status (invoice fully paid)
      const input: CommissionInput = {
        employeeId: employee.employeeId,
        ruleId: rule.id,
        invoiceId: invoice.id,
        jobId: invoice.jobId || undefined,
        triggerType: 'invoice_paid',
        amount: calc.amount,
        rate: rule.rateValue,
        rateType: rule.rateType,
        baseAmount,
        status: 'earned',
        earnedAt: new Date().toISOString(),
      }

      const created = await addCommission(input)
      if (created) {
        console.log('[Commission] Created invoice_paid commission:', created.id, 'amount:', calc.amount)
      }
    }
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[Commission] Error in triggerCommissionForInvoicePaid:', error)
  }
}

// =============================================================================
// Trigger: Job Created
// =============================================================================

export async function triggerCommissionForJobCreated(job: {
  id: string
  price: number
  estimateId?: string | null
  leadId?: string | null
}): Promise<void> {
  try {
    const supabase = createClient()
    
    // Get active rules for job_created
    const rules = await getActiveRulesForTrigger('job_created')
    if (rules.length === 0) return

    // Find sales rep through chain (job -> lead_id -> lead.owner_employee_id)
    // or from job_workers if no lead
    const employee = await findSalesRepFromJob(supabase, job.id)

    if (!employee) {
      console.log('[Commission] No sales rep found for job:', job.id)
      return
    }

    const baseAmount = Number(job.price) || 0

    // Process each rule
    for (const rule of rules) {
      // Check role eligibility
      if (rule.appliesToRoles.length > 0 && employee.role) {
        if (!rule.appliesToRoles.includes(employee.role)) {
          continue
        }
      }

      // Check for duplicate
      const exists = await commissionExists(supabase, rule.id, 'job', job.id)
      if (exists) {
        console.log('[Commission] Skipping duplicate for job:', job.id, 'rule:', rule.id)
        continue
      }

      // Calculate commission
      const calc = calculateCommissionAmount(baseAmount, rule)
      if (calc.skipped) {
        console.log('[Commission] Skipped:', calc.reason)
        continue
      }

      // Create commission with 'pending' status (job not yet complete)
      const input: CommissionInput = {
        employeeId: employee.employeeId,
        ruleId: rule.id,
        jobId: job.id,
        triggerType: 'job_created',
        amount: calc.amount,
        rate: rule.rateValue,
        rateType: rule.rateType,
        baseAmount,
        status: 'pending',
      }

      const created = await addCommission(input)
      if (created) {
        console.log('[Commission] Created job_created commission:', created.id, 'amount:', calc.amount)
      }
    }
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[Commission] Error in triggerCommissionForJobCreated:', error)
  }
}

// =============================================================================
// Trigger: Lead Created
// =============================================================================

export async function triggerCommissionForLeadCreated(lead: {
  id: string
  ownerEmployeeId: string | null
  estimatedValue: number | null
}): Promise<void> {
  try {
    const supabase = createClient()
    
    // Get active rules for lead_created
    const rules = await getActiveRulesForTrigger('lead_created')
    if (rules.length === 0) return

    // Lead has direct owner_employee_id
    if (!lead.ownerEmployeeId) {
      console.log('[Commission] No sales rep (owner_employee_id) for lead:', lead.id)
      return
    }

    // Get employee role
    const { data: employee } = await supabase
      .from('employees')
      .select('id, role')
      .eq('id', lead.ownerEmployeeId)
      .maybeSingle()

    if (!employee) {
      console.log('[Commission] Employee not found:', lead.ownerEmployeeId)
      return
    }

    // For lead_created, base amount is typically the estimated_value or a flat rate
    const baseAmount = lead.estimatedValue || 0

    // Process each rule
    for (const rule of rules) {
      // Check role eligibility
      if (rule.appliesToRoles.length > 0 && employee.role) {
        if (!rule.appliesToRoles.includes(employee.role)) {
          continue
        }
      }

      // Check for duplicate
      const exists = await commissionExists(supabase, rule.id, 'lead', lead.id)
      if (exists) {
        console.log('[Commission] Skipping duplicate for lead:', lead.id, 'rule:', rule.id)
        continue
      }

      // Calculate commission
      // For flat rate rules, baseAmount doesn't matter
      const calc = calculateCommissionAmount(
        rule.rateType === 'flat' ? rule.rateValue : baseAmount, 
        rule
      )
      if (calc.skipped) {
        console.log('[Commission] Skipped:', calc.reason)
        continue
      }

      // Create commission with 'pending' status (lead not yet converted)
      const input: CommissionInput = {
        employeeId: employee.id,
        ruleId: rule.id,
        leadId: lead.id,
        triggerType: 'lead_created',
        amount: calc.amount,
        rate: rule.rateValue,
        rateType: rule.rateType,
        baseAmount: rule.rateType === 'flat' ? rule.rateValue : baseAmount,
        status: 'pending',
      }

      const created = await addCommission(input)
      if (created) {
        console.log('[Commission] Created lead_created commission:', created.id, 'amount:', calc.amount)
      }
    }
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[Commission] Error in triggerCommissionForLeadCreated:', error)
  }
}
