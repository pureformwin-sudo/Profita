'use server'

import { createClient } from '@/lib/supabase/server'
import type { Quote, QuoteStatus } from '@/lib/quotes-types'

// Re-export types for consumers (types are allowed in 'use server' files)
export type { Quote, QuoteItem, QuoteStatus } from '@/lib/quotes-types'

// Get the current user's company ID (server-side)
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
// Quotes CRUD
// =============================================================================

export async function getQuotes(): Promise<{ data: Quote[]; tablesMissing: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      leads:lead_id(name, address),
      customers:customer_id(name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return { data: [], tablesMissing: true }
    console.error('[quotes-storage] getQuotes error:', error)
    return { data: [], tablesMissing: false }
  }

  const mapped = (data || []).map((q: any) => ({
    ...q,
    lead_name: q.leads?.name,
    lead_address: q.leads?.address,
    customer_name: q.customers?.name,
  }))

  return { data: mapped, tablesMissing: false }
}

export async function getQuote(id: string): Promise<Quote | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      leads:lead_id(name, address),
      customers:customer_id(name),
      quote_items(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[quotes-storage] getQuote error:', error)
    return null
  }

  return {
    ...data,
    lead_name: data.leads?.name,
    lead_address: data.leads?.address,
    customer_name: data.customers?.name,
    items: data.quote_items || [],
  }
}

export async function createQuote(input: {
  ownerUserId: string
  repEmployeeId: string | null
  leadId?: string | null
  customerId?: string | null
  serviceType?: string
  propertyType?: string
  description?: string
  items?: Array<{ description: string; quantity: number; unit_price: number }>
  discount?: number
  tax?: number
  validUntil?: string
  notes?: string
}): Promise<{ data: Quote | null; error: string | null }> {
  const supabase = await createClient()
  const companyId = await getUserCompanyId()

  // Calculate totals
  const subtotal = (input.items || []).reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const discount = input.discount || 0
  const tax = input.tax || 0
  const total = subtotal - discount + tax

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      user_id: input.ownerUserId,
      company_id: companyId,
      rep_employee_id: input.repEmployeeId,
      lead_id: input.leadId || null,
      customer_id: input.customerId || null,
      service_type: input.serviceType || null,
      property_type: input.propertyType || null,
      description: input.description || null,
      subtotal,
      discount,
      tax,
      total,
      valid_until: input.validUntil || null,
      notes: input.notes || null,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '42P01') return { data: null, error: 'Quotes table not found. Please run the migration.' }
    console.error('[quotes-storage] createQuote error:', error)
    return { data: null, error: error.message }
  }

  // Insert line items
  if (input.items && input.items.length > 0) {
    const itemsToInsert = input.items.map((item, idx) => ({
      user_id: input.ownerUserId,
      company_id: companyId,
      quote_id: data.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
      sort_order: idx,
    }))

    const { error: itemsError } = await supabase.from('quote_items').insert(itemsToInsert)
    if (itemsError) console.error('[quotes-storage] insert items error:', itemsError)
  }

  return { data, error: null }
}

export async function updateQuote(id: string, updates: Partial<Quote>): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('quotes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[quotes-storage] updateQuote error:', error)
    return false
  }
  return true
}

export async function sendQuote(id: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[quotes-storage] sendQuote error:', error)
    return false
  }
  return true
}

export async function acceptQuote(id: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[quotes-storage] acceptQuote error:', error)
    return false
  }
  return true
}

export async function deleteQuote(id: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) {
    console.error('[quotes-storage] deleteQuote error:', error)
    return false
  }
  return true
}
