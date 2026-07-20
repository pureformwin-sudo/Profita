import { Income, Expense } from './types'

export function exportToCSV(income: Income[], expenses: Expense[], filename: string = 'pureform-export') {
  // Combine and sort all transactions
  const transactions = [
    ...income.map(i => ({
      Date: i.date,
      Type: 'Income',
      Description: i.customerName,
      Category: i.jobType,
      'Payment Method': i.paymentMethod,
      Amount: i.amount,
      Notes: i.notes || '',
    })),
    ...expenses.map(e => ({
      Date: e.date,
      Type: 'Expense',
      Description: e.description,
      Category: e.category,
      'Payment Method': e.paymentMethod,
      Amount: -e.amount,
      Notes: e.notes || '',
    })),
  ].sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())

  if (transactions.length === 0) {
    return false
  }

  // Create CSV content
  const headers = Object.keys(transactions[0])
  const csvContent = [
    headers.join(','),
    ...transactions.map(row => 
      headers.map(header => {
        const value = row[header as keyof typeof row]
        // Escape commas and quotes in values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }).join(',')
    )
  ].join('\n')

  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  return true
}

// Generic CSV exporter for an array of flat objects (keys become headers).
export function exportRowsToCSV(rows: Record<string, string | number>[], filename: string) {
  if (rows.length === 0) return false
  const headers = Object.keys(rows[0])
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header]
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(','),
    ),
  ].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}

const TAX_TREATMENT_LABELS: Record<string, string> = {
  unreviewed: 'Unreviewed',
  likely_deductible: 'Likely deductible',
  not_deductible: 'Not deductible',
  ask_accountant: 'Ask accountant',
}

// Detailed expense-only CSV including the accounting enrichment fields.
export function exportExpensesDetailedCSV(expenses: Expense[], filename: string = 'pureform-expenses') {
  if (expenses.length === 0) return false

  const rows = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((e) => ({
      Date: e.date,
      Type: e.transactionType === 'transfer' ? 'Transfer / CC Payment' : 'Business Expense',
      Description: e.description,
      Vendor: e.vendor || '',
      Category: e.transactionType === 'transfer' ? '' : e.category,
      'Business Purpose': e.businessPurpose || '',
      'Payment Method': e.paymentMethod || '',
      Amount: e.amount,
      'Tax Treatment': TAX_TREATMENT_LABELS[e.taxTreatment || 'unreviewed'] || 'Unreviewed',
      'Tax Note': e.taxNote || '',
      Receipts: (e.attachments?.length || 0) > 0 ? 'Yes' : 'No',
      Notes: e.notes || '',
    }))

  const headers = Object.keys(rows[0])
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof typeof row]
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(','),
    ),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}

export function generateReport(income: Income[], expenses: Expense[]) {
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfit = totalIncome - totalExpenses
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0

  // Group by month
  const monthlyData: Record<string, { income: number; expenses: number }> = {}
  
  income.forEach(i => {
    const month = i.date.substring(0, 7)
    if (!monthlyData[month]) monthlyData[month] = { income: 0, expenses: 0 }
    monthlyData[month].income += i.amount
  })
  
  expenses.forEach(e => {
    const month = e.date.substring(0, 7)
    if (!monthlyData[month]) monthlyData[month] = { income: 0, expenses: 0 }
    monthlyData[month].expenses += e.amount
  })

  // Top customers
  const customerTotals: Record<string, number> = {}
  income.forEach(i => {
    customerTotals[i.customerName] = (customerTotals[i.customerName] || 0) + i.amount
  })
  const topCustomers = Object.entries(customerTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Expense breakdown
  const expenseByCategory: Record<string, number> = {}
  expenses.forEach(e => {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount
  })

  return {
    summary: {
      totalIncome,
      totalExpenses,
      netProfit,
      profitMargin,
      totalTransactions: income.length + expenses.length,
      averageJobValue: income.length > 0 ? totalIncome / income.length : 0,
    },
    monthlyData,
    topCustomers,
    expenseByCategory,
  }
}
