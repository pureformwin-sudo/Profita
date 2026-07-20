export type JobType = 'Residential' | 'Commercial' | 'Storefront'
export type PaymentMethod = 'Cash' | 'Card' | 'Check' | 'Zelle' | 'Other' | 'Venmo'
export type PaymentStatus = 'Paid' | 'Pending'
export type RecurrenceFrequency = 'none' | 'weekly' | 'monthly'
export type JobStatus = 'Scheduled' | 'On the way' | 'In progress' | 'Completed' | 'Invoiced' | 'Paid' | 'Closed'
export type ExpenseCategory = 'Fuel' | 'Equipment' | 'Supplies' | 'Marketing' | 'Software' | 'Other'
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
  category: ExpenseCategory
  description: string
  paymentMethod: PaymentMethod
  recurrence: RecurrenceFrequency
  notes?: string
  createdAt: string
}

export interface Job {
  id: string
  customerId: string
  estimateId?: string  // Linked estimate (if created from estimate)
  invoiceId?: string   // Linked invoice (if invoice was created for this job)
  customerPlanId?: string | null  // Linked service-plan membership (recurring occurrence)
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

export interface Settings {
  profitAllocation: ProfitAllocation
  expenseCategories: ExpenseCategory[]
  darkMode: boolean
  profile?: BusinessProfile
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
