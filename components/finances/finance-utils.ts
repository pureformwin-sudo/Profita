import type { Expense, TaxTreatment } from '@/lib/types'

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  unreviewed: 'Unreviewed',
  likely_deductible: 'Likely deductible',
  not_deductible: 'Not deductible',
  ask_accountant: 'Ask accountant',
}

// Ordered options for tax-treatment selectors.
export const TAX_TREATMENT_OPTIONS: { value: TaxTreatment }[] = [
  { value: 'unreviewed' },
  { value: 'likely_deductible' },
  { value: 'not_deductible' },
  { value: 'ask_accountant' },
]

export function isTransfer(e: Expense): boolean {
  return e.transactionType === 'transfer'
}

// An expense that counts toward business expense totals (i.e. not a transfer).
export function isCountableExpense(e: Expense): boolean {
  return !isTransfer(e)
}

// Real business expenses only (transfers / CC-bill payments excluded so money
// isn't double-counted).
export function realExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !isTransfer(e))
}

export function sum(list: { amount: number }[]): number {
  return list.reduce((s, x) => s + (Number(x.amount) || 0), 0)
}

// Reasons an expense needs cleanup in the Review tab.
export interface ReviewFlags {
  missingVendor: boolean
  missingPurpose: boolean
  unreviewedTax: boolean
  missingReceipt: boolean
  uncategorized: boolean
}

export function reviewFlags(e: Expense): ReviewFlags {
  return {
    missingVendor: !e.vendor || e.vendor.trim() === '',
    missingPurpose: !e.businessPurpose || e.businessPurpose.trim() === '',
    unreviewedTax: (e.taxTreatment || 'unreviewed') === 'unreviewed',
    missingReceipt: (e.attachments?.length || 0) === 0,
    uncategorized: !e.category || e.category.trim() === '' || e.category.toLowerCase() === 'other',
  }
}

// Transfers don't need business substantiation; only real expenses are reviewed.
export function needsReview(e: Expense): boolean {
  if (isTransfer(e)) return false
  const f = reviewFlags(e)
  return f.missingVendor || f.missingPurpose || f.unreviewedTax || f.missingReceipt || f.uncategorized
}

export function categoryBreakdown(expenses: Expense[]): { category: string; total: number }[] {
  const map: Record<string, number> = {}
  realExpenses(expenses).forEach((e) => {
    const key = e.category || 'Uncategorized'
    map[key] = (map[key] || 0) + (Number(e.amount) || 0)
  })
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}
