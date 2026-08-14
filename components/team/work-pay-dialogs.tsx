'use client'

// =============================================================================
// Work & Pay dialogs: Add Work, Record Payment
// =============================================================================
// The pay preview here runs the SAME functions (computeEarning) that the SQL
// write path mirrors, so what the user is shown before saving is what gets
// stored. Both were verified against each other in the migration dry runs.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Plus, X, TriangleAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  computeEarning,
  compTypeUsesRate,
  compTypeUsesJobs,
  formatMoney,
  formatHours,
  COMP_TYPE_LABELS,
  PAYMENT_METHODS,
  type CompType,
  type PerJobLine,
  type PerJobAmountKind,
  type PaymentMethod,
} from '@/lib/work-pay-math'
import {
  addWorkEntry,
  recordPayment,
  type JobOption,
  type EmployeeBalance,
} from '@/lib/work-pay-storage'

const COMP_TYPES: CompType[] = ['hourly', 'full_day', 'per_job', 'hourly_plus_bonus', 'flat']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Combine a yyyy-mm-dd and a HH:mm into an ISO timestamp, or null. */
function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

// -----------------------------------------------------------------------------
// Add Work
// -----------------------------------------------------------------------------

interface AddWorkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: { id: string; name: string }[]
  jobs: JobOption[]
  onSaved: () => void
}

interface JobRow {
  jobId: string
  amountKind: PerJobAmountKind
  amount: string
}

export function AddWorkDialog({
  open,
  onOpenChange,
  employees,
  jobs,
  onSaved,
}: AddWorkDialogProps) {
  const [saving, setSaving] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(todayISO())
  const [compType, setCompType] = useState<CompType>('hourly')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [useOverride, setUseOverride] = useState(false)
  const [hoursOverride, setHoursOverride] = useState('')
  const [rate, setRate] = useState('')
  const [flatAmount, setFlatAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [jobRows, setJobRows] = useState<JobRow[]>([])

  // Reset when reopened so a previous entry can't leak into the next one.
  useEffect(() => {
    if (!open) return
    setEmployeeId(employees[0]?.id ?? '')
    setWorkDate(todayISO())
    setCompType('hourly')
    setStartTime('')
    setEndTime('')
    setBreakMinutes('0')
    setUseOverride(false)
    setHoursOverride('')
    setRate('')
    setFlatAmount('')
    setNotes('')
    setJobRows([])
  }, [open, employees])

  const perJobLines: PerJobLine[] = useMemo(
    () =>
      jobRows
        .filter((r) => r.jobId)
        .map((r) => ({
          jobId: r.jobId,
          amountKind: r.amountKind,
          amount: r.amountKind === 'standard' ? null : Number(r.amount) || 0,
        })),
    [jobRows],
  )

  const preview = useMemo(
    () =>
      computeEarning({
        compType,
        rate: rate === '' ? null : Number(rate),
        flatAmount: flatAmount === '' ? null : Number(flatAmount),
        hours: {
          startTime: combineDateTime(workDate, startTime),
          endTime: combineDateTime(workDate, endTime),
          breakMinutes: Number(breakMinutes) || 0,
          hoursOverride: useOverride && hoursOverride !== '' ? Number(hoursOverride) : null,
        },
        jobs: perJobLines,
      }),
    [
      compType,
      rate,
      flatAmount,
      workDate,
      startTime,
      endTime,
      breakMinutes,
      useOverride,
      hoursOverride,
      perJobLines,
    ],
  )

  const showsRate = compTypeUsesRate(compType)
  const showsJobs = compTypeUsesJobs(compType)

  function addJobRow() {
    setJobRows((rows) => [
      ...rows,
      { jobId: '', amountKind: compType === 'hourly_plus_bonus' ? 'bonus' : 'standard', amount: '' },
    ])
  }

  function updateJobRow(index: number, patch: Partial<JobRow>) {
    setJobRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeJobRow(index: number) {
    setJobRows((rows) => rows.filter((_, i) => i !== index))
  }

  async function save() {
    if (!employeeId) {
      toast.error('Choose an employee')
      return
    }
    if (!workDate) {
      toast.error('Choose a date')
      return
    }
    if (showsRate && (rate === '' || !Number.isFinite(Number(rate)))) {
      toast.error(`Enter a rate for ${COMP_TYPE_LABELS[compType].toLowerCase()} pay`)
      return
    }
    if (compType === 'flat' && (flatAmount === '' || !Number.isFinite(Number(flatAmount)))) {
      toast.error('Enter the flat amount')
      return
    }
    if (compType === 'per_job' && perJobLines.length === 0) {
      toast.error('Per-job pay needs at least one job')
      return
    }
    if (jobRows.some((r) => !r.jobId)) {
      toast.error('Every job row needs a job selected')
      return
    }
    if (preview.amount <= 0) {
      toast.error('This entry would earn $0.00 - check the hours, rate, or amount')
      return
    }

    setSaving(true)
    try {
      await addWorkEntry({
        employeeId,
        workDate,
        compType,
        startTime: combineDateTime(workDate, startTime),
        endTime: combineDateTime(workDate, endTime),
        breakMinutes: Number(breakMinutes) || 0,
        hoursOverride: useOverride && hoursOverride !== '' ? Number(hoursOverride) : null,
        rate: showsRate && rate !== '' ? Number(rate) : null,
        flatAmount: compType === 'flat' && flatAmount !== '' ? Number(flatAmount) : null,
        notes: notes.trim() || null,
        entryMethod: 'manual',
        jobs: perJobLines,
      })
      toast.success(`Work entry saved - ${formatMoney(preview.amount)} earned`)
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save the work entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add work</DialogTitle>
          <DialogDescription>
            Record what someone worked and what it earned. The pay is calculated below before
            anything is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wp-employee">Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="wp-employee">
                  <SelectValue placeholder="Choose employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wp-date">Date</Label>
              <Input
                id="wp-date"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wp-comp">Compensation type</Label>
            <Select value={compType} onValueChange={(v) => setCompType(v as CompType)}>
              <SelectTrigger id="wp-comp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {COMP_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Times are always available: hours are recorded even when they don't
              drive pay, so day-rate work can still be analysed later. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="wp-start">Start time</Label>
              <Input
                id="wp-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={useOverride}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-end">End time</Label>
              <Input
                id="wp-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={useOverride}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-break">Break (minutes)</Label>
              <Input
                id="wp-break"
                type="number"
                min="0"
                inputMode="numeric"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                disabled={useOverride}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex items-center gap-2">
              <input
                id="wp-override-toggle"
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
              />
              <Label htmlFor="wp-override-toggle" className="cursor-pointer text-sm font-normal">
                I just know the total hours
              </Label>
            </div>
            {useOverride && (
              <div className="flex-1 space-y-2">
                <Label htmlFor="wp-override" className="sr-only">
                  Total hours
                </Label>
                <Input
                  id="wp-override"
                  type="number"
                  step="0.25"
                  min="0"
                  placeholder="e.g. 6.5"
                  value={hoursOverride}
                  onChange={(e) => setHoursOverride(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {showsRate && (
              <div className="space-y-2">
                <Label htmlFor="wp-rate">
                  {compType === 'full_day'
                    ? 'Day rate'
                    : compType === 'per_job'
                      ? 'Standard rate per job'
                      : 'Hourly rate'}
                </Label>
                <Input
                  id="wp-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
            )}

            {compType === 'flat' && (
              <div className="space-y-2">
                <Label htmlFor="wp-flat">Flat amount</Label>
                <Input
                  id="wp-flat"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={flatAmount}
                  onChange={(e) => setFlatAmount(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Jobs worked */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Jobs worked
                {compType === 'per_job' && <span className="text-muted-foreground"> (drives pay)</span>}
                {compType === 'hourly_plus_bonus' && (
                  <span className="text-muted-foreground"> (bonus only)</span>
                )}
                {!showsJobs && <span className="text-muted-foreground"> (for reporting)</span>}
              </Label>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={addJobRow}>
                <Plus className="h-3.5 w-3.5" />
                Add job
              </Button>
            </div>

            {jobRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No jobs linked.</p>
            )}

            <div className="space-y-2">
              {jobRows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-2 sm:flex-row sm:items-center"
                >
                  <Select value={row.jobId} onValueChange={(v) => updateJobRow(i, { jobId: v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose job" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.label}
                          {j.scheduledDate ? ` - ${j.scheduledDate.slice(0, 10)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={row.amountKind}
                    onValueChange={(v) => updateJobRow(i, { amountKind: v as PerJobAmountKind })}
                  >
                    <SelectTrigger className="sm:w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="bonus">Bonus</SelectItem>
                    </SelectContent>
                  </Select>

                  {row.amountKind !== 'standard' && (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="sm:w-28"
                      value={row.amount}
                      onChange={(e) => updateJobRow(i, { amount: e.target.value })}
                    />
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeJobRow(i)}
                    aria-label="Remove job"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wp-notes">Notes</Label>
            <Textarea
              id="wp-notes"
              rows={2}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Live preview - same math as the database */}
          <Card className="space-y-2 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                This entry earns
              </p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-500">
                {formatMoney(preview.amount)}
              </p>
            </div>

            {preview.hours > 0 && (
              <p className="text-sm text-muted-foreground">
                {formatHours(preview.hours)} paid
                {preview.breakHours > 0 && ` (${formatHours(preview.grossHours)} less ${Math.round(preview.breakHours * 60)}m break)`}
              </p>
            )}

            {preview.lines.length > 0 && (
              <ul className="space-y-1 border-t border-border/60 pt-2">
                {preview.lines.map((l, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="tabular-nums">{formatMoney(l.amount)}</span>
                  </li>
                ))}
              </ul>
            )}

            {preview.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-sm text-amber-500">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save work entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// Record Payment
// -----------------------------------------------------------------------------

interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  balances: EmployeeBalance[]
  employees: { id: string; name: string }[]
  presetEmployeeId?: string | null
  onSaved: () => void
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  balances,
  employees,
  presetEmployeeId,
  onSaved,
}: RecordPaymentDialogProps) {
  const [saving, setSaving] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [note, setNote] = useState('')
  const [usePeriod, setUsePeriod] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  // Generated once per dialog opening so a double-click cannot double-pay.
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    const initial = presetEmployeeId ?? employees[0]?.id ?? ''
    setEmployeeId(initial)
    setAmount('')
    setPaidOn(todayISO())
    setMethod('Cash')
    setNote('')
    setUsePeriod(false)
    setPeriodStart('')
    setPeriodEnd('')
    setIdempotencyKey(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `k-${Date.now()}-${Math.random()}`,
    )
  }, [open, presetEmployeeId, employees])

  const balance = balances.find((b) => b.employeeId === employeeId)
  const owed = balance?.outstanding ?? 0
  const entered = Number(amount) || 0
  const leftover = Math.round((entered - owed) * 100) / 100

  async function save() {
    if (!employeeId) {
      toast.error('Choose an employee')
      return
    }
    if (!Number.isFinite(entered) || entered <= 0) {
      toast.error('Enter a payment amount greater than $0')
      return
    }
    if (usePeriod && periodStart && periodEnd && periodEnd < periodStart) {
      toast.error('Pay period end cannot be before the start')
      return
    }

    setSaving(true)
    try {
      await recordPayment({
        employeeId,
        amount: entered,
        paidOn,
        method,
        note: note.trim() || null,
        payPeriodStart: usePeriod && periodStart ? periodStart : null,
        payPeriodEnd: usePeriod && periodEnd ? periodEnd : null,
        idempotencyKey,
      })
      toast.success(`Payment of ${formatMoney(entered)} recorded`)
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not record the payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Applied to the oldest unpaid work first. Partial payments are fine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-employee">Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="pay-employee">
                <SelectValue placeholder="Choose employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {balance && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Currently owed</span>
              <span
                className={`font-semibold tabular-nums ${owed > 0 ? 'text-amber-500' : 'text-emerald-500'}`}
              >
                {formatMoney(owed)}
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {owed > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setAmount(String(owed))}
                >
                  Pay full {formatMoney(owed)}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-date">Date paid</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <input
                id="pay-period-toggle"
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={usePeriod}
                onChange={(e) => setUsePeriod(e.target.checked)}
              />
              <Label htmlFor="pay-period-toggle" className="cursor-pointer text-sm font-normal">
                Tag a pay period
              </Label>
            </div>
            {usePeriod && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-period-start" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="pay-period-start"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-period-end" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="pay-period-end"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-note">Note</Label>
            <Textarea
              id="pay-note"
              rows={2}
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {entered > 0 && (
            <Card className="space-y-1 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paying</span>
                <span className="tabular-nums">{formatMoney(entered)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Applied to unpaid work</span>
                <span className="tabular-nums">{formatMoney(Math.min(entered, owed))}</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-1">
                <span className="text-muted-foreground">
                  {leftover > 0 ? 'Held as credit' : 'Still owed after this'}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    leftover > 0 ? 'text-sky-400' : owed - entered > 0 ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  {formatMoney(leftover > 0 ? leftover : owed - entered)}
                </span>
              </div>
              {leftover > 0 && (
                <p className="pt-1 text-xs text-muted-foreground leading-relaxed">
                  This is more than is currently owed. The extra is kept as credit and will
                  apply automatically to future work.
                </p>
              )}
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
