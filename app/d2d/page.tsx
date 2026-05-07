'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Target, 
  Users, 
  DollarSign, 
  MapPin,
  Lock,
  CheckCircle2,
  Zap,
  BarChart3,
  Calendar,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Flame,
  Trophy,
  Clock,
  Star,
  ChevronRight,
  Loader2,
  Save,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadDay, saveDay, loadHistory, EMPTY_DAY, type D2DDayRecord } from '@/lib/d2d-storage'

// Types - matches lib/d2d-storage.ts
interface D2DData {
  date: string
  doors: number
  leads: number
  closes: number
  revenue: number
  area: string
  areaLocked: boolean
  checklist: boolean[]
}

interface AreaHistory {
  area: string
  totalDoors: number
  totalCloses: number
  totalRevenue: number
  sessions: number
  lastVisit: string
}

interface PersonalRecords {
  bestDayRevenue: { amount: number; date: string }
  bestDayCloses: { count: number; date: string }
  bestCloseRate: { rate: number; date: string; doors: number }
  longestStreak: number
}

// Targets
const TARGETS = {
  doors: 80,
  jobs: 8,
  revenue: 2000,
}

// Checklist items
const CHECKLIST_ITEMS = [
  'Knock 60–100 doors',
  'Stay in one neighborhood',
  'Ask for the sale every door',
  'Offer bundle upsell (inside + outside)',
  'Log all results',
]

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function getWeekDates() {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(today.setDate(diff))
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

function calculateStreak(history: D2DDayRecord[]): number {
  if (history.length === 0) return 0
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  const today = new Date()
  
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today)
    checkDate.setDate(today.getDate() - i)
    const dateStr = checkDate.toISOString().split('T')[0]
    const dayData = sorted.find(d => d.date === dateStr)
    
    if (dayData && dayData.doors >= TARGETS.doors) {
      streak++
    } else if (i === 0) {
      continue // Today doesn't break streak if not done yet
    } else {
      break
    }
  }
  return streak
}

function calculatePersonalRecords(history: D2DDayRecord[]): PersonalRecords {
  let bestDayRevenue = { amount: 0, date: '' }
  let bestDayCloses = { count: 0, date: '' }
  let bestCloseRate = { rate: 0, date: '', doors: 0 }
  let longestStreak = 0
  let currentStreak = 0
  
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  
  sorted.forEach(day => {
    if (day.revenue > bestDayRevenue.amount) {
      bestDayRevenue = { amount: day.revenue, date: day.date }
    }
    if (day.closes > bestDayCloses.count) {
      bestDayCloses = { count: day.closes, date: day.date }
    }
    if (day.doors >= 20) {
      const rate = (day.closes / day.doors) * 100
      if (rate > bestCloseRate.rate) {
        bestCloseRate = { rate, date: day.date, doors: day.doors }
      }
    }
    if (day.doors >= TARGETS.doors) {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  })
  
  return { bestDayRevenue, bestDayCloses, bestCloseRate, longestStreak }
}

function calculateAreaHistory(history: D2DDayRecord[]): AreaHistory[] {
  const areaMap = new Map<string, AreaHistory>()
  
  history.forEach(day => {
    if (!day.area) return
    const existing = areaMap.get(day.area) || {
      area: day.area,
      totalDoors: 0,
      totalCloses: 0,
      totalRevenue: 0,
      sessions: 0,
      lastVisit: day.date,
    }
    existing.totalDoors += day.doors
    existing.totalCloses += day.closes
    existing.totalRevenue += day.revenue
    existing.sessions++
    if (day.date > existing.lastVisit) existing.lastVisit = day.date
    areaMap.set(day.area, existing)
  })
  
  return Array.from(areaMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
}

// AI Coach recommendations
function generateCoachInsights(
  data: D2DData,
  history: D2DDayRecord[],
  areaHistory: AreaHistory[],
  hourOfDay: number
): { message: string; type: 'tip' | 'warning' | 'success' | 'motivation' }[] {
  const insights: { message: string; type: 'tip' | 'warning' | 'success' | 'motivation' }[] = []
  
  const closeRate = data.doors > 0 ? (data.closes / data.doors) * 100 : 0
  const avgCloseRate = history.length > 0
    ? history.reduce((s, d) => s + (d.doors > 0 ? (d.closes / d.doors) * 100 : 0), 0) / history.length
    : 10
  
  // Pace insights
  const hoursWorked = Math.max(1, hourOfDay - 9) // Assume start at 9am
  const expectedDoors = Math.round((hoursWorked / 8) * TARGETS.doors)
  
  if (data.doors < expectedDoors * 0.7 && hourOfDay > 12) {
    const needed = TARGETS.doors - data.doors
    const hoursLeft = Math.max(1, 17 - hourOfDay)
    const paceNeeded = Math.ceil(needed / hoursLeft)
    insights.push({
      message: `Behind pace. Need ${paceNeeded} doors/hour to hit ${TARGETS.doors}. Pick up speed.`,
      type: 'warning'
    })
  } else if (data.doors >= TARGETS.doors) {
    insights.push({
      message: `Door target crushed! Every extra door is pure bonus. Keep hunting.`,
      type: 'success'
    })
  }
  
  // Conversion insights
  if (data.doors >= 30 && closeRate < avgCloseRate * 0.7) {
    insights.push({
      message: `Close rate ${closeRate.toFixed(1)}% is below your ${avgCloseRate.toFixed(1)}% average. Are you asking for the sale?`,
      type: 'warning'
    })
  } else if (data.doors >= 30 && closeRate > avgCloseRate * 1.3) {
    insights.push({
      message: `Close rate ${closeRate.toFixed(1)}% is on fire! This area is hot—keep pushing.`,
      type: 'success'
    })
  }
  
  // Area insights
  if (data.area && areaHistory.length > 0) {
    const currentArea = areaHistory.find(a => a.area === data.area)
    if (currentArea && currentArea.sessions > 1) {
      const areaCloseRate = currentArea.totalDoors > 0 
        ? (currentArea.totalCloses / currentArea.totalDoors) * 100 
        : 0
      if (areaCloseRate > avgCloseRate * 1.2) {
        insights.push({
          message: `${data.area} historically converts ${areaCloseRate.toFixed(1)}%. Smart choice.`,
          type: 'tip'
        })
      }
    }
    
    const betterArea = areaHistory.find(a => 
      a.area !== data.area && 
      a.totalDoors > 50 &&
      (a.totalCloses / a.totalDoors) > (closeRate / 100) * 1.5
    )
    if (betterArea && data.closes === 0 && data.doors > 40) {
      insights.push({
        message: `No closes yet. Consider ${betterArea.area} (${((betterArea.totalCloses / betterArea.totalDoors) * 100).toFixed(1)}% close rate historically).`,
        type: 'tip'
      })
    }
  }
  
  // Time-based motivation
  if (hourOfDay >= 16 && data.revenue < TARGETS.revenue * 0.8) {
    const needed = TARGETS.revenue - data.revenue
    insights.push({
      message: `Golden hours 4-7pm. One more close = $${needed > 300 ? '300+' : needed}. Go get it.`,
      type: 'motivation'
    })
  }
  
  if (insights.length === 0) {
    insights.push({
      message: `Stay focused. Your next customer is in this block.`,
      type: 'motivation'
    })
  }
  
  return insights.slice(0, 3)
}

// One-time migration of legacy localStorage D2D data into Supabase.
// IMPORTANT: Only uploads a localStorage day if Supabase has NO row for that date.
// This prevents a second device's stale localStorage from overwriting fresh
// cloud data from another device.
async function migrateLocalStorageIfNeeded() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem('d2d:migrated') === 'true') return

  const legacy: Array<{ key: string; parsed: Record<string, unknown> }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('d2d:') || key === 'd2d:migrated') continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      legacy.push({ key, parsed: JSON.parse(raw) })
    } catch {
      // skip invalid
    }
  }

  // Get cloud history first so we can skip dates that already exist.
  const cloudHistory = await loadHistory()
  const cloudDates = new Set(cloudHistory.map((d) => d.date))

  for (const { parsed } of legacy) {
    const date = typeof parsed.date === 'string' ? parsed.date : null
    if (!date) continue
    // NEVER overwrite an existing cloud row with stale localStorage data.
    if (cloudDates.has(date)) continue
    try {
      await saveDay(date, {
        doors: Number(parsed.doorsKnocked ?? parsed.doors ?? 0) || 0,
        leads: Number(parsed.leads ?? 0) || 0,
        closes: Number(parsed.closes ?? 0) || 0,
        revenue: Number(parsed.revenue ?? 0) || 0,
        area: (parsed.area as string) ?? '',
        areaLocked: Boolean(parsed.areaLocked),
        checklist: Array.isArray(parsed.checklist)
          ? (parsed.checklist as boolean[])
          : [false, false, false, false, false],
        startTime: (parsed.startTime as string | null) ?? null,
      })
    } catch {
      // ignore individual failures
    }
  }

  localStorage.setItem('d2d:migrated', 'true')
}

export default function D2DTrackerPage() {
  const [mounted, setMounted] = useState(false)
  const today = useMemo(() => getToday(), [])
  const [data, setData] = useState<D2DData>({ date: today, ...EMPTY_DAY })
  const [history, setHistory] = useState<D2DDayRecord[]>([])
  const [quickInput, setQuickInput] = useState<{ type: string; value: string } | null>(null)
  const [showCoach, setShowCoach] = useState(true)
  const [showRecords, setShowRecords] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const loadSucceededRef = useRef(false)
  const prevDataRef = useRef<D2DData>({ date: today, ...EMPTY_DAY })

  // Load from Supabase on mount
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        await migrateLocalStorageIfNeeded()
        const [todayDataOrNull, allHistory] = await Promise.all([
          loadDay(today),
          loadHistory(),
        ])
        if (cancelled) return
        // null => no cloud row for today yet; keep initial EMPTY_DAY state.
        const todayData = todayDataOrNull ?? EMPTY_DAY
        setData({
          date: today,
          doors: todayData.doors,
          leads: todayData.leads,
          closes: todayData.closes,
          revenue: todayData.revenue,
          area: todayData.area,
          areaLocked: todayData.areaLocked,
          checklist: todayData.checklist,
        })
        prevDataRef.current = {
          date: today,
          doors: todayData.doors,
          leads: todayData.leads,
          closes: todayData.closes,
          revenue: todayData.revenue,
          area: todayData.area,
          areaLocked: todayData.areaLocked,
          checklist: todayData.checklist,
        }
        // Ensure today is in history for weekly calculations
        const todayRecord: D2DDayRecord = {
          date: today,
          doors: todayData.doors,
          leads: todayData.leads,
          closes: todayData.closes,
          revenue: todayData.revenue,
          area: todayData.area,
          areaLocked: todayData.areaLocked,
          checklist: todayData.checklist,
          startTime: todayData.startTime,
        }
        const filtered = allHistory.filter(h => h.date !== today)
        setHistory([todayRecord, ...filtered])
        loadSucceededRef.current = true
      } catch {
        // On load failure, keep initial zero state visible but BLOCK saves
        // so user interactions can't overwrite cloud data we failed to fetch.
        // userActedRef stays false (never set by this path), which already
        // prevents the save effect from firing.
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [today])

  // Manual save function
  const handleSave = async () => {
    console.log('[v0] handleSave clicked, data:', data)
    setSaving(true)
    try {
      await saveDay(today, {
        doors: data.doors,
        leads: data.leads,
        closes: data.closes,
        revenue: data.revenue,
        area: data.area,
        areaLocked: data.areaLocked,
        checklist: data.checklist,
        startTime: null,
      })
      // Update in-memory history for today so downstream calcs stay fresh
      setHistory(prev => {
        const filtered = prev.filter(h => h.date !== today)
        return [{
          date: today,
          doors: data.doors,
          leads: data.leads,
          closes: data.closes,
          revenue: data.revenue,
          area: data.area,
          areaLocked: data.areaLocked,
          checklist: data.checklist,
          startTime: null,
        }, ...filtered]
      })
      setHasUnsaved(false)
    } finally {
      setSaving(false)
    }
  }



  const areaHistory = useMemo(() => calculateAreaHistory(history), [history])
  const personalRecords = useMemo(() => calculatePersonalRecords(history), [history])
  const currentStreak = useMemo(() => calculateStreak(history), [history])
  const coachInsights = useMemo(() =>
    generateCoachInsights(data, history, areaHistory, mounted ? new Date().getHours() : 12),
    [data, history, areaHistory, mounted]
  )

  // Weekly data - compute from in-memory history
  const weeklyData = useMemo(() => {
    const dates = getWeekDates()
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    let doors = 0, leads = 0, closes = 0, revenue = 0
    const byDay: { day: string; revenue: number; doors: number }[] = []
    
    dates.forEach((date, i) => {
      const d = history.find(h => h.date === date)
      const dayDoors = d?.doors ?? 0
      const dayLeads = d?.leads ?? 0
      const dayCloses = d?.closes ?? 0
      const dayRevenue = d?.revenue ?? 0
      doors += dayDoors
      leads += dayLeads
      closes += dayCloses
      revenue += dayRevenue
      byDay.push({ day: dayNames[i], revenue: dayRevenue, doors: dayDoors })
    })
    
    return { doors, leads, closes, revenue, byDay }
  }, [history])

  // Calculated metrics
  const closeRate = data.doors > 0 ? ((data.closes / data.doors) * 100).toFixed(1) : '0'
  const revenuePerDoor = data.doors > 0 ? (data.revenue / data.doors).toFixed(2) : '0'

  // Progress calculations
  const doorProgress = Math.min((data.doors / TARGETS.doors) * 100, 100)
  const jobProgress = Math.min((data.closes / TARGETS.jobs) * 100, 100)
  const revenueProgress = Math.min((data.revenue / TARGETS.revenue) * 100, 100)

  // Detailed pace metrics (safe default for SSR)
  const hourOfDay = mounted ? new Date().getHours() : 12
  const hoursWorked = Math.max(1, hourOfDay - 9)
  const hoursLeft = Math.max(0, 18 - hourOfDay)
  const currentPace = data.doors / hoursWorked
  const neededPace = hoursLeft > 0 ? (TARGETS.doors - data.doors) / hoursLeft : 0
  
  const getPaceStatus = () => {
    if (data.doors >= TARGETS.doors) return { text: 'Target hit!', color: 'text-emerald-500', emoji: '' }
    if (currentPace >= (TARGETS.doors / 8)) return { text: 'On pace', color: 'text-emerald-500', emoji: '✓' }
    if (currentPace >= (TARGETS.doors / 8) * 0.7) return { text: 'Slightly behind', color: 'text-amber-500', emoji: '→' }
    return { text: 'Behind pace', color: 'text-red-500', emoji: '!' }
  }
  const pace = getPaceStatus()

  // Update helpers — mark as unsaved so the Save button activates.
  const updateField = useCallback(<K extends keyof D2DData>(field: K, value: D2DData[K]) => {
    setHasUnsaved(true)
    setData(prev => ({ ...prev, [field]: value }))
  }, [])

  const increment = useCallback((field: 'doors' | 'leads' | 'closes' | 'revenue', amount: number) => {
    setHasUnsaved(true)
    setData(prev => ({ ...prev, [field]: Math.max(0, prev[field] + amount) }))
  }, [])

  const toggleChecklist = (index: number) => {
    setHasUnsaved(true)
    const newChecklist = [...data.checklist]
    newChecklist[index] = !newChecklist[index]
    setData(prev => ({ ...prev, checklist: newChecklist }))
  }

  const handleQuickAdd = () => {
    if (!quickInput) return
    const val = parseInt(quickInput.value) || 0
    if (val > 0) {
      increment(quickInput.type as 'doors' | 'leads' | 'closes' | 'revenue', val)
    }
    setQuickInput(null)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading your D2D data...
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header with Streak */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">D2D Tracker</h1>
            <p className="text-sm text-muted-foreground">
              {mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '\u00A0'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={saving || !hasUnsaved}
              size="sm"
              className={cn(
                'transition-all',
                hasUnsaved 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : hasUnsaved ? (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved
                </>
              )}
            </Button>
            {/* Streak Badge */}
            <button
              onClick={() => setShowRecords(!showRecords)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                currentStreak > 0 
                  ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-500 border border-orange-500/30' 
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              <Flame className={cn('h-4 w-4', currentStreak > 0 && 'animate-pulse')} />
              {currentStreak} day streak
            </button>
          </div>
        </div>

        {/* Personal Records (Expandable) */}
        {showRecords && (
          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 animate-in slide-in-from-top-2 duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Personal Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-background/50 text-center">
                  <p className="text-xl font-bold text-amber-500">${personalRecords.bestDayRevenue.amount.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Best Day Revenue</p>
                  {personalRecords.bestDayRevenue.date && (
                    <p className="text-[10px] text-muted-foreground/60">{personalRecords.bestDayRevenue.date}</p>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-background/50 text-center">
                  <p className="text-xl font-bold text-emerald-500">{personalRecords.bestDayCloses.count}</p>
                  <p className="text-[10px] text-muted-foreground">Best Day Closes</p>
                  {personalRecords.bestDayCloses.date && (
                    <p className="text-[10px] text-muted-foreground/60">{personalRecords.bestDayCloses.date}</p>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-background/50 text-center">
                  <p className="text-xl font-bold text-blue-500">{personalRecords.bestCloseRate.rate.toFixed(1)}%</p>
                  <p className="text-[10px] text-muted-foreground">Best Close Rate</p>
                  {personalRecords.bestCloseRate.doors > 0 && (
                    <p className="text-[10px] text-muted-foreground/60">{personalRecords.bestCloseRate.doors} doors</p>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-background/50 text-center">
                  <p className="text-xl font-bold text-orange-500">{personalRecords.longestStreak}</p>
                  <p className="text-[10px] text-muted-foreground">Longest Streak</p>
                  <p className="text-[10px] text-muted-foreground/60">days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI COACH WIDGET */}
        <Card className={cn(
          'border-primary/30 transition-all duration-300',
          showCoach ? 'bg-gradient-to-br from-primary/5 to-primary/10' : 'bg-card'
        )}>
          <button
            onClick={() => setShowCoach(!showCoach)}
            className="w-full"
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/20">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  AI Coach
                </CardTitle>
                <ChevronRight className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  showCoach && 'rotate-90'
                )} />
              </div>
            </CardHeader>
          </button>
          {showCoach && (
            <CardContent className="pt-0 space-y-2 animate-in slide-in-from-top-1 duration-200">
              {coachInsights.map((insight, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg text-sm',
                    insight.type === 'warning' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    insight.type === 'success' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    insight.type === 'tip' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                    insight.type === 'motivation' && 'bg-primary/10 text-primary',
                  )}
                >
                  {insight.type === 'warning' && <Clock className="h-4 w-4 mt-0.5 shrink-0" />}
                  {insight.type === 'success' && <Zap className="h-4 w-4 mt-0.5 shrink-0" />}
                  {insight.type === 'tip' && <MapPin className="h-4 w-4 mt-0.5 shrink-0" />}
                  {insight.type === 'motivation' && <Flame className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span>{insight.message}</span>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* TOP SUMMARY - Today Stats with Animation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AnimatedStatCard
            label="Doors Knocked"
            value={data.doors}
            prevValue={prevDataRef.current.doors}
            icon={Target}
            color="bg-blue-500/10 text-blue-500"
            target={TARGETS.doors}
            onIncrement={() => increment('doors', 1)}
            onDecrement={() => increment('doors', -1)}
          />
          <AnimatedStatCard
            label="Leads"
            value={data.leads}
            prevValue={prevDataRef.current.leads}
            icon={Users}
            color="bg-purple-500/10 text-purple-500"
            onIncrement={() => increment('leads', 1)}
            onDecrement={() => increment('leads', -1)}
          />
          <AnimatedStatCard
            label="Jobs Closed"
            value={data.closes}
            prevValue={prevDataRef.current.closes}
            icon={CheckCircle2}
            color="bg-emerald-500/10 text-emerald-500"
            target={TARGETS.jobs}
            onIncrement={() => increment('closes', 1)}
            onDecrement={() => increment('closes', -1)}
          />
          <AnimatedStatCard
            label="Revenue"
            value={data.revenue}
            prevValue={prevDataRef.current.revenue}
            prefix="$"
            icon={DollarSign}
            color="bg-amber-500/10 text-amber-500"
            target={TARGETS.revenue}
            onIncrement={() => setQuickInput({ type: 'revenue', value: '' })}
          />
        </div>

        {/* DAILY TARGET SECTION - Enhanced */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Daily Targets</CardTitle>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-medium', pace.color)}>{pace.emoji} {pace.text}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <AnimatedProgressRow 
              label="Doors" 
              current={data.doors} 
              target={TARGETS.doors} 
              progress={doorProgress}
              pace={`${currentPace.toFixed(1)}/hr → need ${neededPace.toFixed(1)}/hr`}
            />
            <AnimatedProgressRow 
              label="Jobs" 
              current={data.closes} 
              target={TARGETS.jobs} 
              progress={jobProgress}
              pace={`${closeRate}% close rate`}
            />
            <AnimatedProgressRow 
              label="Revenue" 
              current={data.revenue} 
              target={TARGETS.revenue} 
              progress={revenueProgress} 
              prefix="$"
              pace={`$${revenuePerDoor}/door`}
            />
            
            {/* Time remaining indicator */}
            {hoursLeft > 0 && (
              <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{hoursLeft}h left in workday</span>
                <span className="text-muted-foreground/50">|</span>
                <span className={neededPace <= 12 ? 'text-emerald-500' : neededPace <= 15 ? 'text-amber-500' : 'text-red-500'}>
                  {Math.round(neededPace * hoursLeft)} doors to go
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Totals */}
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">This Week</span>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-lg font-bold">{weeklyData.doors}</p>
                <p className="text-xs text-muted-foreground">Doors</p>
              </div>
              <div>
                <p className="text-lg font-bold">{weeklyData.leads}</p>
                <p className="text-xs text-muted-foreground">Leads</p>
              </div>
              <div>
                <p className="text-lg font-bold">{weeklyData.closes}</p>
                <p className="text-xs text-muted-foreground">Closes</p>
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-500">${weeklyData.revenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
            </div>
            
            {/* Mini chart with target line */}
            <div className="mt-4 flex items-end justify-between gap-1 h-20 relative">
              {/* Target line */}
              <div className="absolute left-0 right-0 border-t border-dashed border-primary/30" style={{ bottom: `${(TARGETS.revenue / 3000) * 100}%` }}>
                <span className="absolute -top-2.5 right-0 text-[9px] text-primary/50">Target</span>
              </div>
              {weeklyData.byDay.map((d, i) => {
                const maxRev = 3000
                const height = (d.revenue / maxRev) * 100
                const dayOfWeek = mounted ? new Date().getDay() : -1
                const isToday = mounted && i === (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
                const hitTarget = d.doors >= TARGETS.doors
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-full rounded-t transition-all duration-500 ease-out',
                        isToday ? 'bg-primary' : hitTarget ? 'bg-emerald-500' : 'bg-secondary',
                        d.revenue === 0 && 'bg-secondary/30'
                      )}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className={cn(
                      'text-[10px]',
                      isToday ? 'text-primary font-medium' : 'text-muted-foreground'
                    )}>
                      {d.day}
                    </span>
                    {hitTarget && !isToday && (
                      <Star className="h-2 w-2 text-emerald-500 absolute -top-1" />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* QUICK ACTION BUTTONS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickButton
            label="Add Doors"
            icon={Target}
            color="bg-blue-500 hover:bg-blue-600"
            onClick={() => setQuickInput({ type: 'doors', value: '' })}
          />
          <QuickButton
            label="Add Lead"
            icon={Users}
            color="bg-purple-500 hover:bg-purple-600"
            onClick={() => increment('leads', 1)}
          />
          <QuickButton
            label="Add Close"
            icon={CheckCircle2}
            color="bg-emerald-500 hover:bg-emerald-600"
            onClick={() => increment('closes', 1)}
          />
          <QuickButton
            label="Add Revenue"
            icon={DollarSign}
            color="bg-amber-500 hover:bg-amber-600"
            onClick={() => setQuickInput({ type: 'revenue', value: '' })}
          />
        </div>

        {/* Quick Input Modal */}
        {quickInput && (
          <Card className="border-primary animate-in zoom-in-95 duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  placeholder={quickInput.type === 'revenue' ? 'Enter amount' : 'Enter count'}
                  value={quickInput.value}
                  onChange={(e) => setQuickInput({ ...quickInput, value: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                  autoFocus
                  className="flex-1"
                />
                <Button onClick={handleQuickAdd}>Add</Button>
                <Button variant="ghost" onClick={() => setQuickInput(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Two column layout for checklist and area */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* DAILY PLAN CHECKLIST */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Daily Plan
                <Badge variant="outline" className="ml-auto text-xs">
                  {data.checklist.filter(Boolean).length}/{CHECKLIST_ITEMS.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200',
                    data.checklist[i] 
                      ? 'bg-emerald-500/10 scale-[0.99]' 
                      : 'hover:bg-secondary/50 hover:scale-[1.01]'
                  )}
                >
                  <Checkbox
                    checked={data.checklist[i]}
                    onCheckedChange={() => toggleChecklist(i)}
                  />
                  <span className={cn(
                    'text-sm transition-all duration-200',
                    data.checklist[i] && 'line-through text-muted-foreground'
                  )}>
                    {item}
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* ENHANCED AREA FOCUS */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Area Focus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Neighborhood name..."
                  value={data.area}
                  onChange={(e) => updateField('area', e.target.value)}
                  disabled={data.areaLocked}
                  className={cn(data.areaLocked && 'opacity-60')}
                />
                <Button
                  variant={data.areaLocked ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => updateField('areaLocked', !data.areaLocked)}
                  className="transition-all duration-200"
                >
                  <Lock className={cn('h-4 w-4', data.areaLocked && 'text-primary-foreground')} />
                </Button>
              </div>
              
              {data.areaLocked && data.area && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 animate-in fade-in duration-200">
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    Area locked: {data.area}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Don&apos;t switch until you close 2+ jobs here
                  </p>
                </div>
              )}

              {/* Area History */}
              {areaHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Your top areas:</p>
                  {areaHistory.slice(0, 3).map((area) => {
                    const areaCloseRate = area.totalDoors > 0 
                      ? ((area.totalCloses / area.totalDoors) * 100).toFixed(1)
                      : '0'
                    return (
                      <button
                        key={area.area}
                        onClick={() => {
                          if (!data.areaLocked) {
                            updateField('area', area.area)
                          }
                        }}
                        disabled={data.areaLocked}
                        className={cn(
                          'w-full flex items-center justify-between p-2 rounded-lg text-left transition-all',
                          data.area === area.area 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'bg-secondary/30 hover:bg-secondary/50',
                          data.areaLocked && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium">{area.area}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{areaCloseRate}% close</span>
                          <span className="text-emerald-500">${area.totalRevenue.toLocaleString()}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PERFORMANCE INSIGHTS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Today&apos;s Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold">{closeRate}%</p>
                <p className="text-xs text-muted-foreground">Close Rate</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold">${revenuePerDoor}</p>
                <p className="text-xs text-muted-foreground">Rev/Door</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold">{currentPace.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Doors/Hour</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-bold text-emerald-500">
                  ${data.closes > 0 ? Math.round(data.revenue / data.closes) : 0}
                </p>
                <p className="text-xs text-muted-foreground">Avg Job Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

// Animated Stat Card Component
function AnimatedStatCard({
  label,
  value,
  prevValue,
  prefix = '',
  icon: Icon,
  color,
  target,
  onIncrement,
  onDecrement,
}: {
  label: string
  value: number
  prevValue: number
  prefix?: string
  icon: React.ElementType
  color: string
  target?: number
  onIncrement?: () => void
  onDecrement?: () => void
}) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isAnimating, setIsAnimating] = useState(false)
  
  useEffect(() => {
    if (value !== prevValue) {
      setIsAnimating(true)
      const steps = 10
      const diff = value - displayValue
      const stepValue = diff / steps
      let current = displayValue
      let step = 0
      
      const interval = setInterval(() => {
        step++
        current += stepValue
        setDisplayValue(Math.round(current))
        if (step >= steps) {
          setDisplayValue(value)
          setIsAnimating(false)
          clearInterval(interval)
        }
      }, 30)
      
      return () => clearInterval(interval)
    } else if (value !== displayValue) {
      setDisplayValue(value)
    }
  }, [value, prevValue, displayValue])
  
  const progress = target ? Math.min((value / target) * 100, 100) : 0
  
  return (
    <Card className={cn(
      'relative overflow-hidden transition-all duration-300',
      isAnimating && 'scale-[1.02]'
    )}>
      {/* Progress background */}
      {target && (
        <div 
          className="absolute inset-0 bg-primary/5 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      )}
      <CardContent className="p-4 relative">
        <div className={cn('inline-flex p-2 rounded-lg mb-2', color)}>
          <Icon className="h-4 w-4" />
        </div>
        <p className={cn(
          'text-2xl font-bold transition-all duration-200',
          isAnimating && 'text-primary'
        )}>
          {prefix}{displayValue.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
        
        {(onIncrement || onDecrement) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
            {onIncrement && (
              <button
                onClick={onIncrement}
                className="p-1.5 rounded hover:bg-secondary transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            )}
            {onDecrement && (
              <button
                onClick={onDecrement}
                className="p-1.5 rounded hover:bg-secondary transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Animated Progress Row Component
function AnimatedProgressRow({
  label,
  current,
  target,
  progress,
  prefix = '',
  pace,
}: {
  label: string
  current: number
  target: number
  progress: number
  prefix?: string
  pace?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {pace && <span className="text-xs text-muted-foreground">({pace})</span>}
        </div>
        <span className="font-medium tabular-nums">
          {prefix}{current.toLocaleString()} / {prefix}{target.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            progress >= 100 ? 'bg-emerald-500' : 
            progress >= 70 ? 'bg-primary' :
            progress >= 40 ? 'bg-amber-500' : 'bg-red-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// Quick Button Component
function QuickButton({
  label,
  icon: Icon,
  color,
  onClick,
}: {
  label: string
  icon: React.ElementType
  color: string
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        'h-14 flex-col gap-1 text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',
        color
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
    </Button>
  )
}
