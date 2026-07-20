'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, CheckCircle2, FileWarning, Pencil, Receipt, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { updateExpense } from '@/lib/storage'
import { formatCurrency } from '@/lib/utils-finance'
import type { Expense, TaxTreatment } from '@/lib/types'
import { TAX_TREATMENT_LABELS, TAX_TREATMENT_OPTIONS } from './finance-utils'

interface ReviewTabProps {
  expenses: Expense[]
  onRefresh: () => void
}

// A cleanup workflow surfacing expenses that need attention: missing category,
// missing vendor, no receipt, or still unreviewed for tax. Users fix them
// inline or jump to the full edit form.
export function ReviewTab({ expenses, onRefresh }: ReviewTabProps) {
  const router = useRouter()
  const [savingId, setSavingId] = useState<string | null>(null)

  // Only business expenses need review; transfers are excluded.
  const businessExpenses = useMemo(
    () => expenses.filter((e) => (e.transactionType || 'business_expense') !== 'transfer'),
    [expenses],
  )

  const needsReview = useMemo(() => {
    return businessExpenses.filter((e) => {
      const noCategory = !e.category || e.category.trim() === '' || e.category === 'Other'
      const noVendor = !e.vendor || e.vendor.trim() === ''
      const noReceipt = (e.attachments?.length || 0) === 0
      const unreviewed = (e.taxTreatment || 'unreviewed') === 'unreviewed'
      return noCategory || noVendor || noReceipt || unreviewed
    })
  }, [businessExpenses])

  const reasons = (e: Expense): { label: string; icon: typeof Tag }[] => {
    const list: { label: string; icon: typeof Tag }[] = []
    if (!e.category || e.category.trim() === '' || e.category === 'Other') list.push({ label: 'Needs category', icon: Tag })
    if (!e.vendor || e.vendor.trim() === '') list.push({ label: 'No vendor', icon: FileWarning })
    if ((e.attachments?.length || 0) === 0) list.push({ label: 'No receipt', icon: Receipt })
    if ((e.taxTreatment || 'unreviewed') === 'unreviewed') list.push({ label: 'Tax unreviewed', icon: AlertTriangle })
    return list
  }

  const handleTaxChange = async (expense: Expense, value: TaxTreatment) => {
    setSavingId(expense.id)
    try {
      const res = await updateExpense(expense.id, { taxTreatment: value })
      if (res) {
        toast.success('Tax treatment updated')
        onRefresh()
      } else {
        toast.error('Could not update tax treatment')
      }
    } catch (err) {
      console.error('[v0] review tax update failed:', err)
      toast.error('Could not update tax treatment')
    } finally {
      setSavingId(null)
    }
  }

  if (needsReview.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <p className="font-medium">Everything looks clean</p>
            <p className="text-sm text-muted-foreground">
              No expenses need review right now. New expenses will show up here if they&apos;re missing details.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm">
            <span className="font-medium">{needsReview.length}</span> {needsReview.length === 1 ? 'expense needs' : 'expenses need'} attention.
            Nothing is marked tax-deductible automatically — set each one&apos;s tax treatment yourself.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {needsReview.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.description || 'Untitled expense'}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {e.vendor ? ` · ${e.vendor}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasons(e).map((r, i) => {
                      const Icon = r.icon
                      return (
                        <Badge key={i} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Icon className="mr-1 h-3 w-3" />
                          {r.label}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(e.amount)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select
                  value={e.taxTreatment || 'unreviewed'}
                  onValueChange={(v) => handleTaxChange(e, v as TaxTreatment)}
                  disabled={savingId === e.id}
                >
                  <SelectTrigger className="h-9 w-[190px] text-sm">
                    <SelectValue placeholder="Tax treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_TREATMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {TAX_TREATMENT_LABELS[o.value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/add-expense?id=${e.id}`)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit details
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
