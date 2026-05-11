'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { getIncome, getExpenses, deleteIncome, deleteExpense } from '@/lib/storage'
import { Transaction, Income, Expense } from '@/lib/types'
import { InsightsPanel } from '@/components/ai/insights-panel'
import { generateFinancesInsights } from '@/lib/ai/insights'
import { formatCurrency, formatDate } from '@/lib/utils-finance'
import { Search, Trash2, Filter, ArrowUpRight, ArrowDownRight, X, ChevronDown, Plus, Minus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [deleteId, setDeleteId] = useState<{ id: string; type: 'income' | 'expense' } | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadTransactions()
  }, [])

  useEffect(() => {
    filterTransactions()
  }, [transactions, searchTerm, typeFilter, startDate, endDate])

  const loadTransactions = async () => {
    const [income, expenses] = await Promise.all([getIncome(), getExpenses()])

    const allTransactions: Transaction[] = [
      ...income.map(i => ({ ...i, type: 'income' as const })),
      ...expenses.map(e => ({ ...e, type: 'expense' as const })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setTransactions(allTransactions)
  }

  const filterTransactions = () => {
    let filtered = [...transactions]

    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => t.type === typeFilter)
    }

    if (startDate) {
      filtered = filtered.filter(t => new Date(t.date) >= new Date(startDate))
    }
    if (endDate) {
      filtered = filtered.filter(t => new Date(t.date) <= new Date(endDate))
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(t => {
        if (t.type === 'income') {
          const income = t as Income & { type: 'income' }
          return (
            income.customerName.toLowerCase().includes(term) ||
            income.jobType.toLowerCase().includes(term) ||
            income.paymentMethod.toLowerCase().includes(term) ||
            income.notes?.toLowerCase().includes(term)
          )
        } else {
          const expense = t as Expense & { type: 'expense' }
          return (
            expense.description.toLowerCase().includes(term) ||
            expense.category.toLowerCase().includes(term) ||
            expense.paymentMethod.toLowerCase().includes(term) ||
            expense.notes?.toLowerCase().includes(term)
          )
        }
      })
    }

    setFilteredTransactions(filtered)
  }

  const handleDelete = async () => {
    if (!deleteId) return

    if (deleteId.type === 'income') {
      await deleteIncome(deleteId.id)
      toast.success('Income deleted successfully')
    } else {
      await deleteExpense(deleteId.id)
      toast.success('Expense deleted successfully')
    }

    loadTransactions()
    setDeleteId(null)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setTypeFilter('all')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = typeFilter !== 'all' || startDate || endDate

  // Group transactions by date for better mobile display
  const groupedByDate = filteredTransactions.reduce((acc, transaction) => {
    const date = transaction.date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(transaction)
    return acc
  }, {} as Record<string, Transaction[]>)

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  
  const totalExpenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Finances</h1>
            <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
              <span><strong className="text-emerald-600">+${totalIncome.toFixed(0)}</strong> in</span>
              <span className="text-border">|</span>
              <span><strong className="text-rose-600">-${totalExpenses.toFixed(0)}</strong> out</span>
              <span className="text-border">|</span>
              <span><strong className={totalIncome - totalExpenses >= 0 ? 'text-foreground' : 'text-rose-600'}>${(totalIncome - totalExpenses).toFixed(0)}</strong> net</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button asChild variant="outline" size="sm" className="gap-1 h-8">
              <Link href="/add-expense"><Minus className="h-3.5 w-3.5" />Expense</Link>
            </Button>
            <Button asChild size="sm" className="gap-1 h-8">
              <Link href="/add-income"><Plus className="h-3.5 w-3.5" />Income</Link>
            </Button>
          </div>
        </div>

        {/* Search & Filter - Compact */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transactions List */}
        {filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {Object.entries(groupedByDate).map(([date, dayTransactions]) => (
              <div key={date}>
                <p className="text-xs font-medium text-muted-foreground mb-1 px-1">{formatDate(date)}</p>
                <Card className="p-0 overflow-hidden">
                  <div className="divide-y">
                    {dayTransactions.map((transaction) => (
                      <div key={transaction.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                        {/* Icon */}
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                          transaction.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-rose-100 dark:bg-rose-950/40'
                        }`}>
                          {transaction.type === 'income' ? (
                            <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                          )}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {transaction.type === 'income' ? (transaction as Income).customerName : (transaction as Expense).description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {transaction.type === 'income' ? (transaction as Income).jobType : (transaction as Expense).category}
                          </p>
                        </div>
                        {/* Amount */}
                        <span className={`text-sm font-medium shrink-0 ${
                          transaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {transaction.type === 'income' ? '+' : '-'}${transaction.amount.toFixed(0)}
                        </span>
                        {/* Delete */}
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => setDeleteId({ id: transaction.id, type: transaction.type })}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">No transactions found</div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this transaction from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
