'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CalendarCheck,
  MapPin,
  Phone,
  Clock,
  DollarSign,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Sparkles,
  User,
  Plus,
  Check,
  X,
  Calendar,
  MessageSquare,
  Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getBookingsForRep,
  createBooking,
  updateBooking,
  type Booking,
} from '@/lib/bookings-storage'
import { getLeadsForCurrentRep, type Lead } from '@/lib/leads-storage'
import { cn } from '@/lib/utils'
import { useContactLog } from '@/components/use-contact-log'

const STATUS_CONFIG: Record<Booking['status'], { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  confirmed: { label: 'Confirmed', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  completed: { label: 'Completed', color: 'text-zinc-400', bg: 'bg-zinc-500/15' },
  cancelled: { label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/15' },
  no_show: { label: 'No Show', color: 'text-amber-400', bg: 'bg-amber-500/15' },
}

const SERVICE_TYPES = [
  'Window Cleaning',
  'Pressure Washing',
  'Gutter Cleaning',
  'Solar Panel Cleaning',
  'Roof Cleaning',
  'House Wash',
  'Other',
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h = hours % 12 || 12
  return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr === new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr < new Date().toISOString().split('T')[0]
}

export default function SalesBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { requestLog, logSheet } = useContactLog()
  
  // New booking form
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [bookingsData, leadsResult] = await Promise.all([
      getBookingsForRep(),
      getLeadsForCurrentRep(),
    ])
    setBookings(bookingsData)
    setLeads(leadsResult.data.filter(l => l.status !== 'converted' && l.status !== 'lost'))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const { today, upcoming, past } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayList: Booking[] = []
    const upcomingList: Booking[] = []
    const pastList: Booking[] = []
    
    for (const b of bookings) {
      if (b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show') {
        pastList.push(b)
      } else if (b.scheduled_date === todayStr) {
        todayList.push(b)
      } else if (b.scheduled_date > todayStr) {
        upcomingList.push(b)
      } else {
        pastList.push(b)
      }
    }
    
    return { today: todayList, upcoming: upcomingList, past: pastList }
  }, [bookings])

  const handleCreateBooking = async () => {
    if (!selectedLeadId || !serviceType || !scheduledDate) {
      toast.error('Please fill in required fields')
      return
    }
    
    setSubmitting(true)
    const lead = leads.find(l => l.id === selectedLeadId)
    
    const result = await createBooking({
      lead_id: selectedLeadId,
      service_type: serviceType,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime || undefined,
      duration_minutes: parseInt(duration) || 60,
      address: lead?.address || undefined,
      notes: notes || undefined,
    })
    
    setSubmitting(false)
    
    if (result.success) {
      toast.success('Booking created')
      setShowNewBooking(false)
      resetForm()
      loadData()
    } else {
      toast.error(result.error || 'Failed to create booking')
    }
  }

  const handleMarkComplete = async (booking: Booking) => {
    const ok = await updateBooking(booking.id, { status: 'completed' })
    if (ok) {
      toast.success('Booking marked complete')
      loadData()
    } else {
      toast.error('Failed to update booking')
    }
  }

  const handleMarkNoShow = async (booking: Booking) => {
    const ok = await updateBooking(booking.id, { status: 'no_show' })
    if (ok) {
      toast.success('Marked as no-show')
      loadData()
    } else {
      toast.error('Failed to update booking')
    }
  }

  const resetForm = () => {
    setSelectedLeadId('')
    setServiceType('')
    setScheduledDate('')
    setScheduledTime('')
    setDuration('60')
    setNotes('')
  }

  const BookingCard = ({ booking }: { booking: Booking }) => {
    const config = STATUS_CONFIG[booking.status]
    const isActive = booking.status === 'scheduled' || booking.status === 'confirmed'
    
    return (
      <Card className={cn(
        'group transition-all',
        isToday(booking.scheduled_date) && isActive && 'border-emerald-500/30 bg-emerald-500/5'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn('text-[10px] uppercase tracking-wider', config.bg, config.color)}>
                  {config.label}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(booking.scheduled_date)}
                  {booking.scheduled_time && ` at ${formatTime(booking.scheduled_time)}`}
                </span>
              </div>
              
              {/* Customer */}
              <h3 className="font-semibold truncate flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                {booking.lead_name || 'Unknown Customer'}
              </h3>
              
              {/* Address */}
              {booking.address && (
                <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {booking.address}
                </p>
              )}
              
              {/* Service */}
              <p className="text-sm text-muted-foreground mt-1">
                {booking.service_type}
                {booking.duration_minutes && ` · ${booking.duration_minutes} min`}
              </p>
              
              {/* Notes */}
              {booking.notes && (
                <p className="text-sm text-muted-foreground/70 mt-2 line-clamp-2 italic">
                  {booking.notes}
                </p>
              )}
            </div>
            
            {/* Actions */}
            <div className="shrink-0 flex flex-col gap-1.5">
              {booking.lead_phone && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                    asChild
                  >
                    <a
                      href={`tel:${booking.lead_phone}`}
                      aria-label={`Call ${booking.lead_name || 'contact'}`}
                      onClick={() =>
                        requestLog(
                          'call',
                          { leadId: booking.lead_id, customerId: booking.customer_id },
                          booking.lead_name || booking.customer_name || '',
                        )
                      }
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                    asChild
                  >
                    <a
                      href={`sms:${booking.lead_phone}`}
                      aria-label={`Text ${booking.lead_name || 'contact'}`}
                      onClick={() =>
                        requestLog(
                          'text',
                          { leadId: booking.lead_id, customerId: booking.customer_id },
                          booking.lead_name || booking.customer_name || '',
                        )
                      }
                    >
                      <MessageSquare className="h-4 w-4" />
                    </a>
                  </Button>
                </>
              )}
              {booking.address && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20"
                  asChild
                >
                  <a href={`https://maps.google.com/?daddr=${encodeURIComponent(booking.address)}`} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          
          {/* Action Buttons for Active Bookings */}
          {isActive && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs text-emerald-500 hover:text-emerald-400"
                onClick={() => handleMarkComplete(booking)}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Complete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs text-amber-500 hover:text-amber-400"
                onClick={() => handleMarkNoShow(booking)}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                No Show
              </Button>
            </div>
          )}
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

  const hasAny = today.length > 0 || upcoming.length > 0 || past.length > 0

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Bookings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {today.length} today, {upcoming.length} upcoming
          </p>
        </div>
        <Button onClick={() => setShowNewBooking(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Booking
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Today</span>
            </div>
            <div className="text-2xl font-bold">{today.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Upcoming</span>
            </div>
            <div className="text-2xl font-bold">{upcoming.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-500/5 border-zinc-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Check className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
            </div>
            <div className="text-2xl font-bold">{past.filter(b => b.status === 'completed').length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-violet-500/10 flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-violet-500" />
          </div>
          <h2 className="text-lg font-semibold mb-1">No bookings yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create your first booking to start scheduling appointments.
          </p>
          <Button className="mt-4" onClick={() => setShowNewBooking(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Booking
          </Button>
        </div>
      )}

      {/* Today Section */}
      {today.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-emerald-500">Today ({today.length})</h2>
          </div>
          <div className="space-y-3">
            {today.map(booking => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-blue-500">Upcoming ({upcoming.length})</h2>
          </div>
          <div className="space-y-3">
            {upcoming.map(booking => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}

      {/* Past Section */}
      {past.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Check className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-muted-foreground">Past ({past.length})</h2>
          </div>
          <div className="space-y-3">
            {past.slice(0, 10).map(booking => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}

      {/* New Booking Dialog */}
      <Dialog open={showNewBooking} onOpenChange={setShowNewBooking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Lead Selection */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Customer *</label>
              <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name || 'Unnamed'} - {lead.address || 'No address'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Service Type */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Service *</label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service..." />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((service) => (
                    <SelectItem key={service} value={service}>
                      {service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Date *</label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Time</label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
            
            {/* Duration */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Notes */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBooking(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBooking} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {logSheet}
    </div>
  )
}
