'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, Clock, Camera, MapPin, Phone, CheckCircle2, Briefcase,
  PlayCircle, StopCircle, ImageIcon, Upload, AlertCircle, Loader2,
  Users, History, ChevronDown, Navigation,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getJobEvents, isClockedIn, logClockEvent, totalHoursFromEvents,
  type JobClockEvent,
} from '@/lib/clock-storage'
import {
  updateJobStatus,
  getJobCrewMembers,
  getJobHistory,
  CREW_STATUS_TRANSITIONS,
  STATUS_COLORS,
  type CrewJobStatus,
  type CrewMember,
} from '@/lib/crew-storage'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface JobDetail {
  id: string
  title: string
  service: string | null
  status: string
  scheduled_date: string | null
  scheduled_time: string | null
  notes: string | null
  user_id: string
  customer: {
    id: string
    name: string
    phone: string | null
    address: string | null
  } | null
}

interface JobPhoto {
  id: string
  pathname: string
  phase: 'before' | 'after'
  created_at: string
}

export default function CrewJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [events, setEvents] = useState<JobClockEvent[]>([])
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [clockedIn, setClockedIn] = useState(false)
  const [crewEmployeeId, setCrewEmployeeId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([])
  const [jobHistory, setJobHistory] = useState<Array<{
    id: string
    type: string
    timestamp: string
    actor: string | null
    details: string | null
  }>>([])

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)

  const loadAll = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setCurrentUserId(user.id)

    const { data: crewRow } = await supabase
      .from('crew_users')
      .select('employee_id')
      .eq('user_id', user.id)
      .maybeSingle()
    setCrewEmployeeId(crewRow?.employee_id || null)

    const { data: jobData, error: jobErr } = await supabase
      .from('jobs')
      .select(`
        id, title, service, status, scheduled_date, scheduled_time, notes, user_id,
        customers ( id, name, phone, address )
      `)
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr || !jobData) {
      toast.error('Could not load job')
      setLoading(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customer = (jobData as any).customers || null
    setJob({
      id: jobData.id,
      title: jobData.title,
      service: jobData.service,
      status: jobData.status,
      scheduled_date: jobData.scheduled_date,
      scheduled_time: jobData.scheduled_time,
      notes: jobData.notes,
      user_id: jobData.user_id,
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      } : null,
    })

    const evs = await getJobEvents(jobId)
    setEvents(evs)
    setClockedIn(await isClockedIn(jobId))

    const { data: photoData } = await supabase
      .from('job_photos')
      .select('id, pathname, phase, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
    setPhotos((photoData as JobPhoto[]) || [])

    // Load crew members and history
    const crew = await getJobCrewMembers(jobId)
    setCrewMembers(crew)
    const { events: history } = await getJobHistory(jobId)
    setJobHistory(history)

    setLoading(false)
  }

  useEffect(() => {
    if (jobId) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const onClockIn = async () => {
    if (!job) return
    setBusy('clock_in')
    const { error } = await logClockEvent({
      ownerUserId: job.user_id,
      jobId: job.id,
      crewEmployeeId,
      eventType: 'clock_in',
    })
    setBusy(null)
    if (error) { toast.error(error); return }
    toast.success('Clocked in')
    setClockedIn(true)
    setEvents(await getJobEvents(job.id))
  }

  const onClockOut = async () => {
    if (!job) return
    setBusy('clock_out')
    const { error } = await logClockEvent({
      ownerUserId: job.user_id,
      jobId: job.id,
      crewEmployeeId,
      eventType: 'clock_out',
    })
    setBusy(null)
    if (error) { toast.error(error); return }
    toast.success('Clocked out')
    setClockedIn(false)
    setEvents(await getJobEvents(job.id))
  }

  const uploadPhoto = async (file: File, phase: 'before' | 'after') => {
    if (!job) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image')
      return
    }
    setBusy(`photo_${phase}`)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('jobId', job.id)
      fd.append('phase', phase)
      const res = await fetch('/api/job-photos/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      const { photo } = await res.json()
      setPhotos((prev) => [...prev, photo])
      // Also log a clock event for visibility
      await logClockEvent({
        ownerUserId: job.user_id,
        jobId: job.id,
        crewEmployeeId,
        eventType: phase === 'before' ? 'photo_before' : 'photo_after',
      })
      setEvents(await getJobEvents(job.id))
      toast.success(`${phase === 'before' ? 'Before' : 'After'} photo uploaded`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      toast.error(msg)
    }
    setBusy(null)
  }

  const onSaveNote = async () => {
    if (!job || !noteDraft.trim()) return
    setBusy('note')
    const { error } = await logClockEvent({
      ownerUserId: job.user_id,
      jobId: job.id,
      crewEmployeeId,
      eventType: 'note',
      note: noteDraft.trim(),
    })
    setBusy(null)
    if (error) { toast.error(error); return }
    toast.success('Note added')
    setNoteDraft('')
    setEvents(await getJobEvents(job.id))
  }

  const onMarkComplete = async () => {
    if (!job) return
    if (clockedIn) {
      toast.error('Clock out before marking the job complete')
      return
    }
    if (!confirm('Mark this job as completed?')) return
    setBusy('complete')
    const supabase = createClient()
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'Completed' })
      .eq('id', job.id)
    setBusy(null)
    if (error) { toast.error(error.message); return }
    toast.success('Job marked complete')
    setJob({ ...job, status: 'Completed' })
  }

  const onStatusChange = async (newStatus: CrewJobStatus) => {
    if (!job) return
    setBusy('status')
    const result = await updateJobStatus(job.id, newStatus)
    setBusy(null)
    if (result.success) {
      toast.success(`Status updated to ${newStatus}`)
      setJob({ ...job, status: newStatus })
    } else {
      toast.error(result.error || 'Failed to update status')
    }
  }

  const getStatusColors = (status: string) => {
    return STATUS_COLORS[status] || STATUS_COLORS['Scheduled']
  }

  const availableTransitions = job ? (CREW_STATUS_TRANSITIONS[job.status] || []) : []

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!job) {
    return (
      <AppShell>
        <div className="p-4 lg:p-6 max-w-4xl mx-auto w-full">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-6 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Job not found</p>
                <p className="text-sm text-muted-foreground">It may have been removed or you no longer have access.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/crew/today">Back to today&apos;s jobs</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    )
  }

  const totalHrs = totalHoursFromEvents(events, currentUserId)
  const beforePhotos = photos.filter(p => p.phase === 'before')
  const afterPhotos = photos.filter(p => p.phase === 'after')

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-4xl mx-auto w-full overflow-x-hidden">
{/* Header */}
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="h-10 w-10">
            <Link href="/crew/today"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{job.title}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {job.service || 'Job'} &middot; {job.scheduled_time || 'No time'}
            </p>
          </div>
          {availableTransitions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={busy === 'status'}
                  className={`${getStatusColors(job.status).bg} ${getStatusColors(job.status).text} ${getStatusColors(job.status).border}`}
                >
                  {busy === 'status' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : null}
                  {job.status}
                  <ChevronDown className="h-4 w-4 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTransitions.map((status) => (
                  <DropdownMenuItem 
                    key={status} 
                    onClick={() => onStatusChange(status)}
                    className={`${getStatusColors(status).text}`}
                  >
                    {status}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Badge 
              variant="outline"
              className={`${getStatusColors(job.status).bg} ${getStatusColors(job.status).text} ${getStatusColors(job.status).border}`}
            >
              {job.status}
            </Badge>
          )}
        </div>

        {/* Customer */}
        {job.customer && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{job.customer.name}</p>
                  {job.customer.address && (
                    <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {job.customer.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {job.customer.phone && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${job.customer.phone}`}>
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      Call
                    </a>
                  </Button>
                )}
                {job.customer.address && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(job.customer.address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-3.5 w-3.5 mr-1.5" />
                      Directions
                    </a>
                  </Button>
                )}
</div>
            </CardContent>
          </Card>
        )}

        {/* Assigned Crew */}
        {crewMembers.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Assigned Crew ({crewMembers.length})
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {crewMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 text-sm"
                  >
                    <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-xs font-semibold">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate max-w-[120px]">{member.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clock in/out */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Time on Job
                </p>
                <p className="text-2xl font-bold tabular-nums">{totalHrs.toFixed(2)}h</p>
              </div>
              {clockedIn ? (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={onClockOut}
                  disabled={busy === 'clock_out'}
                >
                  {busy === 'clock_out' ? <Loader2 className="h-5 w-5 animate-spin" /> : <StopCircle className="h-5 w-5 mr-2" />}
                  Clock Out
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-500"
                  onClick={onClockIn}
                  disabled={busy === 'clock_in' || job.status === 'Completed' || job.status === 'Paid'}
                >
                  {busy === 'clock_in' ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5 mr-2" />}
                  Clock In
                </Button>
              )}
            </div>
            {clockedIn && (
              <p className="text-xs text-emerald-500 inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Currently clocked in
              </p>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PhotoSection
            title="Before"
            phase="before"
            photos={beforePhotos}
            inputRef={beforeInputRef}
            onPick={(f) => uploadPhoto(f, 'before')}
            uploading={busy === 'photo_before'}
          />
          <PhotoSection
            title="After"
            phase="after"
            photos={afterPhotos}
            inputRef={afterInputRef}
            onPick={(f) => uploadPhoto(f, 'after')}
            uploading={busy === 'photo_after'}
          />
        </div>

        {/* Note */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Add a note
            </p>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Anything the office should know..."
              rows={2}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveNote}
              disabled={!noteDraft.trim() || busy === 'note'}
            >
              {busy === 'note' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Save note
            </Button>
          </CardContent>
        </Card>

{/* Complete */}
        <Button
          size="lg"
          className="w-full h-12"
          onClick={onMarkComplete}
          disabled={busy === 'complete' || job.status === 'Completed' || job.status === 'Paid'}
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          {job.status === 'Completed' || job.status === 'Paid' ? 'Job Completed' : 'Mark Job Complete'}
        </Button>

        {/* Activity History */}
        {jobHistory.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Activity
                </p>
              </div>
              <div className="space-y-3">
                {jobHistory.slice(0, 10).map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      event.type === 'clock_in' ? 'bg-emerald-500/10 text-emerald-500' :
                      event.type === 'clock_out' ? 'bg-red-500/10 text-red-500' :
                      event.type === 'note' ? 'bg-blue-500/10 text-blue-500' :
                      event.type.includes('photo') ? 'bg-purple-500/10 text-purple-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {event.type === 'clock_in' && <PlayCircle className="h-4 w-4" />}
                      {event.type === 'clock_out' && <StopCircle className="h-4 w-4" />}
                      {event.type === 'note' && <Upload className="h-4 w-4" />}
                      {event.type.includes('photo') && <Camera className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">
                        {event.type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.actor && <span>{event.actor} &middot; </span>}
                        {new Date(event.timestamp).toLocaleTimeString(undefined, { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </p>
                      {event.details && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {event.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function PhotoSection({
  title,
  phase,
  photos,
  inputRef,
  onPick,
  uploading,
}: {
  title: string
  phase: 'before' | 'after'
  photos: JobPhoto[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (f: File) => void
  uploading: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {title} ({photos.length})
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
            Add
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              if (e.target) e.target.value = ''
            }}
          />
        </div>
        {photos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border h-24 flex items-center justify-center text-muted-foreground/60">
            <ImageIcon className="h-6 w-6" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <a
                key={p.id}
                href={`/api/job-photos/file?pathname=${encodeURIComponent(p.pathname)}`}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-square rounded-md overflow-hidden bg-muted ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/job-photos/file?pathname=${encodeURIComponent(p.pathname)}`}
                  alt={`${phase} photo`}
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
