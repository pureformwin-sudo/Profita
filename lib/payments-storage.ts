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
  PaymentProvider,
  PaymentType,
  FeePaidBy,
  RecordPaymentResult,
  RefundPaymentResult 
} from './payments-types'
import { triggerCommissionForPayment } from './commission-triggers'

// Shared mapper: raw payments row -> Payment. Handles provider/fee columns
// (script 35) with safe defaults for legacy rows and optional joined fields.
function mapPaymentRow(p: any): Payment {
  const amount = Number(p.amount)
  const processingFee = Number(p.processing_fee) || 0
  return {
    id: p.id,
    companyId: p.company_id,
    userId: p.user_id,
    invoiceId: p.invoice_id,
    jobId: p.job_id,
    customerId: p.customer_id,
    amount,
    paymentMethod: p.payment_method as PaymentMethod,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    status: p.status as PaymentStatus,
    notes: p.notes,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    provider: (p.provider || 'other') as PaymentProvider,
    paymentType: (p.payment_type || null) as PaymentType | null,
    processingFee,
    feePaidBy: (p.fee_paid_by || null) as FeePaidBy | null,
    netAmount: p.net_amount != null ? Number(p.net_amount) : amount - processingFee,
    paymentLink: p.payment_link ?? null,
    createdBy: p.created_by ?? null,
    customerName: p.customers?.name,
    invoiceNumber: p.invoices?.invoice_number,
  }
}

// Re-export types for consumers
export type { PaymentMethod, PaymentStatus }

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
  
  return (data || []).map(mapPaymentRow)
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
  
  return (data || []).map(mapPaymentRow)
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
  
  return (data || []).map(mapPaymentRow)
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
  
  return mapPaymentRow(data)
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
  
  // Provider / fee metadata with safe defaults.
  const provider = input.provider || 'other'
  const processingFee = Math.max(0, Number(input.processingFee) || 0)
  const netAmount = Math.round((input.amount - processingFee) * 100) / 100

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
      provider,
      payment_type: input.paymentType || null,
      processing_fee: processingFee,
      fee_paid_by: input.feePaidBy || null,
      net_amount: netAmount,
      payment_link: input.paymentLink || null,
      created_by: user.id,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error recording payment:', error)
    return { success: false, error: error.message }
  }

  // Record the processing fee as a business expense ONLY when the business
  // absorbed it (so net proceeds = income - fee in Finances, without ever
  // double-counting revenue). When the customer covered the fee, it is tracked
  // on the payment record only. Non-blocking — a fee failure never blocks the
  // payment itself.
  if (processingFee > 0 && input.feePaidBy === 'business' && (input.status || 'completed') === 'completed') {
    supabase
      .from('expenses')
      .insert({
        company_id: companyId,
        user_id: user.id,
        amount: processingFee,
        date: input.paymentDate || new Date().toISOString().split('T')[0],
        category: 'Processing Fees',
        description: `${provider === 'jim' ? 'JIM' : provider} processing fee`,
        payment_method: 'card',
        recurrence: 'none',
        transaction_type: 'business_expense',
        tax_treatment: 'unreviewed',
        vendor: provider === 'jim' ? 'JIM' : null,
        customer_id: input.customerId || null,
        job_id: input.jobId || null,
        notes: `Auto-recorded processing fee for payment ${data.id}`,
      })
      .then(({ error: feeErr }) => {
        if (feeErr) console.error('[Payments] Failed to record processing-fee expense:', feeErr.message)
      })
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
    
    // If linked to a job, update job status and paid_amount
    if (input.jobId) {
      // Get current job paid amount
      const { data: jobData } = await supabase
        .from('jobs')
        .select('paid_amount, price, job_type, customers(name)')
        .eq('id', input.jobId)
        .maybeSingle()
      
      const currentPaidAmount = Number(jobData?.paid_amount) || 0
      const newJobPaidAmount = currentPaidAmount + input.amount
      const jobPrice = Number(jobData?.price) || 0
      const jobFullyPaid = newJobPaidAmount >= jobPrice
      
      await supabase
        .from('jobs')
        .update({ 
          status: jobFullyPaid ? 'Paid' : undefined,
          paid_amount: newJobPaidAmount 
        })
        .eq('id', input.jobId)
      
      // Also add to income table for dashboard revenue tracking
      const customerName = (jobData as any)?.customers?.name || 'Customer'
      await supabase
        .from('income')
        .insert({
          company_id: companyId,
          user_id: user.id,
          amount: input.amount,
          date: input.paymentDate || new Date().toISOString().split('T')[0],
          customer_name: customerName,
          job_type: jobData?.job_type || 'Service',
          payment_method: input.paymentMethod,
          payment_status: 'Paid',
          job_id: input.jobId,
          notes: input.notes || 'Payment recorded',
        })
    } else {
      // No job linked - still add to income table
      // Get customer name
      const { data: customer } = await supabase
        .from('customers')
        .select('name')
        .eq('id', input.customerId)
        .maybeSingle()
      
      await supabase
        .from('income')
        .insert({
          company_id: companyId,
          user_id: user.id,
          amount: input.amount,
          date: input.paymentDate || new Date().toISOString().split('T')[0],
          customer_name: customer?.name || 'Customer',
          job_type: 'Invoice Payment',
          payment_method: input.paymentMethod,
          payment_status: 'Paid',
          job_id: null,
          notes: input.notes || `Payment for invoice`,
        })
    }
    
    // Trigger commission (non-blocking)
    triggerCommissionForPayment({
      id: data.id,
      invoiceId: data.invoice_id,
      jobId: data.job_id,
      amount: Number(data.amount),
    }).catch(err => console.error('[Commission] Failed to trigger:', err))
    
    return {
      success: true,
      payment: mapPaymentRow(data),
      invoiceFullyPaid,
      remainingBalance: invoiceTotal - newAmountPaid,
    }
  }
  
  // For non-invoice payments that are completed, also add to income table
  if ((input.status || 'completed') === 'completed') {
    // Get customer name
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', input.customerId)
      .maybeSingle()
    
    await supabase
      .from('income')
      .insert({
        company_id: companyId,
        user_id: user.id,
        amount: input.amount,
        date: input.paymentDate || new Date().toISOString().split('T')[0],
        customer_name: customer?.name || 'Customer',
        job_type: 'Payment',
        payment_method: input.paymentMethod,
        payment_status: 'Paid',
        job_id: input.jobId || null,
        notes: input.notes || 'Payment recorded',
      })
  }
  
  // Trigger commission for non-invoice payment (non-blocking)
  triggerCommissionForPayment({
    id: data.id,
    invoiceId: data.invoice_id,
    jobId: data.job_id,
    amount: Number(data.amount),
  }).catch(err => console.error('[Commission] Failed to trigger:', err))
  
  return {
    success: true,
    payment: mapPaymentRow(data),
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
    payment: mapPaymentRow(data),
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
    payment: mapPaymentRow(data),
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
