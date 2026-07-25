'use client'

// =============================================================================
// Job Timer panel - the primary Start / Pause / Resume / Finish control.
// Mobile-first: huge readout, thumb-sized buttons, one tap per action.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Play, Pause, CheckCircle, Truck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Job } from '@/lib/types'
import {
  completeJobTimer,
  formatDuration,
  formatTimer,
  getJobTimeSummary,
  liveWorkSeconds,
  pauseJobTimer,
  resumeJobTimer,
  segmentSeconds,
  startJobTimer,
  startTravelToJob,
  type ActiveTimer,
  type JobTimeSummary,
} from '@/lib/job-timer-storage'
import { useJobTimer, useNow } from '@/lib/job-timer-context'
import { FinishJobSheet } from '@/components/job-timer/finish-job-sheet'

interface JobTimerPanelProps {
  job: Job
  /** Called after the job is completed so the parent can refresh / invoice. */
  onCompleted?: () => void | Promise<void>
  onRefresh?: () => void
  className?: string
}

function formatClock(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function JobTimerPanel({ job, onCompleted, onRefresh, className }: JobTimerPanelProps) {
  const { active, refresh: refreshActive } = useJobTimer()
  const [summary, setSummary] = useState<JobTimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ActiveTimer | null>(null)
  const [pendingAction, setPendingAction] = useState<'start' | 'travel' | null>(null)
  const [showFinish, setShowFinish] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const loadSummary = useCallback(async () => {
    const { summary: s, tableMissing: missing } = await getJobTimeSummary(job.id)
    setSummary(s)
    setTableMissing(missing)
    setLoading(false)
  }, [job.id])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  // Re-read on unlock/focus so a backgrounded phone shows the true elapsed time.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSummary()
    }
    window.addEventListener('focus', loadSummary)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', loadSummary)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadSummary])

  // ---------------------------------------------------------------------------
  // State is RECONCILED from the stored segments, never from job.status, so the
  // UI can't disagree with the database. Which segment is open decides
  // everything: travel -> On the way, work -> In progress, none + work logged ->
  // Paused. That is what guarantees the orange travel card disappears the moment
  // the work segment exists.
  // ---------------------------------------------------------------------------
  const isRunning = !!summary?.isRunning
  const openEntry = summary?.openEntry ?? null
  const isTravelling = isRunning && openEntry?.entryType === 'travel'
  const isWorking = isRunning && openEntry?.entryType === 'work'
  // Only tick while something is actually running.
  const now = useNow(isRunning)

  // Derived from timestamps on every tick - never accumulated locally.
  const workSeconds = liveWorkSeconds(summary, now)
  const travelLive = isTravelling && openEntry ? segmentSeconds(openEntry, now) : 0

  const hasStarted = (summary?.entries.length ?? 0) > 0
  const isPaused = !isRunning && !!summary?.hasWorkStarted
  const isFinished = ['Completed', 'Invoiced', 'Paid', 'Closed'].includes(job.status)

  const afterMutation = async () => {
    await Promise.all([loadSummary(), refreshActive()])
    onRefresh?.()
  }

  const runAction = async (
    key: string,
    fn: () => Promise<{ ok: boolean; error: string | null; conflict?: ActiveTimer | null }>,
    successMsg?: string,
  ) => {
    // Guard against double-taps at the UI layer too (DB guard is the backstop).
    if (busy) return
    setBusy(key)
    try {
      const res = await fn()
      if (!res.ok) {
        if (res.error === 'ALREADY_ACTIVE' && res.conflict) {
          setConflict(res.conflict)
          return
        }
        toast.error(res.error || 'Something went wrong')
        return
      }
      if (successMsg) toast.success(successMsg)
      await afterMutation()
    } finally {
      setBusy(null)
    }
  }

  const handleStart = () =>
    runAction('start', () => startJobTimer(job.id), `Job started at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)

  const handleTravel = () =>
    runAction('travel', () => startTravelToJob(job.id), 'Marked on the way')

  const handlePause = () => runAction('pause', () => pauseJobTimer(job.id), 'Timer paused')

  const handleResume = () => runAction('resume', () => resumeJobTimer(job.id), 'Timer resumed')

  /** Confirmed from the Finish sheet. */
  const handleComplete = async () => {
    setBusy('complete')
    try {
      const res = await completeJobTimer(job.id)
      if (!res.ok) {
        toast.error(res.error || 'Failed to complete job')
        return false
      }
      toast.success('Job completed')
      setShowFinish(false)
      await afterMutation()
      await onCompleted?.()
      return true
    } finally {
      setBusy(null)
    }
  }

  // Resolve a conflict by force-starting the intended action.
  const handleStartAnyway = async () => {
    const action = pendingAction ?? 'start'
    setConflict(null)
    setPendingAction(null)
    await runAction(
      'force',
      () => (action === 'travel' ? startTravelToJob(job.id, { force: true }) : startJobTimer(job.id, { force: true })),
      'Timer started',
    )
  }

  const handleFinishConflicting = async () => {
    if (!conflict) return
    setBusy('finish-other')
    try {
      const res = await completeJobTimer(conflict.jobId)
      if (!res.ok) {
        toast.error(res.error || 'Failed to finish the other job')
        return
      }
      toast.success(`Finished ${conflict.customerName}`)
      setConflict(null)
      await refreshActive()
      // Now the intended action can proceed.
      await runAction(
        'start-after',
        () => (pendingAction === 'travel' ? startTravelToJob(job.id) : startJobTimer(job.id)),
        'Job started',
      )
      setPendingAction(null)
    } finally {
      setBusy(null)
    }
  }

  if (tableMissing) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-sm font-medium text-amber-600">Time tracking not set up</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Run <code className="font-mono">scripts/37-job-timer.sql</code> to enable the job timer.
        </p>
      </div>
    )
  }

  // Completed/paid jobs keep their normal actions; the timer is read-only here.
  if (isFinished) return null

  if (loading) {
    return (
      <div className={cn('flex h-14 items-center justify-center rounded-lg bg-muted/50', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className={cn('space-y-3', className)}>
        {/* ---------- Not started: Start Job (+ optional On the way) ----------
             Also covers "drove there, then stopped travel without starting work",
             which would otherwise render no card at all. */}
        {!isRunning && !summary?.hasWorkStarted && (
          <div className="flex flex-col gap-2">
            <Button onClick={handleStart} size="lg" className="h-14 w-full text-base font-semibold" disabled={!!busy}>
              {busy === 'start' ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Play className="mr-2 h-5 w-5" />
              )}
              {busy === 'start' ? 'Starting Job...' : 'Start Job'}
            </Button>
            {job.status === 'Scheduled' && (
              <Button onClick={handleTravel} variant="outline" className="h-11 w-full" disabled={!!busy}>
                {busy === 'travel' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="mr-2 h-4 w-4" />
                )}
                {busy === 'travel' ? 'Marking...' : 'On the way'}
              </Button>
            )}
            {hasStarted && summary && summary.travelSeconds > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatDuration(summary.travelSeconds)} travel already logged.
              </p>
            )}
          </div>
        )}

        {/* ---------- Travelling ---------- */}
        {isTravelling && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">On the way</span>
            </div>
            <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-foreground">
              {formatTimer(travelLive)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Travel time is tracked separately and not counted as work time.
            </p>
            <Button onClick={handleStart} size="lg" className="mt-3 h-12 w-full font-semibold" disabled={!!busy}>
              {busy === 'start' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              {busy === 'start' ? 'Starting Job...' : 'Start Job'}
            </Button>
          </div>
        )}

        {/* ---------- Running work ---------- */}
        {isWorking && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">In progress</span>
            </div>
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums leading-none text-foreground">
              {formatTimer(workSeconds)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Started at {formatClock(summary?.workFirstStart ?? null)}
              {summary && summary.travelSeconds > 0 && ` · ${formatDuration(summary.travelSeconds)} travel`}
              {summary && summary.breakSeconds > 0 && ` · ${formatDuration(summary.breakSeconds)} break`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={handlePause} variant="outline" size="lg" className="h-12 flex-1" disabled={!!busy}>
                {busy === 'pause' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                {busy === 'pause' ? 'Pausing...' : 'Pause'}
              </Button>
              <Button onClick={() => setShowFinish(true)} size="lg" className="h-12 flex-1 font-semibold" disabled={!!busy}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Finish Job
              </Button>
            </div>
          </div>
        )}

        {/* ---------- Paused ---------- */}
        {isPaused && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2">
              <Pause className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">Job paused</span>
            </div>
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums leading-none text-foreground">
              {formatTimer(workSeconds)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Worked {formatDuration(workSeconds)} · paused at {formatClock(summary?.lastEnd ?? null)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={handleResume} size="lg" className="h-12 flex-1 font-semibold" disabled={!!busy}>
                {busy === 'resume' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {busy === 'resume' ? 'Resuming...' : 'Resume Job'}
              </Button>
              <Button onClick={() => setShowFinish(true)} variant="outline" size="lg" className="h-12 flex-1" disabled={!!busy}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Finish
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Finish Job confirmation ---------- */}
      <FinishJobSheet
        open={showFinish}
        onOpenChange={setShowFinish}
        job={job}
        summary={summary}
        liveWorkSeconds={workSeconds}
        onConfirm={handleComplete}
        busy={busy === 'complete'}
      />

      {/* ---------- Already-active warning (never silently double-start) ---------- */}
      <Dialog
        open={!!conflict}
        onOpenChange={(o) => {
          if (!o) {
            setConflict(null)
            setPendingAction(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>You already have an active job</DialogTitle>
            <DialogDescription>
              Finish or pause it first, or intentionally run both at once.
            </DialogDescription>
          </DialogHeader>
          {conflict && (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="font-medium">{conflict.customerName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Running for{' '}
                {formatDuration(conflict.priorWorkSeconds + segmentSeconds(conflict.entry))}
              </p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              disabled={!!busy}
              onClick={handleFinishConflicting}
            >
              {busy === 'finish-other' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Finish current job, then start this one
            </Button>
            <Button variant="ghost" className="w-full" disabled={!!busy} onClick={handleStartAnyway}>
              Start another anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
