'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
import { getIncome, getExpenses, deleteIncome, deleteExpense, getExpenseCategories } from '@/lib/storage'
import { Income, Expense } from '@/lib/types'
import { Plus, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { OverviewTab } from '@/components/finances/overview-tab'
import { TransactionsTab } from '@/components/finances/transactions-tab'
import { ReviewTab } from '@/components/finances/review-tab'
import { ReportsTab } from '@/components/finances/reports-tab'
import { needsReview } from '@/components/finances/finance-utils'

function FinancesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = searchParams.get('tab') || 'overview'

  const [income, setIncome] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [tab, setTab] = useState(initialTab)
  const [deleteId, setDeleteId] = useState<{ id: string; type: 'income' | 'expense' } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [inc, exp, cats] = await Promise.all([getIncome(), getExpenses(), getExpenseCategories()])
    setIncome(inc)
    setExpenses(exp)
    setCategories(cats)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Keep the tab in sync with the URL (?tab=) so deep links + the Overview
  // "review" shortcut land on the right tab.
  const handleTabChange = (value: string) => {
    setTab(value)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('tab', value)
    router.replace(`/transactions?${params.toString()}`, { scroll: false })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    if (deleteId.type === 'income') {
      const ok = await deleteIncome(deleteId.id)
      ok ? toast.success('Income deleted') : toast.error('Could not delete income')
    } else {
      const ok = await deleteExpense(deleteId.id)
      ok ? toast.success('Expense deleted') : toast.error('Could not delete expense')
    }
    setDeleteId(null)
    loadData()
  }

  const reviewCount = expenses.filter(needsReview).length

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Finances</h1>
        <div className="flex gap-1.5">
          <Button asChild variant="outline" size="sm" className="gap-1 h-9">
            <Link href="/add-expense"><Minus className="h-3.5 w-3.5" />Expense</Link>
          </Button>
          <Button asChild size="sm" className="gap-1 h-9">
            <Link href="/add-income"><Plus className="h-3.5 w-3.5" />Income</Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5">
            Review
            {reviewCount > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">{reviewCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab income={income} expenses={expenses} onReviewClick={() => handleTabChange('review')} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-6">
          <TransactionsTab income={income} expenses={expenses} categories={categories} onDelete={setDeleteId} />
        </TabsContent>
        <TabsContent value="review" className="mt-6">
          <ReviewTab expenses={expenses} onRefresh={loadData} />
        </TabsContent>
        <TabsContent value="reports" className="mt-6">
          <ReportsTab expenses={expenses} income={income} />
        </TabsContent>
      </Tabs>

      {!loading && income.length === 0 && expenses.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No transactions yet. Add income or an expense to get started.
        </p>
      )}

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
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading finances...</div>}>
        <FinancesContent />
      </Suspense>
    </AppShell>
  )
}
