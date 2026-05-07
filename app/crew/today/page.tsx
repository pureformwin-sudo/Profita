'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Briefcase, Clock, MapPin, Phone, ChevronRight, AlertCircle, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CrewJob {
  id: string
  title: string
  scheduled_date: string | null
  scheduled_time: string | null
  status: string
  service: string | null
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
}

export default function CrewTodayPage() {
  const [jobs, setJobs] = useState<CrewJob[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      // Pull today's jobs assigned to me via crew_users -> job_workers -> jobs
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`

      // First: my employee_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data: crewRow, error: crewErr } = await supabase
        .from('crew_users')
        .select('employee_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (crewErr) {
        if (crewErr.code === '42P01') {
          if (!cancelled) { setTablesMissing(true); setLoading(false) }
          return
        }
        console.error('[Crew] crew_users lookup failed:', crewErr)
      }
      const employeeId = crewRow?.employee_id
      if (!employeeId) {
        if (!cancelled) setLoading(false)
        return
      }

      // Pull job_workers for this employee, joined to jobs and customers
      const { data, error } = await supabase
        .from('job_workers')
        .select(`
          job_id,
          jobs!inner (
            id, title, scheduled_date, scheduled_time, status, service, customer_id,
            customers ( id, name, phone, address )
          )
        `)
        .eq('employee_id', employeeId)

      if (error) {
        console.error('[Crew] today jobs failed:', error)
        if (error.code === '42P01') setTablesMissing(true)
        if (!cancelled) setLoading(false)
        return
      }

      const list: CrewJob[] = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.jobs)
        .filter(Boolean)
        .filter((j: { scheduled_date: string | null }) => j.scheduled_date === todayStr)
        .map((j: {
          id: string; title: string; scheduled_date: string | null; scheduled_time: string | null;
          status: string; service: string | null; customer_id: string | null;
          customers: { name: string; phone: string | null; address: string | null } | null
        }) => ({
          id: j.id,
          title: j.title,
          scheduled_date: j.scheduled_date,
          scheduled_time: j.scheduled_time,
          status: j.status,
          service: j.service,
          customer_id: j.customer_id,
          customer_name: j.customers?.name || 'Customer',
          customer_phone: j.customers?.phone || null,
          customer_address: j.customers?.address || null,
        }))

      if (!cancelled) {
        setJobs(list)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto w-full overflow-x-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today&apos;s Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {tablesMissing && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-500">Database setup required</p>
                <p className="text-muted-foreground mt-1">
                  Run <code className="text-xs px-1 py-0.5 rounded bg-background/50">scripts/09-multi-mode-foundation.sql</code> in Supabase.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {jobs.length === 0 && !tablesMissing && (
          <Empty>
            <EmptyHeader>
              <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto" />
              <EmptyTitle>No jobs scheduled today</EmptyTitle>
              <EmptyDescription>
                Check back tomorrow or contact your manager.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <div className="space-y-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/crew/job/${job.id}`}>
              <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 p-2.5 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                      <Briefcase className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{job.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{job.customer_name}</p>
                        </div>
                        <Badge variant={
                          job.status === 'Completed' || job.status === 'Paid'
                            ? 'default'
                            : 'secondary'
                        }>
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {job.scheduled_time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {job.scheduled_time}
                          </span>
                        )}
                        {job.customer_address && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                            <MapPin className="h-3.5 w-3.5" />
                            {job.customer_address}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {job.customer_phone && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a href={`tel:${job.customer_phone}`}>
                              <Phone className="h-3.5 w-3.5 mr-1" />
                              Call
                            </a>
                          </Button>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground inline-flex items-center">
                          Open <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
