'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addExpense } from '@/lib/storage'
import { ExpenseCategory, PaymentMethod } from '@/lib/types'
import { toast } from 'sonner'
import { ArrowLeft, DollarSign, Tag, CreditCard, FileText, Calendar, ShoppingBag } from 'lucide-react'
import Link from 'next/link'

const expenseCategories: ExpenseCategory[] = ['Fuel', 'Equipment', 'Supplies', 'Marketing', 'Software', 'Other']
const paymentMethods: PaymentMethod[] = ['Cash', 'Card', 'Check', 'Zelle', 'Other']

export default function AddExpensePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Fuel' as ExpenseCategory,
    description: '',
    paymentMethod: 'Cash' as PaymentMethod,
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    if (!formData.amount || !formData.description) {
      toast.error('Please fill in all required fields')
      setIsSubmitting(false)
      return
    }

    const result = await addExpense({
      amount: parseFloat(formData.amount),
      date: formData.date,
      category: formData.category,
      description: formData.description,
      paymentMethod: formData.paymentMethod,
      notes: formData.notes,
    })

    if (result) {
      toast.success('Expense added successfully!')
      router.push('/')
    } else {
      toast.error('Failed to add expense')
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto space-y-6 p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-4 animate-fade-in">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 hover-scale">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Add Expense</h1>
            <p className="text-sm text-muted-foreground">Record a business expense</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Card - Prominent */}
          <Card className="border-destructive/20 bg-destructive/5 animate-fade-in-up">
            <CardContent className="p-4">
              <Label htmlFor="amount" className="text-sm font-medium text-muted-foreground mb-2 block">
                Amount
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-6 w-6 text-destructive" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="pl-12 h-14 text-2xl font-bold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="animate-fade-in-up delay-100">
            <CardContent className="p-4 space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  Description
                </Label>
                <Input
                  id="description"
                  placeholder="What did you spend on?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              {/* Date */}
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

              {/* Category & Payment Method - Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    Category
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value as ExpenseCategory })}
                  >
                    <SelectTrigger id="category" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

              {/* Notes */}
              <div className="space-y-2">
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
              </div>
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2 animate-fade-in-up delay-200">
            <Button 
              type="submit" 
              className="flex-1 h-12 text-base font-semibold hover-scale"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Expense'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 hover-scale"
              onClick={() => router.push('/')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
