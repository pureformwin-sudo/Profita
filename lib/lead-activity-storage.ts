'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActivityType, LeadActivity } from '@/lib/lead-activity-types'

// Re-export types for consumers
export type { ActivityType, LeadActivity } from '@/lib/lead-activity-types'

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
// Lead Activity CRUD
// =============================================================================

export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lead_activity')
    .select(`
      *,
      employees:rep_employee_id(name)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    console.error('[lead-activity-storage] getLeadActivities error:', error)
    return []
  }

  return (data || []).map((a: any) => ({
    ...a,
    rep_name: a.employees?.name,
  }))
}

export async function logActivity(input: {
  ownerUserId: string
  leadId: string
  repEmployeeId: string | null
  activityType: ActivityType
  oldStatus?: string
  newStatus?: string
  notes?: string
  metadata?: Record<string, any>
}): Promise<{ data: LeadActivity | null; error: string | null }> {
  const supabase = await createClient()
  const companyId = await getUserCompanyId()

  const { data, error } = await supabase
    .from('lead_activity')
    .insert({
      user_id: input.ownerUserId,
      company_id: companyId,
      lead_id: input.leadId,
      rep_employee_id: input.repEmployeeId,
      activity_type: input.activityType,
      old_status: input.oldStatus || null,
      new_status: input.newStatus || null,
      notes: input.notes || null,
      metadata: input.metadata || {},
    })
    .select()
    .single()

  if (error) {
    if (error.code === '42P01') return { data: null, error: 'Lead activity table not found. Please run the migration.' }
    console.error('[lead-activity-storage] logActivity error:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// Log a door knock with location
export async function logKnock(input: {
  ownerUserId: string
  leadId: string
  repEmployeeId: string | null
  lat?: number
  lng?: number
  outcome?: string
  notes?: string
}): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    repEmployeeId: input.repEmployeeId,
    activityType: 'knock',
    notes: input.notes,
    metadata: {
      lat: input.lat,
      lng: input.lng,
      outcome: input.outcome,
    },
  })
  return !error
}

// Log a call
export async function logCall(input: {
  ownerUserId: string
  leadId: string
  repEmployeeId: string | null
  duration?: number
  outcome?: string
  notes?: string
}): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    repEmployeeId: input.repEmployeeId,
    activityType: 'call',
    notes: input.notes,
    metadata: {
      duration: input.duration,
      outcome: input.outcome,
    },
  })
  return !error
}

// Log a status change
export async function logStatusChange(input: {
  ownerUserId: string
  leadId: string
  repEmployeeId: string | null
  oldStatus: string
  newStatus: string
  notes?: string
}): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    repEmployeeId: input.repEmployeeId,
    activityType: 'status_change',
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    notes: input.notes,
  })
  return !error
}

// Get recent activity for a rep (for dashboard)
export async function getRecentActivityForRep(
  repEmployeeId: string,
  limit = 10
): Promise<Array<LeadActivity & { lead_name?: string; lead_address?: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lead_activity')
    .select(`
      *,
      leads:lead_id(name, address)
    `)
    .eq('rep_employee_id', repEmployeeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === '42P01') return []
    console.error('[lead-activity-storage] getRecentActivityForRep error:', error)
    return []
  }

  return (data || []).map((a: any) => ({
    ...a,
    lead_name: a.leads?.name,
    lead_address: a.leads?.address,
  }))
}

// Get activity counts for a rep in a date range (for stats)
export async function getActivityCountsForRep(
  repEmployeeId: string,
  startDate: string,
  endDate: string
): Promise<Record<ActivityType, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lead_activity')
    .select('activity_type')
    .eq('rep_employee_id', repEmployeeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (error) {
    console.error('[lead-activity-storage] getActivityCountsForRep error:', error)
    return {
      knock: 0,
      call: 0,
      sms: 0,
      email: 0,
      note: 0,
      status_change: 0,
      quote_sent: 0,
      booked: 0,
    }
  }

  const counts: Record<ActivityType, number> = {
    knock: 0,
    call: 0,
    sms: 0,
    email: 0,
    note: 0,
    status_change: 0,
    quote_sent: 0,
    booked: 0,
  }

  for (const row of data || []) {
    const type = row.activity_type as ActivityType
    if (counts[type] !== undefined) counts[type]++
  }

  return counts
}
