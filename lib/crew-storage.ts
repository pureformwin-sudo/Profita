'use client'

import { createClient } from '@/lib/supabase/client'

// Job statuses that crew can set (state machine)
export type CrewJobStatus = 'Scheduled' | 'On My Way' | 'In Progress' | 'Completed' | 'Needs Review'

// All job statuses including admin-only ones
export type JobStatus = CrewJobStatus | 'Paid' | 'Cancelled'

// Valid status transitions for crew members
export const CREW_STATUS_TRANSITIONS: Record<string, CrewJobStatus[]> = {
  'Scheduled': ['On My Way', 'In Progress'],
  'On My Way': ['In Progress', 'Scheduled'], // Can go back if they haven't started
  'In Progress': ['Completed', 'Needs Review'],
  'Completed': [], // Can't change once completed (admin only)
  'Needs Review': [], // Admin handles this
  'Paid': [], // Admin only
  'Cancelled': [], // Admin only
}

// Status badge colors
export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Scheduled': { bg: 'bg-slate-500/10', text: 'text-slate-500', border: 'border-slate-500/30' },
  'On My Way': { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
  'In Progress': { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  'Completed': { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  'Needs Review': { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/30' },
  'Paid': { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/30' },
  'Cancelled': { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30' },
}

export interface CrewJob {
  id: string
  title: string
  scheduled_date: string | null
  scheduled_time: string | null
  status: string
  service: string | null
  price: number | null
  notes: string | null
  estimated_duration: number | null // in minutes
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  customer_email: string | null
  invoice_id: string | null
  lead_id: string | null
}

export interface CrewMember {
  id: string
  name: string
  role: string
  avatar_url: string | null
}

/**
 * Get the current user's employee ID from crew_users table
 */
export async function getMyEmployeeId(): Promise<{ employeeId: string | null; error: string | null; tablesMissing?: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { employeeId: null, error: 'Not authenticated' }
  }

  const { data: crewRow, error } = await supabase
    .from('crew_users')
    .select('employee_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') {
      return { employeeId: null, error: 'Tables not found', tablesMissing: true }
    }
    console.error('[Crew] crew_users lookup failed:', error)
    return { employeeId: null, error: error.message }
  }

  return { employeeId: crewRow?.employee_id || null, error: null }
}

/**
 * Get jobs assigned to the current crew member for a specific date
 */
export async function getMyJobsForDate(dateStr: string): Promise<{ jobs: CrewJob[]; error: string | null; tablesMissing?: boolean }> {
  const { employeeId, error: empError, tablesMissing } = await getMyEmployeeId()
  
  if (empError || !employeeId) {
    return { jobs: [], error: empError, tablesMissing }
  }

  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('job_workers')
    .select(`
      job_id,
      jobs!inner (
        id, title, scheduled_date, scheduled_time, status, service, price, notes,
        customer_id, invoice_id, lead_id,
        customers ( id, name, phone, address, email )
      )
    `)
    .eq('employee_id', employeeId)

  if (error) {
    console.error('[Crew] jobs lookup failed:', error)
    if (error.code === '42P01') {
      return { jobs: [], error: 'Tables not found', tablesMissing: true }
    }
    return { jobs: [], error: error.message }
  }

  const jobs: CrewJob[] = (data || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => row.jobs)
    .filter(Boolean)
    .filter((j: { scheduled_date: string | null }) => j.scheduled_date === dateStr)
    .map((j: {
      id: string; title: string; scheduled_date: string | null; scheduled_time: string | null;
      status: string; service: string | null; price: number | null; notes: string | null;
      customer_id: string | null; invoice_id: string | null; lead_id: string | null;
      customers: { name: string; phone: string | null; address: string | null; email: string | null } | null
    }) => ({
      id: j.id,
      title: j.title,
      scheduled_date: j.scheduled_date,
      scheduled_time: j.scheduled_time,
      status: j.status,
      service: j.service,
      price: j.price,
      notes: j.notes,
      estimated_duration: null, // TODO: Add to jobs table if needed
      customer_id: j.customer_id,
      customer_name: j.customers?.name || 'Customer',
      customer_phone: j.customers?.phone || null,
      customer_address: j.customers?.address || null,
      customer_email: j.customers?.email || null,
      invoice_id: j.invoice_id,
      lead_id: j.lead_id,
    }))
    // Sort by scheduled_time
    .sort((a: CrewJob, b: CrewJob) => {
      if (!a.scheduled_time) return 1
      if (!b.scheduled_time) return -1
      return a.scheduled_time.localeCompare(b.scheduled_time)
    })

  return { jobs, error: null }
}

/**
 * Get all crew members assigned to a specific job
 */
export async function getJobCrewMembers(jobId: string): Promise<CrewMember[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('job_workers')
    .select(`
      employee_id,
      employees (
        id, name, role
      )
    `)
    .eq('job_id', jobId)

  if (error) {
    console.error('[Crew] job crew lookup failed:', error)
    return []
  }

  return (data || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => row.employees)
    .filter(Boolean)
    .map((e: { id: string; name: string; role: string | null }) => ({
      id: e.id,
      name: e.name,
      role: e.role || 'worker',
      avatar_url: null, // Could add later
    }))
}

/**
 * Update job status (crew-safe version with state machine validation)
 */
export async function updateJobStatus(
  jobId: string, 
  newStatus: CrewJobStatus,
  options?: { skipValidation?: boolean }
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient()
  
  // First, check current status
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (fetchError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const currentStatus = job.status as string

  // Check if transition is allowed (unless skipping validation for admins)
  if (!options?.skipValidation) {
    const allowedTransitions = CREW_STATUS_TRANSITIONS[currentStatus] || []
    if (!allowedTransitions.includes(newStatus)) {
      return { 
        success: false, 
        error: `Cannot change status from "${currentStatus}" to "${newStatus}"` 
      }
    }
  }

  // Prevent changing completed/paid jobs
  if (['Paid', 'Cancelled'].includes(currentStatus) && !options?.skipValidation) {
    return { success: false, error: `Cannot modify a ${currentStatus.toLowerCase()} job` }
  }

  // Update the status
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: newStatus })
    .eq('id', jobId)

  if (updateError) {
    console.error('[Crew] status update failed:', updateError)
    return { success: false, error: updateError.message }
  }

  return { success: true, error: null }
}

/**
 * Quick action: Start job (sets to In Progress + clocks in)
 */
export async function startJob(
  jobId: string,
  employeeId: string,
  ownerUserId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient()
  
  // Update status to In Progress
  const statusResult = await updateJobStatus(jobId, 'In Progress')
  if (!statusResult.success) {
    return statusResult
  }

  // Clock in
  const { error: clockError } = await supabase
    .from('job_clock_events')
    .insert({
      owner_user_id: ownerUserId,
      job_id: jobId,
      crew_employee_id: employeeId,
      event_type: 'clock_in',
    })

  if (clockError) {
    console.error('[Crew] clock in failed:', clockError)
    // Don't fail the whole operation - status was updated
  }

  return { success: true, error: null }
}

/**
 * Get job history/timeline (status changes, clock events, notes, photos)
 */
export async function getJobHistory(jobId: string): Promise<{
  events: Array<{
    id: string
    type: 'status_change' | 'clock_in' | 'clock_out' | 'note' | 'photo_before' | 'photo_after'
    timestamp: string
    actor: string | null
    details: string | null
  }>
}> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('job_clock_events')
    .select(`
      id, event_type, created_at, note,
      employees:crew_employee_id ( name )
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Crew] job history failed:', error)
    return { events: [] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (data || []).map((e: any) => ({
    id: e.id,
    type: e.event_type as 'clock_in' | 'clock_out' | 'note' | 'photo_before' | 'photo_after',
    timestamp: e.created_at,
    actor: e.employees?.name || null,
    details: e.note || null,
  }))

  return { events }
}

/**
 * Sync clock out to time_entries for payroll
 */
export async function syncClockOutToTimeEntry(
  jobId: string,
  employeeId: string,
  clockInTime: string,
  clockOutTime: string
): Promise<void> {
  const supabase = createClient()
  
  // Calculate hours
  const startDate = new Date(clockInTime)
  const endDate = new Date(clockOutTime)
  const hours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)

  // Get company_id from employee
  const { data: emp } = await supabase
    .from('employees')
    .select('company_id')
    .eq('id', employeeId)
    .single()

  if (!emp?.company_id) return

  // Insert time entry
  const { error } = await supabase
    .from('time_entries')
    .insert({
      company_id: emp.company_id,
      employee_id: employeeId,
      job_id: jobId,
      date: startDate.toISOString().split('T')[0],
      hours: Math.round(hours * 100) / 100, // Round to 2 decimals
      entry_type: 'job',
      status: 'pending',
      notes: `Auto-synced from job clock events`,
    })

  if (error) {
    console.error('[Crew] time_entries sync failed:', error)
  }
}
