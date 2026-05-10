'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Briefcase, Clock, Calendar, CheckCircle2, PlayCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { STATUS_COLORS } from '@/lib/crew-storage'

interface CrewJob {
  id: string
  title: string
  scheduled_date: string
  scheduled_time: string | null
  status: string
  customer_name: string
}

function formatDateKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function CrewWeekPage() {
  const [jobs, setJobs] = useState<CrewJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }

      const { data: crewRow } = await supabase
        .from('crew_users')
        .select('employee_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!crewRow?.employee_id) { if (!cancelled) setLoading(false); return }

      const today = new Date()
      const start = new Date(today); start.setHours(0,0,0,0)
      const end = new Date(today); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999)

      const { data, error } = await supabase
        .from('job_workers')
        .select(`
          jobs!inner (
            id, title, scheduled_date, scheduled_time, status,
            customers ( name )
          )
        `)
        .eq('employee_id', crewRow.employee_id)

      if (error) { console.error('[Crew] week jobs failed:', error); if (!cancelled) setLoading(false); return }

      const list: CrewJob[] = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.jobs)
        .filter(Boolean)
        .filter((j: { scheduled_date: string | null }) => {
          if (!j.scheduled_date) return false
          const d = new Date(`${j.scheduled_date}T00:00:00`)
          return d >= start && d <= end
        })
        .map((j: {
          id: string; title: string; scheduled_date: string;
          scheduled_time: string | null; status: string;
          customers: { name: string } | null
        }) => ({
          id: j.id,
          title: j.title,
          scheduled_date: j.scheduled_date,
          scheduled_time: j.scheduled_time,
          status: j.status,
          customer_name: j.customers?.name || 'Customer',
        }))
        .sort((a: CrewJob, b: CrewJob) => {
          const ad = a.scheduled_date.localeCompare(b.scheduled_date)
          if (ad !== 0) return ad
          return (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
        })

      if (!cancelled) { setJobs(list); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  // Group by day
  const groups = new Map<string, CrewJob[]>()
  for (const j of jobs) {
    const arr = groups.get(j.scheduled_date) || []
    arr.push(j)
    groups.set(j.scheduled_date, arr)
  }
  const days = Array.from(groups.keys()).sort()

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto w-full overflow-x-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">This Week</h1>
          <p className="text-sm text-muted-foreground">Your assigned jobs for the next 7 days</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && days.length === 0 && (
          <Empty>
            <EmptyHeader>
              <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto" />
              <EmptyTitle>No jobs this week</EmptyTitle>
              <EmptyDescription>Your schedule is clear.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {days.map((day) => {
          const dayJobs = groups.get(day) || []
          const isToday = day === formatDateKey(new Date())
          return (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {dayLabel(day)}
                </h2>
                {isToday && (
                  <span className="text-[10px] font-bold text-emerald-500 px-2 py-0.5 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                    TODAY
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {dayJobs.map((job) => {
                  const colors = STATUS_COLORS[job.status] || STATUS_COLORS['Scheduled']
                  const isCompleted = job.status === 'Completed' || job.status === 'Paid'
                  const isInProgress = job.status === 'In Progress'
                  
                  return (
                    <Link key={job.id} href={`/crew/job/${job.id}`}>
                      <Card className={`hover:bg-muted/40 transition-colors cursor-pointer ${isCompleted ? 'opacity-60' : ''}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`shrink-0 p-2 rounded-lg ${
                            isCompleted ? 'bg-emerald-500/10' : 
                            isInProgress ? 'bg-blue-500/10' : 
                            'bg-muted'
                          }`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : isInProgress ? (
                              <PlayCircle className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{job.customer_name}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {job.scheduled_time && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {job.scheduled_time}
                              </span>
                            )}
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}
                            >
                              {job.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
