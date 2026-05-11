import { Income, Expense } from './types'

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(dateString: string): string {
  // Parse date as local date, not UTC
  const [year, month, day] = dateString.split('-')
  if (year && month && day) {
    // If it's YYYY-MM-DD format, parse as local date
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  // Fallback for other formats
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function calculateStats(income: Income[], expenses: Expense[]) {
  const totalRevenue = income.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0)
  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // Helper to parse date string as local date
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  }

  // Weekly stats
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weeklyRevenue = income
    .filter(i => parseLocalDate(i.date) >= oneWeekAgo)
    .reduce((sum, item) => sum + item.amount, 0)

  // Monthly stats
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const monthlyRevenue = income
    .filter(i => parseLocalDate(i.date) >= oneMonthAgo)
    .reduce((sum, item) => sum + item.amount, 0)

  // Top expense category
  const expensesByCategory = expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount
    return acc
  }, {} as Record<string, number>)

  const topExpenseCategory = Object.entries(expensesByCategory).sort(
    ([, a], [, b]) => b - a
  )[0]

  // Best day
  const incomeByDay = income.reduce((acc, item) => {
    acc[item.date] = (acc[item.date] || 0) + item.amount
    return acc
  }, {} as Record<string, number>)

  const bestDay = Object.entries(incomeByDay).sort(([, a], [, b]) => b - a)[0]

  // Average job value
  const averageJobValue = income.length > 0 ? totalRevenue / income.length : 0

  // Total jobs
  const totalJobs = income.length

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    weeklyRevenue,
    monthlyRevenue,
    topExpenseCategory: topExpenseCategory ? topExpenseCategory[0] : 'None',
    topExpenseCategoryAmount: topExpenseCategory ? topExpenseCategory[1] : 0,
    bestDay: bestDay ? { date: bestDay[0], amount: bestDay[1] } : null,
    averageJobValue,
    totalJobs,
  }
}
