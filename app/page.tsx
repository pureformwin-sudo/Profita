'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getIncome, getExpenses, getPendingIncome, getUpcomingExpenses, getCustomers, getJobs, getEmployees, getInvoices, getEstimates, markPendingIncomeReceived, markUpcomingExpensePaid, addPendingIncome, addUpcomingExpense, transferMoney, getMoneyLocations, updateMoneyLocations, MoneyLocations, getMoneyMonths, getCurrentMonthKey, formatMonthDisplay } from '@/lib/storage'
import { Income, Expense, PendingIncome, UpcomingExpense, Customer, Job, Employee, Estimate } from '@/lib/types'
import { formatDate } from '@/lib/utils-finance'
import { InsightsPanel } from '@/components/ai/insights-panel'
import { AskAIInlineButton } from '@/components/ai/ask-ai-floating'
import { generateOverviewInsights } from '@/lib/ai/insights'
import type { Invoice as GlobalInvoice } from '@/lib/types'
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  Briefcase,
  Users,
  FileText,
  Clock,
  ChevronRight,
  Wallet,
  CreditCard,
  AlertCircle,
  Calendar,
  Receipt,
  Banknote,
  Building2,
  Smartphone,
  CheckCircle2,
  Play,
  RefreshCw,
  DollarSign,
  PiggyBank,
  MapPin,
  Phone,
  ExternalLink,
  Plus,
  Check,
  X,
  MoreVertical,
  ArrowRightLeft
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Invoice {
  id: string
  customerId: string
  invoiceNumber: string
  status: string
  total: number
  amountPaid?: number
  dueDate: string
  issueDate: string
}

function StatCard({ 
  label, 
  value, 
  subValue,
  trend, 
  trendValue, 
  icon: Icon, 
  variant = 'default',
  onClick
}: { 
  label: string
  value: string
  subValue?: string
  trend?: 'up' | 'down'
  trendValue?: string
  icon: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'success' | 'destructive' | 'warning'
  onClick?: () => void
}) {
  const variantStyles = {
    default: 'from-primary/10 to-primary/5 border-primary/20',
    success: 'from-green-500/10 to-green-500/5 border-green-500/20',
    destructive: 'from-red-500/10 to-red-500/5 border-red-500/20',
    warning: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
  }
  
  const iconStyles = {
    default: 'bg-primary/20 text-primary',
    success: 'bg-green-500/20 text-green-500',
    destructive: 'bg-red-500/20 text-red-500',
    warning: 'bg-amber-500/20 text-amber-500',
  }

  return (
    <div 
      className={cn(
        'relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 transition-all',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02]'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
          {trend && trendValue && (
            <div className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              trend === 'up' ? 'text-green-500' : 'text-red-500'
            )}>
              {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div className={cn('rounded-lg p-2', iconStyles[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [income, setIncome] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [pendingIncome, setPendingIncome] = useState<PendingIncome[]>([])
  const [upcomingExpenses, setUpcomingExpenses] = useState<UpcomingExpense[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<(Job & { job_workers?: { employee_id: string }[] })[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [moneyLocations, setMoneyLocations] = useState<MoneyLocations>({ cash: 0, digital: 0, checks: 0, card: 0 })
  const [selectedMoneyMonth, setSelectedMoneyMonth] = useState<string>(getCurrentMonthKey())
  const [availableMonths, setAvailableMonths] = useState<string[]>([getCurrentMonthKey()])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  // Reload money when month changes
  useEffect(() => {
    async function loadMonthMoney() {
      const moneyData = await getMoneyLocations(selectedMoneyMonth)
      setMoneyLocations(moneyData)
    }
    loadMonthMoney()
  }, [selectedMoneyMonth])

  async function loadData() {
    setIsLoading(true)
    const currentMonth = getCurrentMonthKey()
    const [incomeData, expenseData, pendingData, upcomingData, customersData, jobsData, employeesData, invoicesData, estimatesData, moneyData, monthsData] = await Promise.all([
      getIncome(),
      getExpenses(),
      getPendingIncome(),
      getUpcomingExpenses(),
      getCustomers(),
      getJobs(),
      getEmployees(),
      getInvoices(),
      getEstimates(),
      getMoneyLocations(currentMonth),
      getMoneyMonths(),
    ])
    
    setIncome(incomeData)
    setExpenses(expenseData)
    setPendingIncome(pendingData)
    setUpcomingExpenses(upcomingData)
    setCustomers(customersData)
    setJobs(jobsData)
    setEmployees(employeesData)
    setInvoices(invoicesData as Invoice[])
    setEstimates(estimatesData)
    setMoneyLocations(moneyData)
    setAvailableMonths(monthsData)
    setSelectedMoneyMonth(currentMonth)
    setIsLoading(false)
  }

  // Money locations - personal tracker (separate from income tracking)
  const cashIncome = moneyLocations.cash
  const bankIncome = moneyLocations.digital
  const checkIncome = moneyLocations.checks
  const cardIncome = moneyLocations.card
  
  // Calculate totals
  const totalIncome = income.reduce((sum, item) => sum + item.amount, 0)
  const totalExpensesAmount = expenses.reduce((sum, item) => sum + item.amount, 0)
  const netProfit = totalIncome - totalExpensesAmount
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(0) : '0'
  
  const totalPendingIncome = pendingIncome.reduce((sum, p) => sum + p.amount, 0)
  const totalUpcomingExpenses = upcomingExpenses.reduce((sum, u) => sum + u.amount, 0)

  // Who owes you - unpaid invoices
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
  const totalOwed = unpaidInvoices.reduce((sum, i) => sum + (i.total - (i.amountPaid || 0)), 0)

  // Today's stats
  const todayStr = new Date().toISOString().split('T')[0]
  const todayJobs = jobs.filter(j => j.date === todayStr)
  const todayScheduled = todayJobs.filter(j => j.status === 'Scheduled')
  const todayInProgress = todayJobs.filter(j => j.status === 'in_progress')
  const todayCompleted = todayJobs.filter(j => j.status === 'Completed' || j.status === 'Paid')
  const todayRevenue = todayCompleted.reduce((sum, j) => sum + j.price, 0)
  const todayPotential = todayScheduled.reduce((sum, j) => sum + j.price, 0)

  // This month stats
  const now = new Date()
  const thisMonthIncome = income
    .filter(i => {
      const d = new Date(i.date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, i) => sum + i.amount, 0)

  const lastMonthIncome = income
    .filter(i => {
      const d = new Date(i.date)
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
      const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      return d.getMonth() === lastMonth && d.getFullYear() === year
    })
    .reduce((sum, i) => sum + i.amount, 0)

  const monthTrend = lastMonthIncome > 0 ? (((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100).toFixed(0) : '0'

  // Workers
  const workers = employees.filter(e => (e as Employee & { role?: string }).role !== 'sales_rep')

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="relative h-12 w-12 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">Loading your dashboard...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <AskAIInlineButton />
            <Button variant="outline" size="sm" asChild>
              <Link href="/analytics">
                <TrendingUp className="h-4 w-4 mr-2" />
                Reports
              </Link>
            </Button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Net Profit"
            value={`$${netProfit.toLocaleString()}`}
            subValue={`${profitMargin}% margin`}
            icon={TrendingUp}
            variant={netProfit >= 0 ? 'success' : 'destructive'}
          />
          <StatCard
            label="This Month"
            value={`$${thisMonthIncome.toLocaleString()}`}
            trend={Number(monthTrend) >= 0 ? 'up' : 'down'}
            trendValue={`${Math.abs(Number(monthTrend))}% vs last month`}
            icon={Calendar}
            variant="default"
          />
          <StatCard
            label="People Owe You"
            value={`$${totalOwed.toLocaleString()}`}
            subValue={`${unpaidInvoices.length} unpaid invoices`}
            icon={AlertCircle}
            variant={totalOwed > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Expenses"
            value={`$${totalExpensesAmount.toLocaleString()}`}
            subValue={`${expenses.length} transactions`}
            icon={CreditCard}
            variant="destructive"
          />
        </div>

        {/* AI Insights Widget */}
        <InsightsPanel
          insights={generateOverviewInsights({
            customers,
            jobs,
            invoices: invoices as unknown as GlobalInvoice[],
            income,
            expenses,
            pendingIncome,
          })}
          title="AI Insights"
          subtitle="Personalized for your business right now"
        />

        {/* Money Location Section */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-primary shrink-0" />
                <span className="font-semibold">Where Your Money Is</span>
              </div>
              {/* Month Selector */}
              <Select value={selectedMoneyMonth} onValueChange={setSelectedMoneyMonth}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthDisplay(month)}
                      {month === getCurrentMonthKey() && ' (Current)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm font-medium text-foreground">Total: ${(cashIncome + bankIncome + checkIncome + cardIncome).toLocaleString()}</span>
              {/* Transfer Dialog - only for current month */}
              {selectedMoneyMonth === getCurrentMonthKey() && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Transfer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Transfer Money</DialogTitle>
                      <DialogDescription>Move money between locations (doesn&apos;t affect income tracking)</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                      e.preventDefault()
                      const form = e.target as HTMLFormElement
                      const formData = new FormData(form)
                      const from = formData.get('from') as 'cash' | 'digital' | 'checks' | 'card'
                      const to = formData.get('to') as 'cash' | 'digital' | 'checks' | 'card'
                      const amount = parseFloat(formData.get('amount') as string)
                      
                      if (from === to) {
                        toast.error('Cannot transfer to the same location')
                        return
                      }
                      
                      const success = await transferMoney(from, to, amount)
                      if (success) {
                        toast.success(`Moved $${amount.toFixed(2)} from ${from} to ${to}`)
                        loadData()
                        form.reset()
                      } else {
                        toast.error('Failed to transfer')
                      }
                    }} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>From</Label>
                          <Select name="from" defaultValue="checks">
                            <SelectTrigger>
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash (${cashIncome.toLocaleString()})</SelectItem>
                              <SelectItem value="checks">Checks (${checkIncome.toLocaleString()})</SelectItem>
                              <SelectItem value="digital">Digital (${bankIncome.toLocaleString()})</SelectItem>
                              <SelectItem value="card">Card (${cardIncome.toLocaleString()})</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>To</Label>
                          <Select name="to" defaultValue="cash">
                            <SelectTrigger>
                              <SelectValue placeholder="Select destination" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="checks">Checks</SelectItem>
                              <SelectItem value="digital">Digital</SelectItem>
                              <SelectItem value="card">Card/Bank</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input name="amount" type="number" step="0.01" placeholder="0.00" required />
                      </div>
                      <DialogFooter>
                        <Button type="submit" className="gap-2">
                          <ArrowRightLeft className="h-4 w-4" />
                          Transfer
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              {/* Edit Balances Dialog */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Money Balances - {formatMonthDisplay(selectedMoneyMonth)}</DialogTitle>
                    <DialogDescription>
                      {selectedMoneyMonth === getCurrentMonthKey() 
                        ? "Set where your money is at right now" 
                        : `Editing historical data for ${formatMonthDisplay(selectedMoneyMonth)}`}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={async (e) => {
                    e.preventDefault()
                    const form = e.target as HTMLFormElement
                    const formData = new FormData(form)
                    const newLocations: MoneyLocations = {
                      cash: parseFloat(formData.get('cash') as string) || 0,
                      digital: parseFloat(formData.get('digital') as string) || 0,
                      checks: parseFloat(formData.get('checks') as string) || 0,
                      card: parseFloat(formData.get('card') as string) || 0,
                    }
                    
                    const success = await updateMoneyLocations(newLocations, selectedMoneyMonth)
                    if (success) {
                      toast.success(`Balances updated for ${formatMonthDisplay(selectedMoneyMonth)}`)
                      // Refresh the month data
                      const updatedMoney = await getMoneyLocations(selectedMoneyMonth)
                      setMoneyLocations(updatedMoney)
                      const months = await getMoneyMonths()
                      setAvailableMonths(months)
                    } else {
                      toast.error('Failed to update')
                    }
                  }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-green-500" />
                          Cash
                        </Label>
                        <Input name="cash" type="number" step="0.01" defaultValue={cashIncome} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-blue-500" />
                          Digital
                        </Label>
                        <Input name="digital" type="number" step="0.01" defaultValue={bankIncome} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-amber-500" />
                          Checks
                        </Label>
                        <Input name="checks" type="number" step="0.01" defaultValue={checkIncome} />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-purple-500" />
                          Card/Bank
                        </Label>
                        <Input name="card" type="number" step="0.01" defaultValue={cardIncome} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit">Save Balances</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
            <div className="p-4 text-center hover:bg-secondary/30 transition-colors cursor-pointer group">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Banknote className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Cash</span>
              </div>
              <p className="text-2xl font-bold text-green-500">${cashIncome.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">On hand</p>
            </div>
            <div className="p-4 text-center hover:bg-secondary/30 transition-colors cursor-pointer group">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Digital</span>
              </div>
              <p className="text-2xl font-bold text-blue-500">${bankIncome.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Venmo, Zelle, CashApp</p>
            </div>
            <div className="p-4 text-center hover:bg-secondary/30 transition-colors cursor-pointer group">
              <div className="flex items-center justify-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium">Checks</span>
              </div>
              <p className="text-2xl font-bold text-amber-500">${checkIncome.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">To deposit</p>
            </div>
            <div className="p-4 text-center hover:bg-secondary/30 transition-colors cursor-pointer group">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CreditCard className="h-5 w-5 text-purple-500" />
                <span className="text-sm font-medium">Card/Stripe</span>
              </div>
              <p className="text-2xl font-bold text-purple-500">${cardIncome.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Online payments</p>
            </div>
          </div>
        </div>

{/* Needs Attention Section */}
        {(() => {
          const unpaidInvs = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
          const overdueInvs = invoices.filter(i => i.status === 'overdue')
          const upcomingJobs = jobs
            .filter(j => j.status === 'Scheduled' && new Date(j.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 3)
          const pendingEstimates = estimates.filter(e => e.status === 'sent')
          const dueBills = upcomingExpenses.filter(e => {
            const dueDate = new Date(e.dueDate)
            const now = new Date()
            const diff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            return diff <= 7 && diff >= 0
          })

          const hasItems = unpaidInvs.length > 0 || upcomingJobs.length > 0 || pendingEstimates.length > 0 || dueBills.length > 0

          if (!hasItems) return null

          return (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <div className="flex items-center gap-2 p-4 border-b border-amber-500/20">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold">Needs Attention</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {unpaidInvs.length + upcomingJobs.length + pendingEstimates.length + dueBills.length} items
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-amber-500/20">
                {/* Unpaid Invoices */}
                <Link href="/invoices" className="p-4 hover:bg-amber-500/5 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Unpaid Invoices</span>
                  </div>
                  <p className="text-xl font-bold">{unpaidInvs.length}</p>
                  <p className="text-xs text-muted-foreground">
                    ${unpaidInvs.reduce((sum, i) => sum + (i.total - (i.amountPaid || 0)), 0).toLocaleString()} total
                    {overdueInvs.length > 0 && <span className="text-red-500"> ({overdueInvs.length} overdue)</span>}
                  </p>
                </Link>

                {/* Upcoming Jobs */}
                <Link href="/jobs" className="p-4 hover:bg-amber-500/5 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Upcoming Jobs</span>
                  </div>
                  <p className="text-xl font-bold">{upcomingJobs.length}</p>
                  {upcomingJobs[0] && (
                    <p className="text-xs text-muted-foreground truncate">
                      Next: {formatDate(upcomingJobs[0].date)}
                    </p>
                  )}
                </Link>

                {/* Pending Estimates */}
                <Link href="/invoices?tab=estimates" className="p-4 hover:bg-amber-500/5 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Awaiting Response</span>
                  </div>
                  <p className="text-xl font-bold">{pendingEstimates.length}</p>
                  <p className="text-xs text-muted-foreground">
                    ${pendingEstimates.reduce((sum, e) => sum + e.total, 0).toLocaleString()} potential
                  </p>
                </Link>

                {/* Bills Due */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-red-500" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Bills Due</span>
                  </div>
                  <p className="text-xl font-bold">{dueBills.length}</p>
                  <p className="text-xs text-muted-foreground">
                    ${dueBills.reduce((sum, e) => sum + e.amount, 0).toLocaleString()} this week
                  </p>
                </div>
              </div>
            </div>
          )
        })()}

  {/* Main Content Grid */}
  <div className="grid lg:grid-cols-3 gap-6">
  {/* Left Column */}
  <div className="lg:col-span-2 space-y-6">
  
  {/* Today's Activity */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-semibold">Today&apos;s Activity</span>
                </div>
                <Link href="/jobs" className="text-sm text-primary hover:underline">View all jobs</Link>
              </div>
              
              {/* Today Stats */}
              <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-border border-b border-border">
                <div className="p-2 sm:p-3 text-center">
                  <p className="text-lg sm:text-xl font-bold text-amber-500">{todayScheduled.length}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Scheduled</p>
                </div>
                <div className="p-2 sm:p-3 text-center">
                  <p className="text-lg sm:text-xl font-bold text-blue-500">{todayInProgress.length}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">In Progress</p>
                </div>
                <div className="p-2 sm:p-3 text-center">
                  <p className="text-lg sm:text-xl font-bold text-green-500">{todayCompleted.length}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="p-2 sm:p-3 text-center col-span-1 sm:col-span-1 border-t sm:border-t-0">
                  <p className="text-lg sm:text-xl font-bold">${todayRevenue.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Earned</p>
                </div>
                <div className="p-2 sm:p-3 text-center col-span-2 sm:col-span-1 border-t sm:border-t-0">
                  <p className="text-lg sm:text-xl font-bold text-primary">${todayPotential.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Potential</p>
                </div>
              </div>

              {/* Today's Jobs List */}
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {todayJobs.length === 0 ? (
                  <div className="p-6 text-center">
                    <Calendar className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No jobs scheduled for today</p>
                  </div>
                ) : (
                  todayJobs.map(job => {
                    const customer = customers.find(c => c.id === job.customerId)
                    const statusStyles: Record<string, string> = {
                      Scheduled: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
                      in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
                      Completed: 'bg-green-500/10 text-green-500 border-green-500/30',
                      Paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
                    }
                    return (
                      <div key={job.id} className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                            job.status === 'in_progress' ? 'bg-blue-500/20' : job.status === 'completed' ? 'bg-green-500/20' : 'bg-amber-500/20'
                          )}>
                            {job.status === 'in_progress' ? <Play className="h-4 w-4 text-blue-500" /> : 
                             job.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : 
                             <Clock className="h-4 w-4 text-amber-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{customer?.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground truncate">{job.jobType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold">${job.price.toLocaleString()}</span>
                          <Badge variant="outline" className={cn('text-xs capitalize', statusStyles[job.status as keyof typeof statusStyles])}>
                            {job.status?.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Who Owes You */}
            {unpaidInvoices.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20">
                      <DollarSign className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-semibold">People Who Owe You</p>
                      <p className="text-xs text-muted-foreground">{unpaidInvoices.length} unpaid invoices</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-500">${totalOwed.toLocaleString()}</p>
                  </div>
                </div>
                <div className="divide-y divide-amber-500/10 max-h-48 overflow-y-auto">
                  {unpaidInvoices.slice(0, 5).map(invoice => {
                    const customer = customers.find(c => c.id === invoice.customerId)
                    const amountOwed = invoice.total - (invoice.amountPaid || 0)
                    const isOverdue = new Date(invoice.dueDate) < new Date()
                    return (
                      <Link key={invoice.id} href="/invoices" className="flex items-center justify-between p-3 hover:bg-amber-500/5 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{customer?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">Invoice #{invoice.invoiceNumber} · Due {formatDate(invoice.dueDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">${amountOwed.toLocaleString()}</span>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">Overdue</Badge>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pending & Upcoming Row */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Pending Income */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="font-medium text-sm">Expected Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-green-500">${totalPendingIncome.toLocaleString()}</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Expected Income</DialogTitle>
                          <DialogDescription>Track money you&apos;re expecting to receive</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault()
                          const form = e.target as HTMLFormElement
                          const formData = new FormData(form)
                          const result = await addPendingIncome({
                            clientName: formData.get('clientName') as string,
                            amount: parseFloat(formData.get('amount') as string),
                            source: formData.get('source') as string,
                            expectedDate: formData.get('expectedDate') as string,
                            status: 'pending',
                          })
                          if (result) {
                            toast.success('Expected income added')
                            loadData()
                            form.reset()
                          } else {
                            toast.error('Failed to add')
                          }
                        }} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Client Name</Label>
                            <Input name="clientName" placeholder="Who owes you?" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input name="amount" type="number" step="0.01" placeholder="0.00" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Source/Job Type</Label>
                            <Input name="source" placeholder="Window cleaning, etc." />
                          </div>
                          <div className="space-y-2">
                            <Label>Expected Date</Label>
                            <Input name="expectedDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                          </div>
                          <DialogFooter>
                            <Button type="submit">Add Income</Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                  {pendingIncome.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">No pending income</p>
                    </div>
                  ) : (
                    pendingIncome.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors group">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.clientName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(p.expectedDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-green-500">${p.amount.toLocaleString()}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={async () => {
                                const success = await markPendingIncomeReceived(p.id, 'cash')
                                if (success) { toast.success('Marked as received (Cash)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <Banknote className="h-4 w-4 mr-2" />
                                Received Cash
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markPendingIncomeReceived(p.id, 'card')
                                if (success) { toast.success('Marked as received (Card)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Received Card
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markPendingIncomeReceived(p.id, 'check')
                                if (success) { toast.success('Marked as received (Check)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <FileText className="h-4 w-4 mr-2" />
                                Received Check
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markPendingIncomeReceived(p.id, 'venmo')
                                if (success) { toast.success('Marked as received (Venmo)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <Smartphone className="h-4 w-4 mr-2" />
                                Received Venmo/Zelle
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Upcoming Expenses */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="font-medium text-sm">Bills Due</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-red-500">${totalUpcomingExpenses.toLocaleString()}</span>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Bill/Expense</DialogTitle>
                          <DialogDescription>Track upcoming bills you need to pay</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault()
                          const form = e.target as HTMLFormElement
                          const formData = new FormData(form)
                          const result = await addUpcomingExpense({
                            name: formData.get('name') as string,
                            amount: parseFloat(formData.get('amount') as string),
                            category: formData.get('category') as string,
                            dueDate: formData.get('dueDate') as string,
                            status: 'pending',
                          })
                          if (result) {
                            toast.success('Bill added')
                            loadData()
                            form.reset()
                          } else {
                            toast.error('Failed to add')
                          }
                        }} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Bill Name</Label>
                            <Input name="name" placeholder="What do you need to pay?" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input name="amount" type="number" step="0.01" placeholder="0.00" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Category</Label>
                            <Input name="category" placeholder="Supplies, Equipment, etc." />
                          </div>
                          <div className="space-y-2">
                            <Label>Due Date</Label>
                            <Input name="dueDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                          </div>
                          <DialogFooter>
                            <Button type="submit">Add Bill</Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                  {upcomingExpenses.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">No upcoming expenses</p>
                    </div>
                  ) : (
                    upcomingExpenses.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors group">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(u.dueDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-red-500">${u.amount.toLocaleString()}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={async () => {
                                const success = await markUpcomingExpensePaid(u.id, 'cash')
                                if (success) { toast.success('Marked as paid (Cash)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <Banknote className="h-4 w-4 mr-2" />
                                Paid Cash
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markUpcomingExpensePaid(u.id, 'card')
                                if (success) { toast.success('Marked as paid (Card)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Paid Card
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markUpcomingExpensePaid(u.id, 'check')
                                if (success) { toast.success('Marked as paid (Check)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <FileText className="h-4 w-4 mr-2" />
                                Paid Check
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                const success = await markUpcomingExpensePaid(u.id, 'bank_transfer')
                                if (success) { toast.success('Marked as paid (Bank Transfer)'); loadData() }
                                else toast.error('Failed to update')
                              }}>
                                <Building2 className="h-4 w-4 mr-2" />
                                Paid Bank Transfer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Workers & Quick Links */}
          <div className="space-y-6">
            {/* Worker Activity */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Team Activity</span>
                </div>
                <Link href="/team" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {workers.length === 0 ? (
                  <div className="p-6 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No workers yet</p>
                  </div>
                ) : (
                  workers.map(worker => {
                    const workerJobs = todayJobs.filter(job => {
                      const jobWorkersList = job.job_workers || []
                      return jobWorkersList.some(jw => jw.employee_id === worker.id)
                    })
                    const inProgress = workerJobs.find(j => j.status === 'in_progress')
                    const scheduled = workerJobs.filter(j => j.status === 'scheduled').length
                    const completed = workerJobs.filter(j => j.status === 'completed').length
                    const currentCustomer = inProgress ? customers.find(c => c.id === inProgress.customerId) : null

                    return (
                      <div key={worker.id} className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold',
                              inProgress ? 'bg-blue-500/20 ring-2 ring-blue-500 text-blue-500' : 'bg-muted'
                            )}>
                              {worker.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{worker.name}</p>
                              <p className="text-xs text-muted-foreground">{workerJobs.length} jobs today</p>
                            </div>
                          </div>
                          {inProgress ? (
                            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">
                              <Play className="h-3 w-3 mr-1" />
                              Working
                            </Badge>
                          ) : scheduled > 0 ? (
                            <Badge variant="outline" className="text-xs">{scheduled} scheduled</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Idle</Badge>
                          )}
                        </div>
                        {inProgress && currentCustomer && (
                          <div className="ml-10 p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs space-y-1">
                            <p className="font-medium">{inProgress.jobType} - {currentCustomer.name}</p>
                            {currentCustomer.address && (
                              <p className="text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {currentCustomer.address}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Quick Access</h3>
              <Link href="/jobs" className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-all group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/20">
                  <Briefcase className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Jobs</p>
                  <p className="text-xs text-muted-foreground">{jobs.length} total</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/customers" className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-all group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/20">
                  <Users className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Customers</p>
                  <p className="text-xs text-muted-foreground">{customers.length} total</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/invoices" className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-all group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/20">
                  <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Invoices</p>
                  <p className="text-xs text-muted-foreground">{invoices.length} total</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/transactions" className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-all group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/20">
                  <Receipt className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Finances</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
