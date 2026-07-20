'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Income, Expense } from '@/lib/types'
import { formatCurrency } from '@/lib/utils-finance'
import { ArrowUpRight, ArrowDownRight, Wallet, AlertCircle, Landmark } from 'lucide-react'
import {
  realExpenses,
  sum,
  categoryBreakdown,
  needsReview,
  isTransfer,
} from './finance-utils'

interface OverviewTabProps {
  income: Income[]
  expenses: Expense[]
  onReviewClick: () => void
}

export function OverviewTab({ income, expenses, onReviewClick }: OverviewTabProps) {
  const real = realExpenses(expenses)
  const transfers = expenses.filter(isTransfer)
  const totalIncome = sum(income)
  const totalExpenses = sum(real)
  const totalTransfers = sum(transfers)
  const net = totalIncome - totalExpenses
  const breakdown = categoryBreakdown(expenses)
  const maxCat = breakdown.length > 0 ? breakdown[0].total : 0
  const reviewCount = expenses.filter(needsReview).length

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium">Income</span>
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ArrowDownRight className="h-4 w-4 text-rose-600" />
              <span className="text-xs font-medium">Expenses</span>
            </div>
            <p className="text-xl font-bold text-rose-600">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium">Net profit</span>
            </div>
            <p className={`text-xl font-bold ${net >= 0 ? 'text-foreground' : 'text-rose-600'}`}>
              {formatCurrency(net)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Landmark className="h-4 w-4" />
              <span className="text-xs font-medium">Transfers</span>
            </div>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(totalTransfers)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Excluded from totals</p>
          </CardContent>
        </Card>
      </div>

      {/* Review nudge */}
      {reviewCount > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{reviewCount} transaction{reviewCount > 1 ? 's' : ''} need review</p>
              <p className="text-xs text-muted-foreground">
                Missing vendor, business purpose, receipt, or tax treatment.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onReviewClick}>
              Review
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Expenses by category</h2>
            <span className="text-xs text-muted-foreground">{formatCurrency(totalExpenses)} total</span>
          </div>
          {breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No expenses recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {breakdown.map(({ category, total }) => {
                const pct = maxCat > 0 ? (total / maxCat) * 100 : 0
                const shareOfTotal = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{category}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {shareOfTotal.toFixed(0)}%
                        </Badge>
                      </div>
                      <span className="text-sm font-medium shrink-0">{formatCurrency(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
