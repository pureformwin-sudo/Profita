'use client'

// =============================================================================
// Time Tracking summary for a job: totals, per-employee labor, session history,
// and manual corrections for authorized users.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Clock, Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  addManualTimeEntry,
  deleteTimeEntry,
  formatDuration,
  getJobTimeSummary,
  liveWorkSeconds,
  segmentSeconds,
  toHours,
  updateTimeEntry,
  type JobTimeEntry,
  type JobTimeSummary,
  type TimeEntryType,
} from '@/lib/job-timer-storage'
import { useNow } from '@/lib/job-timer-context'
import { usePermissions } from '@/lib/permissions-context'

interface TimeTrackingSectionProps {
  jobId: string
  /**
   * Override who may add/correct entries. When omitted, permission is derived
   * from the signed-in user's role (owners and admins only), so the section is
   * safe to drop in anywhere without plumbing props through.
   */
  canEdit?: boolean
  /** Members selectable when attributing a manual entry. */
  members?: { id: string; name: string }[]
  refreshKey?: number
  /** Called after a manual add/edit/delete changes recorded time. */
  onRefresh?: () => void
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatClock(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const typeLabels: Record<TimeEntryType, string> = { work: 'Work', break: 'Break', travel: 'Travel' }

export function TimeTrackingSection({
  jobId,
  canEdit: canEditProp,
  members = [],
  refreshKey,
  onRefresh,
}: TimeTrackingSectionProps) {
  // Only owners/admins may correct time. Crew see a read-only history.
  const { isAdmin } = usePermissions()
  const canEdit = canEditProp ?? isAdmin

  const [summary, setSummary] = useState<JobTimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<JobTimeEntry | null>(null)
  const [saving, setSaving] = useState(false)

  // Manual entry form
  const [startVal, setStartVal] = useState('')
  const [endVal, setEndVal] = useState('')
  const [typeVal, setTypeVal] = useState<TimeEntryType>('work')
  const [memberVal, setMemberVal] = useState('none')
  const [notesVal, setNotesVal] = useState('')

  const load = useCallback(async () => {
    const { summary: s, tableMissing: missing } = await getJobTimeSummary(jobId)
    setSummary(s)
    setTableMissing(missing)
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const isRunning = !!summary?.isRunning
  const now = useNow(isRunning)
  const workSeconds = liveWorkSeconds(summary, now)

  const openDialog = (entry: JobTimeEntry | null) => {
    setEditing(entry)
    if (entry) {
      setStartVal(toLocalInput(entry.startTime))
      setEndVal(entry.endTime ? toLocalInput(entry.endTime) : '')
      setTypeVal(entry.entryType)
      setNotesVal('')
      setMemberVal(entry.memberId || 'none')
    } else {
      const now = new Date()
      const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      setStartVal(toLocalInput(anHourAgo.toISOString()))
      setEndVal(toLocalInput(now.toISOString()))
      setTypeVal('work')
      setNotesVal('')
      setMemberVal('none')
    }
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!startVal || !endVal) {
      toast.error('Enter both a start and end time')
      return
    }
    const startISO = new Date(startVal).toISOString()
    const endISO = new Date(endVal).toISOString()
    if (new Date(endISO) <= new Date(startISO)) {
      toast.error('End time must be after start time')
      return
    }

    setSaving(true)
    try {
      const res = editing
        ? await updateTimeEntry(editing.id, {
            startTime: startISO,
            endTime: endISO,
            entryType: typeVal,
            notes: notesVal || undefined,
          })
        : await addManualTimeEntry({
            jobId,
            startTime: startISO,
            endTime: endISO,
            entryType: typeVal,
            // SelectItem values must be non-empty, so 'none' maps back to null.
            memberId: memberVal === 'none' ? null : memberVal,
            notes: notesVal || null,
          })

      if (!res.ok) {
        toast.error(res.error || 'Failed to save time entry')
        return
      }
      toast.success(editing ? 'Time entry updated' : 'Time entry added')
      setShowDialog(false)
      setEditing(null)
      await load()
      onRefresh?.()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entry: JobTimeEntry) => {
    const res = await deleteTimeEntry(entry.id)
    if (!res.ok) {
      toast.error(res.error || 'Failed to delete entry')
      return
    }
    toast.success('Time entry removed')
    await load()
    onRefresh?.()
  }

  if (tableMissing) {
    return (
      <div className="px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Time tracking is not set up. Run <code className="font-mono">scripts/37-job-timer.sql</code>.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasEntries = (summary?.entries.length ?? 0) > 0

  return (
    <div className="space-y-4 px-4 py-3">
      {!hasEntries && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">No time tracked for this job yet.</p>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => openDialog(null)}>
              <Plus className="mr-1 h-4 w-4" /> Add Time Entry
            </Button>
          )}
        </div>
      )}

      {hasEntries && summary && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Work time</p>
              <p className="text-base font-bold tabular-nums">{formatDuration(workSeconds)}</p>
            </div>
            <div className="border-x border-border px-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Breaks</p>
              <p className="text-base font-bold tabular-nums">{formatDuration(summary.breakSeconds)}</p>
            </div>
            <div className="pl-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total elapsed</p>
              <p className="text-base font-bold tabular-nums">{formatDuration(summary.totalElapsedSeconds)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Started <span className="font-medium text-foreground">{formatClock(summary.firstStart)}</span>
            </span>
            {!isRunning && summary.lastEnd && (
              <span className="text-muted-foreground">
                Ended <span className="font-medium text-foreground">{formatClock(summary.lastEnd)}</span>
              </span>
            )}
            {summary.travelSeconds > 0 && (
              <span className="text-muted-foreground">
                Travel <span className="font-medium text-foreground">{formatDuration(summary.travelSeconds)}</span>
              </span>
            )}
            <span className="text-muted-foreground">
              Labor <span className="font-medium text-foreground">{toHours(workSeconds)} hrs</span>
            </span>
          </div>

          {/* Per-employee labor */}
          {summary.byWorker.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Labor by employee
                </p>
              </div>
              <div className="space-y-1.5">
                {summary.byWorker.map((w) => (
                  <div key={w.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {w.name}
                      {w.isRunning && (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">{formatDuration(w.workSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session history */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</p>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openDialog(null)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {summary.entries.map((e) => {
                const secs = e.endTime ? (e.durationSeconds ?? 0) : segmentSeconds(e, now)
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-sm"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums">
                      {formatClock(e.startTime)} – {e.endTime ? formatClock(e.endTime) : 'running'}
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {typeLabels[e.entryType]}
                    </Badge>
                    {e.isManual && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        Manual
                      </Badge>
                    )}
                    <span className="ml-auto shrink-0 font-medium tabular-nums">{formatDuration(secs)}</span>
                    {canEdit && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Edit entry</span>
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(e)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          <span className="sr-only">Delete entry</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Manual add / edit */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Time Entry' : 'Add Time Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="te-start">Start</Label>
                <Input
                  id="te-start"
                  type="datetime-local"
                  value={startVal}
                  onChange={(e) => setStartVal(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="te-end">End</Label>
                <Input id="te-end" type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="te-type">Type</Label>
              <Select value={typeVal} onValueChange={(v) => setTypeVal(v as TimeEntryType)}>
                <SelectTrigger id="te-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!editing && members.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="te-member">Employee</Label>
                <Select value={memberVal} onValueChange={setMemberVal}>
                  <SelectTrigger id="te-member">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Me</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="te-notes">Notes</Label>
              <Textarea
                id="te-notes"
                placeholder="Why was this added or corrected?"
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                rows={2}
              />
            </div>

            {editing && (
              <p className="text-xs text-muted-foreground">
                The original times are kept in this entry&apos;s notes for auditing.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Add entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
