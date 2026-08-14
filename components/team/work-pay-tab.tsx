'use client'

// =============================================================================
// Team > Work & Pay
// =============================================================================
// The owner-facing view of the ledger:
//
//   outstanding = earned - paid
//
// Nothing here stores a "paid" flag. Every figure is derived from
// employee_earnings and payment_allocations, so a partial payment shows as
// partial rather than rounding to paid or unpaid.
//
// Kept separate from the Payroll tab on purpose: Payroll reports
// job_workers.amount_earned (the legacy per-job figures), this reports the
// ledger. Migration 43 carried the legacy total in as an opening balance so the
// two do not double-count.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Banknote,
  TriangleAlert,
  RefreshCw,
  Trash2,
  Clock,
  Briefcase,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { AddWorkDialog, RecordPaymentDialog } from '@/components/team/work-pay-dialogs'
import {
  getEmployeeBalances,
  getWorkEntries,
  getWorkPaySummary,
  getPayments,
  getActiveEmployees,
  getJobOptions,
  deleteWorkEntry,
  deletePayment,
  isMissingTable,
  type EmployeeBalance,
  type WorkEntry,
  type PaymentRecord,
  type WorkPaySummary,
  type JobOption,
  type WorkEntryFilters,
} from '@/lib/work-pay-storage'
import {
  formatMoney,
  formatHours,
  COMP_TYPE_LABELS,
  type CompType,
} from '@/lib/work-pay-math'

const COMP_TYPES: CompType[] = ['hourly', 'full_day', 'per_job', 'hourly_plus_bonus', 'flat']

type View = 'entries' | 'payments'

function statusOf(entry: WorkEntry): 'paid' | 'partial' | 'unpaid' {
  if (entry.outstanding <= 0) return 'paid'
  return entry.amountPaid > 0 ? 'partial' : 'unpaid'
}

function StatusBadge({ status }: { status: 'paid' | 'partial' | 'unpaid' }) {
  if (status === 'paid') {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
        Paid
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge variant="outline" className="border-sky-400/40 text-sky-400">
        Partial
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
      Unpaid
    </Badge>
  )
}

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function WorkPayTab() {
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)

  const [summary, setSummary] = useState<WorkPaySummary | null>(null)
  const [balances, setBalances] = useState<EmployeeBalance[]>([])
  const [entries, setEntries] = useState<WorkEntry[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [jobs, setJobs] = useState<JobOption[]>([])

  const [view, setView] = useState<View>('entries')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [addOpen, setAddOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payPreset, setPayPreset] = useState<string | null>(null)

  const [deleteEntry, setDeleteEntry] = useState<WorkEntry | null>(null)
  const [deletePay, setDeletePay] = useState<PaymentRecord | null>(null)

  // Filters
  const [fEmployee, setFEmployee] = useState('all')
  const [fStatus, setFStatus] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all')
  const [fComp, setFComp] = useState('all')
  const [fJob, setFJob] = useState('all')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const filters: WorkEntryFilters = useMemo(
    () => ({
      employeeId: fEmployee === 'all' ? undefined : fEmployee,
      payStatus: fStatus,
      compType: fComp === 'all' ? undefined : (fComp as CompType),
      jobId: fJob === 'all' ? undefined : fJob,
      from: fFrom || undefined,
      to: fTo || undefined,
    }),
    [fEmployee, fStatus, fComp, fJob, fFrom, fTo],
  )

  const load = useCallback(async () => {
    try {
      const [s, b, e, p, emps, jbs] = await Promise.all([
        getWorkPaySummary(),
        getEmployeeBalances(),
        getWorkEntries(filters),
        getPayments(fEmployee === 'all' ? undefined : fEmployee),
        getActiveEmployees(),
        getJobOptions(),
      ])
      setSummary(s)
      setBalances(b)
      setEntries(e)
      setPayments(p)
      setEmployees(emps)
      setJobs(jbs)
      setNeedsMigration(false)
    } catch (err: any) {
      if (isMissingTable(err)) {
        setNeedsMigration(true)
      } else {
        console.log('[v0] WorkPayTab load error:', err?.message)
        toast.error(err?.message ?? 'Could not load Work & Pay')
      }
    } finally {
      setLoading(false)
    }
  }, [filters, fEmployee])

  useEffect(() => {
    load()
  }, [load])

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function confirmDeleteEntry() {
    if (!deleteEntry) return
    try {
      await deleteWorkEntry(deleteEntry.id)
      toast.success('Work entry deleted')
      setDeleteEntry(null)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not delete the work entry')
    }
  }

  async function confirmDeletePayment() {
    if (!deletePay) return
    try {
      await deletePayment(deletePay.id)
      toast.success('Payment deleted')
      setDeletePay(null)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not delete the payment')
    }
  }

  if (needsMigration) {
    return (
      <Card className="space-y-3 p-6">
        <div className="flex items-center gap-2 text-amber-500">
          <TriangleAlert className="h-5 w-5" />
          <h3 className="font-semibold">Setup required</h3>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The Work &amp; Pay ledger tables are not installed yet. Run{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            scripts/42-work-pay-ledger.sql
          </code>{' '}
          and{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            scripts/43-work-pay-backfill.sql
          </code>{' '}
          against your database, then reload this tab.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const owedEmployees = balances.filter((b) => b.outstanding > 0)

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Work &amp; Pay</h2>
          <p className="text-sm text-muted-foreground">
            What your team earned, what you paid, and what is still owed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={() => load()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={() => {
              setPayPreset(null)
              setPayOpen(true)
            }}
          >
            <Banknote className="h-4 w-4" />
            Record payment
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add work
          </Button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Working today
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.workingToday}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.workingToday === 1 ? 'employee' : 'employees'}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hours this week
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {summary.hoursThisWeek.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Since Monday</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Earned this week
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-500">
              {formatMoney(summary.earnedThisWeek)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Labor cost accrued</p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paid this week
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatMoney(summary.paidThisWeek)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Excludes opening balances</p>
          </Card>

          <Card
            className={`p-4 ${summary.totalOutstanding > 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Still owed
            </p>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums ${
                summary.totalOutstanding > 0 ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {formatMoney(summary.totalOutstanding)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {owedEmployees.length} {owedEmployees.length === 1 ? 'person' : 'people'}
            </p>
          </Card>
        </div>
      )}

      {/* Employee cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">By employee</h3>
        {balances.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No work recorded yet. Use{' '}
              <span className="font-medium text-foreground">Add work</span> to record a shift.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => (
              <Card key={b.employeeId} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.employeeName}</p>
                    {!b.active && (
                      <span className="text-xs text-muted-foreground">Inactive</span>
                    )}
                  </div>
                  {b.outstanding > 0 ? (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                      Owed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                      Settled
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Earned</span>
                    <span className="tabular-nums">{formatMoney(b.totalEarned)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="tabular-nums">{formatMoney(b.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-1.5">
                    <span className="text-muted-foreground">Still owed</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        b.outstanding > 0 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    >
                      {formatMoney(b.outstanding)}
                    </span>
                  </div>
                  {b.unallocatedCredit > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credit on account</span>
                      <span className="tabular-nums text-sky-400">
                        {formatMoney(b.unallocatedCredit)}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 bg-transparent"
                  onClick={() => {
                    setPayPreset(b.employeeId)
                    setPayOpen(true)
                  }}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Pay
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="f-employee" className="text-xs">
              Employee
            </Label>
            <Select value={fEmployee} onValueChange={setFEmployee}>
              <SelectTrigger id="f-employee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {balances.map((b) => (
                  <SelectItem key={b.employeeId} value={b.employeeId}>
                    {b.employeeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-status" className="text-xs">
              Pay status
            </Label>
            <Select value={fStatus} onValueChange={(v) => setFStatus(v as typeof fStatus)}>
              <SelectTrigger id="f-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partially paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-comp" className="text-xs">
              Compensation type
            </Label>
            <Select value={fComp} onValueChange={setFComp}>
              <SelectTrigger id="f-comp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any type</SelectItem>
                {COMP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {COMP_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-job" className="text-xs">
              Job
            </Label>
            <Select value={fJob} onValueChange={setFJob}>
              <SelectTrigger id="f-job">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any job</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-from" className="text-xs">
              From
            </Label>
            <Input
              id="f-from"
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-to" className="text-xs">
              To
            </Label>
            <Input id="f-to" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>
        </div>

        {(fEmployee !== 'all' ||
          fStatus !== 'all' ||
          fComp !== 'all' ||
          fJob !== 'all' ||
          fFrom ||
          fTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setFEmployee('all')
              setFStatus('all')
              setFComp('all')
              setFJob('all')
              setFFrom('')
              setFTo('')
            }}
          >
            Clear filters
          </Button>
        )}
      </Card>

      {/* Entries / payments toggle */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setView('entries')}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            view === 'entries'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Work entries ({entries.length})
        </button>
        <button
          onClick={() => setView('payments')}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            view === 'payments'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Payments ({payments.length})
        </button>
      </div>

      {view === 'entries' && (
        <div className="space-y-2">
          {entries.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No work entries match these filters.
              </p>
            </Card>
          ) : (
            entries.map((entry) => {
              const isOpen = expanded.has(entry.id)
              return (
                <Card key={entry.id} className="overflow-hidden">
                  <button
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                    onClick={() => toggleExpanded(entry.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{entry.employeeName}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(entry.workDate)}
                        </span>
                        <StatusBadge status={statusOf(entry)} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{COMP_TYPE_LABELS[entry.compType]}</span>
                        {entry.hours > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatHours(entry.hours)}
                          </span>
                        )}
                        {entry.jobs.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {entry.jobs.length} {entry.jobs.length === 1 ? 'job' : 'jobs'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(entry.computedAmount)}
                      </p>
                      {entry.outstanding > 0 && (
                        <p className="text-xs tabular-nums text-amber-500">
                          {formatMoney(entry.outstanding)} owed
                        </p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-border/60 p-4 pt-3">
                      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        {(entry.startTime || entry.endTime) && (
                          <div>
                            <p className="text-xs text-muted-foreground">Shift</p>
                            <p className="tabular-nums">
                              {formatTime(entry.startTime)}
                              {entry.endTime ? ` - ${formatTime(entry.endTime)}` : ''}
                            </p>
                          </div>
                        )}
                        {entry.breakMinutes > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Break</p>
                            <p className="tabular-nums">{entry.breakMinutes} min</p>
                          </div>
                        )}
                        {entry.rateSnapshot !== null && (
                          <div>
                            <p className="text-xs text-muted-foreground">Rate used</p>
                            <p className="tabular-nums">{formatMoney(entry.rateSnapshot)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">Paid so far</p>
                          <p className="tabular-nums">{formatMoney(entry.amountPaid)}</p>
                        </div>
                      </div>

                      {entry.jobs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Jobs</p>
                          <ul className="space-y-1">
                            {entry.jobs.map((j) => (
                              <li
                                key={j.jobId}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="truncate">{j.jobLabel}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {j.amountKind}
                                  {j.amount !== null ? ` ${formatMoney(j.amount)}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {entry.notes && (
                        <div>
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="text-sm leading-relaxed">{entry.notes}</p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => setDeleteEntry(entry)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete entry
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}

      {view === 'payments' && (
        <div className="space-y-2">
          {payments.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            </Card>
          ) : (
            payments.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.employeeName}</span>
                    <span className="text-sm text-muted-foreground">{formatDate(p.paidOn)}</span>
                    {p.isOpening && (
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        Opening balance
                      </Badge>
                    )}
                    {p.unallocatedAmount > 0 && (
                      <Badge variant="outline" className="border-sky-400/40 text-sky-400">
                        {formatMoney(p.unallocatedAmount)} credit
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {p.method && <span>{p.method}</span>}
                    {p.payPeriodStart && p.payPeriodEnd && (
                      <span>
                        {formatDate(p.payPeriodStart)} - {formatDate(p.payPeriodEnd)}
                      </span>
                    )}
                    {p.note && <span className="truncate">{p.note}</span>}
                  </div>
                </div>

                <p className="shrink-0 font-semibold tabular-nums text-emerald-500">
                  {formatMoney(p.amount)}
                </p>

                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setDeletePay(p)}
                  aria-label={`Delete payment of ${formatMoney(p.amount)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      <AddWorkDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employees={employees}
        jobs={jobs}
        onSaved={load}
      />

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        balances={balances}
        employees={employees}
        presetEmployeeId={payPreset}
        onSaved={load}
      />

      <AlertDialog open={!!deleteEntry} onOpenChange={(o) => !o && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this work entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry && (
                <>
                  {deleteEntry.employeeName} on {formatDate(deleteEntry.workDate)} for{' '}
                  {formatMoney(deleteEntry.computedAmount)}.
                  {deleteEntry.amountPaid > 0 && (
                    <>
                      {' '}
                      {formatMoney(deleteEntry.amountPaid)} has already been paid against it, and
                      that payment will become unallocated credit rather than disappearing.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePay} onOpenChange={(o) => !o && setDeletePay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePay && (
                <>
                  {formatMoney(deletePay.amount)} to {deletePay.employeeName} on{' '}
                  {formatDate(deletePay.paidOn)}. The work it was applied to will go back to being
                  owed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePayment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
