'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, Info } from 'lucide-react'
import { toast } from 'sonner'
import { exportExpensesDetailedCSV, exportRowsToCSV } from '@/lib/export'
import { formatCurrency } from '@/lib/utils-finance'
import type { Expense, Income, TaxTreatment } from '@/lib/types'
import { TAX_TREATMENT_LABELS, isCountableExpense } from './finance-utils'

interface ReportsTabProps {
  expenses: Expense[]
  income: Income[]
}

// Export + tax-summary tab. Deductible grouping is based purely on the manual
// tax_treatment the user set — nothing is inferred.
export function ReportsTab({ expenses, income }: ReportsTabProps) {
  const countable = useMemo(() => expenses.filter(isCountableExpense), [expenses])

  const taxBreakdown = useMemo(() => {
    const groups: Record<TaxTreatment, { count: number; total: number }> = {
      unreviewed: { count: 0, total: 0 },
      likely_deductible: { count: 0, total: 0 },
      not_deductible: { count: 0, total: 0 },
      ask_accountant: { count: 0, total: 0 },
    }
    countable.forEach((e) => {
      const t = (e.taxTreatment || 'unreviewed') as TaxTreatment
      groups[t].count += 1
      groups[t].total += e.amount
    })
    return groups
  }, [countable])

  const transferCount = expenses.length - countable.length

  const handleExportExpenses = () => {
    const ok = exportExpensesDetailedCSV(expenses, 'pureform-expenses')
    if (ok) toast.success('Expenses exported')
    else toast.error('No expenses to export')
  }

  const handleExportIncome = () => {
    if (income.length === 0) {
      toast.error('No income to export')
      return
    }
    const rows = [...income]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((i) => ({
        Date: i.date,
        Customer: i.customerName || '',
        'Job Type': i.jobType || '',
        Amount: i.amount,
        'Payment Method': i.paymentMethod || '',
        'Payment Status': i.paymentStatus || '',
        Notes: i.notes || '',
      }))
    exportRowsToCSV(rows, 'pureform-income')
    toast.success('Income exported')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" />
              Expense report
            </CardTitle>
            <CardDescription>
              Detailed CSV with vendor, category, business purpose, tax treatment, and receipt status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportExpenses} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Export expenses CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" />
              Income report
            </CardTitle>
            <CardDescription>All recorded income with source, amount, and payment method.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportIncome} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Export income CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax treatment summary</CardTitle>
          <CardDescription>
            Based only on the treatment you assigned to each expense. Transfers and credit-card payments
            {transferCount > 0 ? ` (${transferCount})` : ''} are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(taxBreakdown) as TaxTreatment[]).map((key) => {
            const g = taxBreakdown[key]
            return (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <p className="font-medium">{TAX_TREATMENT_LABELS[key]}</p>
                  <p className="text-sm text-muted-foreground">{g.count} {g.count === 1 ? 'expense' : 'expenses'}</p>
                </div>
                <p className="font-semibold">{formatCurrency(g.total)}</p>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/30">
        <CardContent className="flex gap-3 py-4">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            These reports are for your records and to share with your accountant. Profita does not provide tax advice
            and never marks anything deductible on your behalf — confirm all deductions with a tax professional.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
