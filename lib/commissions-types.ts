// =============================================================================
// Commission Types for Phase 5
// =============================================================================

// Trigger types for when commissions are calculated
export type CommissionTrigger = 
  | 'lead_created' 
  | 'job_created' 
  | 'job_completed' 
  | 'invoice_paid' 
  | 'payment_received' 
  | 'manual'

// How the rate is applied
export type CommissionRateType = 'percentage' | 'flat'

// Commission record status
export type CommissionStatus = 'pending' | 'earned' | 'approved' | 'paid' | 'void'

// =============================================================================
// Commission Rule (company-wide configuration)
// =============================================================================

export interface CommissionRule {
  id: string
  companyId: string
  name: string
  description?: string
  triggerType: CommissionTrigger
  rateType: CommissionRateType
  rateValue: number // e.g., 10 for 10% or $10 flat
  minBaseAmount?: number // Minimum base amount to qualify
  maxCommission?: number // Maximum commission cap
  appliesToRoles: string[] // e.g., ['sales_rep', 'manager']
  active: boolean
  priority: number // Higher priority rules are evaluated first
  createdAt: string
  updatedAt: string
}

export interface CommissionRuleInput {
  name: string
  description?: string
  triggerType: CommissionTrigger
  rateType: CommissionRateType
  rateValue: number
  minBaseAmount?: number
  maxCommission?: number
  appliesToRoles?: string[]
  active?: boolean
  priority?: number
}

// =============================================================================
// Commission Record (individual commission instance)
// =============================================================================

export interface Commission {
  id: string
  companyId: string
  employeeId?: string // FK to employees table (payroll profile)
  memberId?: string // FK to company_members table (user profile)
  ruleId?: string // FK to commission_rules
  leadId?: string
  jobId?: string
  invoiceId?: string
  paymentId?: string
  triggerType: CommissionTrigger
  amount: number // Calculated commission amount
  rate: number // The rate used for calculation
  rateType: CommissionRateType
  baseAmount: number // The base amount used for calculation
  status: CommissionStatus
  earnedAt?: string
  approvedAt?: string
  approvedBy?: string
  paidAt?: string
  paidBy?: string
  payoutReference?: string // Check number, payroll run ID, etc.
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CommissionInput {
  employeeId?: string
  memberId?: string
  ruleId?: string
  leadId?: string
  jobId?: string
  invoiceId?: string
  paymentId?: string
  triggerType: CommissionTrigger
  amount: number
  rate: number
  rateType: CommissionRateType
  baseAmount: number
  status?: CommissionStatus
  earnedAt?: string
  notes?: string
}

// =============================================================================
// Commission with joined data
// =============================================================================

export interface CommissionWithDetails extends Commission {
  employeeName?: string
  memberName?: string
  ruleName?: string
  customerName?: string
  jobType?: string
  invoiceNumber?: string
}

// =============================================================================
// Commission Summary (for reporting)
// =============================================================================

export interface CommissionSummary {
  employeeId: string
  employeeName: string
  memberId?: string
  totalEarned: number // All earned commissions (status = earned/approved/paid)
  totalPending: number // Status = pending
  totalApproved: number // Status = approved (awaiting payout)
  totalPaid: number // Status = paid
  commissionCount: number
  commissions: CommissionWithDetails[]
}

export interface CommissionPeriodSummary {
  periodStart: string
  periodEnd: string
  totalCommissions: number
  totalAmount: number
  byStatus: {
    pending: number
    earned: number
    approved: number
    paid: number
    void: number
  }
  byEmployee: CommissionSummary[]
}

// =============================================================================
// Calculation helpers
// =============================================================================

export interface CalculateCommissionParams {
  baseAmount: number
  rule: CommissionRule
  employeeCommissionRate?: number // Override from employee record
  employeeCommissionType?: CommissionRateType
}

export interface CalculatedCommission {
  amount: number
  rate: number
  rateType: CommissionRateType
  baseAmount: number
  ruleId?: string
  appliedCap: boolean
}
