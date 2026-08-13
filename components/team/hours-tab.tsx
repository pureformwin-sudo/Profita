'use client'

// =============================================================================
// Team > Hours
// =============================================================================
// Shows what the job timer actually recorded, and what those hours are worth at
// each employee's effective rate.
//
// Deliberately kept separate from the Payroll tab: Payroll reports
// job_workers.amount_earned (what was agreed per job, $9,982.40 live), this
// reports accrued labor from logged time. They are different numbers and
// merging them would double-count, so both are shown with explicit labels.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Link2, TriangleAlert, RefreshCw, History, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  getAccruedLabor,
  getUnattributedHours,
  getLinkCandidates,
  linkEmployeeToMember,
  getCompensationHistory,
  addCompensationChange,
  type AccruedLabor,
  type UnattributedHours,
  type LinkCandidate,
  type CompensationRecord,
  type PayType,
} from '@/lib/compensation-storage'
import type { Employee } from '@/lib/types'

interface HoursTabProps {
  employees: Employee[]
  onEmployeesChanged?: () => void
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const hours = (n: number) => `${n.toFixed(2)}h`

const PAY_TYPES: { value: PayType; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'per_job', label: 'Per job' },
  { value: 'salary', label: 'Salary' },
  { value: 'commission', label: 'Commission' },
]

export function HoursTab({ employees, onEmployeesChanged }: HoursTabProps) {
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [accrued, setAccrued] = useState<AccruedLabor[]>([])
  const [unattributed, setUnattributed] = useState<UnattributedHours | null>(null)
  const [candidates, setCandidates] = useState<LinkCandidate[]>([])

  // Link dialog
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkEmployeeId, setLinkEmployeeId] = useState<string>('')
  const [linkMemberId, setLinkMemberId] = useState<string>('none')
  const [linkSaving, setLinkSaving] = useState(false)

  // Rate history dialog
  const [rateOpen, setRateOpen] = useState(false)
  const [rateEmployee, setRateEmployee] = useState<Employee | null>(null)
  const [history, setHistory] = useState<CompensationRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [rateSaving, setRateSaving] = useState(false)
  const [rateForm, setRateForm] = useState({
    payType: 'hourly' as PayType,
    payRate: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    note: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [labor, unattr, cands] = await Promise.all([
        getAccruedLabor(),
        getUnattributedHours(),
        getLinkCandidates(),
      ])

      if (labor.setup.needsMigration || unattr.setup.needsMigration) {
        setNeedsMigration(true)
      }
      setAccrued(labor.rows)
      setUnattributed(unattr.unattributed)
      setCandidates(cands)
    } catch (err) {
      console.error('[v0] HoursTab load failed:', err)
      toast.error('Could not load hours')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => {
    const workHours = accrued.reduce((s, r) => s + r.workHours, 0)
    const travelHours = accrued.reduce((s, r) => s + r.travelHours, 0)
    const accruedAmount = accrued.reduce((s, r) => s + r.accruedAmount, 0)
    const nonHourly = accrued.filter((r) => r.notHourly).length
    return { workHours, travelHours, accruedAmount, nonHourly }
  }, [accrued])

  // Employees not yet linked to a team member, so hours cannot reach them.
  const unlinked = useMemo(
    () => employees.filter((e) => e.active && !(e as any).member_id),
    [employees],
  )

  async function openLink(employeeId: string) {
    setLinkEmployeeId(employeeId)
    setLinkMemberId('none')
    setLinkOpen(true)
  }

  async function saveLink() {
    if (!linkEmployeeId) return
    setLinkSaving(true)
    try {
      const res = await linkEmployeeToMember(
        linkEmployeeId,
        linkMemberId === 'none' ? null : linkMemberId,
      )
      if (!res.ok) {
        toast.error(res.error ?? 'Could not link employee')
        return
      }
      toast.success(
        linkMemberId === 'none' ? 'Employee unlinked' : 'Employee linked to team member',
      )
      setLinkOpen(false)
      onEmployeesChanged?.()
      await load()
    } finally {
      setLinkSaving(false)
    }
  }

  async function openRates(employee: Employee) {
    setRateEmployee(employee)
    setRateOpen(true)
    setHistoryLoading(true)
    setRateForm({
      payType: ((employee as any).pay_type as PayType) || 'hourly',
      payRate: String((employee as any).pay_rate ?? ''),
      effectiveFrom: new Date().toISOString().slice(0, 10),
      note: '',
    })
    try {
      const { records, setup } = await getCompensationHistory(employee.id)
      if (setup.needsMigration) setNeedsMigration(true)
      setHistory(records)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function saveRate() {
    if (!rateEmployee) return
    const rate = Number(rateForm.payRate)
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error('Enter a valid pay rate')
      return
    }
    setRateSaving(true)
    try {
      const res = await addCompensationChange({
        employeeId: rateEmployee.id,
        payType: rateForm.payType,
        payRate: rate,
        effectiveFrom: rateForm.effectiveFrom,
        note: rateForm.note,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save rate change')
        return
      }
      toast.success('Rate change recorded')
      const { records } = await getCompensationHistory(rateEmployee.id)
      setHistory(records)
      setRateForm((f) => ({ ...f, note: '' }))
      await load()
    } finally {
      setRateSaving(false)
    }
  }

  if (needsMigration) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-500">
          <TriangleAlert className="h-5 w-5" />
          <h3 className="font-semibold">Setup required</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The compensation history tables are not installed yet. Run{' '}
          <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
            scripts/40-employee-compensation-history.sql
          </code>{' '}
          against your database, then reload this tab.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Unattributed hours: shown first and loudly, because every live timer
          hour currently lands here. Reporting a clean 0 total would look
          correct while hiding all of the real data. */}
      {unattributed && (
        <Card className="p-5 border-amber-500/40 bg-amber-500/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">
                  {hours(unattributed.workHours)} of logged time is not linked to an employee
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  {unattributed.entryCount} timer{' '}
                  {unattributed.entryCount === 1 ? 'entry' : 'entries'} came from a user
                  with no matching employee record, so those hours cannot be costed. Link
                  an employee to the team member who logged the time to bring these hours
                  in.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 bg-transparent"
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="h-4 w-4" />
              Link employees
            </Button>
          </div>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Work hours
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {hours(totals.workHours)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Attributed to an employee</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Travel hours
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {hours(totals.travelHours)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Tracked separately from work</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Accrued labor
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {money(totals.accruedAmount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hourly staff only, at effective rate
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Unlinked employees
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{unlinked.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cannot receive hours until linked
          </p>
        </Card>
      </div>

      {/* Accrued labor per employee */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Hours by employee</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => void load()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {accrued.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No attributed hours yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground leading-relaxed">
              Timer hours appear here once an employee record is linked to the team member
              who logged them.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Employee</th>
                  <th className="px-5 py-3 font-medium">Pay type</th>
                  <th className="px-5 py-3 text-right font-medium">Rate</th>
                  <th className="px-5 py-3 text-right font-medium">Work</th>
                  <th className="px-5 py-3 text-right font-medium">Travel</th>
                  <th className="px-5 py-3 text-right font-medium">Accrued</th>
                </tr>
              </thead>
              <tbody>
                {accrued.map((row) => (
                  <tr key={row.employeeId} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3 font-medium">{row.employeeName}</td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" className="font-normal">
                        {row.payType.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {money(row.payRate)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {hours(row.workHours)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {hours(row.travelHours)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.notHourly ? (
                        // An hourly total would be misleading for per-job or
                        // commission staff, so it is withheld rather than shown as $0.
                        <span className="text-xs text-muted-foreground">n/a</span>
                      ) : (
                        <span className="font-semibold">{money(row.accruedAmount)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totals.nonHourly > 0 && (
          <div className="border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {totals.nonHourly}{' '}
              {totals.nonHourly === 1 ? 'employee is' : 'employees are'} not paid hourly, so
              accrued labor does not apply to them. Their pay stays on the Payroll tab.
            </p>
          </div>
        )}
      </Card>

      {/* Rate history entry point */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Pay rates</h3>
        </div>
        <div className="divide-y divide-border/50">
          {employees.filter((e) => e.active).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No active employees.
            </p>
          ) : (
            employees
              .filter((e) => e.active)
              .map((emp) => (
                <div
                  key={emp.id}
                  className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {((emp as any).pay_type ?? 'per_job').toString().replace('_', ' ')} ·{' '}
                      {money(Number((emp as any).pay_rate ?? 0))}
                      {!(emp as any).member_id && ' · not linked'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() => void openLink(emp.id)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() => void openRates(emp)}
                    >
                      <History className="h-3.5 w-3.5" />
                      Rate history
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link employee to team member</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Timer hours are recorded against the signed-in team member. Linking tells
              Profita which employee those hours belong to so they can be costed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-employee">Employee</Label>
              <Select value={linkEmployeeId} onValueChange={setLinkEmployeeId}>
                <SelectTrigger id="link-employee">
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => e.active)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-member">Team member</Label>
              <Select value={linkMemberId} onValueChange={setLinkMemberId}>
                <SelectTrigger id="link-member">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {/* "none" rather than an empty string: SelectItem cannot take
                      an empty value, and it is converted to null on save. */}
                  <SelectItem value="none">Not linked</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.memberId} value={c.memberId}>
                      {c.memberName}
                      {c.memberEmail ? ` (${c.memberEmail})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setLinkOpen(false)}
              disabled={linkSaving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveLink()} disabled={linkSaving || !linkEmployeeId}>
              {linkSaving ? 'Saving...' : 'Save link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate history dialog */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{rateEmployee?.name} — pay rate</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Rate changes are effective-dated, so editing a rate today never restates what
              an earlier period cost.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rate-type">Pay type</Label>
                <Select
                  value={rateForm.payType}
                  onValueChange={(v) => setRateForm((f) => ({ ...f, payType: v as PayType }))}
                >
                  <SelectTrigger id="rate-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate-amount">Rate</Label>
                <Input
                  id="rate-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateForm.payRate}
                  onChange={(e) => setRateForm((f) => ({ ...f, payRate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-from">Effective from</Label>
              <Input
                id="rate-from"
                type="date"
                value={rateForm.effectiveFrom}
                onChange={(e) =>
                  setRateForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-note">Note (optional)</Label>
              <Input
                id="rate-note"
                placeholder="Annual review, promotion..."
                value={rateForm.note}
                onChange={(e) => setRateForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => void saveRate()}
              disabled={rateSaving}
            >
              <Plus className="h-4 w-4" />
              {rateSaving ? 'Saving...' : 'Record rate change'}
            </Button>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                History
              </p>
              {historyLoading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded changes yet.</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {money(h.payRate)}{' '}
                          <span className="font-normal text-muted-foreground">
                            {h.payType.replace('_', ' ')}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          from {h.effectiveFrom}
                          {h.effectiveTo ? ` to ${h.effectiveTo}` : ''}
                          {h.note ? ` · ${h.note}` : ''}
                        </p>
                      </div>
                      {h.isCurrent && (
                        <Badge variant="secondary" className="shrink-0">
                          Current
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
