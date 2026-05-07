import { createClient } from '@/lib/supabase/client'

export type ClockEventType = 'clock_in' | 'clock_out' | 'photo_before' | 'photo_after' | 'note'

export interface JobClockEvent {
  id: string
  user_id: string
  job_id: string
  crew_user_id: string | null
  crew_employee_id: string | null
  event_type: ClockEventType
  photo_url: string | null
  note: string | null
  occurred_at: string
}

/** All clock events for a single job, oldest first. */
export async function getJobEvents(jobId: string): Promise<JobClockEvent[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_clock_events')
    .select('*')
    .eq('job_id', jobId)
    .order('occurred_at', { ascending: true })
  if (error) {
    console.error('[Clock] Failed to load events:', error)
    return []
  }
  return (data || []) as JobClockEvent[]
}

/** All clock events for the current crew user across all jobs (used for hours summary). */
export async function getMyClockEvents(sinceISO?: string): Promise<{ data: JobClockEvent[]; tablesMissing: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], tablesMissing: false }

  let q = supabase
    .from('job_clock_events')
    .select('*')
    .eq('crew_user_id', user.id)
    .order('occurred_at', { ascending: true })
  if (sinceISO) q = q.gte('occurred_at', sinceISO)

  const { data, error } = await q
  if (error) {
    console.error('[Clock] Failed to load my events:', error)
    return { data: [], tablesMissing: error.code === '42P01' }
  }
  return { data: (data || []) as JobClockEvent[], tablesMissing: false }
}

export async function logClockEvent(input: {
  ownerUserId: string
  jobId: string
  crewEmployeeId: string | null
  eventType: ClockEventType
  photoUrl?: string | null
  note?: string | null
}): Promise<{ data: JobClockEvent | null; error: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated.' }

  const { data, error } = await supabase
    .from('job_clock_events')
    .insert({
      user_id: input.ownerUserId,
      job_id: input.jobId,
      crew_user_id: user.id,
      crew_employee_id: input.crewEmployeeId,
      event_type: input.eventType,
      photo_url: input.photoUrl ?? null,
      note: input.note ?? null,
    })
    .select()
    .single()
  if (error) {
    console.error('[Clock] Failed to log event:', error)
    const msg = error.code === '42P01'
      ? 'Job clock events table does not exist. Run migration 09 first.'
      : error.message
    return { data: null, error: msg }
  }
  return { data: data as JobClockEvent, error: null }
}

/** Returns true if the current crew user is currently clocked in to this job. */
export async function isClockedIn(jobId: string): Promise<boolean> {
  const events = await getJobEvents(jobId)
  // Find latest clock_in or clock_out from the current user
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const mine = events.filter(e => e.crew_user_id === user.id && (e.event_type === 'clock_in' || e.event_type === 'clock_out'))
  if (mine.length === 0) return false
  const last = mine[mine.length - 1]
  return last.event_type === 'clock_in'
}

/**
 * Computes total hours worked across an array of events for the current user.
 * Pairs consecutive clock_in/clock_out events. Stale clock_ins (no matching out) are ignored.
 */
export function totalHoursFromEvents(events: JobClockEvent[], currentUserId?: string | null): number {
  let totalMs = 0
  let openClockIn: Date | null = null
  for (const e of events) {
    if (currentUserId && e.crew_user_id !== currentUserId) continue
    if (e.event_type === 'clock_in') {
      openClockIn = new Date(e.occurred_at)
    } else if (e.event_type === 'clock_out' && openClockIn) {
      totalMs += new Date(e.occurred_at).getTime() - openClockIn.getTime()
      openClockIn = null
    }
  }
  return totalMs / (1000 * 60 * 60)
}
