'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Target,
  CheckCircle2,
  Phone,
  Trophy,
  TrendingUp,
  DollarSign,
  Flame,
  CalendarCheck,
  Award,
  Lock,
} from 'lucide-react'
import { getLeadsForCurrentRep, type Lead } from '@/lib/leads-storage'
import { useAuth } from '@/components/auth-provider'
import { cn } from '@/lib/utils'

const DAILY_GOAL = 30 // doors per day
const WEEKLY_GOAL = 5 // bookings per week
const COMMISSION_PER_BOOKING = 75 // estimated $/booking — placeholder until Phase 3

function startOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function startOfWeekISO(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7 // Monday-start
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function SalesMePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await getLeadsForCurrentRep()
      if (cancelled) return
      setLeads(data)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const todayStart = startOfDayISO()
    const weekStart = startOfWeekISO()

    const todayLeads = leads.filter((l) => (l.created_at || '') >= todayStart)
    const weekLeads = leads.filter((l) => (l.created_at || '') >= weekStart)

    const wins = leads.filter((l) => l.status === 'booked' || l.status === 'converted').length
    const weekWins = weekLeads.filter(
      (l) => l.status === 'booked' || l.status === 'converted'
    ).length
    const totalEngaged = leads.filter(
      (l) => l.status !== 'knocked' && l.status !== 'not_home'
    ).length
    const closeRate = totalEngaged > 0 ? Math.round((wins / totalEngaged) * 100) : 0

    return {
      todayDoors: todayLeads.length,
      weekDoors: weekLeads.length,
      weekWins,
      totalLeads: leads.length,
      totalWins: wins,
      closeRate,
      estCommission: weekWins * COMMISSION_PER_BOOKING,
    }
  }, [leads])

  const dailyPct = Math.min(100, Math.round((stats.todayDoors / DAILY_GOAL) * 100))
  const weeklyPct = Math.min(100, Math.round((stats.weekWins / WEEKLY_GOAL) * 100))

  const userName =
    (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || 'Sales rep'
  const initials = userName.slice(0, 2).toUpperCase()

  return (
    <div className="px-4 pt-4 pb-6 space-y-4 max-w-3xl mx-auto w-full">
      {/* Header card with avatar + greeting */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-emerald-500/5 to-transparent p-5 flex items-center gap-4 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 20%, rgba(139,92,246,0.18), transparent 60%)',
          }}
        />
        <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/30">
          {initials}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Sales rep mode
          </div>
          <h1 className="text-xl font-bold tracking-tight truncate">{userName}</h1>
          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-card/40 border border-border animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Goals row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GoalCard
              icon={<Flame className="h-4 w-4" />}
              label="Daily goal"
              accent="text-amber-400"
              ring="ring-amber-500/20"
              progress={dailyPct}
              barClassName="bg-gradient-to-r from-amber-500 to-orange-500"
              current={stats.todayDoors}
              target={DAILY_GOAL}
              unit="doors"
            />
            <GoalCard
              icon={<CalendarCheck className="h-4 w-4" />}
              label="Weekly goal"
              accent="text-emerald-400"
              ring="ring-emerald-500/20"
              progress={weeklyPct}
              barClassName="bg-gradient-to-r from-emerald-500 to-emerald-400"
              current={stats.weekWins}
              target={WEEKLY_GOAL}
              unit="bookings"
            />
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Target className="h-4 w-4" />}
              label="Doors today"
              value={stats.todayDoors}
              accent="text-sky-400"
              ringClass="ring-sky-500/20 from-sky-500/8"
            />
            <StatCard
              icon={<Phone className="h-4 w-4" />}
              label="Week doors"
              value={stats.weekDoors}
              accent="text-violet-400"
              ringClass="ring-violet-500/20 from-violet-500/8"
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Booked jobs"
              value={stats.totalWins}
              accent="text-emerald-400"
              ringClass="ring-emerald-500/20 from-emerald-500/8"
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Close rate"
              value={`${stats.closeRate}%`}
              accent="text-amber-400"
              ringClass="ring-amber-500/20 from-amber-500/8"
            />
          </div>

          {/* Estimated commission */}
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 ring-1 ring-emerald-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Estimated commission this week
              </div>
              <div className="text-2xl font-bold tabular-nums">
                ${stats.estCommission.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.weekWins} bookings × ${COMMISSION_PER_BOOKING}/each
              </div>
            </div>
          </div>

          {/* Leaderboard preview */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-400" />
                <h2 className="font-semibold">Team leaderboard</h2>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Preview
              </span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { rank: 1, name: 'You', value: stats.totalWins, you: true, medal: '🥇' },
                { rank: 2, name: '—', value: 0, you: false, medal: '🥈' },
                { rank: 3, name: '—', value: 0, you: false, medal: '🥉' },
              ].map((row) => (
                <div
                  key={row.rank}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5',
                    row.you
                      ? 'bg-violet-500/10 ring-1 ring-violet-500/30'
                      : 'bg-background/40'
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0',
                      row.rank === 1
                        ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
                        : row.rank === 2
                          ? 'bg-slate-400/20 text-slate-300'
                          : 'bg-orange-500/20 text-orange-300'
                    )}
                  >
                    #{row.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {row.name}
                      {row.you && (
                        <span className="text-[9px] uppercase tracking-wider bg-violet-500/30 text-violet-200 px-1.5 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Bookings</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums">{row.value}</div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground text-center pt-2 flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" />
                Full leaderboard unlocks in Phase 3
              </p>
            </div>
          </div>

          {/* Lifetime totals */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-violet-400" />
              <h2 className="font-semibold">Lifetime totals</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold tabular-nums">{stats.totalLeads}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
                  Doors knocked
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-emerald-400">
                  {stats.totalWins}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
                  Wins
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-amber-400">
                  {stats.closeRate}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">
                  Close rate
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GoalCard({
  icon,
  label,
  accent,
  ring,
  progress,
  barClassName,
  current,
  target,
  unit,
}: {
  icon: React.ReactNode
  label: string
  accent: string
  ring: string
  progress: number
  barClassName: string
  current: number
  target: number
  unit: string
}) {
  return (
    <div
      className={cn('rounded-2xl border border-border bg-card p-4 ring-1', ring)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wider', accent)}>
          {icon}
          {label}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl font-bold tabular-nums">{current}</span>
        <span className="text-sm text-muted-foreground">
          / {target} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barClassName)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
  ringClass,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  accent: string
  ringClass: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-gradient-to-br to-transparent p-4 ring-1',
        ringClass
      )}
    >
      <div className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wider', accent)}>
        {icon}
        {label}
      </div>
      <div className="text-3xl font-bold mt-1.5 tabular-nums">{value}</div>
    </div>
  )
}
