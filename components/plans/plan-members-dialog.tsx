'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pencil, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer } from '@/lib/types'
import {
  deriveScheduleStatus,
  SCHEDULE_STATUS_META,
  type CustomerPlan,
  type ServicePlan,
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

interface PlanMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: ServicePlan | null
  customerPlans: CustomerPlan[]
  customers: Customer[]
  onRefresh: () => void
}

export function PlanMembersDialog({
  open,
  onOpenChange,
  plan,
  customerPlans,
  customers,
  onRefresh,
}: PlanMembersDialogProps) {
  const [editingCp, setEditingCp] = useState<CustomerPlan | null>(null)

  const members = useMemo(() => {
    if (!plan) return []
    const now = new Date()
    return customerPlans
      .filter((cp) => cp.plan_id === plan.id)
      .map((cp) => ({
        cp,
        customer: customers.find((c) => c.id === cp.customer_id),
        status: deriveScheduleStatus(cp, now),
      }))
      .sort((a, b) => {
        const an = a.cp.next_service_date || '9999'
        const bn = b.cp.next_service_date || '9999'
        return an.localeCompare(bn)
      })
  }, [plan, customerPlans, customers])

  const editingCustomerName =
    customers.find((c) => c.id === editingCp?.customer_id)?.name || 'Customer'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {plan?.name || 'Plan'} members
            </DialogTitle>
            <DialogDescription>
              {members.length} enrolled · edit an individual customer&apos;s schedule without
              affecting anyone else on this plan.
            </DialogDescription>
          </DialogHeader>

          {members.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No customers are enrolled in this plan yet.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {members.map(({ cp, customer, status }) => {
                const meta = SCHEDULE_STATUS_META[status]
                return (
                  <div key={cp.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {customer?.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{customer?.name || 'Unknown customer'}</p>
                      <p className="text-xs text-muted-foreground">
                        Last: {formatDate(cp.last_service_date)} · Next: {formatDate(cp.next_service_date)}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', meta.className)}>
                      {meta.label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => setEditingCp(cp)}
                      aria-label={`Edit schedule for ${customer?.name || 'customer'}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditScheduleDialog
        open={!!editingCp}
        onOpenChange={(o) => !o && setEditingCp(null)}
        customerPlan={editingCp}
        plan={plan}
        customerName={editingCustomerName}
        onSaved={onRefresh}
      />
    </>
  )
}
