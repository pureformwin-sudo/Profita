'use client'

import { useMemo } from 'react'
import { Lightbulb, TrendingDown, TrendingUp, CalendarDays, DollarSign, UserCheck, Zap } from 'lucide-react'
import type { Customer, Job } from '@/lib/types'

interface GrowthCoachProps {
  customers: Customer[]
  jobs: Job[]
  invoices: any[]
}

type Insight = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  text: string
  tone: 'positive' | 'warning' | 'info' | 'action'
}

export function GrowthCoach({ customers, jobs, invoices }: GrowthCoachProps) {
  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = []
    const now = new Date()

    const completed = jobs.filter((j) => j.status === 'Completed' || j.status === 'Paid')

    // 1. Revenue trend this month vs last
    const thisMonthRevenue = completed
      .filter((j) => {
        const d = new Date(j.date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((sum, j) => sum + j.price, 0)

    const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const lastMonthRevenue = completed
      .filter((j) => {
        const d = new Date(j.date)
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
      })
      .reduce((sum, j) => sum + j.price, 0)

    if (lastMonthRevenue > 0) {
      const pct = Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      if (pct <= -10) {
        list.push({
          id: 'rev-down',
          icon: TrendingDown,
          text: `Revenue is down ${Math.abs(pct)}% vs last month. Consider reactivating dormant customers.`,
          tone: 'warning',
        })
      } else if (pct >= 10) {
        list.push({
          id: 'rev-up',
          icon: TrendingUp,
          text: `Revenue is up ${pct}% vs last month. Keep the momentum — push upsells on active jobs.`,
          tone: 'positive',
        })
      }
    }

    // 2. Best day of week by close rate / revenue
    if (completed.length >= 5) {
      const dayRevenue: number[] = [0, 0, 0, 0, 0, 0, 0]
      const dayCount: number[] = [0, 0, 0, 0, 0, 0, 0]
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      for (const j of completed) {
        const d = new Date(j.date)
        dayRevenue[d.getDay()] += j.price
        dayCount[d.getDay()]++
      }
      let bestIdx = 0
      let bestAvg = 0
      for (let i = 0; i < 7; i++) {
        if (dayCount[i] === 0) continue
        const avg = dayRevenue[i] / dayCount[i]
        if (avg > bestAvg) {
          bestAvg = avg
          bestIdx = i
        }
      }
      list.push({
        id: 'best-day',
        icon: CalendarDays,
        text: `${dayNames[bestIdx]}s have your highest average job value ($${Math.round(bestAvg)}). Schedule premium jobs then.`,
        tone: 'info',
      })
    }

    // 3. Pricing suggestion based on min price
    if (completed.length >= 3) {
      const prices = completed.map((j) => j.price).sort((a, b) => a - b)
      const minPrice = prices[0]
      if (minPrice < 179) {
        const newMin = Math.max(179, Math.round(minPrice * 1.15 / 10) * 10)
        list.push({
          id: 'min-ticket',
          icon: DollarSign,
          text: `Raise your minimum ticket from $${minPrice} to $${newMin}. Low tickets hurt your hourly rate.`,
          tone: 'action',
        })
      }
    }

    // 4. Dormant customer shoutout
    const lastJobMap = new Map<string, { name: string; date: Date }>()
    for (const j of completed) {
      const customer = customers.find((c) => c.id === j.customerId)
      if (!customer) continue
      const existing = lastJobMap.get(j.customerId)
      const jd = new Date(j.date)
      if (!existing || jd > existing.date) {
        lastJobMap.set(j.customerId, { name: customer.name, date: jd })
      }
    }
    const sortedByOldest = Array.from(lastJobMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
    if (sortedByOldest.length > 0) {
      const oldest = sortedByOldest[0]
      const daysAgo = Math.floor((now.getTime() - oldest.date.getTime()) / (1000 * 60 * 60 * 24))
      if (daysAgo >= 60) {
        list.push({
          id: 'dormant',
          icon: UserCheck,
          text: `${oldest.name} hasn't booked in ${daysAgo} days. Send a personalized follow-up today.`,
          tone: 'action',
        })
      }
    }

    // 5. Upsell conversion hint
    list.push({
      id: 'upsell-tip',
      icon: Zap,
      text: `Adding a single $60–$90 upsell per job raises annual revenue by ~18% without new customers.`,
      tone: 'info',
    })

    // 6. Pending invoices reminder
    const pendingCount = invoices.filter((i) => i.status === 'sent').length
    if (pendingCount >= 2) {
      list.push({
        id: 'pending-invoices',
        icon: DollarSign,
        text: `You have ${pendingCount} sent invoices awaiting payment. Send a friendly reminder.`,
        tone: 'warning',
      })
    }

    return list.slice(0, 6)
  }, [customers, jobs, invoices])

  const toneStyles = {
    positive: 'bg-green-500/10 text-green-500 border-green-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    action: 'bg-primary/10 text-primary border-primary/20',
  }

  return (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </div>
          <h3 className="font-semibold">Growth Coach</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 ml-10">
          AI-powered insights from your business
        </p>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-auto max-h-[560px]">
        {insights.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            Add more jobs to unlock insights
          </div>
        ) : (
          insights.map((insight) => {
            const Icon = insight.icon
            return (
              <div
                key={insight.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${toneStyles[insight.tone]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm leading-relaxed pt-0.5">{insight.text}</p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
