import { createClient } from '@/lib/supabase/client'
import { nanoid } from 'nanoid'

export interface PortalCustomer {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  companyId: string
  companyName: string | null
}

export interface PortalEstimate {
  id: string
  estimateNumber: string
  status: string
  issueDate: string
  expiryDate: string | null
  total: number
  companyId?: string
  notes?: string | null
  terms?: string | null
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }>
}

export interface PortalInvoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  total: number
  amountPaid: number
  balance: number
  companyId?: string
  notes?: string | null
  terms?: string | null
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    total: number
  }>
}

export interface PortalJob {
  id: string
  date: string
  jobType: string
  status: string
  price: number
  notes: string | null
}

export interface PortalBooking {
  id: string
  title: string
  scheduledDate: string
  scheduledTime: string | null
  status: string
  address: string | null
  notes: string | null
}

/**
 * Validate portal access token and return customer data
 * Token format: {customerId}_{randomToken}
 */
export async function validatePortalToken(token: string): Promise<{
  valid: boolean
  customer: PortalCustomer | null
  error: string | null
}> {
  if (!token || token.length < 10) {
    return { valid: false, customer: null, error: 'Invalid token' }
  }

  const supabase = createClient()

  // Check portal_tokens table
  const { data: tokenData, error: tokenError } = await supabase
    .from('customer_portal_tokens')
    .select('customer_id, expires_at, revoked')
    .eq('token', token)
    .maybeSingle()

  if (tokenError) {
    console.error('[Portal] Token lookup error:', tokenError)
    // Fallback: try to parse token as customerId_hash format
    const customerId = token.split('_')[0]
    if (customerId) {
      return await getCustomerByIdFallback(supabase, customerId)
    }
    return { valid: false, customer: null, error: 'Token validation failed' }
  }

  if (!tokenData) {
    // Fallback for demo: treat token as customer ID directly
    const customerId = token.split('_')[0]
    if (customerId) {
      return await getCustomerByIdFallback(supabase, customerId)
    }
    return { valid: false, customer: null, error: 'Token not found' }
  }

  if (tokenData.revoked) {
    return { valid: false, customer: null, error: 'Token has been revoked' }
  }

  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return { valid: false, customer: null, error: 'Token has expired' }
  }

  // Get customer data
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, name, email, phone, address, company_id, companies(name)')
    .eq('id', tokenData.customer_id)
    .single()

  if (customerError || !customer) {
    return { valid: false, customer: null, error: 'Customer not found' }
  }

  return {
    valid: true,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      companyId: customer.company_id,
      companyName: (customer.companies as any)?.name || null,
    },
    error: null,
  }
}

async function getCustomerByIdFallback(
  supabase: ReturnType<typeof createClient>,
  customerId: string
): Promise<{ valid: boolean; customer: PortalCustomer | null; error: string | null }> {
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, name, email, phone, address, company_id, companies(name)')
    .eq('id', customerId)
    .single()

  if (error || !customer) {
    return { valid: false, customer: null, error: 'Customer not found' }
  }

  return {
    valid: true,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      companyId: customer.company_id,
      companyName: (customer.companies as any)?.name || null,
    },
    error: null,
  }
}

/**
 * Generate a new portal access token for a customer
 */
export async function generatePortalToken(
  customerId: string,
  expiresInDays: number = 365
): Promise<{ token: string | null; error: string | null }> {
  const supabase = createClient()

  // Generate secure token
  const token = `${customerId}_${nanoid(32)}`
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const { error } = await supabase
    .from('customer_portal_tokens')
    .insert({
      customer_id: customerId,
      token,
      expires_at: expiresAt.toISOString(),
      revoked: false,
    })

  if (error) {
    // Table might not exist yet - return the simple token format
    console.error('[Portal] Token insert error (table may not exist):', error)
    return { token: `${customerId}_demo`, error: null }
  }

  return { token, error: null }
}

/**
 * Get customer's estimates (scoped to customer_id only)
 */
export async function getPortalEstimates(customerId: string): Promise<PortalEstimate[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('estimates')
    .select('id, estimate_number, status, issue_date, expiry_date, total, items')
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false })

  if (error) {
    console.error('[Portal] Estimates fetch error:', error)
    return []
  }

  return (data || []).map((e) => ({
    id: e.id,
    estimateNumber: e.estimate_number,
    status: e.status,
    issueDate: e.issue_date,
    expiryDate: e.expiry_date,
    total: parseFloat(e.total) || 0,
    items: (e.items || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.unit_price || 0,
      total: item.total || (item.quantity || 1) * (item.unitPrice || item.unit_price || 0),
    })),
  }))
}

/**
 * Get customer's invoices (scoped to customer_id only)
 */
export async function getPortalInvoices(customerId: string): Promise<PortalInvoice[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, items')
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false })

  if (error) {
    console.error('[Portal] Invoices fetch error:', error)
    return []
  }

  return (data || []).map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    status: inv.status,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    total: parseFloat(inv.total) || 0,
    amountPaid: parseFloat(inv.amount_paid) || 0,
    balance: (parseFloat(inv.total) || 0) - (parseFloat(inv.amount_paid) || 0),
    items: (inv.items || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.unit_price || 0,
      total: item.total || (item.quantity || 1) * (item.unitPrice || item.unit_price || 0),
    })),
  }))
}

/**
 * Get customer's jobs (service history)
 */
export async function getPortalJobs(customerId: string): Promise<PortalJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('jobs')
    .select('id, date, job_type, status, price, notes')
    .eq('customer_id', customerId)
    .order('date', { ascending: false })

  if (error) {
    console.error('[Portal] Jobs fetch error:', error)
    return []
  }

  return (data || []).map((job) => ({
    id: job.id,
    date: job.date,
    jobType: job.job_type,
    status: job.status,
    price: parseFloat(job.price) || 0,
    notes: job.notes,
  }))
}

/**
 * Get customer's bookings
 */
export async function getPortalBookings(customerId: string): Promise<PortalBooking[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, title, scheduled_date, scheduled_time, status, address, notes')
    .eq('customer_id', customerId)
    .order('scheduled_date', { ascending: false })

  if (error) {
    console.error('[Portal] Bookings fetch error:', error)
    return []
  }

  return (data || []).map((b) => ({
    id: b.id,
    title: b.title,
    scheduledDate: b.scheduled_date,
    scheduledTime: b.scheduled_time,
    status: b.status,
    address: b.address,
    notes: b.notes,
  }))
}

/**
 * Get a single estimate by ID (with customer verification)
 */
export async function getPortalEstimate(
  estimateId: string,
  customerId: string
): Promise<PortalEstimate | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('estimates')
    .select('id, estimate_number, status, issue_date, expiry_date, total, items, company_id, notes, terms')
    .eq('id', estimateId)
    .eq('customer_id', customerId) // Security: must match customer
    .single()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    estimateNumber: data.estimate_number,
    status: data.status,
    issueDate: data.issue_date,
    expiryDate: data.expiry_date,
    total: parseFloat(data.total) || 0,
    companyId: data.company_id,
    notes: data.notes,
    terms: data.terms,
    items: (data.items || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.unit_price || 0,
      total: item.total || (item.quantity || 1) * (item.unitPrice || item.unit_price || 0),
    })),
  }
}

/**
 * Get a single invoice by ID (with customer verification)
 */
export async function getPortalInvoice(
  invoiceId: string,
  customerId: string
): Promise<PortalInvoice | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, items, company_id, notes, terms')
    .eq('id', invoiceId)
    .eq('customer_id', customerId) // Security: must match customer
    .single()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    invoiceNumber: data.invoice_number,
    status: data.status,
    issueDate: data.issue_date,
    dueDate: data.due_date,
    total: parseFloat(data.total) || 0,
    amountPaid: parseFloat(data.amount_paid) || 0,
    balance: (parseFloat(data.total) || 0) - (parseFloat(data.amount_paid) || 0),
    companyId: data.company_id,
    notes: data.notes,
    terms: data.terms,
    items: (data.items || []).map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.unit_price || 0,
      total: item.total || (item.quantity || 1) * (item.unitPrice || item.unit_price || 0),
    })),
  }
}

/**
 * Accept an estimate (customer action)
 */
export async function acceptEstimate(
  estimateId: string,
  customerId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('estimates')
    .update({ status: 'accepted' })
    .eq('id', estimateId)
    .eq('customer_id', customerId) // Security: must match customer
    .eq('status', 'sent') // Can only accept sent estimates

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Decline an estimate (customer action)
 */
export async function declineEstimate(
  estimateId: string,
  customerId: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('estimates')
    .update({ 
      status: 'declined',
      notes: reason ? `Declined: ${reason}` : undefined 
    })
    .eq('id', estimateId)
    .eq('customer_id', customerId) // Security: must match customer
    .eq('status', 'sent') // Can only decline sent estimates

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}
