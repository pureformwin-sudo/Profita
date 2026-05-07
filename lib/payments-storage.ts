// ============================================================================
// Payment Storage Functions for Phase 4
// CRUD operations for the payments table
// ============================================================================

import { createClient, getCachedUser } from '@/lib/supabase/client'
import type { 
  Payment, 
  PaymentInput, 
  PaymentWithDetails,
  PaymentMethod,
  PaymentStatus,
  RecordPaymentResult,
  RefundPaymentResult 
} from './payments-types'

// Get Supabase client
function getSupabase() {
  return createClient()
}

// Get the current user's company ID
async function getUserCompanyId(): Promise<string | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  // First check if user owns a company
  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (ownedCompany) return ownedCompany.id

  // Check if user is a member of a company via RPC
  const { data: membership } = await supabase.rpc('get_my_membership')
  if (membership?.company_id) return membership.company_id

  return null
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get all payments for the current company
 */
export async function getPayments(): Promise<Payment[]> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      customers:customer_id (name),
      invoices:invoice_id (invoice_number)
    `)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching payments:', error)
    return []
  }
  
  return (data || []).map((p: any) => ({
    id: p.id,
    companyId: p.company_id,
    userId: p.user_id,
    invoiceId: p.invoice_id,
    jobId: p.job_id,
    customerId: p.customer_id,
    amount: Number(p.amount),
    paymentMethod: p.payment_method as PaymentMethod,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    status: p.status as PaymentStatus,
    notes: p.notes,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    customerName: p.customers?.name,
    invoiceNumber: p.invoices?.invoice_number,
  }))
}

/**
 * Get payments for a specific invoice
 */
export async function getPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      customers:customer_id (name)
    `)
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: true })
  
  if (error) {
    console.error('Error fetching invoice payments:', error)
    return []
  }
  
  return (data || []).map((p: any) => ({
    id: p.id,
    companyId: p.company_id,
    userId: p.user_id,
    invoiceId: p.invoice_id,
    jobId: p.job_id,
    customerId: p.customer_id,
    amount: Number(p.amount),
    paymentMethod: p.payment_method as PaymentMethod,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    status: p.status as PaymentStatus,
    notes: p.notes,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    customerName: p.customers?.name,
  }))
}

/**
 * Get payments for a specific customer
 */
export async function getPaymentsForCustomer(customerId: string): Promise<Payment[]> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      invoices:invoice_id (invoice_number, total)
    `)
    .eq('customer_id', customerId)
    .order('payment_date', { ascending: false })
  
  if (error) {
    console.error('Error fetching customer payments:', error)
    return []
  }
  
  return (data || []).map((p: any) => ({
    id: p.id,
    companyId: p.company_id,
    userId: p.user_id,
    invoiceId: p.invoice_id,
    jobId: p.job_id,
    customerId: p.customer_id,
    amount: Number(p.amount),
    paymentMethod: p.payment_method as PaymentMethod,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    status: p.status as PaymentStatus,
    notes: p.notes,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    invoiceNumber: p.invoices?.invoice_number,
  }))
}

/**
 * Get a single payment by ID
 */
export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      customers:customer_id (name),
      invoices:invoice_id (invoice_number)
    `)
    .eq('id', paymentId)
    .maybeSingle()
  
  if (error || !data) {
    console.error('Error fetching payment:', error)
    return null
  }
  
  return {
    id: data.id,
    companyId: data.company_id,
    userId: data.user_id,
    invoiceId: data.invoice_id,
    jobId: data.job_id,
    customerId: data.customer_id,
    amount: Number(data.amount),
    paymentMethod: data.payment_method as PaymentMethod,
    paymentDate: data.payment_date,
    referenceNumber: data.reference_number,
    status: data.status as PaymentStatus,
    notes: data.notes,
    stripePaymentIntentId: data.stripe_payment_intent_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    customerName: (data as any).customers?.name,
    invoiceNumber: (data as any).invoices?.invoice_number,
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Record a new payment
 * @param input Payment data
 * @param allowOverpayment If false (default), prevents payment amount > remaining balance
 */
export async function recordPayment(
  input: PaymentInput,
  allowOverpayment: boolean = false
): Promise<RecordPaymentResult> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }
  
  const companyId = await getUserCompanyId()
  if (!companyId) {
    return { success: false, error: 'No company found' }
  }
  
  // Validate amount
  if (input.amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than 0' }
  }
  
  // If linked to an invoice, check remaining balance
  let invoiceTotal = 0
  let existingPayments = 0
  let remainingBalance = input.amount
  
  if (input.invoiceId) {
    // Get invoice total
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('id', input.invoiceId)
      .maybeSingle()
    
    if (invoiceError || !invoice) {
      return { success: false, error: 'Invoice not found' }
    }
    
    invoiceTotal = Number(invoice.total)
    
    // Get sum of completed payments for this invoice
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', input.invoiceId)
      .eq('status', 'completed')
    
    existingPayments = (paymentsData || []).reduce((sum, p) => sum + Number(p.amount), 0)
    remainingBalance = invoiceTotal - existingPayments
    
    // Check for overpayment
    if (!allowOverpayment && input.amount > remainingBalance) {
      return { 
        success: false, 
        error: `Payment amount ($${input.amount.toFixed(2)}) exceeds remaining balance ($${remainingBalance.toFixed(2)})`,
        remainingBalance 
      }
    }
  }
  
  // Insert payment
  const { data, error } = await supabase
    .from('payments')
    .insert({
      company_id: companyId,
      user_id: user.id,
      invoice_id: input.invoiceId || null,
      job_id: input.jobId || null,
      customer_id: input.customerId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      payment_date: input.paymentDate || new Date().toISOString().split('T')[0],
      reference_number: input.referenceNumber || null,
      status: input.status || 'completed',
      notes: input.notes || null,
      stripe_payment_intent_id: input.stripePaymentIntentId || null,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error recording payment:', error)
    return { success: false, error: error.message }
  }
  
  // If payment is completed and linked to invoice, update invoice amount_paid
  if ((input.status || 'completed') === 'completed' && input.invoiceId) {
    const newAmountPaid = existingPayments + input.amount
    const invoiceFullyPaid = newAmountPaid >= invoiceTotal
    
    // Update invoice amount_paid and status
    const newStatus = invoiceFullyPaid ? 'paid' : 'sent'
    await supabase
      .from('invoices')
      .update({ 
        amount_paid: newAmountPaid,
        status: newStatus
      })
      .eq('id', input.invoiceId)
    
    // If linked to a job, update job status
    if (input.jobId && invoiceFullyPaid) {
      await supabase
        .from('jobs')
        .update({ 
          status: 'Paid',
          paid_amount: input.amount 
        })
        .eq('id', input.jobId)
    }
    
    return {
      success: true,
      payment: {
        id: data.id,
        companyId: data.company_id,
        userId: data.user_id,
        invoiceId: data.invoice_id,
        jobId: data.job_id,
        customerId: data.customer_id,
        amount: Number(data.amount),
        paymentMethod: data.payment_method as PaymentMethod,
        paymentDate: data.payment_date,
        referenceNumber: data.reference_number,
        status: data.status as PaymentStatus,
        notes: data.notes,
        stripePaymentIntentId: data.stripe_payment_intent_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      invoiceFullyPaid,
      remainingBalance: invoiceTotal - newAmountPaid,
    }
  }
  
  return {
    success: true,
    payment: {
      id: data.id,
      companyId: data.company_id,
      userId: data.user_id,
      invoiceId: data.invoice_id,
      jobId: data.job_id,
      customerId: data.customer_id,
      amount: Number(data.amount),
      paymentMethod: data.payment_method as PaymentMethod,
      paymentDate: data.payment_date,
      referenceNumber: data.reference_number,
      status: data.status as PaymentStatus,
      notes: data.notes,
      stripePaymentIntentId: data.stripe_payment_intent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }
}

/**
 * Update an existing payment
 */
export async function updatePayment(
  paymentId: string,
  updates: Partial<PaymentInput>
): Promise<RecordPaymentResult> {
  const supabase = getSupabase()
  
  // Build update object
  const updateData: Record<string, any> = {}
  if (updates.amount !== undefined) updateData.amount = updates.amount
  if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod
  if (updates.paymentDate !== undefined) updateData.payment_date = updates.paymentDate
  if (updates.referenceNumber !== undefined) updateData.reference_number = updates.referenceNumber
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.notes !== undefined) updateData.notes = updates.notes
  
  const { data, error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', paymentId)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating payment:', error)
    return { success: false, error: error.message }
  }
  
  // Recalculate invoice amount_paid if this payment is linked to an invoice
  if (data.invoice_id) {
    await recalculateInvoiceAmountPaid(data.invoice_id)
  }
  
  return {
    success: true,
    payment: {
      id: data.id,
      companyId: data.company_id,
      userId: data.user_id,
      invoiceId: data.invoice_id,
      jobId: data.job_id,
      customerId: data.customer_id,
      amount: Number(data.amount),
      paymentMethod: data.payment_method as PaymentMethod,
      paymentDate: data.payment_date,
      referenceNumber: data.reference_number,
      status: data.status as PaymentStatus,
      notes: data.notes,
      stripePaymentIntentId: data.stripe_payment_intent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }
}

/**
 * Refund a payment (marks as refunded, doesn't delete)
 */
export async function refundPayment(
  paymentId: string,
  refundNotes?: string
): Promise<RefundPaymentResult> {
  const supabase = getSupabase()
  
  // Get the payment first
  const payment = await getPaymentById(paymentId)
  if (!payment) {
    return { success: false, error: 'Payment not found' }
  }
  
  if (payment.status === 'refunded') {
    return { success: false, error: 'Payment is already refunded' }
  }
  
  // Update payment status to refunded
  const { data, error } = await supabase
    .from('payments')
    .update({ 
      status: 'refunded',
      notes: refundNotes ? `${payment.notes || ''}\n[REFUNDED] ${refundNotes}`.trim() : payment.notes
    })
    .eq('id', paymentId)
    .select()
    .single()
  
  if (error) {
    console.error('Error refunding payment:', error)
    return { success: false, error: error.message }
  }
  
  // Recalculate invoice amount_paid if linked
  let newBalance = 0
  if (payment.invoiceId) {
    newBalance = await recalculateInvoiceAmountPaid(payment.invoiceId)
  }
  
  return {
    success: true,
    payment: {
      id: data.id,
      companyId: data.company_id,
      userId: data.user_id,
      invoiceId: data.invoice_id,
      jobId: data.job_id,
      customerId: data.customer_id,
      amount: Number(data.amount),
      paymentMethod: data.payment_method as PaymentMethod,
      paymentDate: data.payment_date,
      referenceNumber: data.reference_number,
      status: data.status as PaymentStatus,
      notes: data.notes,
      stripePaymentIntentId: data.stripe_payment_intent_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
    newBalance,
  }
}

/**
 * Delete a payment (use with caution - prefer refund for audit trail)
 */
export async function deletePayment(paymentId: string): Promise<boolean> {
  const supabase = getSupabase()
  
  // Get payment to check for linked invoice
  const payment = await getPaymentById(paymentId)
  const invoiceId = payment?.invoiceId
  
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)
  
  if (error) {
    console.error('Error deleting payment:', error)
    return false
  }
  
  // Recalculate invoice amount_paid if linked
  if (invoiceId) {
    await recalculateInvoiceAmountPaid(invoiceId)
  }
  
  return true
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Recalculate and update an invoice's amount_paid from completed payments
 * Returns the new balance
 */
export async function recalculateInvoiceAmountPaid(invoiceId: string): Promise<number> {
  const supabase = getSupabase()
  
  // Get invoice total
  const { data: invoice } = await supabase
    .from('invoices')
    .select('total')
    .eq('id', invoiceId)
    .maybeSingle()
  
  if (!invoice) return 0
  
  const invoiceTotal = Number(invoice.total)
  
  // Sum completed payments
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'completed')
  
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
  
  // Determine new status
  let newStatus: string = 'sent'
  if (totalPaid >= invoiceTotal) {
    newStatus = 'paid'
  } else if (totalPaid > 0) {
    // Check if overdue
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('due_date, status')
      .eq('id', invoiceId)
      .maybeSingle()
    
    if (invoiceData) {
      const isOverdue = new Date(invoiceData.due_date) < new Date()
      newStatus = isOverdue ? 'overdue' : 'sent'
    }
  }
  
  // Update invoice
  await supabase
    .from('invoices')
    .update({ 
      amount_paid: totalPaid,
      status: newStatus
    })
    .eq('id', invoiceId)
  
  return invoiceTotal - totalPaid
}

/**
 * Get total amount paid for an invoice (from completed payments)
 */
export async function getInvoiceTotalPaid(invoiceId: string): Promise<number> {
  const supabase = getSupabase()
  
  const { data } = await supabase
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'completed')
  
  return (data || []).reduce((sum, p) => sum + Number(p.amount), 0)
}

/**
 * Get total amount paid by a customer (from completed payments)
 */
export async function getCustomerTotalPaid(customerId: string): Promise<number> {
  const supabase = getSupabase()
  
  const { data } = await supabase
    .from('payments')
    .select('amount')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
  
  return (data || []).reduce((sum, p) => sum + Number(p.amount), 0)
}
