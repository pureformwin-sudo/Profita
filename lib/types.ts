export type JobType = 'Residential' | 'Commercial' | 'Storefront'
export type PaymentMethod = 'Cash' | 'Card' | 'Check' | 'Zelle' | 'Other' | 'Venmo'
export type PaymentStatus = 'Paid' | 'Pending'
export type RecurrenceFrequency = 'none' | 'weekly' | 'monthly'
export type JobStatus = 'Scheduled' | 'On the way' | 'In progress' | 'Completed' | 'Invoiced' | 'Paid' | 'Closed'
export type ExpenseCategory = 'Fuel' | 'Equipment' | 'Supplies' | 'Marketing' | 'Software' | 'Other'
// Built-in categories offered by default. Users can add their own (stored in
// settings.expense_categories); category is persisted as free text.
export const DEFAULT_EXPENSE_CATEGORIES: string[] = ['Fuel', 'Equipment', 'Supplies', 'Marketing', 'Software', 'Other']
// How a transaction affects expense totals. 'transfer' (e.g. paying a credit
// card bill, moving money between accounts) is recorded but NEVER counted as a
// business expense, so money isn't double-counted.
export type TransactionType = 'business_expense' | 'transfer'
// Tax treatment is always chosen manually — nothing is auto-marked deductible.
export type TaxTreatment = 'unreviewed' | 'likely_deductible' | 'not_deductible' | 'ask_accountant'
// A receipt / document attached to an expense (stored in Vercel Blob).
export interface ExpenseAttachment {
  url: string
  pathname: string
  name: string
  size: number
  contentType: string
  uploadedAt: string
}
export type PaymentSource = 'Venmo' | 'Cash App' | 'Invoice' | 'Zelle' | 'Check' | 'Other'
export type PendingStatus = 'Pending' | 'Processing' | 'On Hold'
export type ExpenseStatus = 'Unpaid' | 'Scheduled'
export type PaymentType = 'Hourly' | 'PerJob'

// Employee types
export interface Employee {
  id: string
  name: string
  email?: string
  phone?: string
  paymentType: PaymentType
  hourlyRate?: number
  perJobRate?: number
  notes?: string
  active: boolean
  createdAt: string
}

export interface JobWorker {
  id: string
  jobId: string
  employeeId: string
  employeeName?: string
  hoursWorked?: number
  amountEarned: number
  createdAt: string
}

export interface PayrollSummary {
  employeeId: string
  employeeName: string
  totalEarned: number
  totalHours?: number
  jobCount: number
  jobs: {
    id: string
    customerName: string
    amount: number
    jobPrice?: number
    date: string
    hours?: number
  }[]
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid'
}


export interface Income {
  id: string
  amount: number
  date: string
  customerName: string
  jobType: JobType
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  jobId?: string
  notes?: string
  createdAt: string
}

export interface Expense {
  id: string
  amount: number
  date: string
  category: string // free text; defaults + custom categories from settings
  description: string
  paymentMethod: PaymentMethod
  recurrence: RecurrenceFrequency
  notes?: string
  createdAt: string
  // Accounting enrichment (script 34). All optional / safe defaults.
  vendor?: string | null
  businessPurpose?: string | null
  transactionType?: TransactionType   // defaults to 'business_expense'
  taxTreatment?: TaxTreatment          // defaults to 'unreviewed'
  taxNote?: string | null
  jobId?: string | null
  customerId?: string | null
  attachments?: ExpenseAttachment[]
}

// Intent to enroll a customer in a recurring Service Plan, captured on a job
// and activated ONLY when the job is Completed/Paid.
export interface PendingPlanEnrollment {
  planId: string
  priceOverride: number | null   // null = use master plan price
  autoRenew: boolean | null      // null = inherit plan setting
  note: string | null            // optional internal note stored on the membership
  anchorDate: string | null      // YYYY-MM-DD; defaults to the job's service date
  mode: 'enroll' | 'change'      // 'change' = user confirmed replacing a different active plan
}

export interface Job {
  id: string
  customerId: string
  estimateId?: string  // Linked estimate (if created from estimate)
  invoiceId?: string   // Linked invoice (if invoice was created for this job)
  customerPlanId?: string | null  // Linked service-plan membership (recurring occurrence)
  pendingPlanEnrollment?: PendingPlanEnrollment | null // enroll on completion
  date: string
  startTime?: string   // HH:mm format
  endTime?: string     // HH:mm format
  jobType: JobType
  price: number
  paidAmount?: number  // Amount paid so far (for partial payments)
  expenses?: number
  status: JobStatus
  notes?: string
  createdAt: string
}

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  createdAt: string
  salesRepId?: string
  salesRepName?: string
}

export interface ProfitAllocation {
  profit: number
  expenses: number
  taxes: number
  misc: number
}

export interface BusinessProfile {
  businessName: string
  ownerName: string
  phone: string
  email?: string
  serviceArea: string
  weeklyGoal: number
  taxRate: number
}

// JIM external-app payment integration config (Settings > Payments).
export interface JimPaymentSettings {
  enabled: boolean
  defaultPaymentType: 'tap_to_pay' | 'payment_link'
  defaultFeePaidBy: 'business' | 'customer'
  showEstimatedFee: boolean
  accountLabel?: string
}

export interface PaymentSettings {
  jim: JimPaymentSettings
}

export const defaultPaymentSettings: PaymentSettings = {
  jim: {
    enabled: true,
    defaultPaymentType: 'tap_to_pay',
    defaultFeePaidBy: 'business',
    showEstimatedFee: true,
    accountLabel: '',
  },
}

export interface Settings {
  profitAllocation: ProfitAllocation
  expenseCategories: string[]
  darkMode: boolean
  profile?: BusinessProfile
  paymentSettings?: PaymentSettings
}

export interface PendingIncome {
  id: string
  clientName: string
  amount: number
  source: PaymentSource
  status: PendingStatus
  expectedDate: string
  notes?: string
  createdAt: string
}

export interface UpcomingExpense {
  id: string
  name: string
  amount: number
  category: ExpenseCategory
  dueDate: string
  status: ExpenseStatus
  notes?: string
  createdAt: string
}

export type Transaction = (Income & { type: 'income' }) | (Expense & { type: 'expense' })

// Invoice & Estimate types (lowercase to match database CHECK constraints)
export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'

export interface EstimateItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Estimate {
  id: string
  customerId: string
  customerName?: string
  estimateNumber: string
  status: EstimateStatus
  issueDate: string
  expiryDate: string
  items: EstimateItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  notes?: string
  createdAt: string
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: string
  customerId: string
  customerName?: string
  jobId?: string
  estimateId?: string
  invoiceNumber: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  items: InvoiceItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string
  stripePaymentIntentId?: string
  createdAt: string
}

// Notification types for D2D CRM
export type NotificationChannel = 'sms' | 'email' | 'both' | 'none'
export type NotificationType = 
  | 'lead_followup'
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'appointment_missed'
  | 'invoice_sent'
  | 'payment_reminder'
  | 'job_completed'
  | 'hot_lead_alert'

export type NotificationStatus = 'sent' | 'failed' | 'pending' | 'scheduled'

export interface NotificationLog {
  id: string
  customerId: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  repId?: string
  repName?: string
  type: NotificationType
  channel: 'sms' | 'email'
  message: string
  subject?: string
  status: NotificationStatus
  errorMessage?: string
  jobId?: string
  invoiceId?: string
  sentAt: string
  createdAt: string
}

export interface NotificationSettings {
  smsEnabled: boolean
  emailEnabled: boolean
  defaultChannel: NotificationChannel
  // User's own API credentials (stored securely per-user)
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioPhoneNumber?: string
  resendApiKey?: string
  resendFromEmail?: string // e.g., "notifications@yourdomain.com"
  templates: {
    [key in NotificationType]: {
      sms: string
      email: string
      emailSubject: string
      enabled: boolean
    }
  }
}

export interface CustomerNotificationPrefs {
  preferredChannel: NotificationChannel
  smsConsent: boolean
  emailConsent: boolean
}

// In-App Notification System
export type InAppNotificationCategory = 
  | 'job'
  | 'invoice'
  | 'payment'
  | 'estimate'
  | 'customer'
  | 'schedule'
  | 'team'
  | 'plan'
  | 'ai'
  | 'system'

export type InAppNotificationType =
  // Jobs
  | 'job_created'
  | 'job_scheduled'
  | 'job_starting_soon'
  | 'job_on_the_way'
  | 'job_started'
  | 'job_completed'
  | 'job_needs_invoice'
  | 'job_rescheduled'
  | 'job_cancelled'
  | 'job_overdue'
  // Invoices
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'invoice_payment_failed'
  | 'invoice_reminder_needed'
  // Payments
  | 'payment_received'
  | 'partial_payment_received'
  | 'payment_needs_deposit'
  | 'payment_method_recorded'
  // Estimates
  | 'estimate_created'
  | 'estimate_sent'
  | 'estimate_accepted'
  | 'estimate_rejected'
  | 'estimate_expired'
  | 'estimate_needs_followup'
  | 'estimate_ready_to_convert'
  // Customers
  | 'customer_added'
  | 'customer_upcoming_job'
  | 'customer_unpaid_balance'
  | 'customer_due_followup'
  | 'customer_upsell_opportunity'
  | 'customer_plan_eligible'
  // Schedule
  | 'schedule_job_reminder'
  | 'schedule_today_summary'
  | 'schedule_time_changed'
  | 'schedule_worker_assigned'
  | 'schedule_route_changed'
  // Team
  | 'team_worker_assigned'
  | 'team_worker_traveling'
  | 'team_worker_started'
  | 'team_worker_completed'
  | 'team_payroll_owed'
  | 'team_worker_idle'
  // Service Plans
  | 'plan_new_member'
  | 'plan_renewal_upcoming'
  | 'plan_payment_due'
  | 'plan_needs_job_scheduled'
  | 'plan_job_auto_created'
  // AI Growth
  | 'ai_upsell_opportunity'
  | 'ai_repeat_service_due'
  | 'ai_pricing_opportunity'
  | 'ai_revenue_warning'
  | 'ai_unconverted_followup'
  | 'ai_plan_opportunity'
  // System
  | 'system_welcome'
  | 'system_update'

// ---------------------------------------------------------------------------
// Christmas lights lease contracts
// ---------------------------------------------------------------------------

export type LightContractStatus = 'draft' | 'final'

/** Reusable boilerplate wording. One row per company per contract type. */
export interface ContractTemplate {
  id: string
  contractType: string
  name: string
  /** Raw wording with {{placeholders}}. Supplied by the user. */
  body: string
  createdAt: string
  updatedAt: string
}

/**
 * One lease agreement. Customer name/address are SNAPSHOT onto the row rather
 * than joined, so an executed contract keeps the terms it was signed under
 * even if the customer record is later edited or deleted.
 */
export interface LightContract {
  id: string
  customerId: string | null
  contractNumber: string
  customerName: string
  serviceAddress: string | null
  customerEmail: string | null
  customerPhone: string | null
  price: number | null
  termYears: number | null
  installDate: string | null
  takedownDate: string | null
  notes: string | null
  /** Wording frozen at finalize time. Null while still a draft. */
  bodySnapshot: string | null
  status: LightContractStatus
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InAppNotification {
  id: string
  type: InAppNotificationType
  category: InAppNotificationCategory
  title: string
  message: string
  icon?: string
  read: boolean
  // Related record links
  customerId?: string
  jobId?: string
  invoiceId?: string
  estimateId?: string
  employeeId?: string
  planId?: string
  // Metadata
  createdAt: string
  expiresAt?: string
}
