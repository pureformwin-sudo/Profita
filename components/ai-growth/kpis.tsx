'use client'

import { DollarSign, Flame, TrendingUp, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer, Job } from '@/lib/types'

interface KPICardProps {
  label: string
  value: string
  subValue: string
  icon: React.ComponentType<{ className?: string }>
  variant: 'success' | 'warning' | 'primary' | 'info'
}

function KPICard({ label, value, subValue, icon: Icon, variant }: KPICardProps) {
  const variantStyles = {
    success: 'from-green-500/10 to-green-500/5 border-green-500/20',
    warning: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    primary: 'from-primary/10 to-primary/5 border-primary/20',
    info: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
  }
  const iconStyles = {
    success: 'bg-green-500/20 text-green-500',
    warning: 'bg-amber-500/20 text-amber-500',
    primary: 'bg-primary/20 text-primary',
    info: 'bg-blue-500/20 text-blue-500',
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-gradient-to-br p-4', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{subValue}</p>
        </div>
        <div className={cn('rounded-lg p-2', iconStyles[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

interface AIGrowthKPIsProps {
  customers: Customer[]
  jobs: Job[]
  invoices: any[]
}

export function AIGrowthKPIs({ customers, jobs, invoices }: AIGrowthKPIsProps) {
  // Missed revenue: customers who haven't booked in 90+ days
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const customerLastJobMap = new Map<string, { date: Date; amount: number }>()
  for (const job of jobs) {
    if (job.status !== 'Completed' && job.status !== 'Paid') continue
    const existing = customerLastJobMap.get(job.customerId)
    const jobDate = new Date(job.date)
    if (!existing || jobDate > existing.date) {
      customerLastJobMap.set(job.customerId, { date: jobDate, amount: job.price })
    }
  }

  let missedRevenue = 0
  let dueCount = 0
  for (const [, info] of customerLastJobMap) {
    if (info.date < ninetyDaysAgo) {
      missedRevenue += info.amount
      dueCount++
    }
  }

  // Hot leads: unpaid draft/sent invoices (mock for leads)
  const hotLeads = invoices.filter((i) => i.status === 'draft' || i.status === 'sent').length

  // Pricing opportunity: avg job value potential +12%
  const completedJobs = jobs.filter((j) => j.status === 'Completed' || j.status === 'Paid')
  const avgJobValue = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.price, 0) / completedJobs.length
    : 0
  const pricingLift = avgJobValue > 0 ? Math.round(avgJobValue * 0.12) : 0

  // Efficiency score: simple composite
  const baseScore = 60
  const completionBonus = Math.min(20, completedJobs.length * 2)
  const retentionBonus = Math.min(20, (customers.length - dueCount) * 2)
  const efficiencyScore = Math.min(100, baseScore + completionBonus + retentionBonus)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICard
        label="Missed Revenue"
        value={`$${missedRevenue.toLocaleString()}`}
        subValue={dueCount > 0 ? `${dueCount} customers due for repeat service` : 'All customers up to date'}
        icon={DollarSign}
        variant="success"
      />
      <KPICard
        label="Leads to Follow Up"
        value={`${hotLeads}`}
        subValue={hotLeads > 0 ? `${hotLeads} hot leads waiting` : 'No pending leads'}
        icon={Flame}
        variant="warning"
      />
      <KPICard
        label="Pricing Opportunity"
        value={`+$${pricingLift}`}
        subValue={`Raise avg job value +12%`}
        icon={TrendingUp}
        variant="primary"
      />
      <KPICard
        label="Efficiency Score"
        value={`${efficiencyScore}`}
        subValue={`out of 100`}
        icon={Gauge}
        variant="info"
      />
    </div>
  )
}
