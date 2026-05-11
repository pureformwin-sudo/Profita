'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  TrendingUp,
  Target,
  DoorOpen,
  MessageSquare,
  FileText,
  CalendarCheck,
  DollarSign,
  Trophy,
  RefreshCw,
  Flame,
  Zap,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { getLeadsForCurrentRep, type Lead } from '@/lib/leads-storage'
import { getQuotes, type Quote } from '@/lib/quotes-storage'
import { cn } from '@/lib/utils'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getDayOfWeek(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1 // Monday = 0
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MyStatsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const [leadsResult, quotesResult] = await Promise.all([
      getLeadsForCurrentRep(),
      getQuotes(),
    ])
    setLeads(leadsResult.data)
    setQuotes(quotesResult.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const stats = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const weekStart = getWeekStart(today)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // All-time stats
    const totalLeads = leads.length
    const engaged = leads.filter((l) => !['knocked', 'not_home'].includes(l.status)).length
    const booked = leads.filter((l) => l.status === 'booked').length
    const converted = leads.filter((l) => l.status === 'converted').length
    const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0

    // Today stats
    const todayLeads = leads.filter((l) => l.created_at?.startsWith(todayStr))
    const todayKnocked = todayLeads.length
    const todayEngaged = todayLeads.filter(
      (l) => !['knocked', 'not_home'].includes(l.status)
    ).length

    // Week stats
    const weekLeads = leads.filter((l) => l.created_at && l.created_at >= weekStartStr)
    const weekKnocked = weekLeads.length
    const weekBooked = weekLeads.filter((l) => l.status === 'booked').length

    // Daily breakdown for week chart
    const dailyKnocks: number[] = Array(7).fill(0)
    weekLeads.forEach((l) => {
      if (l.created_at) {
        const day = getDayOfWeek(new Date(l.created_at))
        dailyKnocks[day]++
      }
    })
    const maxDailyKnocks = Math.max(...dailyKnocks, 1)

    // Quotes stats
    const totalQuotes = quotes.length
    const acceptedQuotes = quotes.filter((q) => q.status === 'accepted')
    const totalRevenue = acceptedQuotes.reduce((sum, q) => sum + q.total, 0)
    const weekQuotes = quotes.filter((q) => q.created_at && q.created_at >= weekStartStr)

    // Goals (placeholder - would come from rep_goals table in real implementation)
    const dailyGoal = 20
    const weeklyGoal = 100
    const dailyProgress = Math.min(100, Math.round((todayKnocked / dailyGoal) * 100))
    const weeklyProgress = Math.min(100, Math.round((weekKnocked / weeklyGoal) * 100))

    return {
      totalLeads,
      engaged,
      booked,
      converted,
      conversionRate,
      todayKnocked,
      todayEngaged,
      weekKnocked,
      weekBooked,
      dailyKnocks,
      maxDailyKnocks,
      totalQuotes,
      weekQuotes: weekQuotes.length,
      totalRevenue,
      dailyGoal,
      weeklyGoal,
      dailyProgress,
      weeklyProgress,
    }
  }, [leads, quotes])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            My Stats
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track your performance
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Today's Progress */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Today&apos;s Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl font-bold">{stats.todayKnocked}</span>
            <span className="text-sm text-muted-foreground">
              / {stats.dailyGoal} doors
            </span>
          </div>
          <Progress value={stats.dailyProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {stats.todayEngaged} conversations started
          </p>
        </CardContent>
      </Card>

      {/* Week Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DoorOpen className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Week Doors</span>
            </div>
            <div className="text-2xl font-bold">{stats.weekKnocked}</div>
            <Progress value={stats.weeklyProgress} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Engaged</span>
            </div>
            <div className="text-2xl font-bold">{stats.engaged}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CalendarCheck className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Booked</span>
            </div>
            <div className="text-2xl font-bold">{stats.booked}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Close %</span>
            </div>
            <div className="text-2xl font-bold">{stats.conversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Week Activity Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1 h-32">
            {stats.dailyKnocks.map((count, i) => {
              const heightPercent = (count / stats.maxDailyKnocks) * 100
              const isToday = i === getDayOfWeek(new Date())
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end h-24">
                    <div
                      className={cn(
                        'w-full rounded-t-sm transition-all',
                        isToday ? 'bg-primary' : 'bg-primary/40'
                      )}
                      style={{ height: `${Math.max(4, heightPercent)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[10px]',
                      isToday ? 'text-primary font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    {WEEKDAYS[i]}
                  </span>
                  <span className="text-xs font-medium">{count}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Total Won
              </p>
              <p className="text-xl font-bold text-emerald-500">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Quotes Sent
              </p>
              <p className="text-xl font-bold">{stats.totalQuotes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                This Week
              </p>
              <p className="text-xl font-bold">{stats.weekQuotes} quotes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All-Time Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            All-Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{stats.totalLeads}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.engaged}</p>
              <p className="text-xs text-muted-foreground">Engaged</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.booked}</p>
              <p className="text-xs text-muted-foreground">Booked</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.converted}</p>
              <p className="text-xs text-muted-foreground">Converted</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
