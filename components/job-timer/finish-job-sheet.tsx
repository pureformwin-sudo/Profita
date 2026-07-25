'use client'

// =============================================================================
// Finish Job confirmation sheet.
// Finishing is never a silent one-tap close - the worker confirms the numbers
// that will be recorded as labor. Completing does NOT mark anything paid.
// =============================================================================

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Job } from '@/lib/types'
import { formatDuration, type JobTimeSummary } from '@/lib/job-timer-storage'

interface FinishJobSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
  summary: JobTimeSummary | null
  /** Live work seconds including any still-running segment. */
  liveWorkSeconds: number
  onConfirm: () => Promise<boolean>
  busy?: boolean
}

function formatClock(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums', emphasis && 'text-lg font-bold')}>{value}</span>
    </div>
  )
}

export function FinishJobSheet({
  open,
  onOpenChange,
  job,
  summary,
  liveWorkSeconds,
  onConfirm,
  busy,
}: FinishJobSheetProps) {
  // Elapsed is wall-clock from first start to now; work excludes breaks.
  const totalElapsed = summary?.totalElapsedSeconds ?? 0
  const breakSeconds = summary?.breakSeconds ?? 0
  const travelSeconds = summary?.travelSeconds ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish Job</DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-border">
          <Row label="Started" value={formatClock(summary?.firstStart ?? null)} />
          <Row label="Finishing" value={formatClock(new Date().toISOString())} />
          <Row label="Total elapsed" value={formatDuration(totalElapsed)} />
          {breakSeconds > 0 && <Row label="Breaks" value={formatDuration(breakSeconds)} />}
          {travelSeconds > 0 && <Row label="Travel" value={formatDuration(travelSeconds)} />}
          <Row label="Actual work time" value={formatDuration(liveWorkSeconds)} emphasis />
          {job.price > 0 && <Row label="Job value" value={`$${job.price.toLocaleString()}`} />}
        </div>

        {/* Per-employee labor, so multi-worker jobs are auditable at finish time. */}
        {summary && summary.byWorker.length > 1 && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Labor by employee
            </p>
            <div className="space-y-1">
              {summary.byWorker.map((w) => (
                <div key={w.key} className="flex items-center justify-between text-sm">
                  <span>{w.name}</span>
                  <span className="tabular-nums font-medium">{formatDuration(w.workSeconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This records the job as completed and saves the final labor time. It does not mark the
          invoice paid.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="h-12 w-full font-semibold" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            Complete Job
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep working
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
