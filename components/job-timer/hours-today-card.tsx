'use client'

// =============================================================================
// Dashboard stat: the signed-in user's tracked work time today.
// The running segment is computed from its start timestamp on every tick, so the
// value counts up live and never double counts. Hides itself when nothing has
// been tracked, so the dashboard doesn't gain a dead "0h" tile.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration, getMyWorkTimeToday } from '@/lib/job-timer-storage'
import { useJobTimer, useNow } from '@/lib/job-timer-context'

export function HoursTodayCard({ className }: { className?: string }) {
  const { active } = useJobTimer()
  const [today, setToday] = useState<{ closedSeconds: number; openStartedAt: string | null } | null>(null)

  const load = useCallback(async () => {
    setToday(await getMyWorkTimeToday())
  }, [])

  // Re-read on mount and whenever the running segment changes identity
  // (start / pause / resume / finish all change this).
  useEffect(() => {
    load()
  }, [load, active?.entry.id])

  const isRunning = !!today?.openStartedAt
  const now = useNow(isRunning)

  if (!today) return null

  const liveSeconds = today.openStartedAt
    ? Math.max(0, Math.floor((now - new Date(today.openStartedAt).getTime()) / 1000))
    : 0
  const totalSeconds = today.closedSeconds + liveSeconds

  // Nothing tracked today and nothing running: don't render an empty stat.
  if (totalSeconds <= 0) return null

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 flex items-center gap-3', className)}>
      <div
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
          isRunning ? 'bg-emerald-500/15' : 'bg-muted',
        )}
      >
        <Timer
          className={cn('h-4 w-4', isRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Your hours today</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">
          {formatDuration(totalSeconds)}
          {isRunning && (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              running
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
