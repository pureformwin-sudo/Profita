'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, LogOut, User as UserIcon, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getMyClockEvents, totalHoursFromEvents, type JobClockEvent } from '@/lib/clock-storage'
import { useAuth } from '@/components/auth-provider'

export default function CrewMePage() {
  const { logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<JobClockEvent[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }

      // Pull employee record for display name
      const { data: crewRow } = await supabase
        .from('crew_users')
        .select('employee_id')
        .eq('user_id', user.id)
        .maybeSingle()
      let displayName = user.email || 'Crew Member'
      if (crewRow?.employee_id) {
        const { data: emp } = await supabase
          .from('employees')
          .select('name')
          .eq('id', crewRow.employee_id)
          .maybeSingle()
        if (emp?.name) displayName = emp.name
      }

      // Last 30 days of events
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const result = await getMyClockEvents(since.toISOString())

      if (!cancelled) {
        setUserId(user.id)
        setName(displayName)
        setEvents(result.data)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Compute hours buckets
  const now = new Date()
  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0)
  const startOfWeek = new Date(now)
  const dayOfWeek = startOfWeek.getDay() // 0 = Sun
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek)
  startOfWeek.setHours(0,0,0,0)

  const todayEvents = events.filter(e => new Date(e.occurred_at) >= startOfToday)
  const weekEvents = events.filter(e => new Date(e.occurred_at) >= startOfWeek)
  const monthEvents = events

  const todayHrs = totalHoursFromEvents(todayEvents, userId)
  const weekHrs = totalHoursFromEvents(weekEvents, userId)
  const monthHrs = totalHoursFromEvents(monthEvents, userId)

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto w-full overflow-x-hidden">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{loading ? '...' : name}</h1>
            <p className="text-xs text-muted-foreground">Crew member</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Clock className="h-3.5 w-3.5" />
                Today
              </div>
              <div className="text-2xl font-bold tabular-nums">{todayHrs.toFixed(1)}h</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <TrendingUp className="h-3.5 w-3.5" />
                This Week
              </div>
              <div className="text-2xl font-bold tabular-nums">{weekHrs.toFixed(1)}h</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <TrendingUp className="h-3.5 w-3.5" />
                30 Days
              </div>
              <div className="text-2xl font-bold tabular-nums">{monthHrs.toFixed(1)}h</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!loading && events.length === 0 && (
              <p className="text-sm text-muted-foreground">No clock events yet.</p>
            )}
            {!loading && events.length > 0 && (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {events.slice().reverse().slice(0, 25).map((e) => (
                  <li key={e.id} className="text-xs flex items-center justify-between">
                    <span className="font-medium">
                      {e.event_type === 'clock_in' && 'Clocked in'}
                      {e.event_type === 'clock_out' && 'Clocked out'}
                      {e.event_type === 'photo_before' && 'Before photo'}
                      {e.event_type === 'photo_after' && 'After photo'}
                      {e.event_type === 'note' && 'Note added'}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(e.occurred_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await logout()
              toast.success('Signed out')
            } catch {
              toast.error('Failed to sign out')
            }
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </AppShell>
  )
}
