'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { 
  Briefcase, Clock, MapPin, Phone, ChevronRight, AlertCircle, Calendar,
  Play, Navigation, Loader2, MessageSquare
} from 'lucide-react'
import { useContactLog } from '@/components/use-contact-log'
import { 
  getMyJobsForDate, 
  getMyEmployeeId,
  startJob,
  updateJobStatus,
  STATUS_COLORS,
  type CrewJob 
} from '@/lib/crew-storage'
import { createClient } from '@/lib/supabase/client'

export default function CrewTodayPage() {
  const [jobs, setJobs] = useState<CrewJob[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const { requestLog, requestText, contactSheets } = useContactLog()

  // Crew calls are about the job's customer, so log both ids on one row.
  const handleContact = (mode: 'call' | 'text', job: CrewJob) => {
    const subject = { jobId: job.id, customerId: job.customer_id, leadId: job.lead_id }
    // Text sends in-app through Quo; call is still a device handoff, so it only
    // queues the outcome prompt.
    if (mode === 'text') {
      requestText(subject, job.customer_name, job.customer_phone)
      return
    }
    requestLog('call', subject, job.customer_name)
  }

  const loadJobs = async () => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`

    const { employeeId: empId } = await getMyEmployeeId()
    setEmployeeId(empId)

    const { jobs: jobList, error, tablesMissing: missing } = await getMyJobsForDate(todayStr)
    
    if (missing) {
      setTablesMissing(true)
    }
    if (error) {
      console.error('[Crew] Error loading jobs:', error)
    }
    
    setJobs(jobList)
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const handleQuickStart = async (job: CrewJob, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!employeeId) {
      toast.error('Employee not found')
      return
    }

    setBusyJobId(job.id)
    
    // Get owner user ID for clock event
    const supabase = createClient()
    const { data: jobData } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', job.id)
      .single()

    if (!jobData?.user_id) {
      toast.error('Job owner not found')
      setBusyJobId(null)
      return
    }

    const result = await startJob(job.id, employeeId, jobData.user_id)
    
    if (result.success) {
      toast.success('Job started - you are now clocked in')
      // Update local state
      setJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, status: 'In Progress' } : j
      ))
    } else {
      toast.error(result.error || 'Failed to start job')
    }
    
    setBusyJobId(null)
  }

  const handleSetOnMyWay = async (job: CrewJob, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setBusyJobId(job.id)
    const result = await updateJobStatus(job.id, 'On My Way')
    
    if (result.success) {
      toast.success('Status updated - On My Way')
      setJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, status: 'On My Way' } : j
      ))
    } else {
      toast.error(result.error || 'Failed to update status')
    }
    
    setBusyJobId(null)
  }

  const getStatusColors = (status: string) => {
    return STATUS_COLORS[status] || STATUS_COLORS['Scheduled']
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      </AppShell>
    )
  }

  // Group jobs by status for better organization
  const activeJobs = jobs.filter(j => ['In Progress', 'On My Way'].includes(j.status))
  const scheduledJobs = jobs.filter(j => j.status === 'Scheduled')
  const completedJobs = jobs.filter(j => ['Completed', 'Paid', 'Needs Review'].includes(j.status))

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto w-full overflow-x-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today&apos;s Jobs</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold">{jobs.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
            <p className="text-2xl font-bold text-amber-500">{activeJobs.length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-500">{completedJobs.length}</p>
            <p className="text-xs text-muted-foreground">Done</p>
          </div>
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

        {/* Active Jobs - Show first */}
        {activeJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Now</h2>
            {activeJobs.map((job) => (
              <JobCard 
                key={job.id} 
                job={job} 
                busyJobId={busyJobId}
                onQuickStart={handleQuickStart}
                onSetOnMyWay={handleSetOnMyWay}
                getStatusColors={getStatusColors}
                onContact={handleContact}
              />
            ))}
          </div>
        )}

        {/* Scheduled Jobs */}
        {scheduledJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</h2>
            {scheduledJobs.map((job) => (
              <JobCard 
                key={job.id} 
                job={job} 
                busyJobId={busyJobId}
                onQuickStart={handleQuickStart}
                onSetOnMyWay={handleSetOnMyWay}
                getStatusColors={getStatusColors}
                onContact={handleContact}
              />
            ))}
          </div>
        )}

        {/* Completed Jobs */}
        {completedJobs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Completed</h2>
            {completedJobs.map((job) => (
              <JobCard 
                key={job.id} 
                job={job} 
                busyJobId={busyJobId}
                onQuickStart={handleQuickStart}
                onSetOnMyWay={handleSetOnMyWay}
                getStatusColors={getStatusColors}
                isCompleted
                onContact={handleContact}
              />
            ))}
          </div>
        )}

        {contactSheets}
      </div>
    </AppShell>
  )
}

function JobCard({ 
  job, 
  busyJobId, 
  onQuickStart, 
  onSetOnMyWay,
  getStatusColors,
  isCompleted = false,
  onContact,
}: { 
  job: CrewJob
  busyJobId: string | null
  onQuickStart: (job: CrewJob, e: React.MouseEvent) => void
  onSetOnMyWay: (job: CrewJob, e: React.MouseEvent) => void
  getStatusColors: (status: string) => { bg: string; text: string; border: string }
  isCompleted?: boolean
  onContact: (mode: 'call' | 'text', job: CrewJob) => void
}) {
  const statusColors = getStatusColors(job.status)
  const isBusy = busyJobId === job.id
  const canStart = job.status === 'Scheduled' || job.status === 'On My Way'
  const canSetOnMyWay = job.status === 'Scheduled'

  return (
    <Link href={`/crew/job/${job.id}`}>
      <Card className={`hover:bg-muted/40 transition-colors cursor-pointer ${isCompleted ? 'opacity-60' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 p-2.5 rounded-lg ${statusColors.bg} ring-1 ${statusColors.border}`}>
              <Briefcase className={`h-5 w-5 ${statusColors.text}`} />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{job.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{job.customer_name}</p>
                </div>
                <Badge 
                  variant="outline"
                  className={`${statusColors.bg} ${statusColors.text} ${statusColors.border} shrink-0`}
                >
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
                {job.service && (
                  <span className="inline-flex items-center gap-1">
                    {job.service}
                  </span>
                )}
              </div>
              
              {/* Address with directions link */}
              {job.customer_address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.customer_address)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors p-2 -m-2 rounded-lg hover:bg-muted/50"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{job.customer_address}</span>
                  <Navigation className="h-3 w-3 shrink-0 ml-auto text-blue-500" />
                </a>
              )}
              
              {/* Action buttons - larger touch targets */}
              <div className="flex items-center gap-2 pt-1">
                {canSetOnMyWay && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => onSetOnMyWay(job, e)}
                    disabled={isBusy}
                    className="h-10 px-3 text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="h-4 w-4 mr-1.5" />
                        On My Way
                      </>
                    )}
                  </Button>
                )}
                {canStart && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => onQuickStart(job, e)}
                    disabled={isBusy}
                    className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1.5" />
                        Start Job
                      </>
                    )}
                  </Button>
                )}
                {job.customer_phone && (
                  <>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onContact('call', job)
                      }}
                      className="h-10 px-3"
                    >
                      <a href={`tel:${job.customer_phone}`}>
                        <Phone className="h-4 w-4 mr-1.5" />
                        Call
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onContact('text', job)
                      }}
                      className="h-10 px-3"
                    >
                      <MessageSquare className="h-4 w-4 mr-1.5" />
                      Text
                    </Button>
                  </>
                )}
                <span className="ml-auto text-xs text-muted-foreground inline-flex items-center">
                  Details <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
