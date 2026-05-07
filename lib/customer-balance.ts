// ============================================================================
// Customer Balance Functions for Phase 4
// Calculate customer balances, payment history, and related metrics
// ============================================================================

import { createClient } from '@/lib/supabase/client'
import type { 
  Payment,
  CustomerBalance,
  CustomerPaymentHistoryEntry 
} from './payments-types'

function getSupabase() {
  return createClient()
}

// ============================================================================
// Customer Balance Calculations
// ============================================================================

/**
 * Get a customer's balance summary
 */
export async function getCustomerBalance(customerId: string): Promise<CustomerBalance | null> {
  const supabase = getSupabase()
  
  // Get customer info
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .maybeSingle()
  
  if (customerError || !customer) {
    console.error('Error fetching customer:', customerError)
    return null
  }
  
  // Get all invoices for customer (exclude cancelled)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, due_date, status')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
  
  // Get all completed payments for customer
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .order('payment_date', { ascending: false })
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let totalInvoiced = 0
  let totalPaid = 0
  let overdueAmount = 0
  let unpaidInvoiceCount = 0
  
  for (const invoice of (invoices || [])) {
    const total = Number(invoice.total)
    const paid = Number(invoice.amount_paid)
    const balance = total - paid
    
    totalInvoiced += total
    
    if (balance > 0) {
      unpaidInvoiceCount++
      
      const dueDate = new Date(invoice.due_date)
      dueDate.setHours(0, 0, 0, 0)
      if (dueDate < today) {
        overdueAmount += balance
      }
    }
  }
  
  // Sum completed payments
  for (const payment of (payments || [])) {
    totalPaid += Number(payment.amount)
  }
  
  const lastPayment = payments && payments.length > 0 ? payments[0] : null
  
  return {
    customerId: customer.id,
    customerName: customer.name,
    totalInvoiced,
    totalPaid,
    balanceDue: totalInvoiced - totalPaid,
    overdueAmount,
    invoiceCount: (invoices || []).length,
    unpaidInvoiceCount,
    lastPaymentDate: lastPayment?.payment_date || null,
    lastPaymentAmount: lastPayment ? Number(lastPayment.amount) : null,
  }
}

/**
 * Get balances for all customers with outstanding balances
 */
export async function getCustomersWithBalances(): Promise<CustomerBalance[]> {
  const supabase = getSupabase()
  
  // Get all customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .order('name')
  
  if (!customers) return []
  
  // Get all invoices (exclude cancelled)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, customer_id, total, amount_paid, due_date, status')
    .neq('status', 'cancelled')
  
  // Get all completed payments
  const { data: payments } = await supabase
    .from('payments')
    .select('customer_id, amount, payment_date')
    .eq('status', 'completed')
    .order('payment_date', { ascending: false })
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Build customer balance map
  const balanceMap = new Map<string, CustomerBalance>()
  
  // Initialize all customers
  for (const customer of customers) {
    balanceMap.set(customer.id, {
      customerId: customer.id,
      customerName: customer.name,
      totalInvoiced: 0,
      totalPaid: 0,
      balanceDue: 0,
      overdueAmount: 0,
      invoiceCount: 0,
      unpaidInvoiceCount: 0,
      lastPaymentDate: null,
      lastPaymentAmount: null,
    })
  }
  
  // Process invoices
  for (const invoice of (invoices || [])) {
    const balance = balanceMap.get(invoice.customer_id)
    if (!balance) continue
    
    const total = Number(invoice.total)
    const paid = Number(invoice.amount_paid)
    const remaining = total - paid
    
    balance.totalInvoiced += total
    balance.invoiceCount++
    
    if (remaining > 0) {
      balance.unpaidInvoiceCount++
      
      const dueDate = new Date(invoice.due_date)
      dueDate.setHours(0, 0, 0, 0)
      if (dueDate < today) {
        balance.overdueAmount += remaining
      }
    }
  }
  
  // Process payments
  for (const payment of (payments || [])) {
    const balance = balanceMap.get(payment.customer_id)
    if (!balance) continue
    
    balance.totalPaid += Number(payment.amount)
    
    // Track last payment (payments are ordered desc by date)
    if (!balance.lastPaymentDate) {
      balance.lastPaymentDate = payment.payment_date
      balance.lastPaymentAmount = Number(payment.amount)
    }
  }
  
  // Calculate balance due and filter to only those with balances
  const results: CustomerBalance[] = []
  for (const balance of balanceMap.values()) {
    balance.balanceDue = balance.totalInvoiced - balance.totalPaid
    if (balance.balanceDue > 0 || balance.invoiceCount > 0) {
      results.push(balance)
    }
  }
  
  // Sort by balance due (highest first)
  results.sort((a, b) => b.balanceDue - a.balanceDue)
  
  return results
}

/**
 * Get customers with overdue balances
 */
export async function getCustomersWithOverdueBalances(): Promise<CustomerBalance[]> {
  const all = await getCustomersWithBalances()
  return all.filter(c => c.overdueAmount > 0)
}

// ============================================================================
// Customer Payment History
// ============================================================================

/**
 * Get a customer's payment history (invoices and payments in chronological order)
 */
export async function getCustomerPaymentHistory(customerId: string): Promise<CustomerPaymentHistoryEntry[]> {
  const supabase = getSupabase()
  
  // Get all invoices for customer
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, issue_date, status')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('issue_date', { ascending: true })
  
  // Get all payments for customer
  const { data: payments } = await supabase
    .from('payments')
    .select('id, invoice_id, amount, payment_method, payment_date, reference_number, status')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .order('payment_date', { ascending: true })
  
  // Build invoice lookup
  const invoiceLookup = new Map<string, { invoiceNumber: string; total: number }>()
  for (const inv of (invoices || [])) {
    invoiceLookup.set(inv.id, { 
      invoiceNumber: inv.invoice_number, 
      total: Number(inv.total) 
    })
  }
  
  // Build combined history
  const history: CustomerPaymentHistoryEntry[] = []
  
  // Add invoice entries (positive amounts = charges)
  for (const invoice of (invoices || [])) {
    history.push({
      id: invoice.id,
      type: 'invoice',
      date: invoice.issue_date,
      description: `Invoice #${invoice.invoice_number}`,
      amount: Number(invoice.total), // Positive = amount owed
      balance: 0, // Will be calculated
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    })
  }
  
  // Add payment entries (negative amounts = payments reduce balance)
  for (const payment of (payments || [])) {
    const invoiceInfo = payment.invoice_id ? invoiceLookup.get(payment.invoice_id) : null
    
    history.push({
      id: payment.id,
      type: 'payment',
      date: payment.payment_date,
      description: invoiceInfo 
        ? `Payment for Invoice #${invoiceInfo.invoiceNumber}`
        : 'Payment received',
      amount: -Number(payment.amount), // Negative = reduces balance
      balance: 0, // Will be calculated
      invoiceId: payment.invoice_id || undefined,
      invoiceNumber: invoiceInfo?.invoiceNumber,
      paymentMethod: payment.payment_method,
      referenceNumber: payment.reference_number || undefined,
    })
  }
  
  // Sort by date
  history.sort((a, b) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()
    if (dateA !== dateB) return dateA - dateB
    // If same date, invoices come before payments
    if (a.type === 'invoice' && b.type === 'payment') return -1
    if (a.type === 'payment' && b.type === 'invoice') return 1
    return 0
  })
  
  // Calculate running balance
  let runningBalance = 0
  for (const entry of history) {
    runningBalance += entry.amount
    entry.balance = runningBalance
  }
  
  return history
}

// ============================================================================
// Summary Statistics
// ============================================================================

/**
 * Get overall accounts receivable summary
 */
export async function getAccountsReceivableSummary(): Promise<{
  totalOutstanding: number
  totalOverdue: number
  customersWithBalance: number
  customersOverdue: number
  averageBalance: number
  averageDaysOutstanding: number
}> {
  const customers = await getCustomersWithBalances()
  
  let totalOutstanding = 0
  let totalOverdue = 0
  let customersWithBalance = 0
  let customersOverdue = 0
  
  for (const customer of customers) {
    if (customer.balanceDue > 0) {
      totalOutstanding += customer.balanceDue
      customersWithBalance++
    }
    if (customer.overdueAmount > 0) {
      totalOverdue += customer.overdueAmount
      customersOverdue++
    }
  }
  
  const averageBalance = customersWithBalance > 0 
    ? totalOutstanding / customersWithBalance 
    : 0
  
  // TODO: Calculate average days outstanding from invoice issue dates
  const averageDaysOutstanding = 0
  
  return {
    totalOutstanding,
    totalOverdue,
    customersWithBalance,
    customersOverdue,
    averageBalance,
    averageDaysOutstanding,
  }
}

/**
 * Get top customers by balance due
 */
export async function getTopCustomersByBalance(limit: number = 10): Promise<CustomerBalance[]> {
  const customers = await getCustomersWithBalances()
  return customers
    .filter(c => c.balanceDue > 0)
    .slice(0, limit)
}

/**
 * Get top customers by overdue amount
 */
export async function getTopCustomersByOverdue(limit: number = 10): Promise<CustomerBalance[]> {
  const customers = await getCustomersWithBalances()
  return customers
    .filter(c => c.overdueAmount > 0)
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, limit)
}
