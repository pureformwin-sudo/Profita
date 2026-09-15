'use client'

import { useMemo, useState } from 'react'
import { Download, Users, CheckCircle2, PhoneOff, CalendarX, Copy, MapPinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Customer, Job } from '@/lib/types'
import { buildExportList, toCsv } from '@/lib/customer-export'

interface CustomersExportDialogProps {
  customers: Customer[]
  jobs: Job[]
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? ''}`}>{value}</p>
    </div>
  )
}

export function CustomersExportDialog({ customers, jobs }: CustomersExportDialogProps) {
  const [open, setOpen] = useState(false)

  // Pure + instant over already-loaded, session-scoped data — recomputed only
  // when the dialog is open so a closed dialog costs nothing.
  const result = useMemo(
    () => (open ? buildExportList(customers, jobs) : null),
    [open, customers, jobs],
  )

  const handleDownload = () => {
    if (!result || result.rows.length === 0) return
    const csv = toCsv(result.rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sms-campaign-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const stats = result?.stats

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export SMS list</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export SMS campaign list</DialogTitle>
          <DialogDescription>
            Only customers with a job whose work was delivered (Completed, Invoiced, Paid, or
            Closed) and a valid phone number are included. Numbers are formatted in E.164
            (+15595551234) for import.
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                icon={<Users className="h-3.5 w-3.5" />}
                label="Total customers"
                value={stats.total}
              />
              <StatCard
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Passed both filters"
                value={stats.passed}
                accent="text-emerald-500"
              />
              <StatCard
                icon={<CalendarX className="h-3.5 w-3.5" />}
                label="No completed job"
                value={stats.excludedNoCompleted}
              />
              <StatCard
                icon={<PhoneOff className="h-3.5 w-3.5" />}
                label="Bad / missing phone"
                value={stats.excludedBadPhone}
              />
              <StatCard
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Deduplicated"
                value={stats.deduped}
                accent={stats.deduped > 0 ? 'text-amber-500' : undefined}
              />
              <StatCard
                icon={<MapPinOff className="h-3.5 w-3.5" />}
                label="Exported, no address"
                value={stats.missingAddress}
                accent={stats.missingAddress > 0 ? 'text-amber-500' : undefined}
              />
            </div>

            {stats.collisions.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                  {stats.deduped} duplicate{stats.deduped === 1 ? '' : 's'} across{' '}
                  {stats.collisions.length} shared phone
                  {stats.collisions.length === 1 ? '' : 's'} — kept the higher lifetime value:
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs">
                  {stats.collisions.map((c) => (
                    <li key={c.phone} className="text-muted-foreground">
                      <span className="font-mono text-foreground">{c.phone}</span>: kept{' '}
                      <span className="text-foreground">{c.kept.name}</span> ($
                      {c.kept.lifetimeValue.toLocaleString()}), dropped{' '}
                      {c.dropped
                        .map((d) => `${d.name} ($${d.lifetimeValue.toLocaleString()})`)
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {stats.passed > 0
                  ? `${stats.passed} contact${stats.passed === 1 ? '' : 's'} ready to export`
                  : 'No contacts match both filters'}
              </p>
              <Button onClick={handleDownload} disabled={stats.passed === 0} className="gap-2">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
