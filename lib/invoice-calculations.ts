// ============================================================================
// Invoice Calculation Functions for Phase 4
// Calculate invoice balances, payment status, and related metrics
// ============================================================================

import { createClient } from '@/lib/supabase/client'
import type { Invoice } from './types'
import type { 
  Payment, 
  InvoicePaymentStatus, 
  InvoiceWithBalance 
} from './payments-types'

function getSupabase() {
  return createClient()
}

// Map a raw payments row to a Payment, defaulting the provider/fee columns
// (script 35) so legacy rows and this calculation module stay type-safe.
function rowToPayment(p: any): Payment {
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
    paymentMethod: p.payment_method,
    paymentDate: p.payment_date,
    referenceNumber: p.reference_number,
    status: p.status,
    notes: p.notes,
    stripePaymentIntentId: p.stripe_payment_intent_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    provider: p.provider || 'other',
    paymentType: p.payment_type || null,
    processingFee,
    feePaidBy: p.fee_paid_by || null,
    netAmount: p.net_amount != null ? Number(p.net_amount) : amount - processingFee,
    paymentLink: p.payment_link ?? null,
    createdBy: p.created_by ?? null,
  }
}

// ============================================================================
// Invoice Balance Calculations
// ============================================================================

/**
 * Calculate the payment status of an invoice based on payments and due date
 */
export function calculateInvoicePaymentStatus(
  total: number,
  amountPaid: number,
  dueDate: string,
  invoiceStatus: string
): InvoicePaymentStatus {
  // Handle voided/cancelled invoices
  if (invoiceStatus === 'cancelled') {
    return 'void'
  }
  
  const balance = total - amountPaid
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const isOverdue = due < today
  
  // Check if all payments were refunded
  // (This would need to be passed in or checked separately for accuracy)
  
  if (amountPaid >= total) {
    return 'paid'
  }
  
  if (amountPaid > 0 && balance > 0) {
    // Partially paid - check if overdue
    return isOverdue ? 'overdue' : 'partially_paid'
  }
  
  if (amountPaid === 0) {
    // No payments
    return isOverdue ? 'overdue' : 'unpaid'
  }
  
  return 'unpaid'
}

/**
 * Calculate invoice balance from completed payments
 */
export function calculateInvoiceBalance(total: number, payments: Payment[]): number {
  const completedPayments = payments.filter(p => p.status === 'completed')
  const totalPaid = completedPayments.reduce((sum, p) => sum + p.amount, 0)
  return Math.max(0, total - totalPaid)
}

/**
 * Calculate total paid from completed payments
 */
export function calculateTotalPaid(payments: Payment[]): number {
  return payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)
}

// ============================================================================
// Fetch Invoice with Balance Information
// ============================================================================

/**
 * Get an invoice with its payment balance information
 */
export async function getInvoiceWithBalance(invoiceId: string): Promise<InvoiceWithBalance | null> {
  const supabase = getSupabase()
  
  // Get invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      customers:customer_id (name)
    `)
    .eq('id', invoiceId)
    .maybeSingle()
  
  if (invoiceError || !invoice) {
    console.error('Error fetching invoice:', invoiceError)
    return null
  }
  
  // Get payments for this invoice
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: true })
  
  if (paymentsError) {
    console.error('Error fetching invoice payments:', paymentsError)
  }
  
  const payments: Payment[] = (paymentsData || []).map(rowToPayment)
  
  const total = Number(invoice.total)
  const amountPaid = calculateTotalPaid(payments)
  const balance = total - amountPaid
  const paymentStatus = calculateInvoicePaymentStatus(
    total,
    amountPaid,
    invoice.due_date,
    invoice.status
  )
  
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    customerId: invoice.customer_id,
    customerName: (invoice as any).customers?.name,
    total,
    amountPaid,
    balance,
    paymentStatus,
    dueDate: invoice.due_date,
    issueDate: invoice.issue_date,
    payments,
  }
}

/**
 * Get all invoices with balance information for a customer
 */
export async function getCustomerInvoicesWithBalance(customerId: string): Promise<InvoiceWithBalance[]> {
  const supabase = getSupabase()
  
  // Get all invoices for customer
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select(`
      *,
      customers:customer_id (name)
    `)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false })
  
  if (invoicesError || !invoices) {
    console.error('Error fetching customer invoices:', invoicesError)
    return []
  }
  
  // Get all payments for this customer's invoices
  const invoiceIds = invoices.map(i => i.id)
  const { data: paymentsData } = await supabase
    .from('payments')
    .select('*')
    .in('invoice_id', invoiceIds)
    .order('payment_date', { ascending: true })
  
  const paymentsByInvoice = new Map<string, Payment[]>()
  for (const p of (paymentsData || [])) {
    const invoiceId = p.invoice_id
    if (!paymentsByInvoice.has(invoiceId)) {
      paymentsByInvoice.set(invoiceId, [])
    }
    paymentsByInvoice.get(invoiceId)!.push(rowToPayment(p))
  }
  
  return invoices.map(invoice => {
    const payments = paymentsByInvoice.get(invoice.id) || []
    const total = Number(invoice.total)
    const amountPaid = calculateTotalPaid(payments)
    const balance = total - amountPaid
    const paymentStatus = calculateInvoicePaymentStatus(
      total,
      amountPaid,
      invoice.due_date,
      invoice.status
    )
    
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerId: invoice.customer_id,
      customerName: (invoice as any).customers?.name,
      total,
      amountPaid,
      balance,
      paymentStatus,
      dueDate: invoice.due_date,
      issueDate: invoice.issue_date,
      payments,
    }
  })
}

/**
 * Get all unpaid/partially paid invoices
 */
export async function getUnpaidInvoices(): Promise<InvoiceWithBalance[]> {
  const supabase = getSupabase()
  
  // Get invoices that are not fully paid
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customers:customer_id (name)
    `)
    .neq('status', 'paid')
    .neq('status', 'cancelled')
    .order('due_date', { ascending: true })
  
  if (error || !invoices) {
    console.error('Error fetching unpaid invoices:', error)
    return []
  }
  
  // Get payments for these invoices
  const invoiceIds = invoices.map(i => i.id)
  const { data: paymentsData } = await supabase
    .from('payments')
    .select('*')
    .in('invoice_id', invoiceIds)
  
  const paymentsByInvoice = new Map<string, Payment[]>()
  for (const p of (paymentsData || [])) {
    const invoiceId = p.invoice_id
    if (!paymentsByInvoice.has(invoiceId)) {
      paymentsByInvoice.set(invoiceId, [])
    }
    paymentsByInvoice.get(invoiceId)!.push(rowToPayment(p))
  }
  
  return invoices
    .map(invoice => {
      const payments = paymentsByInvoice.get(invoice.id) || []
      const total = Number(invoice.total)
      const amountPaid = calculateTotalPaid(payments)
      const balance = total - amountPaid
      const paymentStatus = calculateInvoicePaymentStatus(
        total,
        amountPaid,
        invoice.due_date,
        invoice.status
      )
      
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: invoice.customer_id,
        customerName: (invoice as any).customers?.name,
        total,
        amountPaid,
        balance,
        paymentStatus,
        dueDate: invoice.due_date,
        issueDate: invoice.issue_date,
        payments,
      }
    })
    .filter(i => i.balance > 0) // Only include invoices with remaining balance
}

/**
 * Get overdue invoices
 */
export async function getOverdueInvoices(): Promise<InvoiceWithBalance[]> {
  const unpaid = await getUnpaidInvoices()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  return unpaid.filter(invoice => {
    const dueDate = new Date(invoice.dueDate)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today
  })
}

// ============================================================================
// Summary Statistics
// ============================================================================

/**
 * Get invoice summary statistics
 */
export async function getInvoiceSummary(): Promise<{
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  totalOverdue: number
  invoiceCount: number
  paidCount: number
  unpaidCount: number
  overdueCount: number
}> {
  const supabase = getSupabase()
  
  // Get all invoices (except cancelled)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, due_date, status')
    .neq('status', 'cancelled')
  
  if (!invoices) {
    return {
      totalInvoiced: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalOverdue: 0,
      invoiceCount: 0,
      paidCount: 0,
      unpaidCount: 0,
      overdueCount: 0,
    }
  }
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let totalInvoiced = 0
  let totalPaid = 0
  let totalOutstanding = 0
  let totalOverdue = 0
  let paidCount = 0
  let unpaidCount = 0
  let overdueCount = 0
  
  for (const invoice of invoices) {
    const total = Number(invoice.total)
    const paid = Number(invoice.amount_paid)
    const balance = total - paid
    const dueDate = new Date(invoice.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const isOverdue = dueDate < today && balance > 0
    
    totalInvoiced += total
    totalPaid += paid
    
    if (balance > 0) {
      totalOutstanding += balance
      unpaidCount++
      
      if (isOverdue) {
        totalOverdue += balance
        overdueCount++
      }
    } else {
      paidCount++
    }
  }
  
  return {
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    totalOverdue,
    invoiceCount: invoices.length,
    paidCount,
    unpaidCount,
    overdueCount,
  }
}
