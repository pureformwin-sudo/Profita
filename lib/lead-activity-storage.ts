'use server'

import { createClient } from '@/lib/supabase/server'
import { ACTIVITY_TYPES } from '@/lib/lead-activity-types'
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
    .from('lead_activities')
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
  /**
   * Optional. Prefer omitting this: the acting user is derived from the session
   * server-side. Attributing an activity to the *lead's* owner (often the admin
   * who imported it) rather than the rep who actually did the work produces a
   * misleading audit trail, and a client-supplied id can't be trusted anyway.
   */
  ownerUserId?: string
  /**
   * Subject of the activity. At least one of leadId / customerId / jobId must be
   * set (enforced by the `lead_activities_has_subject` CHECK). A call made from
   * a job passes BOTH jobId and customerId, so it shows on the job timeline and
   * the customer's history without being logged twice.
   */
  leadId?: string | null
  customerId?: string | null
  jobId?: string | null
  repEmployeeId: string | null
  activityType: ActivityType
  oldStatus?: string
  newStatus?: string
  notes?: string
  metadata?: Record<string, any>
}): Promise<{ data: LeadActivity | null; error: string | null }> {
  const supabase = await createClient()
  const companyId = await getUserCompanyId()

  const { data: { user } } = await supabase.auth.getUser()
  const actingUserId = user?.id ?? input.ownerUserId
  if (!actingUserId) {
    return { data: null, error: 'Not signed in' }
  }

  // Fail fast with a readable message instead of letting Postgres reject the
  // insert with an opaque 23514 from the subject CHECK.
  if (!input.leadId && !input.customerId && !input.jobId) {
    return { data: null, error: 'Activity needs a lead, customer or job' }
  }

  const { data, error } = await supabase
    .from('lead_activities')
    .insert({
      user_id: actingUserId,
      company_id: companyId,
      lead_id: input.leadId ?? null,
      customer_id: input.customerId ?? null,
      job_id: input.jobId ?? null,
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
  ownerUserId?: string
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

/**
 * Whatever the activity is about. At least one field must be set; a job call
 * should also carry customerId so it appears in the customer's history too.
 */
export type ActivitySubject = {
  leadId?: string | null
  customerId?: string | null
  jobId?: string | null
}

// Log a call
export async function logCall(
  input: ActivitySubject & {
    ownerUserId?: string
    repEmployeeId: string | null
    duration?: number
    outcome?: string
    notes?: string
  },
): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    customerId: input.customerId,
    jobId: input.jobId,
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

// Log a voicemail (rep reached voicemail instead of the person)
export async function logVoicemail(
  input: ActivitySubject & {
    ownerUserId?: string
    repEmployeeId: string | null
    notes?: string
  },
): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    customerId: input.customerId,
    jobId: input.jobId,
    repEmployeeId: input.repEmployeeId,
    activityType: 'voicemail',
    notes: input.notes,
  })
  return !error
}

/**
 * Log a text that the user CONFIRMED they sent.
 *
 * An `sms:` handoff gives no delivery signal back to the web app, so this must
 * only ever be called from an explicit confirmation — never fired automatically
 * on tap, or the log fills up with texts that were never sent.
 * Texts sent in-app through /api/quo/send are logged server-side instead.
 */
export async function logText(
  input: ActivitySubject & {
    ownerUserId?: string
    repEmployeeId: string | null
    notes?: string
  },
): Promise<boolean> {
  const { error } = await logActivity({
    ownerUserId: input.ownerUserId,
    leadId: input.leadId,
    customerId: input.customerId,
    jobId: input.jobId,
    repEmployeeId: input.repEmployeeId,
    activityType: 'sms',
    notes: input.notes,
    metadata: { channel: 'device_handoff', confirmed: true },
  })
  return !error
}

// Log a status change
export async function logStatusChange(input: {
  ownerUserId?: string
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
    .from('lead_activities')
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
    .from('lead_activities')
    .select('activity_type')
    .eq('rep_employee_id', repEmployeeId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // Derive the zeroed map from ACTIVITY_TYPES instead of hardcoding the keys.
  // The two literal objects that used to live here had drifted out of sync with
  // the type (they still listed 'booked' and were missing 'voicemail'), so any
  // new activity type silently counted as 0 forever.
  const emptyCounts = (): Record<ActivityType, number> =>
    ACTIVITY_TYPES.reduce(
      (acc, t) => ({ ...acc, [t]: 0 }),
      {} as Record<ActivityType, number>,
    )

  if (error) {
    if (error.code === '42P01') return emptyCounts()
    console.error('[lead-activity-storage] getActivityCountsForRep error:', error)
    return emptyCounts()
  }

  const counts: Record<ActivityType, number> = emptyCounts()

  for (const row of data || []) {
    const type = row.activity_type as ActivityType
    if (counts[type] !== undefined) counts[type]++
  }

  return counts
}
