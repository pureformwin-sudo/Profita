'use server'

import { createClient } from '@/lib/supabase/server'
import type { Lead, LeadStatus } from '@/lib/leads-storage'
import type { Quote } from '@/lib/quotes-types'
import type { Booking } from '@/lib/bookings-storage'

// =============================================================================
// Conversion Result Types
// =============================================================================

export interface ConversionResult {
  success: boolean
  error?: string
}

export interface LeadConversionResult extends ConversionResult {
  customerId?: string
  customerName?: string
  alreadyConverted?: boolean
  linkedToExisting?: boolean
}

export interface QuoteToJobResult extends ConversionResult {
  jobId?: string
  customerId?: string
  alreadyConverted?: boolean
}

export interface QuoteToEstimateResult extends ConversionResult {
  estimateId?: string
  alreadyConverted?: boolean
}

export interface BookingToJobResult extends ConversionResult {
  jobId?: string
  customerId?: string
}

// =============================================================================
// Helper: Get user's company ID (server-side)
// =============================================================================

async function getUserCompanyId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // First check if user owns a company
  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (ownedCompany) return ownedCompany.id

  // Check if user is a member of a company
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  return membership?.company_id || null
}

// =============================================================================
// Helper: Find existing customer by phone or email within the same company
// =============================================================================

async function findExistingCustomer(
  companyId: string,
  phone?: string | null,
  email?: string | null
): Promise<{ id: string; name: string } | null> {
  if (!phone && !email) return null

  const supabase = await createClient()
  
  // Build OR conditions for phone and email
  const conditions: string[] = []
  if (phone && phone.trim()) {
    // Normalize phone for comparison (remove non-digits)
    const normalizedPhone = phone.replace(/\D/g, '')
    if (normalizedPhone.length >= 7) {
      conditions.push(`phone.ilike.%${normalizedPhone.slice(-7)}%`)
    }
  }
  if (email && email.trim()) {
    conditions.push(`email.ilike.${email.trim()}`)
  }

  if (conditions.length === 0) return null

  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('company_id', companyId)
    .or(conditions.join(','))
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return { id: data.id, name: data.name }
}

// =============================================================================
// Convert Lead to Customer
// =============================================================================

export async function convertLeadToCustomer(
  leadId: string,
  options?: {
    forceCreate?: boolean // Create new even if match found
    linkToCustomerId?: string // Explicitly link to this customer
  }
): Promise<LeadConversionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const companyId = await getUserCompanyId()
  if (!companyId) return { success: false, error: 'No company found' }

  // Get the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return { success: false, error: 'Lead not found' }
  }

  // Check if already converted
  if (lead.converted_customer_id) {
    // Verify the customer still exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', lead.converted_customer_id)
      .maybeSingle()

    if (existingCustomer) {
      return {
        success: true,
        customerId: existingCustomer.id,
        customerName: existingCustomer.name,
        alreadyConverted: true,
      }
    }
    // Customer was deleted, allow re-conversion
  }

  // If explicitly linking to an existing customer
  if (options?.linkToCustomerId) {
    const { data: targetCustomer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', options.linkToCustomerId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!targetCustomer) {
      return { success: false, error: 'Target customer not found' }
    }

    // Update lead with converted_customer_id and status
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        converted_customer_id: targetCustomer.id,
        converted_at: new Date().toISOString(),
        status: 'converted' as LeadStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return {
      success: true,
      customerId: targetCustomer.id,
      customerName: targetCustomer.name,
      linkedToExisting: true,
    }
  }

  // Check for existing customer with same phone/email (unless forceCreate)
  if (!options?.forceCreate) {
    const existingCustomer = await findExistingCustomer(
      companyId,
      lead.phone,
      lead.email
    )

    if (existingCustomer) {
      // Link to existing customer
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          converted_customer_id: existingCustomer.id,
          converted_at: new Date().toISOString(),
          status: 'converted' as LeadStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      if (updateError) {
        return { success: false, error: updateError.message }
      }

      return {
        success: true,
        customerId: existingCustomer.id,
        customerName: existingCustomer.name,
        linkedToExisting: true,
      }
    }
  }

  // Create new customer from lead data
  const { data: newCustomer, error: customerError } = await supabase
    .from('customers')
    .insert({
      user_id: user.id,
      company_id: companyId,
      name: lead.name || 'Unknown',
      phone: lead.phone || null,
      email: lead.email || null,
      address: lead.address || null,
      notes: lead.notes ? `Converted from lead. Original notes: ${lead.notes}` : 'Converted from lead',
    })
    .select('id, name')
    .single()

  if (customerError || !newCustomer) {
    return { success: false, error: customerError?.message || 'Failed to create customer' }
  }

  // Update lead with converted_customer_id and status
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      converted_customer_id: newCustomer.id,
      converted_at: new Date().toISOString(),
      status: 'converted' as LeadStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updateError) {
    // Customer was created but lead update failed - still return success
    console.error('[workflow-conversions] Failed to update lead status:', updateError)
  }

  return {
    success: true,
    customerId: newCustomer.id,
    customerName: newCustomer.name,
    linkedToExisting: false,
  }
}

// =============================================================================
// Convert Quote to Job
// =============================================================================

export async function convertQuoteToJob(
  quoteId: string,
  options?: {
    customerId?: string // Use this customer (skip lead conversion)
    scheduledDate?: string // Job date (defaults to today)
    jobType?: 'Residential' | 'Commercial' | 'Storefront'
  }
): Promise<QuoteToJobResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const companyId = await getUserCompanyId()
  if (!companyId) return { success: false, error: 'No company found' }

  // Get the quote
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single()

  if (quoteError || !quote) {
    return { success: false, error: 'Quote not found' }
  }

  // Check if already converted to job
  if (quote.converted_job_id) {
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', quote.converted_job_id)
      .maybeSingle()

    if (existingJob) {
      return {
        success: true,
        jobId: existingJob.id,
        customerId: quote.customer_id,
        alreadyConverted: true,
      }
    }
    // Job was deleted, allow re-conversion
  }

  // Determine customer ID
  let customerId = options?.customerId || quote.customer_id

  // If no customer but has lead, convert lead to customer first
  if (!customerId && quote.lead_id) {
    const leadResult = await convertLeadToCustomer(quote.lead_id)
    if (!leadResult.success) {
      return { success: false, error: `Failed to convert lead: ${leadResult.error}` }
    }
    customerId = leadResult.customerId
  }

  if (!customerId) {
    return { success: false, error: 'No customer associated with this quote. Convert the lead first or select a customer.' }
  }

  // Create the job
  const jobDate = options?.scheduledDate || new Date().toISOString().split('T')[0]
  
  const { data: newJob, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: customerId,
      lead_id: quote.lead_id || null,
      quote_id: quoteId,
      date: jobDate,
      job_type: options?.jobType || 'Residential',
      price: quote.total || 0,
      status: 'Scheduled',
      notes: quote.notes ? `From quote #${quote.quote_number}. ${quote.notes}` : `From quote #${quote.quote_number}`,
    })
    .select('id')
    .single()

  if (jobError || !newJob) {
    return { success: false, error: jobError?.message || 'Failed to create job' }
  }

  // Update quote with converted_job_id
  const { error: updateError } = await supabase
    .from('quotes')
    .update({
      converted_job_id: newJob.id,
      converted_at: new Date().toISOString(),
      customer_id: customerId, // Ensure customer is linked
      status: 'accepted',
      accepted_at: quote.accepted_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)

  if (updateError) {
    console.error('[workflow-conversions] Failed to update quote:', updateError)
  }

  // Update lead status if applicable
  if (quote.lead_id) {
    await supabase
      .from('leads')
      .update({
        status: 'converted' as LeadStatus,
        converted_customer_id: customerId,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote.lead_id)
  }

  return {
    success: true,
    jobId: newJob.id,
    customerId: customerId,
  }
}

// =============================================================================
// Convert Quote to Estimate
// =============================================================================

export async function convertQuoteToEstimate(
  quoteId: string
): Promise<QuoteToEstimateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const companyId = await getUserCompanyId()
  if (!companyId) return { success: false, error: 'No company found' }

  // Get the quote with line items
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single()

  if (quoteError || !quote) {
    return { success: false, error: 'Quote not found' }
  }

  // Check if already converted to estimate (check converted_invoice_id as we don't have converted_estimate_id)
  if (quote.converted_invoice_id) {
    return {
      success: true,
      estimateId: quote.converted_invoice_id,
      alreadyConverted: true,
    }
  }

  // Get or create customer
  let customerId = quote.customer_id

  if (!customerId && quote.lead_id) {
    const leadResult = await convertLeadToCustomer(quote.lead_id)
    if (!leadResult.success) {
      return { success: false, error: `Failed to convert lead: ${leadResult.error}` }
    }
    customerId = leadResult.customerId
  }

  if (!customerId) {
    return { success: false, error: 'No customer associated with this quote' }
  }

  // Generate estimate number
  const { count } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })

  const estimateNumber = `EST-${String((count || 0) + 1).padStart(4, '0')}`

  // Parse line items from quote (stored as jsonb in quotes.line_items or items)
  const lineItems = quote.line_items || quote.items || []
  const estimateItems = Array.isArray(lineItems)
    ? lineItems.map((item: any) => ({
        description: item.description || item.name || 'Service',
        quantity: item.quantity || 1,
        unitPrice: item.unit_price || item.unitPrice || item.price || 0,
        total: (item.quantity || 1) * (item.unit_price || item.unitPrice || item.price || 0),
      }))
    : []

  const subtotal = estimateItems.reduce((sum: number, item: any) => sum + item.total, 0)
  const taxRate = quote.tax_rate || 0
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  // Create estimate
  const today = new Date().toISOString().split('T')[0]
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: newEstimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: customerId,
      estimate_number: estimateNumber,
      status: 'draft',
      issue_date: today,
      expiry_date: expiryDate,
      items: estimateItems,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes: quote.notes ? `Converted from quote #${quote.quote_number}. ${quote.notes}` : `Converted from quote #${quote.quote_number}`,
    })
    .select('id')
    .single()

  if (estimateError || !newEstimate) {
    return { success: false, error: estimateError?.message || 'Failed to create estimate' }
  }

  // Update quote to mark as converted (using converted_invoice_id for now since we don't have converted_estimate_id)
  await supabase
    .from('quotes')
    .update({
      converted_invoice_id: newEstimate.id,
      converted_at: new Date().toISOString(),
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)

  return {
    success: true,
    estimateId: newEstimate.id,
  }
}

// =============================================================================
// Convert Booking to Job
// =============================================================================

export async function convertBookingToJob(
  bookingId: string,
  options?: {
    customerId?: string
    jobType?: 'Residential' | 'Commercial' | 'Storefront'
    price?: number
  }
): Promise<BookingToJobResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const companyId = await getUserCompanyId()
  if (!companyId) return { success: false, error: 'No company found' }

  // Get the booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, leads:lead_id(*)')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return { success: false, error: 'Booking not found' }
  }

  // Determine customer ID
  let customerId = options?.customerId || booking.customer_id

  // If no customer but has lead, convert lead to customer
  if (!customerId && booking.lead_id) {
    const leadResult = await convertLeadToCustomer(booking.lead_id)
    if (!leadResult.success) {
      return { success: false, error: `Failed to convert lead: ${leadResult.error}` }
    }
    customerId = leadResult.customerId
  }

  if (!customerId) {
    return { success: false, error: 'No customer associated with this booking. Convert the lead first or select a customer.' }
  }

  // Create job from booking
  const { data: newJob, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: customerId,
      lead_id: booking.lead_id || null,
      date: booking.scheduled_date,
      start_time: booking.scheduled_time || null,
      job_type: options?.jobType || 'Residential',
      price: options?.price || 0,
      status: 'Scheduled',
      notes: booking.notes ? `From booking. Service: ${booking.service_type}. ${booking.notes}` : `From booking. Service: ${booking.service_type}`,
    })
    .select('id')
    .single()

  if (jobError || !newJob) {
    return { success: false, error: jobError?.message || 'Failed to create job' }
  }

  // Update booking status
  await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      customer_id: customerId,
    })
    .eq('id', bookingId)

  // Update lead if applicable
  if (booking.lead_id) {
    await supabase
      .from('leads')
      .update({
        status: 'converted' as LeadStatus,
        converted_customer_id: customerId,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.lead_id)
  }

  return {
    success: true,
    jobId: newJob.id,
    customerId: customerId,
  }
}

// =============================================================================
// Update Lead Pipeline Status (auto-updates based on events)
// =============================================================================

export type PipelineEvent =
  | 'follow_up_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'appointment_booked'
  | 'deal_closed'
  | 'converted_to_customer'
  | 'job_created'
  | 'marked_not_interested'
  | 'marked_lost'

export async function updateLeadPipelineStatus(
  leadId: string,
  event: PipelineEvent
): Promise<{ success: boolean; newStatus?: LeadStatus; error?: string }> {
  const supabase = await createClient()

  // Map events to status changes
  const statusMap: Record<PipelineEvent, LeadStatus> = {
    follow_up_created: 'interested',
    quote_sent: 'quoted',
    quote_accepted: 'quoted',
    appointment_booked: 'booked',
    deal_closed: 'converted',
    converted_to_customer: 'converted',
    job_created: 'converted',
    marked_not_interested: 'not_interested',
    marked_lost: 'lost',
  }

  const newStatus = statusMap[event]
  if (!newStatus) {
    return { success: false, error: 'Invalid event type' }
  }

  // Get current lead to check if we should update
  const { data: lead, error: fetchError } = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single()

  if (fetchError || !lead) {
    return { success: false, error: 'Lead not found' }
  }

  // Define status priority (higher = more progressed in pipeline)
  const statusPriority: Record<LeadStatus, number> = {
    knocked: 1,
    not_home: 2,
    not_interested: 0, // Terminal state
    interested: 3,
    quoted: 4,
    booked: 5,
    converted: 6,
    lost: 0, // Terminal state
  }

  // Only update if new status is higher priority (don't regress)
  // Exception: terminal states (not_interested, lost) can be set from any state
  const currentPriority = statusPriority[lead.status as LeadStatus] || 0
  const newPriority = statusPriority[newStatus] || 0

  if (newPriority <= currentPriority && newPriority > 0) {
    // Don't regress, but still return success
    return { success: true, newStatus: lead.status as LeadStatus }
  }

  // Update the status
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'converted' ? { converted_at: new Date().toISOString() } : {}),
    })
    .eq('id', leadId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true, newStatus }
}

// =============================================================================
// Helper: Check if lead is already converted
// =============================================================================

export async function checkLeadConversionStatus(
  leadId: string
): Promise<{ converted: boolean; customerId?: string; customerName?: string }> {
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('converted_customer_id, customers:converted_customer_id(name)')
    .eq('id', leadId)
    .single()

  if (!lead?.converted_customer_id) {
    return { converted: false }
  }

  return {
    converted: true,
    customerId: lead.converted_customer_id,
    customerName: (lead as any).customers?.name,
  }
}

// =============================================================================
// Helper: Check if quote is already converted
// =============================================================================

export async function checkQuoteConversionStatus(
  quoteId: string
): Promise<{
  convertedToJob: boolean
  convertedToEstimate: boolean
  jobId?: string
  estimateId?: string
}> {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select('converted_job_id, converted_invoice_id')
    .eq('id', quoteId)
    .single()

  if (!quote) {
    return { convertedToJob: false, convertedToEstimate: false }
  }

  return {
    convertedToJob: !!quote.converted_job_id,
    convertedToEstimate: !!quote.converted_invoice_id,
    jobId: quote.converted_job_id || undefined,
    estimateId: quote.converted_invoice_id || undefined,
  }
}
