'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { getIncome, getExpenses, getJobs, getCustomers, getSettings, getInvoices } from '@/lib/storage'
import { Income, Expense, Job, Customer, Settings, Invoice } from '@/lib/types'
import { formatCurrency } from '@/lib/utils-finance'
import { 
  TrendingUp, TrendingDown, Target, Crown, Sparkles, Briefcase,
  ArrowUpRight, ArrowDownRight, Calendar, DollarSign, CheckCircle2
} from 'lucide-react'

type TimePeriod = 'week' | 'month' | 'year'

export default function AnalyticsPage() {
  const [income, setIncome] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<TimePeriod>('month')

  useEffect(() => {
    const loadData = async () => {
      const [incomeData, expenseData, jobsData, customersData, invoicesData, settingsData] = await Promise.all([
        getIncome(),
        getExpenses(),
        getJobs(),
        getCustomers(),
        getInvoices(),
        getSettings(),
      ])
      setIncome(incomeData)
      setExpenses(expenseData)
      setJobs(jobsData)
      setCustomers(customersData)
      setInvoices(invoicesData)
      setSettings(settingsData)
      setIsLoading(false)
    }
    loadData()
  }, [])

  // Filter data by time period
  const filterByPeriod = <T extends { date: string }>(data: T[]): T[] => {
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      default:
        return data
    }

    return data.filter(item => new Date(item.date) >= startDate)
  }

  // Calculate all metrics
  const metrics = useMemo(() => {
    const filteredIncome = filterByPeriod(income)
    const filteredExpenses = filterByPeriod(expenses)
    const filteredJobs = filterByPeriod(jobs)

    const totalRevenue = filteredIncome.reduce((sum, i) => sum + i.amount, 0)
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
    const profit = totalRevenue - totalExpenses
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    const completedJobs = filteredJobs.filter(j => j.status === 'Completed' || j.status === 'Paid').length
    const scheduledJobs = filteredJobs.filter(j => j.status === 'Scheduled').length
    const avgJobValue = completedJobs > 0 ? totalRevenue / completedJobs : 0

    // Previous period comparison
    const now = new Date()
    let prevStartDate: Date
    let prevEndDate: Date

    switch (period) {
      case 'week':
        prevEndDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0)
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        break
      default:
        prevStartDate = new Date(0)
        prevEndDate = new Date(0)
    }

    const prevIncome = income.filter(i => {
      const d = new Date(i.date)
      return d >= prevStartDate && d <= prevEndDate
    })
    const prevRevenue = prevIncome.reduce((sum, i) => sum + i.amount, 0)
    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0

    // Unpaid invoices
    const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
    const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
    const overdueCount = invoices.filter(i => i.status === 'overdue').length

    return { totalRevenue, totalExpenses, profit, profitMargin, completedJobs, scheduledJobs, avgJobValue, revenueChange, unpaidTotal, unpaidInvoices: unpaidInvoices.length, overdueCount }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, expenses, jobs, invoices, period])

  // Weekly goal progress
  const weeklyGoal = settings?.profile?.weeklyGoal || 1500
  const thisWeekRevenue = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    return income
      .filter(i => new Date(i.date) >= weekStart)
      .reduce((sum, i) => sum + i.amount, 0)
  }, [income])
  const goalProgress = Math.min((thisWeekRevenue / weeklyGoal) * 100, 100)

  // Revenue chart data - daily for week/month, monthly for year
  const chartData = useMemo(() => {
    const filteredIncome = filterByPeriod(income)
    const dataMap: Record<string, number> = {}
    
    // Create date labels based on period
    const now = new Date()
    const labels: string[] = []
    
    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
      }
    } else if (period === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        labels.push(i.toString())
      }
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      for (let i = 0; i <= now.getMonth(); i++) {
        labels.push(months[i])
      }
    }
    
    // Initialize all labels to 0
    labels.forEach(l => { dataMap[l] = 0 })
    
    // Fill in actual data
    filteredIncome.forEach(i => {
      const d = new Date(i.date)
      let key: string
      if (period === 'week') {
        key = d.toLocaleDateString('en-US', { weekday: 'short' })
      } else if (period === 'month') {
        key = d.getDate().toString()
      } else {
        key = d.toLocaleDateString('en-US', { month: 'short' })
      }
      if (dataMap[key] !== undefined) {
        dataMap[key] += i.amount
      }
    })

    return labels.map(label => ({ label, value: dataMap[label] || 0 }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, period])

  // Max value for chart scaling
  const maxChartValue = Math.max(...chartData.map(d => d.value), 1)

  // Job type breakdown
  const jobTypeData = useMemo(() => {
    const filteredJobs = filterByPeriod(jobs).filter(j => 
      j.status === 'Completed' || j.status === 'Paid'
    )
    const typeMap: Record<string, number> = {}
    
    filteredJobs.forEach(j => {
      const type = j.jobType || 'Other'
      typeMap[type] = (typeMap[type] || 0) + j.price
    })

    const total = Object.values(typeMap).reduce((a, b) => a + b, 0)
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
    
    return Object.entries(typeMap)
      .map(([type, amount], i) => ({ 
        type, 
        amount, 
        color: colors[i % colors.length],
        percent: total > 0 ? (amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, period])

  // Top customers
  const topCustomers = useMemo(() => {
    const customerRevenue: Record<string, { name: string; revenue: number; jobs: number }> = {}
    
    jobs.forEach(job => {
      if (job.status === 'Completed' || job.status === 'Paid') {
        const customer = customers.find(c => c.id === job.customerId)
        if (customer) {
          if (!customerRevenue[customer.id]) {
            customerRevenue[customer.id] = { name: customer.name, revenue: 0, jobs: 0 }
          }
          customerRevenue[customer.id].revenue += job.price
          customerRevenue[customer.id].jobs += 1
        }
      }
    })

    return Object.values(customerRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }, [jobs, customers])

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Business performance
              <span className="mx-2 text-border">|</span>
              {period === 'week' ? 'Last 7 days' : period === 'month' ? 'This month' : 'Year to date'}
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {(['week', 'month', 'year'] as TimePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics - Clean inline style */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
            {/* Revenue */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</span>
                {metrics.revenueChange !== 0 && (
                  <span className={`flex items-center text-xs font-medium ${
                    metrics.revenueChange > 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {metrics.revenueChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(metrics.revenueChange).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-semibold">{formatCurrency(metrics.totalRevenue)}</p>
            </div>

            {/* Profit */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Profit</span>
                <span className="text-xs font-medium text-muted-foreground">{metrics.profitMargin.toFixed(0)}% margin</span>
              </div>
              <p className={`text-2xl font-semibold ${metrics.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(metrics.profit)}
              </p>
            </div>

            {/* Jobs */}
            <div className="p-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Jobs Completed</span>
              <p className="text-2xl font-semibold mt-1">{metrics.completedJobs}</p>
            </div>

            {/* Avg Value */}
            <div className="p-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Job Value</span>
              <p className="text-2xl font-semibold mt-1">{formatCurrency(metrics.avgJobValue)}</p>
            </div>
          </div>
        </div>

        {/* Weekly Goal - Compact */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Weekly Goal</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(thisWeekRevenue)} / {formatCurrency(weeklyGoal)}
              </span>
            </div>
            <span className={`text-sm font-semibold ${goalProgress >= 100 ? 'text-emerald-500' : ''}`}>
              {goalProgress.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                goalProgress >= 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(goalProgress, 100)}%` }}
            />
          </div>
          {goalProgress >= 100 && (
            <p className="text-xs text-emerald-500 font-medium mt-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Goal achieved! +{formatCurrency(thisWeekRevenue - weeklyGoal)} over target
            </p>
          )}
        </div>

        {/* Revenue Chart */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Revenue Trend</h2>
            <span className="text-xs text-muted-foreground">
              {period === 'week' ? 'Daily' : period === 'month' ? 'Daily' : 'Monthly'}
            </span>
          </div>
          
          {/* Bar Chart */}
          <div className="h-40 flex items-end gap-0.5">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full rounded-sm bg-primary/70 hover:bg-primary transition-colors"
                  style={{ 
                    height: `${Math.max((d.value / maxChartValue) * 100, 2)}%`,
                  }}
                  title={`${d.label}: ${formatCurrency(d.value)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-0.5 mt-2 border-t border-border pt-2">
            {chartData.map((d, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[9px] text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Two Column: Services & Top Customers */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Revenue by Service */}
          <div className="border border-border rounded-lg bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-medium">Revenue by Service</h2>
            </div>
            {jobTypeData.length > 0 ? (
              <div className="p-4 space-y-3">
                {jobTypeData.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div 
                      className="h-2 w-2 rounded-full shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm flex-1 truncate">{item.type}</span>
                    <span className="text-sm text-muted-foreground">{item.percent.toFixed(0)}%</span>
                    <span className="text-sm font-medium w-20 text-right">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No completed jobs this period
              </div>
            )}
          </div>

          {/* Top Customers */}
          <div className="border border-border rounded-lg bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-medium">Top Customers</h2>
            </div>
            {topCustomers.length > 0 ? (
              <div className="divide-y divide-border">
                {topCustomers.map((customer, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className={`text-xs font-bold w-5 text-center ${
                      i === 0 ? 'text-amber-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium">{customer.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.jobs} job{customer.jobs !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-500">{formatCurrency(customer.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No customer data yet
              </div>
            )}
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border">
            <div className="p-4 text-center">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming Jobs</span>
              <p className="text-xl font-semibold mt-1">{metrics.scheduledJobs}</p>
            </div>
            <div className="p-4 text-center">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expenses</span>
              <p className="text-xl font-semibold mt-1 text-red-500">{formatCurrency(metrics.totalExpenses)}</p>
            </div>
            <div className="p-4 text-center">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unpaid Invoices</span>
              <p className="text-xl font-semibold mt-1 text-amber-500">{formatCurrency(metrics.unpaidTotal)}</p>
              <p className="text-xs text-muted-foreground">{metrics.unpaidInvoices} invoice{metrics.unpaidInvoices !== 1 ? 's' : ''}{metrics.overdueCount > 0 ? ` (${metrics.overdueCount} overdue)` : ''}</p>
            </div>
            <div className="p-4 text-center">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customers</span>
              <p className="text-xl font-semibold mt-1">{customers.length}</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
