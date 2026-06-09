'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useMode } from '@/lib/mode-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Map,
  Users,
  Target,
  DollarSign,
  Clock,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Award,
  CheckCircle2,
  MapPin,
  Calendar,
  CircleDot,
} from 'lucide-react'

// Types
interface DayStats {
  id?: string
  date: string
  doors: number
  leads: number
  closes: number
  revenue: number
  area: string
  plan_completed: Record<string, boolean>
}

interface WeekStats {
  doors: number
  leads: number
  closes: number
  revenue: number
  days: { date: string; doors: number; leads: number; closes: number; revenue: number }[]
}

// Daily targets (configurable)
const DAILY_TARGETS = {
  doors: 80,
  leads: 8,  // 10% of doors
  revenue: 2000,
}

// Work hours
const WORK_START = 9  // 9 AM
const WORK_END = 18   // 6 PM (9 hours)

export default function SalesHomePage() {
  const router = useRouter()
  const { employeeId, loading: modeLoading } = useMode()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [todayStats, setTodayStats] = useState<DayStats>({
    date: new Date().toISOString().split('T')[0],
    doors: 0,
    leads: 0,
    closes: 0,
    revenue: 0,
    area: '',
    plan_completed: {},
  })
  const [weekStats, setWeekStats] = useState<WeekStats>({
    doors: 0,
    leads: 0,
    closes: 0,
    revenue: 0,
    days: [],
  })

  // Daily plan items
  const dailyPlan = [
    { id: 'warmup', label: 'Review territory & warm-up' },
    { id: 'first20', label: 'First 20 doors knocked' },
    { id: 'midday', label: 'Midday follow-up calls' },
    { id: 'afternoon', label: 'Afternoon push (40+ doors)' },
    { id: 'wrapup', label: 'End-of-day wrap-up & notes' },
  ]

  const today = new Date().toISOString().split('T')[0]

  // Load data
  useEffect(() => {
    if (modeLoading) return
    loadData()
  }, [modeLoading, employeeId])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Get today's stats
      const { data: todayData } = await supabase
        .from('d2d_days')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()

      if (todayData) {
        setTodayStats({
          id: todayData.id,
          date: todayData.date,
          doors: todayData.doors || 0,
          leads: todayData.leads || 0,
          closes: todayData.closes || 0,
          revenue: Number(todayData.revenue) || 0,
          area: todayData.area || '',
          plan_completed: todayData.plan_completed || {},
        })
      }

      // Get this week's stats (Mon-Sun)
      const now = new Date()
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      const { data: weekData } = await supabase
        .from('d2d_days')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', monday.toISOString().split('T')[0])
        .lte('date', sunday.toISOString().split('T')[0])
        .order('date', { ascending: true })

      if (weekData && weekData.length > 0) {
        const totals = weekData.reduce((acc, day) => ({
          doors: acc.doors + (day.doors || 0),
          leads: acc.leads + (day.leads || 0),
          closes: acc.closes + (day.closes || 0),
          revenue: acc.revenue + Number(day.revenue || 0),
        }), { doors: 0, leads: 0, closes: 0, revenue: 0 })

        // Build days array for chart
        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const days = daysOfWeek.map((_, i) => {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          const dateStr = d.toISOString().split('T')[0]
          const dayData = weekData.find(w => w.date === dateStr)
          return {
            date: dateStr,
            doors: dayData?.doors || 0,
            leads: dayData?.leads || 0,
            closes: dayData?.closes || 0,
            revenue: Number(dayData?.revenue) || 0,
          }
        })

        setWeekStats({ ...totals, days })
      } else {
        // Initialize empty week
        const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const days = daysOfWeek.map((_, i) => {
          const d = new Date(monday)
          d.setDate(monday.getDate() + i)
          return { date: d.toISOString().split('T')[0], doors: 0, leads: 0, closes: 0, revenue: 0 }
        })
        setWeekStats({ doors: 0, leads: 0, closes: 0, revenue: 0, days })
      }
    } catch (e) {
      console.error('[v0] Error loading sales data:', e)
    }
    setLoading(false)
  }

  // Save stats to database
  const saveStats = useCallback(async (newStats: DayStats) => {
    setSaving(true)
    const supabase = createClient()
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not authenticated')
        setSaving(false)
        return
      }

      const payload = {
        user_id: user.id,
        date: today,
        doors: newStats.doors,
        leads: newStats.leads,
        closes: newStats.closes,
        revenue: newStats.revenue,
        area: newStats.area,
        plan_completed: newStats.plan_completed,
        updated_at: new Date().toISOString(),
      }

      if (newStats.id) {
        // Update existing
        const { error } = await supabase
          .from('d2d_days')
          .update(payload)
          .eq('id', newStats.id)
        
        if (error) throw error
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('d2d_days')
          .insert(payload)
          .select()
          .single()
        
        if (error) throw error
        if (data) {
          setTodayStats(prev => ({ ...prev, id: data.id }))
        }
      }
    } catch (e) {
      console.error('[v0] Error saving stats:', e)
      toast.error('Failed to save')
    }
    setSaving(false)
  }, [today])

  // Increment/decrement handlers
  const updateStat = (field: 'doors' | 'leads' | 'closes', delta: number) => {
    const newValue = Math.max(0, todayStats[field] + delta)
    const newStats = { ...todayStats, [field]: newValue }
    setTodayStats(newStats)
    saveStats(newStats)
  }

  const updateRevenue = (delta: number) => {
    const newValue = Math.max(0, todayStats.revenue + delta)
    const newStats = { ...todayStats, revenue: newValue }
    setTodayStats(newStats)
    saveStats(newStats)
  }

  const togglePlanItem = (itemId: string) => {
    const newCompleted = {
      ...todayStats.plan_completed,
      [itemId]: !todayStats.plan_completed[itemId],
    }
    const newStats = { ...todayStats, plan_completed: newCompleted }
    setTodayStats(newStats)
    saveStats(newStats)
  }

  // Calculate pace
  const now = new Date()
  const currentHour = now.getHours() + now.getMinutes() / 60
  const hoursWorked = Math.max(0, Math.min(currentHour - WORK_START, WORK_END - WORK_START))
  const hoursLeft = Math.max(0, WORK_END - currentHour)
  const doorsPerHour = hoursWorked > 0 ? (todayStats.doors / hoursWorked).toFixed(1) : '0.0'
  const neededPerHour = hoursLeft > 0 ? ((DAILY_TARGETS.doors - todayStats.doors) / hoursLeft).toFixed(1) : '0'
  const closeRate = todayStats.leads > 0 ? Math.round((todayStats.closes / todayStats.leads) * 100) : 0
  const revenuePerDoor = todayStats.doors > 0 ? Math.round(todayStats.revenue / todayStats.doors) : 0
  
  const doorProgress = Math.min(100, (todayStats.doors / DAILY_TARGETS.doors) * 100)
  const leadProgress = Math.min(100, (todayStats.leads / DAILY_TARGETS.leads) * 100)
  const revenueProgress = Math.min(100, (todayStats.revenue / DAILY_TARGETS.revenue) * 100)
  
  const isOnPace = todayStats.doors >= (hoursWorked / (WORK_END - WORK_START)) * DAILY_TARGETS.doors
  const doorsToGo = Math.max(0, DAILY_TARGETS.doors - todayStats.doors)

  // Completed plan items count
  const planCompleted = Object.values(todayStats.plan_completed).filter(Boolean).length

  if (loading || modeLoading) {
    return (
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl bg-zinc-800" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-64 w-full rounded-2xl bg-zinc-800" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4 max-w-4xl mx-auto w-full overflow-x-hidden">
      {/* Quick Stat Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CounterCard
          icon={CircleDot}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/20"
          label="Doors Knocked"
          value={todayStats.doors}
          onIncrement={() => updateStat('doors', 1)}
          onDecrement={() => updateStat('doors', -1)}
        />
        <CounterCard
          icon={Users}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/20"
          label="Leads"
          value={todayStats.leads}
          onIncrement={() => updateStat('leads', 1)}
          onDecrement={() => updateStat('leads', -1)}
        />
        <CounterCard
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/20"
          label="Jobs Closed"
          value={todayStats.closes}
          onIncrement={() => updateStat('closes', 1)}
          onDecrement={() => updateStat('closes', -1)}
        />
        <CounterCard
          icon={DollarSign}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/20"
          label="Revenue"
          value={`$${todayStats.revenue.toLocaleString()}`}
          onIncrement={() => updateRevenue(100)}
          onDecrement={() => updateRevenue(-100)}
          isRevenue
        />
      </div>

      {/* Daily Targets */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Daily Targets</CardTitle>
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              isOnPace
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', isOnPace ? 'bg-emerald-400' : 'bg-red-400')} />
              {isOnPace ? 'On pace' : 'Behind pace'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Doors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">Doors</span>
                <span className="text-zinc-500">({doorsPerHour}/hr → need {neededPerHour}/hr)</span>
              </div>
              <span className="font-semibold text-white">{todayStats.doors} / {DAILY_TARGETS.doors}</span>
            </div>
            <Progress value={doorProgress} className="h-2.5 bg-zinc-800 [&>div]:bg-purple-500" />
          </div>

          {/* Leads/Jobs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">Jobs</span>
                <span className="text-zinc-500">({closeRate}% close rate)</span>
              </div>
              <span className="font-semibold text-white">{todayStats.closes} / {DAILY_TARGETS.leads}</span>
            </div>
            <Progress value={leadProgress} className="h-2.5 bg-zinc-800 [&>div]:bg-emerald-500" />
          </div>

          {/* Revenue */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">Revenue</span>
                <span className="text-zinc-500">(${revenuePerDoor}/door)</span>
              </div>
              <span className="font-semibold text-white">${todayStats.revenue.toLocaleString()} / ${DAILY_TARGETS.revenue.toLocaleString()}</span>
            </div>
            <Progress value={revenueProgress} className="h-2.5 bg-zinc-800 [&>div]:bg-amber-500" />
          </div>

          {/* Time remaining */}
          <div className="flex items-center justify-center gap-2 pt-2 text-sm text-zinc-500 border-t border-zinc-800">
            <Clock className="h-4 w-4" />
            <span>{hoursLeft.toFixed(1)}h left in workday</span>
            <span className="text-zinc-600">|</span>
            <span className={doorsToGo > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {doorsToGo > 0 ? `${doorsToGo} doors to go` : 'Goal reached!'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* This Week Stats */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">This Week</CardTitle>
            <Link href="/sales/my-stats" className="text-zinc-500 hover:text-white">
              <Calendar className="h-5 w-5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Week summary */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            <div className="rounded-xl bg-zinc-800/40 px-2 py-3 text-center">
              <p className="text-xl font-bold tabular-nums text-white">{weekStats.doors}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Doors</p>
            </div>
            <div className="rounded-xl bg-zinc-800/40 px-2 py-3 text-center">
              <p className="text-xl font-bold tabular-nums text-white">{weekStats.leads}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Leads</p>
            </div>
            <div className="rounded-xl bg-zinc-800/40 px-2 py-3 text-center">
              <p className="text-xl font-bold tabular-nums text-white">{weekStats.closes}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Closes</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 px-2 py-3 text-center">
              <p className="text-xl font-bold tabular-nums text-emerald-400">${weekStats.revenue.toLocaleString()}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Revenue</p>
            </div>
          </div>

          {/* Weekly chart */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Doors per day</span>
            <div className="flex items-center gap-1.5">
              <div className="w-4 border-t border-dashed border-amber-500/70" />
              <span className="text-[10px] text-zinc-500">Target {DAILY_TARGETS.doors}</span>
            </div>
          </div>
          <div className="relative h-32 rounded-xl bg-zinc-800/30 px-2 pt-4 pb-1">
            {(() => {
              const maxDoors = Math.max(...weekStats.days.map(d => d.doors), DAILY_TARGETS.doors)
              const targetPct = maxDoors > 0 ? (DAILY_TARGETS.doors / maxDoors) * 100 : 100
              return (
                <>
                  {/* Target line */}
                  <div
                    className="absolute left-2 right-2 border-t border-dashed border-amber-500/50"
                    style={{ bottom: `calc(${targetPct}% * 0.82 + 0.25rem)` }}
                  />
                  <div className="flex h-full items-end gap-1.5">
                    {weekStats.days.map((day, i) => {
                      const height = maxDoors > 0 ? (day.doors / maxDoors) * 100 : 0
                      const isToday = day.date === today
                      return (
                        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                          {day.doors > 0 && (
                            <span className={cn(
                              'text-[10px] font-semibold tabular-nums',
                              isToday ? 'text-emerald-400' : 'text-zinc-400'
                            )}>
                              {day.doors}
                            </span>
                          )}
                          <div
                            className={cn(
                              'w-full max-w-[28px] rounded-md transition-all',
                              isToday ? 'bg-emerald-500' : day.doors > 0 ? 'bg-zinc-600' : 'bg-zinc-700/40'
                            )}
                            style={{ height: `${Math.max(height, 3)}%` }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
          {/* Day labels */}
          <div className="mt-1.5 flex gap-1.5">
            {weekStats.days.map((day, i) => {
              const isToday = day.date === today
              return (
                <span
                  key={i}
                  className={cn(
                    'flex-1 text-center text-[10px] font-medium',
                    isToday ? 'text-emerald-400' : 'text-zinc-500'
                  )}
                >
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                </span>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          onClick={() => updateStat('doors', 1)}
          className="h-16 flex-col gap-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30"
        >
          <CircleDot className="h-5 w-5" />
          <span className="text-xs font-semibold">Add Doors</span>
        </Button>
        <Button
          onClick={() => updateStat('leads', 1)}
          className="h-16 flex-col gap-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30"
        >
          <Users className="h-5 w-5" />
          <span className="text-xs font-semibold">Add Lead</span>
        </Button>
        <Button
          onClick={() => updateStat('closes', 1)}
          className="h-16 flex-col gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-xs font-semibold">Add Close</span>
        </Button>
        <Button
          onClick={() => router.push('/sales/quotes/new')}
          className="h-16 flex-col gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
        >
          <DollarSign className="h-5 w-5" />
          <span className="text-xs font-semibold">Add Revenue</span>
        </Button>
      </div>

      {/* Daily Plan & Area Focus */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Daily Plan Checklist */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-zinc-400" />
                <CardTitle className="text-base font-semibold">Daily Plan</CardTitle>
              </div>
              <span className="text-sm text-zinc-500">{planCompleted}/{dailyPlan.length}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {dailyPlan.map((item) => (
              <label
                key={item.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors',
                  todayStats.plan_completed[item.id]
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-zinc-800/50 hover:bg-zinc-800'
                )}
              >
                <Checkbox
                  checked={todayStats.plan_completed[item.id] || false}
                  onCheckedChange={() => togglePlanItem(item.id)}
                  className="border-zinc-600"
                />
                <span className={cn(
                  'text-sm',
                  todayStats.plan_completed[item.id] ? 'text-emerald-400 line-through' : 'text-white'
                )}>
                  {item.label}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Area Focus / Quick Links */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-zinc-400" />
              <CardTitle className="text-base font-semibold">Quick Access</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/sales/map"
              className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Map className="h-5 w-5 text-emerald-400" />
                <span className="font-medium text-white">Sales Map</span>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </Link>
            <Link
              href="/sales/leads"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-400" />
                <span className="font-medium text-white">My Leads</span>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </Link>
            <Link
              href="/sales/pipeline"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-cyan-400" />
                <span className="font-medium text-white">Pipeline</span>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </Link>
            <Link
              href="/sales/leaderboard"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-amber-400" />
                <span className="font-medium text-white">Leaderboard</span>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-300 text-sm px-4 py-2 rounded-full shadow-lg">
          Saving...
        </div>
      )}
    </div>
  )
}

// Counter Card Component
function CounterCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  onIncrement,
  onDecrement,
  isRevenue = false,
}: {
  icon: typeof Target
  iconColor: string
  iconBg: string
  label: string
  value: string | number
  onIncrement: () => void
  onDecrement: () => void
  isRevenue?: boolean
}) {
  return (
    <div className="group relative overflow-hidden bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <div className={cn('h-10 w-10 shrink-0 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={onIncrement}
            aria-label={`Increase ${label}`}
            className="h-6 w-6 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDecrement}
            aria-label={`Decrease ${label}`}
            className="h-6 w-6 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums leading-none text-white">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-zinc-500">{label}</p>
    </div>
  )
}
