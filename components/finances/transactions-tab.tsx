'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { Income, Expense } from '@/lib/types'
import { formatDate } from '@/lib/utils-finance'
import { Search, Trash2, ArrowUpRight, ArrowDownRight, Landmark, SlidersHorizontal, X, Paperclip } from 'lucide-react'

type TxType = 'income' | 'expense'
type Tx = (Income & { type: 'income' }) | (Expense & { type: 'expense' })

interface TransactionsTabProps {
  income: Income[]
  expenses: Expense[]
  categories: string[]
  onDelete: (item: { id: string; type: TxType }) => void
}

export function TransactionsTab({ income, expenses, categories, onDelete }: TransactionsTabProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const allTx: Tx[] = useMemo(
    () =>
      [
        ...income.map((i) => ({ ...i, type: 'income' as const })),
        ...expenses.map((e) => ({ ...e, type: 'expense' as const })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [income, expenses],
  )

  const filtered = useMemo(() => {
    let list = [...allTx]

    if (typeFilter === 'income') list = list.filter((t) => t.type === 'income')
    else if (typeFilter === 'expense')
      list = list.filter((t) => t.type === 'expense' && (t as Expense).transactionType !== 'transfer')
    else if (typeFilter === 'transfer')
      list = list.filter((t) => t.type === 'expense' && (t as Expense).transactionType === 'transfer')

    if (categoryFilter !== 'all')
      list = list.filter((t) => t.type === 'expense' && (t as Expense).category === categoryFilter)

    if (startDate) list = list.filter((t) => new Date(t.date) >= new Date(startDate))
    if (endDate) list = list.filter((t) => new Date(t.date) <= new Date(endDate))

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter((t) => {
        if (t.type === 'income') {
          const i = t as Income
          return (
            i.customerName?.toLowerCase().includes(term) ||
            i.jobType?.toLowerCase().includes(term) ||
            i.paymentMethod?.toLowerCase().includes(term) ||
            i.notes?.toLowerCase().includes(term)
          )
        }
        const e = t as Expense
        return (
          e.description?.toLowerCase().includes(term) ||
          e.category?.toLowerCase().includes(term) ||
          e.vendor?.toLowerCase().includes(term) ||
          e.paymentMethod?.toLowerCase().includes(term) ||
          e.notes?.toLowerCase().includes(term)
        )
      })
    }

    return list
  }, [allTx, typeFilter, categoryFilter, startDate, endDate, searchTerm])

  const grouped = useMemo(
    () =>
      filtered.reduce((acc, t) => {
        ;(acc[t.date] ||= []).push(t)
        return acc
      }, {} as Record<string, Tx[]>),
    [filtered],
  )

  const hasActiveFilters = typeFilter !== 'all' || categoryFilter !== 'all' || !!startDate || !!endDate
  const clearFilters = () => {
    setTypeFilter('all')
    setCategoryFilter('all')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="space-y-4">
      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search description, vendor, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button variant={hasActiveFilters ? 'default' : 'outline'} size="sm" className="h-9 gap-1.5" onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <Card className="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expenses</SelectItem>
                  <SelectItem value="transfer">Transfers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="col-span-2 lg:col-span-4 h-8 justify-self-start gap-1.5 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {Object.entries(grouped).map(([date, dayTx]) => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground mb-1 px-1">{formatDate(date)}</p>
              <Card className="p-0 overflow-hidden">
                <div className="divide-y">
                  {dayTx.map((t) => {
                    const isIncome = t.type === 'income'
                    const expense = t as Expense
                    const transfer = !isIncome && expense.transactionType === 'transfer'
                    const editable = !isIncome
                    return (
                      <div key={t.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                            isIncome
                              ? 'bg-emerald-100 dark:bg-emerald-950/40'
                              : transfer
                                ? 'bg-muted'
                                : 'bg-rose-100 dark:bg-rose-950/40'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : transfer ? (
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && router.push(`/add-expense?id=${t.id}`)}
                          className={`flex-1 min-w-0 text-left ${editable ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">
                              {isIncome ? (t as Income).customerName : expense.description}
                            </p>
                            {transfer && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Transfer</Badge>
                            )}
                            {!isIncome && !transfer && (expense.attachments?.length || 0) > 0 && (
                              <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {isIncome
                              ? (t as Income).jobType
                              : transfer
                                ? 'Transfer / CC payment'
                                : [expense.vendor, expense.category].filter(Boolean).join(' · ') || expense.category}
                          </p>
                        </button>

                        <span
                          className={`text-sm font-medium shrink-0 ${
                            isIncome ? 'text-emerald-600' : transfer ? 'text-muted-foreground' : 'text-rose-600'
                          }`}
                        >
                          {isIncome ? '+' : transfer ? '' : '-'}${t.amount.toFixed(0)}
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={() => onDelete({ id: t.id, type: t.type })}
                          aria-label="Delete transaction"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">No transactions found</div>
      )}
    </div>
  )
}
