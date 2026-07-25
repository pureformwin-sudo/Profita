'use client'

// =============================================================================
// Persistent active-job indicator.
// Sits above the mobile bottom nav so a running timer is never forgotten, and
// tapping it returns to the job. Hidden on the Jobs page only when it would
// duplicate an already-visible running row is NOT done - it stays visible
// everywhere by design (spec 3).
// =============================================================================

import { useRouter } from 'next/navigation'
import { Timer, ChevronRight, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimer, segmentSeconds } from '@/lib/job-timer-storage'
import { useJobTimer, useNow } from '@/lib/job-timer-context'

export function ActiveJobBar() {
  const { active } = useJobTimer()
  const router = useRouter()
  // Only tick when there is something to show.
  const now = useNow(!!active)

  if (!active) return null

  // The label and the number both come from the SAME open segment, so the bar
  // flips from travel to work the instant the work segment exists. It can never
  // keep counting travel while the job is actually in progress.
  const isTravel = active.entry.entryType === 'travel'
  const isBreak = active.entry.entryType === 'break'
  // Travel/break show only their own segment; work shows cumulative job work.
  const elapsed =
    isTravel || isBreak
      ? segmentSeconds(active.entry, now)
      : active.priorWorkSeconds + segmentSeconds(active.entry, now)

  const accent = isTravel || isBreak ? 'amber' : 'emerald'
  const label = isTravel ? 'On the way' : isBreak ? 'On break' : 'In progress'

  const open = () => {
    router.push(`/jobs?job=${active.jobId}`)
  }

  return (
    <div
      className={cn(
        'fixed inset-x-0 z-40 px-3',
        // Clear the mobile bottom nav on small screens; bottom-anchored on desktop.
        'bottom-[4.75rem] lg:bottom-4 lg:left-auto lg:right-4 lg:inset-x-auto lg:px-0',
      )}
    >
      <button
        onClick={open}
        aria-label={`Open active job for ${active.customerName}`}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-lg backdrop-blur-xl transition-colors lg:w-80',
          accent === 'amber'
            ? 'border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25'
            : 'border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25',
        )}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              accent === 'amber' ? 'bg-amber-500' : 'bg-emerald-500',
            )}
          />
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              accent === 'amber' ? 'bg-amber-500' : 'bg-emerald-500',
            )}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
              accent === 'amber' ? 'text-amber-600' : 'text-emerald-600',
            )}
          >
            {isTravel ? <Truck className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
            {label}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{active.customerName}</p>
        </div>

        <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-foreground">
          {formatTimer(elapsed)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}
