'use client'

import { createClient } from '@/lib/supabase/client'
import type { InAppNotification, InAppNotificationType, InAppNotificationCategory, Job, Invoice, Estimate, Customer } from './types'
import { fetchMyMembershipCompanyId } from './membership-rpc'

// Get the current user's company ID
async function getUserCompanyId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // First check if user owns a company
  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (ownedCompany) return ownedCompany.id

  // Check if user is a member of a company via RPC.
  // Use the shared helper: get_my_membership RETURNS TABLE, so the raw result is
  // an array and reading .company_id directly off it is always undefined.
  const memberCompanyId = await fetchMyMembershipCompanyId(supabase)
  if (memberCompanyId) return memberCompanyId

  return null
}

// Map notification types to their categories
const TYPE_TO_CATEGORY: Record<InAppNotificationType, InAppNotificationCategory> = {
  // Jobs
  job_created: 'job',
  job_scheduled: 'job',
  job_starting_soon: 'job',
  job_on_the_way: 'job',
  job_started: 'job',
  job_completed: 'job',
  job_needs_invoice: 'job',
  job_rescheduled: 'job',
  job_cancelled: 'job',
  job_overdue: 'job',
  // Invoices
  invoice_created: 'invoice',
  invoice_sent: 'invoice',
  invoice_paid: 'invoice',
  invoice_overdue: 'invoice',
  invoice_payment_failed: 'invoice',
  invoice_reminder_needed: 'invoice',
  // Payments
  payment_received: 'payment',
  partial_payment_received: 'payment',
  payment_needs_deposit: 'payment',
  payment_method_recorded: 'payment',
  // Estimates
  estimate_created: 'estimate',
  estimate_sent: 'estimate',
  estimate_accepted: 'estimate',
  estimate_rejected: 'estimate',
  estimate_expired: 'estimate',
  estimate_needs_followup: 'estimate',
  estimate_ready_to_convert: 'estimate',
  // Customers
  customer_added: 'customer',
  customer_upcoming_job: 'customer',
  customer_unpaid_balance: 'customer',
  customer_due_followup: 'customer',
  customer_upsell_opportunity: 'customer',
  customer_plan_eligible: 'customer',
  // Schedule
  schedule_job_reminder: 'schedule',
  schedule_today_summary: 'schedule',
  schedule_time_changed: 'schedule',
  schedule_worker_assigned: 'schedule',
  schedule_route_changed: 'schedule',
  // Team
  team_worker_assigned: 'team',
  team_worker_traveling: 'team',
  team_worker_started: 'team',
  team_worker_completed: 'team',
  team_payroll_owed: 'team',
  team_worker_idle: 'team',
  // Service Plans
  plan_new_member: 'plan',
  plan_renewal_upcoming: 'plan',
  plan_payment_due: 'plan',
  plan_needs_job_scheduled: 'plan',
  plan_job_auto_created: 'plan',
  // AI Growth
  ai_upsell_opportunity: 'ai',
  ai_repeat_service_due: 'ai',
  ai_pricing_opportunity: 'ai',
  ai_revenue_warning: 'ai',
  ai_unconverted_followup: 'ai',
  ai_plan_opportunity: 'ai',
  // System
  system_welcome: 'system',
  system_update: 'system',
}

// Get all in-app notifications for current user
export async function getInAppNotifications(): Promise<InAppNotification[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    if (error.code === '42P01') {
      console.warn('in_app_notifications table not found. Run the migration.')
      return []
    }
    console.error('Error fetching notifications:', error)
    return []
  }

  return data.map(row => ({
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    icon: row.icon,
    read: row.read,
    customerId: row.customer_id,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    estimateId: row.estimate_id,
    employeeId: row.employee_id,
    planId: row.plan_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))
}

// Get unread count
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) {
    if (error.code === '42P01') return 0
    console.error('Error counting notifications:', error)
    return 0
  }

  return count || 0
}

// Check if similar notification exists (for duplicate prevention)
async function hasSimilarNotification(
  type: InAppNotificationType,
  relatedId?: string,
  withinHours: number = 24
): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const cutoffTime = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('type', type)
    .gte('created_at', cutoffTime)

  // Check by related record ID
  if (relatedId) {
    // Check any of the related ID fields
    query = query.or(`job_id.eq.${relatedId},invoice_id.eq.${relatedId},estimate_id.eq.${relatedId},customer_id.eq.${relatedId}`)
  }

  const { count, error } = await query

  if (error) {
    console.error('Error checking duplicate notifications:', error)
    return false
  }

  return (count || 0) > 0
}

// Create a new in-app notification (with duplicate prevention)
export async function createInAppNotification(data: {
  type: InAppNotificationType
  title: string
  message: string
  icon?: string
  customerId?: string
  jobId?: string
  invoiceId?: string
  estimateId?: string
  employeeId?: string
  planId?: string
  expiresAt?: string
  preventDuplicateHours?: number // Set to 0 to skip duplicate check
}): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check for duplicates (default 24 hours)
  const preventDuplicateHours = data.preventDuplicateHours ?? 24
  if (preventDuplicateHours > 0) {
    const relatedId = data.jobId || data.invoiceId || data.estimateId || data.customerId
    const hasDuplicate = await hasSimilarNotification(data.type, relatedId, preventDuplicateHours)
    if (hasDuplicate) {
      return null // Skip creating duplicate
    }
  }

  const category = TYPE_TO_CATEGORY[data.type]
  const companyId = await getUserCompanyId()

  const { data: result, error } = await supabase
    .from('in_app_notifications')
    .insert({
      user_id: user.id,
      company_id: companyId,
      type: data.type,
      category,
      title: data.title,
      message: data.message,
      icon: data.icon,
      read: false,
      customer_id: data.customerId,
      job_id: data.jobId,
      invoice_id: data.invoiceId,
      estimate_id: data.estimateId,
      employee_id: data.employeeId,
      plan_id: data.planId,
      expires_at: data.expiresAt,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '42P01') {
      console.warn('in_app_notifications table not found. Run the migration.')
      return null
    }
    console.error('Error creating notification:', error)
    return null
  }

  return result?.id || null
}

// Mark a notification as read
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ read: true })
    .eq('id', notificationId)

  if (error) {
    console.error('Error marking notification read:', error)
    return false
  }
  return true
}

// Mark all notifications as read
export async function markAllNotificationsRead(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('in_app_notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) {
    console.error('Error marking all notifications read:', error)
    return false
  }
  return true
}

// Delete a notification
export async function deleteNotification(notificationId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    console.error('Error deleting notification:', error)
    return false
  }
  return true
}

// Clear all read notifications
export async function clearReadNotifications(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('read', true)

  if (error) {
    console.error('Error clearing read notifications:', error)
    return false
  }
  return true
}

// ============================================
// Notification creation helpers for app events
// ============================================

export async function notifyJobCreated(job: Job, customerName: string) {
  return createInAppNotification({
    type: 'job_created',
    title: 'New Job Created',
    message: `${job.jobType} job for ${customerName} scheduled for ${formatDate(job.date)}`,
    icon: 'briefcase',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 0, // Always create for new jobs
  })
}

export async function notifyJobStartingSoon(job: Job, customerName: string, minutesUntil: number) {
  const timeText = minutesUntil <= 15 ? 'starting now' : `starting in ${minutesUntil} minutes`
  return createInAppNotification({
    type: 'job_starting_soon',
    title: 'Job Starting Soon',
    message: `${job.jobType} for ${customerName} is ${timeText}`,
    icon: 'clock',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 2, // Only one reminder per 2 hours
  })
}

export async function notifyJobCompleted(job: Job, customerName: string) {
  return createInAppNotification({
    type: 'job_completed',
    title: 'Job Completed',
    message: `${job.jobType} job for ${customerName} is complete. Create an invoice?`,
    icon: 'check-circle',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 0, // Always notify on completion
  })
}

export async function notifyJobOverdue(job: Job, customerName: string) {
  return createInAppNotification({
    type: 'job_overdue',
    title: 'Job Overdue',
    message: `${job.jobType} for ${customerName} was scheduled for ${formatDate(job.date)} but hasn't been completed`,
    icon: 'alert-circle',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 24, // Only once per day
  })
}

export async function notifyJobNeedsInvoice(job: Job, customerName: string) {
  return createInAppNotification({
    type: 'job_needs_invoice',
    title: 'Invoice Needed',
    message: `${customerName}'s ${job.jobType} job needs an invoice ($${job.price.toLocaleString()})`,
    icon: 'receipt',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 24, // Only once per day
  })
}

export async function notifyInvoiceCreated(invoice: { id: string; invoiceNumber: string; total: number; customerId: string }, customerName: string) {
  return createInAppNotification({
    type: 'invoice_created',
    title: 'Invoice Created',
    message: `${invoice.invoiceNumber} for $${invoice.total.toLocaleString()} created for ${customerName}`,
    icon: 'file-text',
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    preventDuplicateHours: 0, // Always create for new invoices
  })
}

export async function notifyInvoicePaid(invoice: { id: string; invoiceNumber: string; total: number; customerId: string }, customerName: string) {
  return createInAppNotification({
    type: 'invoice_paid',
    title: 'Invoice Paid',
    message: `${customerName} paid ${invoice.invoiceNumber} ($${invoice.total.toLocaleString()})`,
    icon: 'dollar-sign',
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    preventDuplicateHours: 0, // Always notify on payment
  })
}

export async function notifyInvoiceOverdue(invoice: { id: string; invoiceNumber: string; total: number; customerId: string }, customerName: string, daysPastDue: number) {
  return createInAppNotification({
    type: 'invoice_overdue',
    title: 'Invoice Overdue',
    message: `${invoice.invoiceNumber} from ${customerName} is ${daysPastDue} days overdue ($${invoice.total.toLocaleString()})`,
    icon: 'alert-circle',
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    preventDuplicateHours: 24, // Only once per day per invoice
  })
}

export async function notifyPaymentReceived(amount: number, customerName: string, paymentMethod: string, jobId?: string, customerId?: string) {
  return createInAppNotification({
    type: 'payment_received',
    title: 'Payment Received',
    message: `$${amount.toLocaleString()} received from ${customerName} via ${paymentMethod}`,
    icon: 'credit-card',
    jobId,
    customerId,
    preventDuplicateHours: 0, // Always notify on payment
  })
}

export async function notifyPaymentNeedsDeposit(amount: number, customerName: string, paymentMethod: string) {
  return createInAppNotification({
    type: 'payment_needs_deposit',
    title: 'Deposit Needed',
    message: `$${amount.toLocaleString()} ${paymentMethod} payment from ${customerName} needs to be deposited`,
    icon: 'wallet',
    preventDuplicateHours: 8, // Remind again after 8 hours
  })
}

export async function notifyEstimateCreated(estimate: Estimate, customerName: string) {
  return createInAppNotification({
    type: 'estimate_created',
    title: 'Estimate Created',
    message: `${estimate.estimateNumber} for $${estimate.total.toLocaleString()} created for ${customerName}`,
    icon: 'file-text',
    estimateId: estimate.id,
    customerId: estimate.customerId,
    preventDuplicateHours: 0, // Always create
  })
}

export async function notifyEstimateAccepted(estimate: Estimate, customerName: string) {
  return createInAppNotification({
    type: 'estimate_accepted',
    title: 'Estimate Accepted!',
    message: `${customerName} accepted ${estimate.estimateNumber}. Ready to convert to job?`,
    icon: 'check-circle',
    estimateId: estimate.id,
    customerId: estimate.customerId,
    preventDuplicateHours: 0, // Always notify
  })
}

export async function notifyEstimateNeedsFollowup(estimate: Estimate, customerName: string, daysPending: number) {
  return createInAppNotification({
    type: 'estimate_needs_followup',
    title: 'Estimate Awaiting Response',
    message: `${estimate.estimateNumber} for ${customerName} has been pending ${daysPending} days. Time to follow up?`,
    icon: 'clock',
    estimateId: estimate.id,
    customerId: estimate.customerId,
    preventDuplicateHours: 24, // Only once per day
  })
}

export async function notifyCustomerAdded(customer: Customer) {
  return createInAppNotification({
    type: 'customer_added',
    title: 'New Customer',
    message: `${customer.name} was added to your customer list`,
    icon: 'user-plus',
    customerId: customer.id,
    preventDuplicateHours: 0, // Always create
  })
}

export async function notifyCustomerFollowup(customer: Customer, reason: string) {
  return createInAppNotification({
    type: 'customer_due_followup',
    title: 'Customer Follow-up',
    message: `${customer.name}: ${reason}`,
    icon: 'user',
    customerId: customer.id,
    preventDuplicateHours: 24, // Once per day
  })
}

export async function notifyWorkerAssigned(job: Job, workerName: string, customerName: string) {
  return createInAppNotification({
    type: 'team_worker_assigned',
    title: 'Worker Assigned',
    message: `${workerName} assigned to ${job.jobType} for ${customerName}`,
    icon: 'users',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 0, // Always notify
  })
}

export async function notifyWorkerCompleted(job: Job, workerName: string, customerName: string) {
  return createInAppNotification({
    type: 'team_worker_completed',
    title: 'Worker Completed Job',
    message: `${workerName} completed ${job.jobType} for ${customerName}`,
    icon: 'check-circle',
    jobId: job.id,
    customerId: job.customerId,
    preventDuplicateHours: 0, // Always notify
  })
}

export async function notifyPlanRenewal(planName: string, customerName: string, customerId: string, daysUntil: number, planId?: string) {
  return createInAppNotification({
    type: 'plan_renewal_upcoming',
    title: 'Plan Renewal Coming',
    message: `${customerName}'s ${planName} plan renews in ${daysUntil} days`,
    icon: 'refresh-cw',
    customerId,
    planId,
    preventDuplicateHours: 24, // Once per day
  })
}

export async function notifyUpsellOpportunity(customerName: string, suggestion: string, customerId: string) {
  return createInAppNotification({
    type: 'ai_upsell_opportunity',
    title: 'Upsell Opportunity',
    message: `${customerName}: ${suggestion}`,
    icon: 'trending-up',
    customerId,
    preventDuplicateHours: 72, // Once every 3 days per customer
  })
}

export async function notifyRepeatServiceDue(customerName: string, service: string, customerId: string) {
  return createInAppNotification({
    type: 'ai_repeat_service_due',
    title: 'Repeat Service Due',
    message: `${customerName} may be due for ${service}`,
    icon: 'refresh-cw',
    customerId,
    preventDuplicateHours: 168, // Once per week
  })
}

// ============================================
// Daily Summary Notification
// ============================================

export async function notifyDailySummary(data: {
  jobCount: number
  potentialRevenue: number
  overdueInvoices: number
  billsDue: number
}) {
  const parts: string[] = []
  if (data.jobCount > 0) parts.push(`${data.jobCount} job${data.jobCount !== 1 ? 's' : ''} scheduled`)
  if (data.potentialRevenue > 0) parts.push(`$${data.potentialRevenue.toLocaleString()} potential`)
  if (data.overdueInvoices > 0) parts.push(`${data.overdueInvoices} invoice${data.overdueInvoices !== 1 ? 's' : ''} overdue`)
  if (data.billsDue > 0) parts.push(`${data.billsDue} bill${data.billsDue !== 1 ? 's' : ''} due`)

  if (parts.length === 0) {
    return null // Nothing to report
  }

  return createInAppNotification({
    type: 'schedule_today_summary',
    title: "Today's Summary",
    message: parts.join(', '),
    icon: 'calendar',
    preventDuplicateHours: 20, // Only one per day
  })
}

// ============================================
// Smart reminder generation (call on app load)
// ============================================

export async function generateSmartReminders(data: {
  jobs: Job[]
  invoices: Invoice[]
  estimates: Estimate[]
  customers: Customer[]
}) {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  // Generate daily summary
  const todaysJobs = data.jobs.filter(j => j.date === todayStr && j.status === 'Scheduled')
  const overdueInvoices = data.invoices.filter(i => 
    (i.status === 'sent' || i.status === 'overdue') && i.dueDate < todayStr
  )
  const upcomingBills = 0 // Could be expanded to check upcomingExpenses

  if (todaysJobs.length > 0 || overdueInvoices.length > 0) {
    const totalValue = todaysJobs.reduce((sum, j) => sum + j.price, 0)
    await notifyDailySummary({
      jobCount: todaysJobs.length,
      potentialRevenue: totalValue,
      overdueInvoices: overdueInvoices.length,
      billsDue: upcomingBills,
    })
  }

  // Check for overdue invoices (individual reminders)
  for (const invoice of overdueInvoices) {
    const daysPastDue = Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    const customer = data.customers.find(c => c.id === invoice.customerId)
    if (customer && daysPastDue > 0) {
      await notifyInvoiceOverdue(
        { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total, customerId: invoice.customerId },
        customer.name,
        daysPastDue
      )
    }
  }

  // Check for estimates needing follow-up (sent more than 3 days ago)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  for (const estimate of data.estimates) {
    if (estimate.status === 'sent') {
      const createdDate = new Date(estimate.createdAt)
      const daysPending = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysPending >= 3) {
        const customer = data.customers.find(c => c.id === estimate.customerId)
        if (customer) {
          await notifyEstimateNeedsFollowup(estimate, customer.name, daysPending)
        }
      }
    }
  }

  // Check for completed jobs without invoices
  for (const job of data.jobs) {
    if (job.status === 'Completed' && !job.invoiceId) {
      const customer = data.customers.find(c => c.id === job.customerId)
      if (customer) {
        await notifyJobNeedsInvoice(job, customer.name)
      }
    }
  }

  // Check for overdue jobs (scheduled but not completed, date in past)
  for (const job of data.jobs) {
    if (job.status === 'Scheduled' && job.date < todayStr) {
      const customer = data.customers.find(c => c.id === job.customerId)
      if (customer) {
        await notifyJobOverdue(job, customer.name)
      }
    }
  }
}

// ============================================
// Team/Worker Notification Helpers
// ============================================

// Notify owner when worker is on the way
export async function notifyWorkerOnTheWay(
  workerName: string, 
  jobType: string, 
  customerName: string, 
  jobId: string, 
  employeeId: string
) {
  return createInAppNotification({
    type: 'team_worker_traveling',
    title: 'Worker On The Way',
    message: `${workerName} is heading to ${customerName} for ${jobType}`,
    icon: 'car',
    jobId,
    employeeId,
    preventDuplicateHours: 1,
  })
}

// Notify owner when worker starts a job
export async function notifyWorkerStartedJob(
  workerName: string, 
  jobType: string, 
  customerName: string, 
  jobId: string, 
  employeeId: string
) {
  return createInAppNotification({
    type: 'team_worker_started',
    title: 'Job Started',
    message: `${workerName} started ${jobType} at ${customerName}`,
    icon: 'play',
    jobId,
    employeeId,
    preventDuplicateHours: 0,
  })
}

// Notify owner when worker completes a job
export async function notifyWorkerCompletedJob(
  workerName: string, 
  jobType: string, 
  customerName: string, 
  jobId: string, 
  employeeId: string
) {
  return createInAppNotification({
    type: 'team_worker_completed',
    title: 'Job Completed',
    message: `${workerName} completed ${jobType} at ${customerName}. Ready for invoice.`,
    icon: 'check-circle',
    jobId,
    employeeId,
    preventDuplicateHours: 0,
  })
}

// Notify worker when job is rescheduled
export async function notifyWorkerJobRescheduled(
  jobType: string, 
  customerName: string, 
  newDate: string,
  jobId: string
) {
  return createInAppNotification({
    type: 'job_rescheduled',
    title: 'Job Rescheduled',
    message: `${jobType} at ${customerName} has been moved to ${formatDate(newDate)}`,
    icon: 'calendar',
    jobId,
    preventDuplicateHours: 0,
  })
}

// Notify worker when job is cancelled
export async function notifyWorkerJobCancelled(
  jobType: string, 
  customerName: string, 
  jobId: string
) {
  return createInAppNotification({
    type: 'job_cancelled',
    title: 'Job Cancelled',
    message: `${jobType} at ${customerName} has been cancelled`,
    icon: 'x-circle',
    jobId,
    preventDuplicateHours: 0,
  })
}

// Notify worker of upcoming job reminder
export async function notifyWorkerJobReminder(
  jobType: string, 
  customerName: string, 
  timeUntil: string,
  jobId: string
) {
  return createInAppNotification({
    type: 'schedule_job_reminder',
    title: 'Upcoming Job',
    message: `${jobType} at ${customerName} ${timeUntil}`,
    icon: 'bell',
    jobId,
    preventDuplicateHours: 4,
  })
}

// Notify when customer info changes for worker's assigned job
export async function notifyWorkerCustomerUpdated(
  customerName: string, 
  jobId: string,
  customerId: string
) {
  return createInAppNotification({
    type: 'customer_added', // Reusing type for customer updates
    title: 'Customer Info Updated',
    message: `Contact info for ${customerName} has been updated`,
    icon: 'user',
    jobId,
    customerId,
    preventDuplicateHours: 2,
  })
}

// Helper
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
