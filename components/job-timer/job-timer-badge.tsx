'use client'

// =============================================================================
// Live "running / paused" indicator for a job row in the Jobs list.
// Renders nothing unless THIS job is the signed-in user's active timer, so the
// list stays quiet and costs no extra queries (it reads shared context).
// =============================================================================

import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useJobTimer, useNow } from '@/lib/job-timer-context'
import { formatDuration, segmentSeconds } from '@/lib/job-timer-storage'

export function JobTimerBadge({ jobId, className }: { jobId: string; className?: string }) {
  const { active } = useJobTimer()
  const isThisJob = active?.jobId === jobId
  // Only tick while this row is actually the running job.
  const now = useNow(isThisJob)

  if (!isThisJob || !active) return null

  const elapsed = active.priorWorkSeconds + segmentSeconds(active.entry, now)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold tabular-nums',
        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        className,
      )}
    >
      <Timer className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Timer running, elapsed </span>
      {formatDuration(elapsed)}
    </span>
  )
}
