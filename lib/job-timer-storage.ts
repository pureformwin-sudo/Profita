// =============================================================================
// Job Timer / Time Tracking
// =============================================================================
// Segment-based model on the existing `time_entries` table (see script 37).
// One row per segment: work | break | travel.
//   Start  -> open a work segment (end_time NULL)
//   Pause  -> close the open segment
//   Resume -> open a new work segment
//   Finish -> close the open segment
//
// RELIABILITY CONTRACT: elapsed time is ALWAYS derived by summing stored
// timestamps. Nothing is ever accumulated client-side, so the timer survives
// refresh, backgrounding, screen lock, app close, and network drops. The UI
// uses a local interval purely to re-render the derived value once per second.
// =============================================================================

import { createClient, getCachedUser } from '@/lib/supabase/client'

export type TimeEntryType = 'work' | 'break' | 'travel'

export interface JobTimeEntry {
  id: string
  companyId: string | null
  jobId: string | null
  memberId: string | null
  userId: string | null
  entryType: TimeEntryType
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  notes: string | null
  isManual: boolean
  createdBy: string | null
  editedBy: string | null
  editedAt: string | null
  createdAt: string | null
}

/** Rolled-up totals for a job, derived from its segments. */
export interface JobTimeSummary {
  entries: JobTimeEntry[]
  /** Sum of completed work segments, in seconds (excludes the running one). */
  workSeconds: number
  breakSeconds: number
  travelSeconds: number
  /** First start and last end across all segments. */
  firstStart: string | null
  lastEnd: string | null
  /**
   * Start of the first WORK segment. Distinct from firstStart, which may point at
   * a travel segment — showing that as "Started at" made the work timer look like
   * it began when the drive began.
   */
  workFirstStart: string | null
  /** True once at least one work segment exists (travel alone doesn't count). */
  hasWorkStarted: boolean
  /** Wall-clock span from first start to last end (or now if still running). */
  totalElapsedSeconds: number
  /** The currently running segment, if any. */
  openEntry: JobTimeEntry | null
  isRunning: boolean
  /** Timer was started at some point but is not currently running. */
  isPaused: boolean
  /** Per-person breakdown so we can answer "who worked this job, how long". */
  byWorker: JobWorkerTime[]
}

export interface JobWorkerTime {
  key: string
  memberId: string | null
  userId: string | null
  name: string
  workSeconds: number
  isRunning: boolean
}

/** A running timer plus the job context needed by the global active-job bar. */
export interface ActiveTimer {
  entry: JobTimeEntry
  jobId: string
  customerName: string
  jobType: string | null
  /** Total completed work on this job before the running segment. */
  priorWorkSeconds: number
}

function getSupabase() {
  return createClient()
}

/** Missing-table detection so the UI can surface setup SQL instead of failing. */
function isMissingTable(error: any): boolean {
  return error?.code === '42P01'
}

async function getUserCompanyId(): Promise<string | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (ownedCompany) return ownedCompany.id

  const { data: membership } = await supabase.rpc('get_my_membership')
  if (membership?.company_id) return membership.company_id

  return null
}

/**
 * Resolves the acting worker. Owners have a synthetic membership id ('owner')
 * and no company_members row, so memberId stays null and attribution falls back
 * to the auth user id — which is why script 37 makes member_id nullable.
 */
async function getActor(): Promise<{ userId: string; memberId: string | null; companyId: string | null; name: string } | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const companyId = await getUserCompanyId()

  const { data: membership } = await supabase.rpc('get_my_membership')
  const memberId = membership?.id && membership.id !== 'owner' ? membership.id : null
  const name =
    membership?.name ||
    (user.user_metadata as any)?.name ||
    user.email?.split('@')[0] ||
    'You'

  return { userId: user.id, memberId, companyId, name }
}

function mapEntry(r: any): JobTimeEntry {
  return {
    id: r.id,
    companyId: r.company_id ?? null,
    jobId: r.job_id ?? null,
    memberId: r.member_id ?? null,
    userId: r.user_id ?? null,
    entryType: (r.entry_type || 'work') as TimeEntryType,
    startTime: r.start_time,
    endTime: r.end_time ?? null,
    durationSeconds:
      r.duration_seconds != null
        ? Number(r.duration_seconds)
        : r.duration_minutes != null
          ? Number(r.duration_minutes) * 60
          : null,
    notes: r.notes ?? null,
    isManual: !!r.is_manual,
    createdBy: r.created_by ?? null,
    editedBy: r.edited_by ?? null,
    editedAt: r.edited_at ?? null,
    createdAt: r.created_at ?? null,
  }
}

// ============================================================================
// Derived time math (pure — safe to call on every render tick)
// ============================================================================

/** Seconds of a segment, counting up to `now` while it is still open. */
export function segmentSeconds(entry: JobTimeEntry, now: number = Date.now()): number {
  const start = new Date(entry.startTime).getTime()
  const end = entry.endTime ? new Date(entry.endTime).getTime() : now
  return Math.max(0, Math.floor((end - start) / 1000))
}

/**
 * Live seconds for one segment type, including the running segment when it is of
 * that type. Every displayed duration goes through this single function so the
 * big timer, the totals row, and the session list can never disagree — the
 * original bug showed "total elapsed 20s" next to a travel timer reading 59s
 * because the totals were frozen at fetch time while the timer ticked.
 */
export function liveSecondsOfType(
  summary: JobTimeSummary | null,
  type: TimeEntryType,
  now: number = Date.now(),
): number {
  if (!summary) return 0
  const base =
    type === 'work' ? summary.workSeconds : type === 'break' ? summary.breakSeconds : summary.travelSeconds
  const running =
    summary.openEntry && summary.openEntry.entryType === type ? segmentSeconds(summary.openEntry, now) : 0
  return base + running
}

/** Live total work seconds for a summary, including the running segment. */
export function liveWorkSeconds(summary: JobTimeSummary | null, now: number = Date.now()): number {
  return liveSecondsOfType(summary, 'work', now)
}

export function liveTravelSeconds(summary: JobTimeSummary | null, now: number = Date.now()): number {
  return liveSecondsOfType(summary, 'travel', now)
}

export function liveBreakSeconds(summary: JobTimeSummary | null, now: number = Date.now()): number {
  return liveSecondsOfType(summary, 'break', now)
}

/**
 * Wall-clock span from the first segment start to now (or to the last end when
 * nothing is running). Derived from the span rather than by adding the buckets,
 * so overlapping segments can never be double-counted.
 */
export function liveTotalElapsedSeconds(summary: JobTimeSummary | null, now: number = Date.now()): number {
  if (!summary || !summary.firstStart) return 0
  const start = new Date(summary.firstStart).getTime()
  const end = summary.isRunning ? now : summary.lastEnd ? new Date(summary.lastEnd).getTime() : start
  return Math.max(0, Math.floor((end - start) / 1000))
}

/** HH:MM:SS for the big timer readout. */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

/** Compact "2h 16m" / "15m" / "45s" for summaries. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Decimal hours, for payroll/profitability groundwork. */
export function toHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100
}

function buildSummary(entries: JobTimeEntry[], nameByKey: Record<string, string> = {}): JobTimeSummary {
  const now = Date.now()
  let workSeconds = 0
  let breakSeconds = 0
  let travelSeconds = 0
  let openEntry: JobTimeEntry | null = null
  let firstStart: string | null = null
  let lastEnd: string | null = null
  let workFirstStart: string | null = null

  const workerMap = new Map<string, JobWorkerTime>()

  for (const e of entries) {
    if (!e.endTime) {
      openEntry = e
    } else {
      const secs = e.durationSeconds ?? segmentSeconds(e, now)
      if (e.entryType === 'work') workSeconds += secs
      else if (e.entryType === 'break') breakSeconds += secs
      else if (e.entryType === 'travel') travelSeconds += secs
    }

    if (!firstStart || new Date(e.startTime) < new Date(firstStart)) firstStart = e.startTime
    if (e.endTime && (!lastEnd || new Date(e.endTime) > new Date(lastEnd))) lastEnd = e.endTime

    // Per-worker work totals (only work counts as labor).
    if (e.entryType === 'work') {
      if (!workFirstStart || new Date(e.startTime) < new Date(workFirstStart)) {
        workFirstStart = e.startTime
      }
      const key = e.memberId || e.userId || 'unknown'
      const existing = workerMap.get(key)
      const secs = e.endTime ? (e.durationSeconds ?? segmentSeconds(e, now)) : segmentSeconds(e, now)
      if (existing) {
        existing.workSeconds += secs
        existing.isRunning = existing.isRunning || !e.endTime
      } else {
        workerMap.set(key, {
          key,
          memberId: e.memberId,
          userId: e.userId,
          name: nameByKey[key] || 'Worker',
          workSeconds: secs,
          isRunning: !e.endTime,
        })
      }
    }
  }

  const isRunning = !!openEntry
  const spanEnd = openEntry ? now : lastEnd ? new Date(lastEnd).getTime() : null
  const totalElapsedSeconds =
    firstStart && spanEnd ? Math.max(0, Math.floor((spanEnd - new Date(firstStart).getTime()) / 1000)) : 0

  return {
    entries,
    workSeconds,
    breakSeconds,
    travelSeconds,
    firstStart,
    lastEnd,
    workFirstStart,
    hasWorkStarted: workFirstStart !== null,
    totalElapsedSeconds,
    openEntry,
    isRunning,
    // Paused = work has begun and nothing is running right now. Keyed off work
    // specifically so a finished travel leg alone is not reported as "paused".
    isPaused: !isRunning && workFirstStart !== null,
    byWorker: Array.from(workerMap.values()).sort((a, b) => b.workSeconds - a.workSeconds),
  }
}

// ============================================================================
// Reads
// ============================================================================

/** Full time summary for one job, including per-worker breakdown. */
export async function getJobTimeSummary(
  jobId: string,
): Promise<{ summary: JobTimeSummary | null; tableMissing: boolean }> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('job_id', jobId)
    .order('start_time', { ascending: true })

  if (error) {
    if (isMissingTable(error)) return { summary: null, tableMissing: true }
    console.error('[JobTimer] Failed to load job time entries:', error.message)
    return { summary: null, tableMissing: false }
  }

  const entries = (data || []).map(mapEntry)
  const nameByKey = await resolveWorkerNames(entries)
  return { summary: buildSummary(entries, nameByKey), tableMissing: false }
}

/** Resolves display names for member/user ids appearing in entries. */
async function resolveWorkerNames(entries: JobTimeEntry[]): Promise<Record<string, string>> {
  const supabase = getSupabase()
  const memberIds = Array.from(new Set(entries.map(e => e.memberId).filter(Boolean))) as string[]
  const out: Record<string, string> = {}

  if (memberIds.length > 0) {
    const { data } = await supabase.from('company_members').select('id, name, email').in('id', memberIds)
    for (const m of data || []) {
      out[m.id] = m.name || m.email || 'Worker'
    }
  }

  // Owner-logged entries have no member row; label the current user as "You".
  const user = await getCachedUser()
  if (user) {
    const selfName = (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'You'
    for (const e of entries) {
      const key = e.memberId || e.userId || 'unknown'
      if (!out[key] && e.userId === user.id) out[key] = selfName
    }
  }
  return out
}

/**
 * The current user's running timer, if any, with job context for the global
 * active-job bar. Returns null when nothing is running.
 */
export async function getMyActiveTimer(): Promise<{ active: ActiveTimer | null; tableMissing: boolean }> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { active: null, tableMissing: false }

  // Match either attribution path (owner: user_id, member: member_id).
  const orFilter = actor.memberId
    ? `user_id.eq.${actor.userId},member_id.eq.${actor.memberId}`
    : `user_id.eq.${actor.userId}`

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .is('end_time', null)
    .or(orFilter)
    .order('start_time', { ascending: false })
    .limit(1)

  if (error) {
    if (isMissingTable(error)) return { active: null, tableMissing: true }
    console.error('[JobTimer] Failed to load active timer:', error.message)
    return { active: null, tableMissing: false }
  }

  const row = (data || [])[0]
  if (!row) return { active: null, tableMissing: false }
  const entry = mapEntry(row)
  if (!entry.jobId) return { active: null, tableMissing: false }

  // Job + customer context for the bar label.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, job_type, customer_id')
    .eq('id', entry.jobId)
    .maybeSingle()

  let customerName = 'Job'
  if (job?.customer_id) {
    const { data: cust } = await supabase.from('customers').select('name').eq('id', job.customer_id).maybeSingle()
    if (cust?.name) customerName = cust.name
  }

  // Prior completed work on this job so the bar shows cumulative time.
  const { data: prior } = await supabase
    .from('time_entries')
    .select('duration_seconds, duration_minutes, entry_type, end_time')
    .eq('job_id', entry.jobId)
    .not('end_time', 'is', null)

  const priorWorkSeconds = (prior || [])
    .filter((p: any) => (p.entry_type || 'work') === 'work')
    .reduce(
      (sum: number, p: any) =>
        sum + (p.duration_seconds != null ? Number(p.duration_seconds) : Number(p.duration_minutes || 0) * 60),
      0,
    )

  return {
    active: {
      entry,
      jobId: entry.jobId,
      customerName,
      jobType: job?.job_type ?? null,
      priorWorkSeconds,
    },
    tableMissing: false,
  }
}

/**
 * Lightweight running/paused state for many jobs at once, so the Jobs list can
 * badge rows without an N+1 query per job.
 */
export async function getJobTimerStates(
  jobIds: string[],
): Promise<Record<string, { isRunning: boolean; workSeconds: number; runningSince: string | null; firstStart: string | null }>> {
  const out: Record<string, { isRunning: boolean; workSeconds: number; runningSince: string | null; firstStart: string | null }> = {}
  if (jobIds.length === 0) return out

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .select('job_id, entry_type, start_time, end_time, duration_seconds, duration_minutes')
    .in('job_id', jobIds)

  if (error) {
    if (!isMissingTable(error)) console.error('[JobTimer] Failed to load timer states:', error.message)
    return out
  }

  for (const r of data || []) {
    const jid = r.job_id
    if (!jid) continue
    if (!out[jid]) out[jid] = { isRunning: false, workSeconds: 0, runningSince: null, firstStart: null }
    const bucket = out[jid]

    if (!bucket.firstStart || new Date(r.start_time) < new Date(bucket.firstStart)) {
      bucket.firstStart = r.start_time
    }

    if (!r.end_time) {
      bucket.isRunning = true
      bucket.runningSince = r.start_time
    } else if ((r.entry_type || 'work') === 'work') {
      bucket.workSeconds +=
        r.duration_seconds != null ? Number(r.duration_seconds) : Number(r.duration_minutes || 0) * 60
    }
  }
  return out
}

/**
 * The current user's tracked work time today, split so callers can render a
 * live-ticking value without double counting:
 *   - closedSeconds: finished segments (fixed)
 *   - openStartedAt:  ISO start of the still-running segment, if any
 * Total now = closedSeconds + (now - openStartedAt).
 */
export async function getMyWorkTimeToday(): Promise<{ closedSeconds: number; openStartedAt: string | null }> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { closedSeconds: 0, openStartedAt: null }

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const orFilter = actor.memberId
    ? `user_id.eq.${actor.userId},member_id.eq.${actor.memberId}`
    : `user_id.eq.${actor.userId}`

  const { data, error } = await supabase
    .from('time_entries')
    .select('entry_type, start_time, end_time, duration_seconds, duration_minutes')
    .gte('start_time', start.toISOString())
    .or(orFilter)

  if (error) {
    if (!isMissingTable(error)) console.error('[JobTimer] Failed to load today hours:', error.message)
    return { closedSeconds: 0, openStartedAt: null }
  }

  let closedSeconds = 0
  let openStartedAt: string | null = null

  for (const r of (data || []) as any[]) {
    if ((r.entry_type || 'work') !== 'work') continue
    if (!r.end_time) {
      // Keep the earliest open segment (there should only ever be one).
      if (!openStartedAt || new Date(r.start_time) < new Date(openStartedAt)) openStartedAt = r.start_time
      continue
    }
    closedSeconds += r.duration_seconds != null ? Number(r.duration_seconds) : Number(r.duration_minutes || 0) * 60
  }

  return { closedSeconds, openStartedAt }
}

/** Total work seconds logged by the current user today, as a single number. */
export async function getMyWorkSecondsToday(): Promise<number> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return 0

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const orFilter = actor.memberId
    ? `user_id.eq.${actor.userId},member_id.eq.${actor.memberId}`
    : `user_id.eq.${actor.userId}`

  const { data, error } = await supabase
    .from('time_entries')
    .select('entry_type, start_time, end_time, duration_seconds, duration_minutes')
    .gte('start_time', start.toISOString())
    .or(orFilter)

  if (error) {
    if (!isMissingTable(error)) console.error('[JobTimer] Failed to load today hours:', error.message)
    return 0
  }

  const now = Date.now()
  return (data || [])
    .filter((r: any) => (r.entry_type || 'work') === 'work')
    .reduce((sum: number, r: any) => {
      if (!r.end_time) return sum + Math.max(0, Math.floor((now - new Date(r.start_time).getTime()) / 1000))
      return sum + (r.duration_seconds != null ? Number(r.duration_seconds) : Number(r.duration_minutes || 0) * 60)
    }, 0)
}

// ============================================================================
// Writes (idempotent — safe against double-taps)
// ============================================================================

export interface TimerActionResult {
  ok: boolean
  error: string | null
  /** Set when the action was blocked because another job is already running. */
  conflict?: ActiveTimer | null
}

/**
 * Atomically swaps an open travel/break segment for a work segment.
 *
 * Delegates to the `start_job_work_session` RPC (script 38) so the three coupled
 * writes — close travel, open work at the same instant, advance job status —
 * happen inside ONE database transaction. Doing this from the browser as three
 * separate calls is what allowed the torn state in the original bug: any one of
 * them could fail and leave travel running with no work segment.
 *
 * Falls back to a best-effort client-side sequence only if the RPC is missing,
 * so an un-migrated environment still works instead of hard-failing.
 */
async function transitionToWorkSegment(jobId: string): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('start_job_work_session', { p_job_id: jobId })

  if (!error) return { ok: true, error: null }

  // 42883 = function does not exist -> script 38 has not been run yet.
  const missingFn = error.code === '42883' || /start_job_work_session/i.test(error.message || '')
  if (!missingFn) {
    console.error('[JobTimer] Atomic start failed:', error.message)
    return { ok: false, error: error.message }
  }

  console.warn('[JobTimer] start_job_work_session missing; run scripts/38-job-timer-atomic-transition.sql')
  const closed = await pauseJobTimer(jobId)
  if (!closed.ok) return closed

  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated.' }

  const { error: insErr } = await supabase.from('time_entries').insert({
    company_id: actor.companyId,
    job_id: jobId,
    member_id: actor.memberId,
    user_id: actor.userId,
    entry_type: 'work',
    start_time: new Date().toISOString(),
    created_by: actor.userId,
  })
  if (insErr) {
    console.error('[JobTimer] Fallback start failed:', insErr.message)
    return { ok: false, error: insErr.message }
  }
  await setJobStatusIfEarlier(jobId, 'In progress')
  return { ok: true, error: null }
}

/**
 * Starts (or resumes) timing a job.
 *
 * Idempotent: if a segment for THIS job is already running, it succeeds without
 * creating a duplicate, so double-tapping Start is harmless. If a DIFFERENT job
 * is running, it refuses and returns the conflict so the UI can prompt — it
 * never silently starts a second timer. `force` lets the user knowingly run
 * concurrent jobs (the schema supports it).
 */
export async function startJobTimer(
  jobId: string,
  opts: { entryType?: TimeEntryType; force?: boolean; alsoSetStatus?: boolean } = {},
): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated.' }

  const entryType = opts.entryType || 'work'

  // Check for an existing running segment for this user.
  const { active, tableMissing } = await getMyActiveTimer()
  if (tableMissing) {
    return { ok: false, error: 'Time tracking table is missing. Run scripts/37-job-timer.sql.' }
  }

  if (active) {
    if (active.jobId === jobId) {
      // Same job, same segment type -> genuine no-op (double-tap safe).
      if (active.entry.entryType === entryType) return { ok: true, error: null }

      // Same job, DIFFERENT type -> this is a real transition, e.g. the user is
      // on the way and just pressed "Start Job". Previously this returned early
      // and reported success while leaving travel open and never creating the
      // work segment, so the UI stayed orange and work time never accrued.
      // Hand the whole thing to the atomic RPC (script 38) so closing travel,
      // opening work at the same instant, and moving the status either all
      // commit together or not at all.
      if (entryType === 'work') {
        return transitionToWorkSegment(jobId)
      }

      // Any other type change (e.g. work -> travel): close the open segment
      // first so the one-open-per-user index cannot reject the insert.
      const closed = await pauseJobTimer(jobId)
      if (!closed.ok) return closed
    } else if (!opts.force) {
      return { ok: false, error: 'ALREADY_ACTIVE', conflict: active }
    }
  }

  const { error } = await supabase.from('time_entries').insert({
    company_id: actor.companyId,
    job_id: jobId,
    member_id: actor.memberId,
    user_id: actor.userId,
    entry_type: entryType,
    start_time: new Date().toISOString(),
    created_by: actor.userId,
  })

  if (error) {
    // Unique violation = the double-tap guard fired; another open segment won
    // the race. That is the intended outcome, not a user-facing failure.
    if (error.code === '23505') return { ok: true, error: null }
    console.error('[JobTimer] Failed to start timer:', error.message)
    return { ok: false, error: error.message }
  }

  if (opts.alsoSetStatus !== false && entryType === 'work') {
    await setJobStatusIfEarlier(jobId, 'In progress')
  }
  return { ok: true, error: null }
}

/**
 * Pauses the running segment for a job by closing it. Idempotent: if nothing is
 * running, it reports success. Job status intentionally stays "In progress" —
 * paused is derived from "no open segment", so status and timer can never drift.
 */
export async function pauseJobTimer(jobId: string): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated.' }

  const { data, error: findErr } = await supabase
    .from('time_entries')
    .select('id')
    .eq('job_id', jobId)
    .is('end_time', null)
    .or(actor.memberId ? `user_id.eq.${actor.userId},member_id.eq.${actor.memberId}` : `user_id.eq.${actor.userId}`)
    .order('start_time', { ascending: false })
    .limit(1)

  if (findErr) {
    if (isMissingTable(findErr)) return { ok: false, error: 'Time tracking table is missing.' }
    return { ok: false, error: findErr.message }
  }

  const open = (data || [])[0]
  if (!open) return { ok: true, error: null } // already paused

  // Guarded on end_time IS NULL so a concurrent pause can't double-close.
  const { error } = await supabase
    .from('time_entries')
    .update({ end_time: new Date().toISOString() })
    .eq('id', open.id)
    .is('end_time', null)

  if (error) {
    console.error('[JobTimer] Failed to pause timer:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

/** Resume = open a new work segment. */
export async function resumeJobTimer(jobId: string, opts: { force?: boolean } = {}): Promise<TimerActionResult> {
  return startJobTimer(jobId, { entryType: 'work', force: opts.force })
}

/**
 * Finishes the job: closes any open segment and marks the job Completed.
 * Deliberately does NOT touch invoices or payments — a finished job is never
 * auto-marked paid; the existing completion/invoice/payment flow handles that.
 */
export async function completeJobTimer(jobId: string): Promise<TimerActionResult> {
  const paused = await pauseJobTimer(jobId)
  if (!paused.ok) return paused

  const supabase = getSupabase()
  const { error } = await supabase.from('jobs').update({ status: 'Completed' }).eq('id', jobId)
  if (error) {
    console.error('[JobTimer] Failed to set job Completed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

/** Marks travel to a job ("On the way"). Travel never counts as work time. */
export async function startTravelToJob(jobId: string, opts: { force?: boolean } = {}): Promise<TimerActionResult> {
  const res = await startJobTimer(jobId, { entryType: 'travel', force: opts.force, alsoSetStatus: false })
  if (res.ok) await setJobStatusIfEarlier(jobId, 'On the way')
  return res
}

/**
 * Advances job status without ever moving it backwards past a billing state.
 * Protects existing accounting: a job that is already Invoiced/Paid/Closed is
 * never demoted by a timer action.
 */
async function setJobStatusIfEarlier(jobId: string, target: 'On the way' | 'In progress'): Promise<void> {
  const supabase = getSupabase()
  const { data: job } = await supabase.from('jobs').select('status').eq('id', jobId).maybeSingle()
  if (!job) return

  const protectedStatuses = ['Completed', 'Invoiced', 'Paid', 'Closed']
  if (protectedStatuses.includes(job.status)) return
  if (job.status === target) return
  // Don't regress In progress back to On the way.
  if (target === 'On the way' && job.status === 'In progress') return

  const { error } = await supabase.from('jobs').update({ status: target }).eq('id', jobId)
  if (error) console.error('[JobTimer] Failed to update job status:', error.message)
}

// ============================================================================
// Manual corrections (audit-friendly)
// ============================================================================

/** Adds a completed entry by hand, e.g. an employee forgot to start the timer. */
export async function addManualTimeEntry(input: {
  jobId: string
  startTime: string // ISO
  endTime: string // ISO
  entryType: TimeEntryType
  memberId?: string | null
  notes?: string | null
}): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated.' }

  if (new Date(input.endTime) < new Date(input.startTime)) {
    return { ok: false, error: 'End time must be after start time.' }
  }

  // Attribute to the chosen member when provided, else to the acting user.
  const memberId = input.memberId ?? actor.memberId
  let userId: string | null = actor.userId
  if (input.memberId) {
    const { data: m } = await supabase.from('company_members').select('user_id').eq('id', input.memberId).maybeSingle()
    userId = m?.user_id ?? null
  }
  // Satisfy the actor-present constraint even if the member has no linked user.
  if (!memberId && !userId) userId = actor.userId

  const { error } = await supabase.from('time_entries').insert({
    company_id: actor.companyId,
    job_id: input.jobId,
    member_id: memberId,
    user_id: userId,
    entry_type: input.entryType,
    start_time: input.startTime,
    end_time: input.endTime,
    notes: input.notes || null,
    is_manual: true,
    created_by: actor.userId,
  })

  if (error) {
    console.error('[JobTimer] Failed to add manual entry:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

/**
 * Corrects an existing entry. Records who edited it and when, and appends to
 * (never replaces) the note history so past data isn't silently overwritten.
 */
export async function updateTimeEntry(
  entryId: string,
  patch: { startTime?: string; endTime?: string | null; entryType?: TimeEntryType; notes?: string | null },
): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const actor = await getActor()
  if (!actor) return { ok: false, error: 'Not authenticated.' }

  const { data: existing } = await supabase
    .from('time_entries')
    .select('start_time, end_time, notes')
    .eq('id', entryId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Time entry not found.' }

  const nextStart = patch.startTime ?? existing.start_time
  const nextEnd = patch.endTime !== undefined ? patch.endTime : existing.end_time
  if (nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    return { ok: false, error: 'End time must be after start time.' }
  }

  // Preserve the original window in the note trail for auditability.
  const stamp = new Date().toISOString().split('T')[0]
  const trail = `[edited ${stamp}] was ${new Date(existing.start_time).toLocaleTimeString()}–${existing.end_time ? new Date(existing.end_time).toLocaleTimeString() : 'open'}`
  const nextNotes = patch.notes !== undefined ? patch.notes : existing.notes
  const mergedNotes = [nextNotes, trail].filter(Boolean).join(' | ')

  const update: Record<string, any> = {
    start_time: nextStart,
    end_time: nextEnd,
    notes: mergedNotes,
    is_manual: true,
    edited_by: actor.userId,
    edited_at: new Date().toISOString(),
  }
  if (patch.entryType) update.entry_type = patch.entryType

  const { error } = await supabase.from('time_entries').update(update).eq('id', entryId)
  if (error) {
    console.error('[JobTimer] Failed to update entry:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

export async function deleteTimeEntry(entryId: string): Promise<TimerActionResult> {
  const supabase = getSupabase()
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId)
  if (error) {
    console.error('[JobTimer] Failed to delete entry:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}
