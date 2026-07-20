'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  addExpense,
  updateExpense,
  getExpenses,
  getExpenseCategories,
  addExpenseCategory,
  getCustomers,
  getJobs,
} from '@/lib/storage'
import {
  PaymentMethod,
  TransactionType,
  TaxTreatment,
  ExpenseAttachment,
  Customer,
  Job,
} from '@/lib/types'
import { ReceiptUploader } from '@/components/expenses/receipt-uploader'
import { toast } from 'sonner'
import {
  ArrowLeft, DollarSign, Tag, CreditCard, FileText, Calendar, ShoppingBag,
  Store, Briefcase, Landmark, Repeat, Plus, Loader2,
} from 'lucide-react'
import Link from 'next/link'

const paymentMethods: PaymentMethod[] = ['Cash', 'Card', 'Check', 'Zelle', 'Venmo', 'Other']

const TAX_TREATMENTS: { value: TaxTreatment; label: string }[] = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'likely_deductible', label: 'Likely deductible' },
  { value: 'not_deductible', label: 'Not deductible' },
  { value: 'ask_accountant', label: 'Ask accountant' },
]

const ADD_NEW_CATEGORY = '__add_new__'

function AddExpenseForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const isEditing = !!editId

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Fuel',
    description: '',
    paymentMethod: 'Cash' as PaymentMethod,
    notes: '',
    vendor: '',
    businessPurpose: '',
    transactionType: 'business_expense' as TransactionType,
    taxTreatment: 'unreviewed' as TaxTreatment,
    taxNote: '',
    jobId: 'none',
    customerId: 'none',
    recurrence: 'none' as 'none' | 'weekly' | 'monthly',
  })
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [cats, custs, jbs] = await Promise.all([getExpenseCategories(), getCustomers(), getJobs()])
      if (!active) return
      setCategories(cats)
      setCustomers(custs)
      setJobs(jbs)

      if (editId) {
        const all = await getExpenses()
        const existing = all.find((e) => e.id === editId)
        if (existing) {
          setFormData({
            amount: String(existing.amount),
            date: existing.date,
            category: existing.category || 'Other',
            description: existing.description,
            paymentMethod: existing.paymentMethod || 'Cash',
            notes: existing.notes || '',
            vendor: existing.vendor || '',
            businessPurpose: existing.businessPurpose || '',
            transactionType: existing.transactionType || 'business_expense',
            taxTreatment: existing.taxTreatment || 'unreviewed',
            taxNote: existing.taxNote || '',
            jobId: existing.jobId || 'none',
            customerId: existing.customerId || 'none',
            recurrence: existing.recurrence || 'none',
          })
          setAttachments(existing.attachments || [])
        } else {
          toast.error('Expense not found')
        }
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [editId])

  const isTransfer = formData.transactionType === 'transfer'

  // Jobs relevant to the selected customer (or all if none selected), newest first.
  const relevantJobs = useMemo(() => {
    const list = formData.customerId !== 'none'
      ? jobs.filter((j) => j.customerId === formData.customerId)
      : jobs
    return [...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100)
  }, [jobs, formData.customerId])

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name || 'Unknown'

  const handleCategoryChange = (value: string) => {
    if (value === ADD_NEW_CATEGORY) {
      setAddingCategory(true)
      return
    }
    setFormData((prev) => ({ ...prev, category: value }))
  }

  const confirmNewCategory = async () => {
    const name = newCategory.trim()
    if (!name) {
      setAddingCategory(false)
      return
    }
    const ok = await addExpenseCategory(name)
    if (ok) {
      setCategories((prev) => (prev.some((c) => c.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]))
      setFormData((prev) => ({ ...prev, category: name }))
      toast.success(`Added category "${name}"`)
    } else {
      toast.error('Could not add category')
    }
    setNewCategory('')
    setAddingCategory(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.amount || !formData.description) {
      toast.error('Please enter an amount and description')
      return
    }
    setIsSubmitting(true)

    const payload = {
      amount: parseFloat(formData.amount),
      date: formData.date,
      category: formData.category,
      description: formData.description,
      paymentMethod: formData.paymentMethod,
      recurrence: formData.recurrence,
      notes: formData.notes,
      vendor: formData.vendor.trim() || null,
      businessPurpose: formData.businessPurpose.trim() || null,
      transactionType: formData.transactionType,
      // Transfers are never a tax-deductible business expense.
      taxTreatment: isTransfer ? ('not_deductible' as TaxTreatment) : formData.taxTreatment,
      taxNote: formData.taxNote.trim() || null,
      jobId: formData.jobId !== 'none' ? formData.jobId : null,
      customerId: formData.customerId !== 'none' ? formData.customerId : null,
      attachments,
    }

    const result = isEditing ? await updateExpense(editId!, payload) : await addExpense(payload)

    if (result) {
      toast.success(isEditing ? 'Expense updated' : 'Expense added successfully!')
      router.push(isEditing ? '/transactions' : '/')
    } else {
      toast.error(isEditing ? 'Failed to update expense' : 'Failed to add expense')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto p-4 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto space-y-6 p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => router.push(isEditing ? '/transactions' : '/')}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {isEditing ? 'Edit Transaction' : 'Add Expense'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isTransfer ? 'Record a transfer or bill payment' : 'Record a business expense'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction type toggle */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                Transaction type
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, transactionType: 'business_expense' })}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                    !isTransfer ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Briefcase className="h-4 w-4 shrink-0" />
                  Business expense
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, transactionType: 'transfer' })}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                    isTransfer ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Landmark className="h-4 w-4 shrink-0" />
                  Transfer / CC payment
                </button>
              </div>
              {isTransfer && (
                <p className="text-xs text-muted-foreground">
                  Transfers and credit-card bill payments are recorded but excluded from expense totals so money
                  isn&apos;t counted twice.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Amount Card - Prominent */}
          <Card className={isTransfer ? 'border-border' : 'border-destructive/20 bg-destructive/5'}>
            <CardContent className="p-4">
              <Label htmlFor="amount" className="text-sm font-medium text-muted-foreground mb-2 block">
                Amount
              </Label>
              <div className="relative">
                <DollarSign className={`absolute left-3 top-1/2 -translate-y-1/2 h-6 w-6 ${isTransfer ? 'text-muted-foreground' : 'text-destructive'}`} />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="pl-12 h-14 text-2xl font-bold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Core details */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  Description
                </Label>
                <Input
                  id="description"
                  placeholder={isTransfer ? 'e.g. Chase card payment' : 'What did you spend on?'}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor" className="text-sm font-medium flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  Vendor / paid to
                </Label>
                <Input
                  id="vendor"
                  placeholder="e.g. Home Depot"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="h-12"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Category (hidden for transfers) */}
                {!isTransfer && (
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-sm font-medium flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      Category
                    </Label>
                    {addingCategory ? (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={newCategory}
                          placeholder="New category"
                          onChange={(e) => setNewCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              e.preventDefault()
                              confirmNewCategory()
                            }
                          }}
                          className="h-12"
                        />
                        <Button type="button" size="icon" className="h-12 w-12 shrink-0" onClick={confirmNewCategory}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select value={formData.category} onValueChange={handleCategoryChange}>
                        <SelectTrigger id="category" className="h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                          <SelectItem value={ADD_NEW_CATEGORY} className="text-primary">
                            + Add category
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod" className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Payment
                  </Label>
                  <Select
                    value={formData.paymentMethod}
                    onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}
                  >
                    <SelectTrigger id="paymentMethod" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business substantiation (expenses only) */}
          {!isTransfer && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessPurpose" className="text-sm font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Business purpose
                  </Label>
                  <Input
                    id="businessPurpose"
                    placeholder="Why was this a business cost?"
                    value={formData.businessPurpose}
                    onChange={(e) => setFormData({ ...formData, businessPurpose: e.target.value })}
                    className="h-12"
                  />
                </div>

                {/* Linked customer / job */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Customer (optional)</Label>
                    <Select
                      value={formData.customerId}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          customerId: value,
                          // Reset job link if it no longer matches the customer.
                          jobId:
                            value !== 'none' && prev.jobId !== 'none' &&
                            jobs.find((j) => j.id === prev.jobId)?.customerId !== value
                              ? 'none'
                              : prev.jobId,
                        }))
                      }
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Job (optional)</Label>
                    <Select
                      value={formData.jobId}
                      onValueChange={(value) => setFormData({ ...formData, jobId: value })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {relevantJobs.map((j) => (
                          <SelectItem key={j.id} value={j.id}>
                            {new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' · '}
                            {customerName(j.customerId)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tax treatment (manual only) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                      Tax treatment
                    </Label>
                    <Select
                      value={formData.taxTreatment}
                      onValueChange={(value) => setFormData({ ...formData, taxTreatment: value as TaxTreatment })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_TREATMENTS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxNote" className="text-sm font-medium">Tax note</Label>
                    <Input
                      id="taxNote"
                      placeholder="Optional"
                      value={formData.taxNote}
                      onChange={(e) => setFormData({ ...formData, taxNote: e.target.value })}
                      className="h-12"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nothing is marked deductible automatically. Confirm tax treatment with your accountant.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Receipts */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Receipts & documents
              </Label>
              <ReceiptUploader value={attachments} onChange={setAttachments} disabled={isSubmitting} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Notes (optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 h-12 text-base font-semibold" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Expense'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => router.push(isEditing ? '/transactions' : '/')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

export default function AddExpensePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="max-w-lg mx-auto p-4 flex items-center justify-center min-h-[50vh]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </AppShell>
      }
    >
      <AddExpenseForm />
    </Suspense>
  )
}
