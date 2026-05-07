import type {
  Customer,
  Job,
  Invoice,
  Income,
  Expense,
  Employee,
  PendingIncome,
} from '@/lib/types'

// ===== Shared helpers =====

export type CustomerTag = 'VIP' | 'DueSoon' | 'UpsellReady' | 'Inactive' | 'New'

export interface AIInsight {
  id: string
  kind: 'revenue' | 'customer' | 'invoice' | 'efficiency' | 'upsell' | 'expense' | 'team'
  tone: 'positive' | 'warning' | 'neutral' | 'opportunity'
  title: string
  detail: string
  action?: {
    label: string
    href?: string
    onClickKey?: string
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return Math.floor((db.getTime() - da.getTime()) / DAY_MS)
}

export function customerJobs(customerId: string, jobs: Job[]): Job[] {
  return jobs.filter((j) => j.customerId === customerId)
}

export function isCompletedStatus(status: string | undefined): boolean {
  const s = (status || '').toLowerCase()
  return s === 'completed' || s === 'paid'
}

function normInvoiceStatus(s: string | undefined): string {
  return (s || '').toLowerCase()
}

function isInvoicePaidOrCancelled(status: string | undefined): boolean {
  const s = normInvoiceStatus(status)
  return s === 'paid' || s === 'cancelled'
}

function isInvoiceOpen(status: string | undefined): boolean {
  const s = normInvoiceStatus(status)
  return s === 'sent' || s === 'overdue'
}

export function customerLifetimeValue(customerId: string, jobs: Job[]): number {
  return customerJobs(customerId, jobs)
    .filter((j) => isCompletedStatus(j.status))
    .reduce((sum, j) => sum + (j.price || 0), 0)
}

export function lastCompletedJob(customerId: string, jobs: Job[]): Job | null {
  const completed = customerJobs(customerId, jobs)
    .filter((j) => isCompletedStatus(j.status))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return completed[0] || null
}

export function completedJobCount(customerId: string, jobs: Job[]): number {
  return customerJobs(customerId, jobs).filter((j) => isCompletedStatus(j.status)).length
}

// Categorize a customer into a smart tag
export function customerTag(
  customer: Customer,
  jobs: Job[],
  now: Date = new Date(),
): CustomerTag | null {
  const cJobs = customerJobs(customer.id, jobs)
  const completed = cJobs.filter((j) => isCompletedStatus(j.status))
  const ltv = customerLifetimeValue(customer.id, jobs)
  const last = lastCompletedJob(customer.id, jobs)
  const daysSinceLast = last ? daysBetween(last.date, now) : Infinity
  const createdDays = daysBetween(customer.createdAt, now)

  // VIP: high value OR many jobs
  if (ltv >= 1500 || completed.length >= 4) return 'VIP'

  // Due Soon: last service 25-40 days ago (recurring window)
  if (last && daysSinceLast >= 25 && daysSinceLast <= 45) return 'DueSoon'

  // Inactive: 90+ days since last service
  if (last && daysSinceLast >= 90) return 'Inactive'

  // Upsell ready: had 1-2 completed jobs recently
  if (completed.length >= 1 && completed.length <= 2 && daysSinceLast <= 60) return 'UpsellReady'

  // New: created in last 14 days, no completed yet
  if (createdDays <= 14 && completed.length === 0) return 'New'

  return null
}

export function nextServiceWindow(
  customer: Customer,
  jobs: Job[],
): { date: string; confidence: 'low' | 'med' | 'high' } | null {
  const last = lastCompletedJob(customer.id, jobs)
  if (!last) return null
  const completed = customerJobs(customer.id, jobs).filter((j) => isCompletedStatus(j.status))
  // Use 30-day default cadence, or average interval if enough data
  let interval = 30
  if (completed.length >= 3) {
    const sorted = completed.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date))
    }
    interval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
  }
  const next = new Date(new Date(last.date).getTime() + interval * DAY_MS)
  return {
    date: next.toISOString(),
    confidence: completed.length >= 3 ? 'high' : completed.length >= 1 ? 'med' : 'low',
  }
}

// ===== Overview insights =====

export function generateOverviewInsights(args: {
  customers: Customer[]
  jobs: Job[]
  invoices: Invoice[]
  income: Income[]
  expenses: Expense[]
  pendingIncome?: PendingIncome[]
}): AIInsight[] {
  const { customers, jobs, invoices, income, expenses } = args
  const now = new Date()
  const insights: AIInsight[] = []

  // Revenue trend (this month vs last month)
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

  const thisMonthRevenue = income
    .filter((i) => {
      const d = new Date(i.date)
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear
    })
    .reduce((s, i) => s + i.amount, 0)
  const lastMonthRevenue = income
    .filter((i) => {
      const d = new Date(i.date)
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
    })
    .reduce((s, i) => s + i.amount, 0)

  if (lastMonthRevenue > 0) {
    const pct = Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    if (pct >= 5) {
      insights.push({
        id: 'rev-up',
        kind: 'revenue',
        tone: 'positive',
        title: `Revenue is up ${pct}% vs last month`,
        detail: `$${thisMonthRevenue.toLocaleString()} this month vs $${lastMonthRevenue.toLocaleString()} last month.`,
        action: { label: 'See reports', href: '/analytics' },
      })
    } else if (pct <= -5) {
      insights.push({
        id: 'rev-down',
        kind: 'revenue',
        tone: 'warning',
        title: `Revenue is down ${Math.abs(pct)}% vs last month`,
        detail: `Consider reaching out to dormant customers or running a promo.`,
        action: { label: 'See reports', href: '/analytics' },
      })
    }
  }

  // Repeat service due
  const dueSoon = customers.filter((c) => customerTag(c, jobs, now) === 'DueSoon')
  if (dueSoon.length > 0) {
    insights.push({
      id: 'due-soon',
      kind: 'customer',
      tone: 'opportunity',
      title: `${dueSoon.length} ${dueSoon.length === 1 ? 'customer is' : 'customers are'} due for service`,
      detail: `Reach out now to book the next job while you're top of mind.`,
      action: { label: 'View customers', href: '/customers' },
    })
  }

  // Unpaid invoice follow-up
  const unpaid = invoices.filter((inv) => isInvoiceOpen(inv.status))
  const overdue = invoices.filter((inv) => {
    if (!isInvoiceOpen(inv.status)) return false
    return new Date(inv.dueDate) < now
  })
  if (overdue.length > 0) {
    const total = overdue.reduce((s, inv) => s + (inv.total - (inv.amountPaid || 0)), 0)
    insights.push({
      id: 'overdue-invoices',
      kind: 'invoice',
      tone: 'warning',
      title: `${overdue.length} overdue ${overdue.length === 1 ? 'invoice' : 'invoices'} — $${total.toLocaleString()}`,
      detail: `Send a friendly reminder today to speed up payment.`,
      action: { label: 'Open invoices', href: '/invoices' },
    })
  } else if (unpaid.length > 0) {
    const total = unpaid.reduce((s, inv) => s + (inv.total - (inv.amountPaid || 0)), 0)
    insights.push({
      id: 'unpaid-invoices',
      kind: 'invoice',
      tone: 'opportunity',
      title: `$${total.toLocaleString()} in open invoices`,
      detail: `Follow up on sent invoices waiting for payment.`,
      action: { label: 'Open invoices', href: '/invoices' },
    })
  }

  // Average job value opportunity
  const completedJobs = jobs.filter((j) => isCompletedStatus(j.status))
  if (completedJobs.length >= 5) {
    const avg = completedJobs.reduce((s, j) => s + j.price, 0) / completedJobs.length
    const low = completedJobs.filter((j) => j.price < avg * 0.7).length
    if (low >= 3) {
      insights.push({
        id: 'avg-value',
        kind: 'upsell',
        tone: 'opportunity',
        title: `Average job value is $${Math.round(avg)}`,
        detail: `${low} recent jobs came in well below your average. Bundle add-ons to raise ticket size.`,
        action: { label: 'View jobs', href: '/jobs' },
      })
    }
  }

  // Best day / service
  if (completedJobs.length >= 10) {
    const byDay: Record<string, number> = {}
    completedJobs.forEach((j) => {
      const day = new Date(j.date).toLocaleDateString('en-US', { weekday: 'long' })
      byDay[day] = (byDay[day] || 0) + j.price
    })
    const top = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]
    if (top) {
      insights.push({
        id: 'best-day',
        kind: 'efficiency',
        tone: 'positive',
        title: `${top[0]} is your highest-earning day`,
        detail: `$${Math.round(top[1]).toLocaleString()} total from ${top[0]} jobs. Prioritize bookings on this day.`,
      })
    }
  }

  return insights.slice(0, 5)
}

// ===== Job insights =====

export interface JobSuggestion {
  type: 'upsell' | 'reschedule' | 'followup' | 'note'
  text: string
}

export function generateJobSuggestion(job: Job, customer: Customer | undefined, jobs: Job[]): JobSuggestion | null {
  if (!customer) return null
  const cJobs = customerJobs(customer.id, jobs).filter((j) => isCompletedStatus(j.status))

  // Upsell suggestion for residential customers
  if (job.jobType === 'Residential' && cJobs.length >= 1) {
    const notes = cJobs.map((j) => (j.notes || '').toLowerCase()).join(' ')
    if (!notes.includes('gutter')) {
      return {
        type: 'upsell',
        text: 'Suggest gutter cleaning add-on — avg +$85 per job.',
      }
    }
    if (!notes.includes('solar')) {
      return {
        type: 'upsell',
        text: 'Residential property — may be a good solar panel cleaning candidate.',
      }
    }
  }

  if (job.jobType === 'Commercial' && cJobs.length >= 2) {
    return {
      type: 'upsell',
      text: 'Commercial repeat customer — propose a monthly service contract.',
    }
  }

  // Repeat customer nudge
  if (cJobs.length >= 3) {
    return {
      type: 'followup',
      text: `Loyal customer — ${cJobs.length} jobs completed. Consider a VIP discount.`,
    }
  }

  return null
}

export function estimatedProfitability(job: Job): { margin: number; tier: 'high' | 'med' | 'low' } {
  const cost = job.expenses || job.price * 0.25
  const margin = job.price > 0 ? ((job.price - cost) / job.price) * 100 : 0
  const tier = margin >= 60 ? 'high' : margin >= 40 ? 'med' : 'low'
  return { margin, tier }
}

// ===== Customer insights =====

export function generateCustomerSummary(
  customer: Customer,
  jobs: Job[],
  invoices: Invoice[],
): {
  ltv: number
  lastServiceDate: string | null
  jobCount: number
  nextWindow: { date: string; confidence: 'low' | 'med' | 'high' } | null
  recommendedOffer: string
  followupMessage: string
  openBalance: number
} {
  const ltv = customerLifetimeValue(customer.id, jobs)
  const last = lastCompletedJob(customer.id, jobs)
  const jobCount = completedJobCount(customer.id, jobs)
  const nextWindow = nextServiceWindow(customer, jobs)

  const tag = customerTag(customer, jobs)
  let recommendedOffer = 'Send a monthly check-in.'
  if (tag === 'VIP') recommendedOffer = 'Offer a loyalty discount or priority scheduling.'
  else if (tag === 'DueSoon') recommendedOffer = 'Book their next recurring service now.'
  else if (tag === 'UpsellReady') recommendedOffer = 'Propose an add-on (gutters, solar, or trim).'
  else if (tag === 'Inactive') recommendedOffer = 'Send a win-back offer (10% off next service).'
  else if (tag === 'New') recommendedOffer = 'Send a welcome message and booking link.'

  const firstName = customer.name.split(' ')[0]
  const followupMessage =
    tag === 'Inactive'
      ? `Hi ${firstName}, it's been a while! We'd love to have you back — 10% off your next service this month.`
      : tag === 'DueSoon'
      ? `Hi ${firstName}, you're due for your next service. Want us to book you in this week?`
      : `Hi ${firstName}, just checking in. Let us know if you'd like to schedule your next service.`

  const openBalance = invoices
    .filter((inv) => inv.customerId === customer.id && !isInvoicePaidOrCancelled(inv.status))
    .reduce((s, inv) => s + (inv.total - (inv.amountPaid || 0)), 0)

  return {
    ltv,
    lastServiceDate: last?.date || null,
    jobCount,
    nextWindow,
    recommendedOffer,
    followupMessage,
    openBalance,
  }
}

// ===== Invoice insights =====

export function generateInvoiceSuggestion(invoice: Invoice, now: Date = new Date()): AIInsight | null {
  const openBalance = invoice.total - (invoice.amountPaid || 0)
  if (isInvoicePaidOrCancelled(invoice.status)) return null

  const daysOpen = daysBetween(invoice.issueDate, now)
  const daysToDue = daysBetween(now, invoice.dueDate)
  const status = normInvoiceStatus(invoice.status)

  if (status === 'draft') {
    return {
      id: `inv-${invoice.id}-draft`,
      kind: 'invoice',
      tone: 'opportunity',
      title: 'Draft invoice',
      detail: 'Send it now to get paid faster.',
    }
  }

  if (daysToDue < 0) {
    return {
      id: `inv-${invoice.id}-overdue`,
      kind: 'invoice',
      tone: 'warning',
      title: `Overdue by ${Math.abs(daysToDue)} day${Math.abs(daysToDue) === 1 ? '' : 's'}`,
      detail: `$${openBalance.toLocaleString()} outstanding. Send a reminder today.`,
    }
  }

  if (daysOpen >= 5) {
    return {
      id: `inv-${invoice.id}-stale`,
      kind: 'invoice',
      tone: 'opportunity',
      title: `Open ${daysOpen} days`,
      detail: 'Consider a gentle reminder to nudge payment.',
    }
  }

  return null
}

export function generateInvoiceReminderMessage(invoice: Invoice, customerName?: string): string {
  const open = invoice.total - (invoice.amountPaid || 0)
  const name = customerName?.split(' ')[0] || 'there'
  return `Hi ${name}, just a friendly reminder that invoice ${invoice.invoiceNumber} for $${open.toFixed(2)} is due. Let me know if you have any questions — thanks!`
}

// ===== Finances insights =====

export function generateFinancesInsights(income: Income[], expenses: Expense[]): AIInsight[] {
  const insights: AIInsight[] = []
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

  const byCat = (items: Expense[], month: number, year: number) => {
    const out: Record<string, number> = {}
    for (const e of items) {
      const d = new Date(e.date)
      if (d.getMonth() !== month || d.getFullYear() !== year) continue
      out[e.category] = (out[e.category] || 0) + e.amount
    }
    return out
  }

  const thisCats = byCat(expenses, thisMonth, thisYear)
  const lastCats = byCat(expenses, lastMonth, lastMonthYear)

  // Detect a spike in any category
  for (const cat of Object.keys(thisCats)) {
    const now = thisCats[cat]
    const prev = lastCats[cat] || 0
    if (prev > 50 && now / prev > 1.2) {
      const pct = Math.round(((now - prev) / prev) * 100)
      insights.push({
        id: `spike-${cat}`,
        kind: 'expense',
        tone: 'warning',
        title: `${cat} costs up ${pct}% this month`,
        detail: `$${now.toFixed(0)} this month vs $${prev.toFixed(0)} last month.`,
      })
    }
  }

  // Top income source
  if (income.length >= 3) {
    const byJobType: Record<string, number> = {}
    income.forEach((i) => {
      byJobType[i.jobType] = (byJobType[i.jobType] || 0) + i.amount
    })
    const top = Object.entries(byJobType).sort((a, b) => b[1] - a[1])[0]
    if (top) {
      insights.push({
        id: 'top-source',
        kind: 'revenue',
        tone: 'positive',
        title: `${top[0]} is your top revenue source`,
        detail: `$${Math.round(top[1]).toLocaleString()} total. Double down with targeted outreach.`,
      })
    }
  }

  // Margin check
  const totalIncome = income.reduce((s, i) => s + i.amount, 0)
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
  if (totalIncome > 0) {
    const margin = ((totalIncome - totalExpense) / totalIncome) * 100
    if (margin < 30) {
      insights.push({
        id: 'low-margin',
        kind: 'expense',
        tone: 'warning',
        title: `Profit margin is ${margin.toFixed(0)}%`,
        detail: `Consider raising minimum pricing or trimming recurring costs.`,
      })
    } else if (margin >= 60) {
      insights.push({
        id: 'strong-margin',
        kind: 'revenue',
        tone: 'positive',
        title: `Strong ${margin.toFixed(0)}% profit margin`,
        detail: `You're keeping costs in check. Reinvest in marketing or equipment.`,
      })
    }
  }

  return insights.slice(0, 4)
}

// ===== Reports summary =====

export function generateReportsSummary(args: {
  income: Income[]
  expenses: Expense[]
  jobs: Job[]
  period: 'week' | 'month' | 'year'
}): string[] {
  const { income, expenses, jobs, period } = args
  const now = new Date()
  const cutoff = new Date()
  if (period === 'week') cutoff.setDate(now.getDate() - 7)
  else if (period === 'month') cutoff.setMonth(now.getMonth() - 1)
  else cutoff.setFullYear(now.getFullYear() - 1)

  const prevCutoff = new Date(cutoff)
  if (period === 'week') prevCutoff.setDate(cutoff.getDate() - 7)
  else if (period === 'month') prevCutoff.setMonth(cutoff.getMonth() - 1)
  else prevCutoff.setFullYear(cutoff.getFullYear() - 1)

  const inRange = (d: string, from: Date, to: Date) => {
    const x = new Date(d)
    return x >= from && x <= to
  }

  const curIncome = income.filter((i) => inRange(i.date, cutoff, now)).reduce((s, i) => s + i.amount, 0)
  const prevIncome = income.filter((i) => inRange(i.date, prevCutoff, cutoff)).reduce((s, i) => s + i.amount, 0)

  const summary: string[] = []

  if (prevIncome > 0) {
    const pct = Math.round(((curIncome - prevIncome) / prevIncome) * 100)
    if (pct > 0) summary.push(`Revenue is up ${pct}% this ${period}, reaching $${curIncome.toLocaleString()}.`)
    else if (pct < 0) summary.push(`Revenue is down ${Math.abs(pct)}% this ${period}. Push follow-ups and upsells.`)
    else summary.push(`Revenue is flat at $${curIncome.toLocaleString()} this ${period}.`)
  } else {
    summary.push(`Revenue this ${period}: $${curIncome.toLocaleString()}.`)
  }

  // Top job type
  const periodJobs = jobs.filter((j) => inRange(j.date, cutoff, now) && isCompletedStatus(j.status))
  if (periodJobs.length >= 3) {
    const byType: Record<string, number> = {}
    periodJobs.forEach((j) => {
      byType[j.jobType] = (byType[j.jobType] || 0) + j.price
    })
    const top = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]
    if (top) summary.push(`Top category: ${top[0]} jobs generated $${Math.round(top[1]).toLocaleString()}.`)
  }

  // Avg job value
  if (periodJobs.length > 0) {
    const avg = periodJobs.reduce((s, j) => s + j.price, 0) / periodJobs.length
    summary.push(`Average job value: $${Math.round(avg)}. Add-ons (gutters, solar) can lift this.`)
  }

  // Expense check
  const curExpense = expenses.filter((e) => inRange(e.date, cutoff, now)).reduce((s, e) => s + e.amount, 0)
  if (curIncome > 0) {
    const margin = ((curIncome - curExpense) / curIncome) * 100
    summary.push(`Profit margin: ${margin.toFixed(0)}% (revenue $${curIncome.toLocaleString()}, expenses $${curExpense.toLocaleString()}).`)
  }

  return summary
}

// ===== Calendar hints =====

export function generateCalendarHints(args: { jobs: Job[]; customers: Customer[]; date: Date }): AIInsight[] {
  const { jobs, customers, date } = args
  const hints: AIInsight[] = []

  const dayStr = date.toISOString().split('T')[0]
  const dayJobs = jobs.filter((j) => j.date.startsWith(dayStr) && j.status === 'Scheduled')

  if (dayJobs.length >= 2) {
    const customerMap = new Map(customers.map((c) => [c.id, c]))
    const addresses = dayJobs
      .map((j) => customerMap.get(j.customerId)?.address || '')
      .filter(Boolean)
    if (addresses.length >= 2) {
      hints.push({
        id: 'cluster',
        kind: 'efficiency',
        tone: 'opportunity',
        title: `${dayJobs.length} jobs scheduled`,
        detail: 'Group by area to save drive time and fuel.',
      })
    }
  }

  if (dayJobs.length === 0) {
    hints.push({
      id: 'empty-day',
      kind: 'efficiency',
      tone: 'opportunity',
      title: 'Open availability',
      detail: 'No jobs yet — a good time to reach out to customers due for service.',
    })
  }

  // Overdue customers near today
  const now = new Date()
  const overdue = customers.filter((c) => customerTag(c, jobs, now) === 'DueSoon')
  if (overdue.length > 0) {
    hints.push({
      id: 'overdue-customers',
      kind: 'customer',
      tone: 'opportunity',
      title: `${overdue.length} customer${overdue.length === 1 ? '' : 's'} due for service`,
      detail: 'Slot them in during upcoming open windows.',
    })
  }

  return hints
}

// ===== Team insights =====

export function generateTeamInsights(args: {
  employees: Employee[]
  jobs: Job[]
}): AIInsight[] {
  const { employees, jobs } = args
  const insights: AIInsight[] = []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Note: without job_workers array we approximate by looking at completed jobs count
  const completedThisMonth = jobs.filter(
    (j) => isCompletedStatus(j.status) && new Date(j.date) >= monthStart,
  )

  if (completedThisMonth.length === 0) {
    insights.push({
      id: 'no-jobs-month',
      kind: 'team',
      tone: 'neutral',
      title: 'No completed jobs this month yet',
      detail: 'Schedule work to measure team productivity.',
    })
    return insights
  }

  const totalRevenue = completedThisMonth.reduce((s, j) => s + j.price, 0)
  const active = employees.filter((e) => e.active)

  if (active.length > 0) {
    const avgPerEmp = totalRevenue / active.length
    insights.push({
      id: 'team-avg',
      kind: 'team',
      tone: 'positive',
      title: `Team generated $${Math.round(totalRevenue).toLocaleString()} this month`,
      detail: `Average $${Math.round(avgPerEmp).toLocaleString()} per active team member across ${completedThisMonth.length} jobs.`,
    })
  }

  // Simple "underbooked" signal: fewer active workers than jobs
  if (active.length >= 2 && completedThisMonth.length < active.length * 2) {
    insights.push({
      id: 'underbooked',
      kind: 'team',
      tone: 'opportunity',
      title: 'Team has capacity',
      detail: 'Consider pushing more bookings — team is lightly utilized this month.',
    })
  }

  return insights
}

// ===== Global Ask AI answers (rule-based contextual assistant) =====

export interface AskAIContext {
  customers: Customer[]
  jobs: Job[]
  invoices: Invoice[]
  income: Income[]
  expenses: Expense[]
  employees?: Employee[]
}

export function answerAskAI(question: string, ctx: AskAIContext): string {
  const q = question.toLowerCase().trim()
  const now = new Date()

  // Greetings / empty
  if (!q || q.length < 2) {
    return "Ask me about revenue, customers due for service, unpaid invoices, or what to focus on next."
  }

  // Business overview
  if (q.includes('how') && (q.includes('business') || q.includes('doing') || q.includes('going'))) {
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const monthIncome = ctx.income
      .filter((i) => {
        const d = new Date(i.date)
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear
      })
      .reduce((s, i) => s + i.amount, 0)
    const monthExpense = ctx.expenses
      .filter((e) => {
        const d = new Date(e.date)
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear
      })
      .reduce((s, e) => s + e.amount, 0)
    const completed = ctx.jobs.filter(
      (j) => isCompletedStatus(j.status) && new Date(j.date).getMonth() === thisMonth,
    )
    return `This month: $${monthIncome.toLocaleString()} revenue, $${monthExpense.toLocaleString()} expenses, ${completed.length} completed jobs. Profit margin: ${monthIncome > 0 ? (((monthIncome - monthExpense) / monthIncome) * 100).toFixed(0) : 0}%.`
  }

  // Follow-ups
  if (q.includes('follow') || (q.includes('customer') && q.includes('up'))) {
    const dueSoon = ctx.customers.filter((c) => customerTag(c, ctx.jobs, now) === 'DueSoon')
    const inactive = ctx.customers.filter((c) => customerTag(c, ctx.jobs, now) === 'Inactive')
    const names = [...dueSoon, ...inactive].slice(0, 6).map((c) => c.name).join(', ')
    if (names)
      return `Prioritize ${dueSoon.length} due-for-service and ${inactive.length} inactive customers: ${names}.`
    return `No urgent follow-ups right now. Keep an eye on new customers as they mature.`
  }

  // Losing money
  if (q.includes('losing') || q.includes('leak') || q.includes('waste')) {
    const insights = generateFinancesInsights(ctx.income, ctx.expenses)
    const warn = insights.find((i) => i.tone === 'warning')
    if (warn) return `${warn.title}. ${warn.detail}`
    return `No major leaks detected. Your expenses look balanced.`
  }

  // What to focus on
  if (q.includes('focus') || q.includes('next') || q.includes('priority') || q.includes('should')) {
    const overview = generateOverviewInsights(ctx)
    const top = overview.find((i) => i.tone === 'warning' || i.tone === 'opportunity') || overview[0]
    if (top) return `${top.title}. ${top.detail}`
    return `Keep booking jobs and follow up with past customers for repeat business.`
  }

  // Repeat service
  if (q.includes('repeat') || q.includes('due')) {
    const due = ctx.customers.filter((c) => customerTag(c, ctx.jobs, now) === 'DueSoon')
    if (due.length === 0) return `No customers are currently in the due-for-service window.`
    return `${due.length} customer${due.length === 1 ? ' is' : 's are'} due for service: ${due.slice(0, 8).map((c) => c.name).join(', ')}.`
  }

  // Upsell
  if (q.includes('upsell') || q.includes('add-on') || q.includes('addon')) {
    const ready = ctx.customers.filter((c) => customerTag(c, ctx.jobs, now) === 'UpsellReady')
    if (ready.length === 0) return `No clear upsell candidates right now.`
    return `${ready.length} customer${ready.length === 1 ? '' : 's'} are upsell-ready: ${ready.slice(0, 6).map((c) => c.name).join(', ')}. Pitch gutter, solar, or premium packages.`
  }

  // Unpaid / invoices
  if (q.includes('unpaid') || q.includes('overdue') || q.includes('invoice')) {
    const open = ctx.invoices.filter((i) => isInvoiceOpen(i.status))
    const total = open.reduce((s, i) => s + (i.total - (i.amountPaid || 0)), 0)
    return `${open.length} open invoice${open.length === 1 ? '' : 's'} totaling $${total.toLocaleString()}. Send reminders on any over 5 days old.`
  }

  // Revenue
  if (q.includes('revenue') || q.includes('earn') || q.includes('income') || q.includes('made')) {
    const total = ctx.income.reduce((s, i) => s + i.amount, 0)
    const count = ctx.income.length
    return `Total revenue recorded: $${total.toLocaleString()} across ${count} transaction${count === 1 ? '' : 's'}.`
  }

  // Price / quote help
  if (q.includes('price') || q.includes('quote') || q.includes('charge')) {
    const completed = ctx.jobs.filter((j) => isCompletedStatus(j.status))
    if (completed.length === 0) return `No completed jobs yet — try $150 as a residential starting point.`
    const avg = completed.reduce((s, j) => s + j.price, 0) / completed.length
    return `Your average completed job is $${Math.round(avg)}. Price new quotes between $${Math.round(avg * 0.9)} and $${Math.round(avg * 1.3)} depending on scope.`
  }

  // Default
  return `I can help with revenue, follow-ups, unpaid invoices, upsells, pricing, and what to focus on. Try asking "What should I focus on next?"`
}
