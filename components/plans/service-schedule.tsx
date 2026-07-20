'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, Pencil, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer } from '@/lib/types'
import {
  deriveScheduleStatus,
  SCHEDULE_STATUS_META,
  type CustomerPlan,
  type ServicePlan,
  type ScheduleStatus,
} from '@/lib/plans-storage'
import { EditScheduleDialog } from './edit-schedule-dialog'

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function daysLabel(next: string | null, status: ScheduleStatus): string {
  if (status === 'needs-setup') return 'No schedule set'
  if (!next) return ''
  const due = new Date(next.split('T')[0] + 'T00:00:00')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Due today'
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`
  return `in ${diff} day${diff === 1 ? '' : 's'}`
}

type FilterKey = 'all' | 'today' | 'week' | 'month' | 'overdue' | 'needs-setup'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due Today' },
  { key: 'week', label: 'Due This Week' },
  { key: 'month', label: 'Due This Month' },
  { key: 'needs-setup', label: 'Needs Setup' },
]

interface ScheduleRow {
  cp: CustomerPlan
  plan: ServicePlan | null
  customer: Customer | undefined
  status: ScheduleStatus
  diffDays: number | null
}

interface ServiceScheduleSectionProps {
  plans: ServicePlan[]
  customerPlans: CustomerPlan[]
  customers: Customer[]
  onRefresh: () => void
}

export function ServiceScheduleSection({
  plans,
  customerPlans,
  customers,
  onRefresh,
}: ServiceScheduleSectionProps) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [editing, setEditing] = useState<ScheduleRow | null>(null)

  const rows = useMemo<ScheduleRow[]>(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return customerPlans
      .filter((cp) => cp.plan_id && cp.status !== 'cancelled')
      .map((cp) => {
        const plan = plans.find((p) => p.id === cp.plan_id) || null
        const customer = customers.find((c) => c.id === cp.customer_id)
        const status = deriveScheduleStatus(cp, now)
        let diffDays: number | null = null
        if (cp.next_service_date) {
          const due = new Date(cp.next_service_date.split('T')[0] + 'T00:00:00')
          diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
        }
        return { cp, plan, customer, status, diffDays }
      })
      .sort((a, b) => {
        // Needs-setup rows sink to the bottom; everything else sorts by due date.
        if (a.status === 'needs-setup' && b.status !== 'needs-setup') return 1
        if (b.status === 'needs-setup' && a.status !== 'needs-setup') return -1
        if (a.diffDays === null && b.diffDays === null) {
          return (a.customer?.name || '').localeCompare(b.customer?.name || '')
        }
        if (a.diffDays === null) return 1
        if (b.diffDays === null) return -1
        return a.diffDays - b.diffDays
      })
  }, [plans, customerPlans, customers])

  const counts = useMemo(() => {
    return {
      overdue: rows.filter((r) => r.status === 'overdue').length,
      today: rows.filter((r) => r.diffDays === 0).length,
      week: rows.filter((r) => r.diffDays !== null && r.diffDays >= 0 && r.diffDays <= 7).length,
      month: rows.filter((r) => r.diffDays !== null && r.diffDays >= 0 && r.diffDays <= 30).length,
      needsSetup: rows.filter((r) => r.status === 'needs-setup').length,
    }
  }, [rows])

  const visibleRows = useMemo(() => {
    switch (filter) {
      case 'overdue':
        return rows.filter((r) => r.status === 'overdue')
      case 'today':
        return rows.filter((r) => r.diffDays === 0)
      case 'week':
        return rows.filter((r) => r.diffDays !== null && r.diffDays >= 0 && r.diffDays <= 7)
      case 'month':
        return rows.filter((r) => r.diffDays !== null && r.diffDays >= 0 && r.diffDays <= 30)
      case 'needs-setup':
        return rows.filter((r) => r.status === 'needs-setup')
      default:
        return rows
    }
  }, [rows, filter])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Service Schedule
            </CardTitle>
            {counts.needsSetup > 0 && (
              <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-500">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {counts.needsSetup} need setup
              </Badge>
            )}
          </div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count =
                f.key === 'overdue' ? counts.overdue
                : f.key === 'today' ? counts.today
                : f.key === 'week' ? counts.week
                : f.key === 'month' ? counts.month
                : f.key === 'needs-setup' ? counts.needsSetup
                : rows.length
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    filter === f.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {f.label}
                  <span className={cn(
                    'rounded-full px-1.5 text-[10px]',
                    filter === f.key ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No customers in this view.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleRows.map((row) => {
              const meta = SCHEDULE_STATUS_META[row.status]
              return (
                <div
                  key={row.cp.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {row.customer?.name?.charAt(0) || '?'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{row.customer?.name || 'Unknown customer'}</p>
                      <Badge variant="outline" className={cn('text-[10px] shrink-0', meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.plan?.name || 'No plan'}
                      {row.plan && <span className="capitalize"> · {row.plan.frequency}</span>}
                    </p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Last: {formatDate(row.cp.last_service_date)}</p>
                    <p className="text-sm font-medium">
                      Next: {formatDate(row.cp.next_service_date)}
                    </p>
                  </div>
                  <div className="hidden md:block text-right shrink-0 w-24">
                    <span className={cn(
                      'text-xs font-medium',
                      row.status === 'overdue' && 'text-red-500',
                      row.status === 'due' && 'text-orange-500',
                      row.status === 'due-soon' && 'text-amber-500',
                      row.status === 'needs-setup' && 'text-purple-500',
                    )}>
                      {daysLabel(row.cp.next_service_date, row.status)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => setEditing(row)}
                    aria-label={`Edit schedule for ${row.customer?.name || 'customer'}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <EditScheduleDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        customerPlan={editing?.cp || null}
        plan={editing?.plan || null}
        customerName={editing?.customer?.name || 'Customer'}
        onSaved={onRefresh}
      />
    </Card>
  )
}
