import { createClient } from '@/lib/supabase/client'

export type LeadStatus =
  | 'knocked'
  | 'not_home'
  | 'not_interested'
  | 'interested'
  | 'quoted'
  | 'booked'
  | 'converted'
  | 'lost'

export const LEAD_STATUSES: LeadStatus[] = [
  'knocked',
  'not_home',
  'not_interested',
  'interested',
  'quoted',
  'booked',
  'converted',
  'lost',
]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  knocked: 'Knocked',
  not_home: 'Not Home',
  not_interested: 'Not Interested',
  interested: 'Interested',
  quoted: 'Quoted',
  booked: 'Booked',
  converted: 'Converted',
  lost: 'Lost',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; pin: string }> = {
  knocked:        { bg: 'bg-slate-500/10',   text: 'text-slate-400',   pin: '#94a3b8' },
  not_home:       { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    pin: '#71717a' },
  not_interested: { bg: 'bg-rose-500/10',    text: 'text-rose-400',    pin: '#f43f5e' },
  interested:     { bg: 'bg-amber-500/10',   text: 'text-amber-400',   pin: '#f59e0b' },
  quoted:         { bg: 'bg-sky-500/10',     text: 'text-sky-400',     pin: '#0ea5e9' },
  booked:         { bg: 'bg-violet-500/10',  text: 'text-violet-400',  pin: '#8b5cf6' },
  converted:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', pin: '#10b981' },
  lost:           { bg: 'bg-gray-500/10',    text: 'text-gray-400',    pin: '#6b7280' },
}

export interface Lead {
  id: string
  user_id: string
  rep_user_id: string | null
  rep_employee_id: string | null
  territory_id: string | null
  name: string
  phone: string
  email: string
  address: string
  lat: number | null
  lng: number | null
  status: LeadStatus
  notes: string
  follow_up_at: string | null
  converted_customer_id: string | null
  created_at: string
  updated_at: string
  // Extended fields (from 10-salesforce-extended.sql)
  service_interest?: string | null
  estimated_value?: number | null
  do_not_knock?: boolean
  property_type?: string | null
  source?: string
  last_contact_at?: string | null
  follow_up_date?: string | null
  follow_up_reason?: string | null
}

export interface Territory {
  id: string
  user_id: string
  name: string
  color: string
  polygon: { type: 'Polygon'; coordinates: number[][][] } | null
  center_lat: number | null
  center_lng: number | null
  assigned_rep_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

// =============================================================================
// Leads CRUD
// =============================================================================

// Convenience wrapper used by sales-rep pages — RLS automatically scopes to the current rep.
// Returns the same { data, tablesMissing } shape as getLeads() so pages can show a setup banner.
export async function getLeadsForCurrentRep(): Promise<{ data: Lead[]; tablesMissing: boolean }> {
  return getLeads()
}

// Convenience wrapper for the common case of changing only the lead's pipeline status.
export async function updateLeadStatus(id: string, status: LeadStatus): Promise<boolean> {
  return updateLead(id, { status })
}

export async function getLeads(): Promise<{ data: Lead[]; tablesMissing: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], tablesMissing: false }

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Leads] Failed to load:', error)
    // PGRST205 = table not found via REST API, 42P01 = table not found via SQL
    return { data: [], tablesMissing: error.code === 'PGRST205' || error.code === '42P01' }
  }
  return { data: (data || []) as Lead[], tablesMissing: false }
}

export async function getLead(id: string): Promise<Lead | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[Leads] Failed to load lead:', error)
    return null
  }
  return data as Lead | null
}

export async function createLead(input: {
  ownerUserId?: string
  name?: string
  phone?: string
  email?: string
  address?: string
  lat?: number | null
  lng?: number | null
  status?: LeadStatus
  notes?: string
  territoryId?: string | null
  repEmployeeId?: string | null
}): Promise<{ data: Lead | null; error: string | null; tablesMissing?: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated.' }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      user_id: user.id, // Always use authenticated user
      owner_employee_id: input.repEmployeeId ?? null,
      territory_id: input.territoryId ?? null,
      name: input.name ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      address: input.address ?? '',
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      status: input.status ?? 'knocked',
      notes: input.notes ?? '',
      source: 'd2d',
    })
    .select()
    .single()

  if (error) {
    console.error('[Leads] Failed to create:', error)
    // PGRST205 = table not found via REST API, 42P01 = table not found via SQL
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return { data: null, error: 'Database setup required. Click "Run Setup" to create tables.', tablesMissing: true }
    }
    return { data: null, error: error.message || 'Failed to create lead.' }
  }
  return { data: data as Lead, error: null }
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[Leads] Failed to update:', error)
    return false
  }
  return true
}

export async function updateLeadNotes(id: string, notes: string): Promise<boolean> {
  return updateLead(id, { notes })
}

export async function deleteLead(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) {
    console.error('[Leads] Failed to delete:', error)
    return false
  }
  return true
}

// =============================================================================
// Territories CRUD
// =============================================================================

export async function getTerritories(): Promise<{ data: Territory[]; tablesMissing: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], tablesMissing: false }

  const { data, error } = await supabase
    .from('territories')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Territories] Failed to load:', error)
    return { data: [], tablesMissing: error.code === '42P01' }
  }
  return { data: (data || []) as Territory[], tablesMissing: false }
}

export async function createTerritory(input: {
  ownerUserId: string
  name: string
  color?: string
  centerLat?: number | null
  centerLng?: number | null
}): Promise<{ data: Territory | null; error: string | null }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('territories')
    .insert({
      user_id: input.ownerUserId,
      name: input.name,
      color: input.color ?? '#10b981',
      center_lat: input.centerLat ?? null,
      center_lng: input.centerLng ?? null,
    })
    .select()
    .single()
  if (error) {
    console.error('[Territories] Failed to create:', error)
    return { data: null, error: error.message }
  }
  return { data: data as Territory, error: null }
}

// =============================================================================
// Follow-Up Helpers
// =============================================================================

export async function getLeadsWithFollowUpDue(): Promise<Lead[]> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('follow_up_date', 'is', null)
    .lte('follow_up_date', today)
    .order('follow_up_date', { ascending: true })

  if (error) {
    console.error('[Leads] Failed to load follow-ups:', error)
    return []
  }
  return (data || []) as Lead[]
}

export async function getLeadsWithUpcomingFollowUp(daysAhead = 7): Promise<Lead[]> {
  const supabase = createClient()
  const today = new Date()
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + daysAhead)
  
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('follow_up_date', 'is', null)
    .gt('follow_up_date', today.toISOString().split('T')[0])
    .lte('follow_up_date', futureDate.toISOString().split('T')[0])
    .order('follow_up_date', { ascending: true })

  if (error) {
    console.error('[Leads] Failed to load upcoming follow-ups:', error)
    return []
  }
  return (data || []) as Lead[]
}

export async function setFollowUp(
  leadId: string,
  date: string,
  reason?: string
): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('leads')
    .update({
      follow_up_date: date,
      follow_up_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) {
    console.error('[Leads] Failed to set follow-up:', error)
    return false
  }
  return true
}

export async function clearFollowUp(leadId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('leads')
    .update({
      follow_up_date: null,
      follow_up_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (error) {
    console.error('[Leads] Failed to clear follow-up:', error)
    return false
  }
  return true
}

// =============================================================================
// Hot Leads (interested + follow-up due)
// =============================================================================

export async function getHotLeads(): Promise<Lead[]> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`status.eq.interested,follow_up_date.lte.${today}`)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[Leads] Failed to load hot leads:', error)
    return []
  }
  return (data || []) as Lead[]
}
