'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Clock,
  AlertTriangle,
  Calendar,
  Phone,
  MessageSquare,
  MapPin,
  CheckCircle2,
  Plus,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  getLeadsWithFollowUpDue,
  getLeadsWithUpcomingFollowUp,
  setFollowUp,
  clearFollowUp,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  type Lead,
} from '@/lib/leads-storage'
import { cn } from '@/lib/utils'
import { useContactLog } from '@/components/use-contact-log'

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'Not set'
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

export default function SalesFollowUpsPage() {
  const [dueLeads, setDueLeads] = useState<Lead[]>([])
  const [upcomingLeads, setUpcomingLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Logging a contact updates last_contact_at, which feeds these lists.
  const { requestLog, logSheet } = useContactLog(() => loadData())

  const loadData = async () => {
    setLoading(true)
    const [due, upcoming] = await Promise.all([
      getLeadsWithFollowUpDue(),
      getLeadsWithUpcomingFollowUp(14),
    ])
    setDueLeads(due)
    setUpcomingLeads(upcoming)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const overdueLeads = useMemo(() => dueLeads.filter((l) => isOverdue(l.follow_up_date)), [dueLeads])
  const todayLeads = useMemo(() => dueLeads.filter((l) => isToday(l.follow_up_date)), [dueLeads])

  const handleReschedule = async () => {
    if (!selectedLead || !newDate) return
    setSubmitting(true)
    const ok = await setFollowUp(selectedLead.id, newDate, newReason || undefined)
    setSubmitting(false)
    if (ok) {
      toast.success('Follow-up rescheduled')
      setRescheduleOpen(false)
      setSelectedLead(null)
      setNewDate('')
      setNewReason('')
      loadData()
    } else {
      toast.error('Failed to reschedule')
    }
  }

  const handleMarkDone = async (lead: Lead) => {
    const ok = await clearFollowUp(lead.id)
    if (ok) {
      toast.success('Follow-up completed')
      loadData()
    } else {
      toast.error('Failed to clear follow-up')
    }
  }

  const openReschedule = (lead: Lead) => {
    setSelectedLead(lead)
    setNewDate(lead.follow_up_date || '')
    setNewReason(lead.follow_up_reason || '')
    setRescheduleOpen(true)
  }

  const LeadCard = ({ lead, variant }: { lead: Lead; variant: 'overdue' | 'today' | 'upcoming' }) => {
    const statusColor = LEAD_STATUS_COLORS[lead.status]
    return (
      <Card
        className={cn(
          'group relative overflow-hidden transition-all',
          variant === 'overdue' && 'border-red-500/30 bg-red-500/5',
          variant === 'today' && 'border-amber-500/30 bg-amber-500/5',
          variant === 'upcoming' && 'border-border'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {variant === 'overdue' && (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                {variant === 'today' && (
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                {variant === 'upcoming' && (
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    variant === 'overdue' && 'text-red-500',
                    variant === 'today' && 'text-amber-500',
                    variant === 'upcoming' && 'text-muted-foreground'
                  )}
                >
                  {formatDate(lead.follow_up_date)}
                </span>
              </div>

              <h3 className="font-semibold text-foreground truncate">{lead.name || 'Unknown'}</h3>

              {lead.address && (
                <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {lead.address}
                </p>
              )}

              {lead.follow_up_reason && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2 italic">
                  &ldquo;{lead.follow_up_reason}&rdquo;
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-wider"
                  style={{
                    backgroundColor: statusColor?.bg,
                    color: statusColor?.text,
                    borderColor: 'transparent',
                  }}
                >
                  {LEAD_STATUS_LABELS[lead.status]}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              {lead.phone && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                  asChild
                >
                  <a
                    href={`tel:${lead.phone}`}
                    aria-label={`Call ${lead.name || 'lead'}`}
                    onClick={() => requestLog('call', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {lead.phone && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                  asChild
                >
                  <a
                    href={`sms:${lead.phone}`}
                    aria-label={`Text ${lead.name || 'lead'}`}
                    onClick={() => requestLog('text', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => openReschedule(lead)}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Reschedule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs text-emerald-500 hover:text-emerald-400"
              onClick={() => handleMarkDone(lead)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasAny = overdueLeads.length > 0 || todayLeads.length > 0 || upcomingLeads.length > 0

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow Ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {hasAny
              ? `${overdueLeads.length + todayLeads.length} need attention`
              : 'No follow-ups scheduled'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">All caught up!</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            No follow-ups scheduled. Set a follow-up date on any lead to see it here.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/sales/leads">
              View all leads
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      )}

      {/* Overdue Section */}
      {overdueLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-red-500">
              Overdue ({overdueLeads.length})
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {overdueLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} variant="overdue" />
            ))}
          </div>
        </section>
      )}

      {/* Today Section */}
      {todayLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-amber-500">
              Today ({todayLeads.length})
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {todayLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} variant="today" />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Section */}
      {upcomingLeads.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Upcoming ({upcomingLeads.length})</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} variant="upcoming" />
            ))}
          </div>
        </section>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Follow Up</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">New Date</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason (optional)</label>
              <Textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Call back after vacation"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={!newDate || submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {logSheet}
    </div>
  )
}
