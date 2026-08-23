'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { getJobs, addJob, updateJob, deleteJob, getCustomers, addIncome } from '@/lib/storage'
import { Job, JobType, JobStatus, Customer } from '@/lib/types'
import { formatCurrency } from '@/lib/utils-finance'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, DollarSign, User, Briefcase, X, Navigation, ClipboardList, ExternalLink, Loader2, UserCheck, MessageSquare } from 'lucide-react'
import { useContactLog } from '@/components/use-contact-log'
import { getBookings, type Booking } from '@/lib/bookings-storage'
import { convertBookingToJob } from '@/lib/workflow-conversions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const jobTypes: JobType[] = ['Residential', 'Commercial', 'Storefront']
const jobStatuses: JobStatus[] = ['Scheduled', 'On the way', 'In progress', 'Completed', 'Invoiced', 'Paid', 'Closed']

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface JobWithCustomer extends Job {
  customerName?: string
  customerAddress?: string
}

export default function CalendarPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<JobWithCustomer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedJob, setSelectedJob] = useState<JobWithCustomer | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showJobModal, setShowJobModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [convertingBooking, setConvertingBooking] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const { requestLog, requestText, contactSheets } = useContactLog()

  const [formData, setFormData] = useState({
    customerId: '',
    date: '',
    jobType: 'Residential' as JobType,
    price: '',
    expenses: '',
    status: 'Scheduled' as JobStatus,
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const [jobsData, customersData, bookingsData] = await Promise.all([
      getJobs(), 
      getCustomers(),
      getBookings()
    ])
    
    // Enrich jobs with customer data
    const enrichedJobs = jobsData.map(job => {
      const customer = customersData.find(c => c.id === job.customerId)
      return {
        ...job,
        customerName: customer?.name || 'Unknown Customer',
        customerAddress: customer?.address || '',
      }
    })
    
    setJobs(enrichedJobs)
    setCustomers(customersData)
    setBookings(bookingsData)
    setIsLoading(false)
  }

  // Get calendar grid data
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const startingDay = firstDayOfMonth.getDay()
    const totalDays = lastDayOfMonth.getDate()
    
    const days: { date: Date; isCurrentMonth: boolean; jobs: JobWithCustomer[] }[] = []
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startingDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i)
      days.push({
        date,
        isCurrentMonth: false,
        jobs: getJobsForDate(date),
      })
    }
    
    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day)
      days.push({
        date,
        isCurrentMonth: true,
        jobs: getJobsForDate(date),
      })
    }
    
    // Next month days to fill the grid
    const remainingDays = 42 - days.length
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day)
      days.push({
        date,
        isCurrentMonth: false,
        jobs: getJobsForDate(date),
      })
    }
    
    return days
  }, [currentDate, jobs])

  // Get week data for week view
  const weekData = useMemo(() => {
    const startOfWeek = new Date(currentDate)
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
    
    const days: { date: Date; jobs: JobWithCustomer[] }[] = []
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      days.push({
        date,
        jobs: getJobsForDate(date),
      })
    }
    
    return days
  }, [currentDate, jobs])

  function getJobsForDate(date: Date): JobWithCustomer[] {
    const dateStr = date.toISOString().split('T')[0]
    return jobs.filter(job => job.date === dateStr)
  }

  function getBookingsForDate(date: Date): Booking[] {
    const dateStr = date.toISOString().split('T')[0]
    return bookings.filter(booking => booking.scheduled_date === dateStr)
  }

  function formatDateStr(date: Date): string {
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  }

  function isToday(date: Date): boolean {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  function navigateMonth(direction: number) {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1))
  }

  function navigateWeek(direction: number) {
    setCurrentDate(new Date(currentDate.getTime() + direction * 7 * 24 * 60 * 60 * 1000))
  }

  function handleDayClick(date: Date) {
    setSelectedDate(date)
    setFormData(prev => ({
      ...prev,
      date: date.toISOString().split('T')[0],
    }))
    setShowAddModal(true)
  }

  function handleJobClick(job: JobWithCustomer, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedJob(job)
    setShowJobModal(true)
  }

  function handleBookingClick(booking: Booking, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedBooking(booking)
    setShowBookingModal(true)
  }

  async function handleConvertBookingToJob() {
    if (!selectedBooking) return
    
    setConvertingBooking(true)
    const result = await convertBookingToJob(selectedBooking.id)
    setConvertingBooking(false)
    
    if (result.success) {
      toast.success(result.alreadyConverted 
        ? 'Booking was already converted to a job'
        : 'Booking converted to job successfully!')
      setShowBookingModal(false)
      setSelectedBooking(null)
      loadData()
      // Navigate to the job if created
      if (result.jobId) {
        router.push(`/jobs?id=${result.jobId}`)
      }
    } else {
      toast.error(result.error || 'Failed to convert booking to job')
    }
  }

  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault()
    
    if (!formData.customerId || !formData.price) {
      toast.error('Please select a customer and enter a price')
      return
    }

    await addJob({
      customerId: formData.customerId,
      date: formData.date,
      jobType: formData.jobType,
      price: parseFloat(formData.price),
      expenses: formData.expenses ? parseFloat(formData.expenses) : 0,
      status: formData.status,
      notes: formData.notes,
    })

    toast.success('Job scheduled!')
    setShowAddModal(false)
    setFormData({
      customerId: '',
      date: '',
      jobType: 'Residential',
      price: '',
      expenses: '',
      status: 'Scheduled',
      notes: '',
    })
    loadData()
  }

  async function handleUpdateJobStatus(status: JobStatus) {
    if (!selectedJob) return
    
    await updateJob(selectedJob.id, { status })
    
    // Immediately update selectedJob so modal shows new status
    setSelectedJob({ ...selectedJob, status })
    
    // Also update jobs array immediately for calendar UI
    setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status } : j))
    
    // If marking as Paid, also create income record to sync finances
    if (status === 'Paid') {
      await addIncome({
        amount: selectedJob.price,
        date: selectedJob.date,
        customerName: selectedJob.customerName || 'Unknown Customer',
        jobType: selectedJob.jobType,
        paymentMethod: 'Cash', // Default
        paymentStatus: 'Paid',
        jobId: selectedJob.id,
        notes: 'Auto-added from job',
      })
    }
    
    toast.success(`Job marked as ${status}`)
    // Don't close modal immediately - let user see the updated status
    loadData()
  }

  async function handleDeleteJob() {
    if (!selectedJob) return
    
    await deleteJob(selectedJob.id)
    toast.success('Job deleted')
    setShowJobModal(false)
    loadData()
  }

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-500'
      case 'On the way': return 'bg-amber-500'
      case 'In progress': return 'bg-purple-500'
      case 'Completed': return 'bg-green-500'
      case 'Invoiced': return 'bg-orange-500'
      case 'Paid': return 'bg-emerald-500'
      case 'Closed': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusBadgeColor = (status: JobStatus) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'On the way': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
      case 'In progress': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'Invoiced': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'Paid': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'Closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Calculate stats
  const todayJobs = jobs.filter(j => j.date === new Date().toISOString().split('T')[0])
  const weekJobs = weekData.flatMap(d => d.jobs)
  const scheduledJobs = jobs.filter(j => j.status === 'Scheduled')
  const totalScheduledRevenue = scheduledJobs.reduce((sum, j) => sum + j.price, 0)

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-4 sm:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-[600px] bg-muted rounded-xl" />
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Schedule</h1>
            <p className="text-muted-foreground">Manage your calendar, routes, and bookings</p>
          </div>
          <Button onClick={() => {
            setFormData(prev => ({ ...prev, date: new Date().toISOString().split('T')[0] }))
            setShowAddModal(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule Job
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                  <CalendarIcon className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-500">{todayJobs.length}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
                  <Briefcase className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-500">{weekJobs.length}</p>
                  <p className="text-xs text-muted-foreground">This Week</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{scheduledJobs.length}</p>
                  <p className="text-xs text-muted-foreground">Scheduled</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-500">{formatCurrency(totalScheduledRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Potential</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar Controls */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => viewMode === 'month' ? navigateMonth(-1) : navigateWeek(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-lg font-semibold min-w-[180px] text-center">
                  {formatDateStr(currentDate)}
                </h2>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => viewMode === 'month' ? navigateMonth(1) : navigateWeek(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Today
                </Button>
                <div className="flex rounded-lg border overflow-hidden">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none"
                    onClick={() => setViewMode('month')}
                  >
                    Month
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none"
                    onClick={() => setViewMode('week')}
                  >
                    Week
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Grid */}
        {viewMode === 'month' ? (
          <>
            {/* MOBILE: Full month grid with job names */}
            <div className="lg:hidden space-y-4">
              <Card>
                <CardContent className="p-2">
                  {/* Day Headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                      <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  {/* Calendar Days with Job Names */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {calendarData.map((day, index) => {
                      const isSelected = selectedDate?.toDateString() === day.date.toDateString()
                      const dayRevenue = day.jobs.reduce((sum, j) => sum + j.price, 0)
                      return (
                        <button
                          key={index}
                          onClick={() => setSelectedDate(day.date)}
                          className={cn(
                            "min-h-[70px] p-1 flex flex-col rounded-md transition-all text-left",
                            !day.isCurrentMonth && "opacity-30",
                            isSelected && "bg-primary/10 ring-1 ring-primary",
                            isToday(day.date) && !isSelected && "bg-primary/5 ring-1 ring-primary/50",
                            !isSelected && !isToday(day.date) && day.isCurrentMonth && "active:bg-muted"
                          )}
                        >
                          {/* Date + Revenue */}
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={cn(
                              "text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full",
                              isToday(day.date) && "bg-primary text-primary-foreground"
                            )}>
                              {day.date.getDate()}
                            </span>
                            {dayRevenue > 0 && (
                              <span className="text-[7px] font-semibold text-emerald-500">
                                ${dayRevenue >= 1000 ? `${(dayRevenue/1000).toFixed(1)}k` : dayRevenue}
                              </span>
                            )}
                          </div>
                          
{/* Job and Booking pills */}
                                          <div className="flex-1 space-y-0.5 overflow-hidden">
                                            {/* Jobs */}
                                            {day.jobs.slice(0, 2).map((job) => (
                                              <div 
                                                key={job.id} 
                                                className={cn(
                                                  "text-[7px] font-medium px-1 py-0.5 rounded truncate text-white leading-tight",
                                                  job.status === 'Paid' && "bg-emerald-500",
                                                  job.status === 'Completed' && "bg-amber-500",
                                                  job.status === 'Scheduled' && "bg-blue-500"
                                                )}
                                              >
                                                {job.customerName?.split(' ')[0] || 'Job'}
                                              </div>
                                            ))}
                                            {/* Bookings (purple) - only show if jobs < 2 */}
                                            {day.jobs.length < 2 && getBookingsForDate(day.date).slice(0, 2 - day.jobs.length).map((booking) => (
                                              <div 
                                                key={`b-${booking.id}`}
                                                className="text-[7px] font-medium px-1 py-0.5 rounded truncate text-white leading-tight bg-purple-500"
                                              >
                                                {(booking.lead_name || booking.customer_name)?.split(' ')[0] || 'Appt'}
                                              </div>
                                            ))}
                                            {(day.jobs.length + getBookingsForDate(day.date).length) > 2 && (
                                              <div className="text-[7px] text-muted-foreground font-medium">
                                                +{day.jobs.length + getBookingsForDate(day.date).length - 2} more
                                              </div>
                                            )}
                                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Selected day jobs list */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Select a day'}
                    </CardTitle>
                    <Button size="sm" onClick={() => selectedDate && handleDayClick(selectedDate)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Jobs */}
                  {selectedDate && getJobsForDate(selectedDate).map(job => (
                    <div
                      key={`job-${job.id}`}
                      onClick={() => { setSelectedJob(job); setShowJobModal(true) }}
                      className={cn(
                        "p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]",
                        job.status === 'Scheduled' && "bg-blue-500/10 border border-blue-500/20",
                        job.status === 'Completed' && "bg-amber-500/10 border border-amber-500/20",
                        job.status === 'Paid' && "bg-emerald-500/10 border border-emerald-500/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{job.customerName}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Clock className="h-3 w-3" />
                              {job.startTime ? (
                                (() => {
                                  const [h, m] = job.startTime!.split(':').map(Number)
                                  const period = h >= 12 ? 'PM' : 'AM'
                                  const hour12 = h % 12 || 12
                                  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                                })()
                              ) : (
                                <span className="italic text-muted-foreground/70">No time</span>
                              )}
                            </span>
                            <span className="truncate">{job.customerAddress || job.jobType}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-emerald-500">{formatCurrency(job.price)}</p>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            job.status === 'Scheduled' && "bg-blue-500/20 text-blue-400",
                            job.status === 'Completed' && "bg-amber-500/20 text-amber-400",
                            job.status === 'Paid' && "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {job.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Bookings from Sales Force */}
                  {selectedDate && getBookingsForDate(selectedDate).map(booking => (
                    <div
                      key={`booking-${booking.id}`}
                      onClick={(e) => handleBookingClick(booking, e)}
                      className="p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] bg-purple-500/10 border border-purple-500/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{booking.lead_name || booking.customer_name || 'Lead'}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 font-medium">BOOKING</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <Clock className="h-3 w-3" />
                              {booking.scheduled_time ? (
                                (() => {
                                  const [h, m] = booking.scheduled_time.split(':').map(Number)
                                  const period = h >= 12 ? 'PM' : 'AM'
                                  const hour12 = h % 12 || 12
                                  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                                })()
                              ) : (
                                <span className="italic text-muted-foreground/70">No time</span>
                              )}
                            </span>
                            <span className="truncate">{booking.service_type}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            booking.status === 'scheduled' && "bg-purple-500/20 text-purple-400",
                            booking.status === 'confirmed' && "bg-emerald-500/20 text-emerald-400",
                            booking.status === 'completed' && "bg-green-500/20 text-green-400"
                          )}>
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Empty state */}
                  {selectedDate && getJobsForDate(selectedDate).length === 0 && getBookingsForDate(selectedDate).length === 0 && (
                    <div className="py-6 text-center text-muted-foreground">
                      <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No jobs or bookings</p>
                      <Button 
                        variant="link" 
                        size="sm"
                        onClick={() => selectedDate && handleDayClick(selectedDate)}
                      >
                        Schedule a job
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* DESKTOP: Full calendar grid */}
            <Card className="hidden lg:block">
              <CardContent className="p-4">
                {/* Day Headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAYS.map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarData.map((day, index) => {
                    const dayRevenue = day.jobs.reduce((sum, j) => sum + j.price, 0)
                    return (
                      <div
                        key={index}
                        className={cn(
                          "min-h-[120px] p-2 rounded-lg border cursor-pointer transition-all hover:bg-muted/50 hover:border-muted-foreground/30 group",
                          !day.isCurrentMonth && "opacity-40",
                          isToday(day.date) && "border-primary bg-primary/5 ring-1 ring-primary/20"
                        )}
                        onClick={() => handleDayClick(day.date)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
                            isToday(day.date) && "bg-primary text-primary-foreground"
                          )}>
                            {day.date.getDate()}
                          </span>
                          {day.jobs.length > 0 && (
                            <span className="text-xs font-medium text-emerald-500">
                              {formatCurrency(dayRevenue)}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 max-h-[85px] overflow-y-auto scrollbar-thin">
                          {day.jobs.map(job => (
                            <div
                              key={job.id}
                              className={cn(
                                "text-xs px-2 py-1.5 rounded text-white cursor-pointer transition-transform hover:scale-[1.02] font-medium",
                                job.status === 'Scheduled' && "bg-gradient-to-r from-blue-500 to-blue-600",
                                job.status === 'Completed' && "bg-gradient-to-r from-amber-500 to-amber-600",
                                job.status === 'Paid' && "bg-gradient-to-r from-emerald-500 to-emerald-600"
                              )}
                              onClick={(e) => handleJobClick(job, e)}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate">{job.customerName}</span>
                                {job.startTime && (
                                  <span className="text-[10px] text-white/80 flex-shrink-0">
                                    {(() => {
                                      const [h, m] = job.startTime!.split(':').map(Number)
                                      const period = h >= 12 ? 'PM' : 'AM'
                                      const hour12 = h % 12 || 12
                                      return `${hour12}${m > 0 ? ':' + m.toString().padStart(2, '0') : ''}${period}`
                                    })()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {day.jobs.length === 0 && (
                          <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Week View */
          <>
            {/* MOBILE: Vertical scrollable list */}
            <div className="lg:hidden space-y-3">
              {weekData.map((day, index) => {
                const dayRevenue = day.jobs.reduce((sum, j) => sum + j.price, 0)
                return (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex flex-col items-center justify-center",
                            isToday(day.date) 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted"
                          )}>
                            <span className="text-[10px] font-medium opacity-70">{DAYS[index]}</span>
                            <span className="text-lg font-bold leading-none">{day.date.getDate()}</span>
                          </div>
                          <div>
                            <p className="font-semibold">
                              {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {day.jobs.length} job{day.jobs.length !== 1 ? 's' : ''}
                              {dayRevenue > 0 && ` · ${formatCurrency(dayRevenue)}`}
                            </p>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleDayClick(day.date)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    {day.jobs.length > 0 && (
                      <CardContent className="pt-0 space-y-2">
                        {day.jobs.map(job => (
                          <div
                            key={job.id}
                            onClick={() => { setSelectedJob(job); setShowJobModal(true) }}
                            className={cn(
                              "p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]",
                              job.status === 'Scheduled' && "bg-blue-500/10 border border-blue-500/20",
                              job.status === 'Completed' && "bg-amber-500/10 border border-amber-500/20",
                              job.status === 'Paid' && "bg-emerald-500/10 border border-emerald-500/20"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold truncate">{job.customerName}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1 flex-shrink-0">
                                    <Clock className="h-3 w-3" />
                                    {job.startTime ? (
                                      (() => {
                                        const [h, m] = job.startTime!.split(':').map(Number)
                                        const period = h >= 12 ? 'PM' : 'AM'
                                        const hour12 = h % 12 || 12
                                        return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                                      })()
                                    ) : (
                                      <span className="italic text-muted-foreground/70">No time</span>
                                    )}
                                  </span>
                                  <span>{job.jobType}</span>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-emerald-500">{formatCurrency(job.price)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>

            {/* DESKTOP: Full 7-column grid */}
            <Card className="hidden lg:block">
              <CardContent className="p-4">
                <div className="grid grid-cols-7 gap-3">
                  {weekData.map((day, index) => {
                    const dayRevenue = day.jobs.reduce((sum, j) => sum + j.price, 0)
                    return (
                      <div key={index} className="min-h-[400px] flex flex-col">
                        <div className={cn(
                          "text-center py-3 mb-3 rounded-xl transition-all",
                          isToday(day.date) 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                            : "bg-secondary/50"
                        )}>
                          <div className="text-xs font-medium opacity-80">{DAYS[index]}</div>
                          <div className="text-xl font-bold">{day.date.getDate()}</div>
                          {day.jobs.length > 0 && (
                            <div className={cn(
                              "text-xs font-semibold mt-1",
                              isToday(day.date) ? "text-primary-foreground/80" : "text-emerald-500"
                            )}>
                              {formatCurrency(dayRevenue)}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 flex-1">
                          {day.jobs.map(job => (
                            <div
                              key={job.id}
                              className={cn(
                                "p-2.5 rounded-xl text-white cursor-pointer text-xs transition-all hover:scale-[1.02] hover:shadow-lg",
                                job.status === 'Scheduled' && "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20",
                                job.status === 'Completed' && "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20",
                                job.status === 'Paid' && "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20"
                              )}
                              onClick={(e) => handleJobClick(job, e)}
                            >
                              <div className="font-semibold truncate">{job.customerName}</div>
                              <div className="flex items-center gap-1.5 text-white/80 text-[10px] mt-0.5">
                                {job.startTime && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {(() => {
                                      const [h, m] = job.startTime!.split(':').map(Number)
                                      const period = h >= 12 ? 'PM' : 'AM'
                                      const hour12 = h % 12 || 12
                                      return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                                    })()}
                                  </span>
                                )}
                                <span>{job.jobType}</span>
                              </div>
                              <div className="font-bold mt-1">{formatCurrency(job.price)}</div>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs h-9 mt-2 border border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary"
                          onClick={() => handleDayClick(day.date)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Job
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Add Job Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule New Job</DialogTitle>
              <DialogDescription>
                {selectedDate && `Scheduling for ${selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddJob} className="space-y-4">
              <div>
                <Label htmlFor="customer">Customer *</Label>
                <Select value={formData.customerId} onValueChange={(v) => setFormData(prev => ({ ...prev, customerId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jobType">Job Type</Label>
                  <Select value={formData.jobType} onValueChange={(v) => setFormData(prev => ({ ...prev, jobType: v as JobType }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as JobStatus }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any special instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Schedule Job</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Job Details Modal */}
        <Dialog open={showJobModal} onOpenChange={setShowJobModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Job Details</DialogTitle>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-primary/10">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{selectedJob.customerName}</p>
                    <span className={cn("text-xs px-2 py-1 rounded-full", getStatusBadgeColor(selectedJob.status))}>
                      {selectedJob.status}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(selectedJob.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {selectedJob.startTime ? (
                      <span>
                        {(() => {
                          const [h, m] = selectedJob.startTime!.split(':').map(Number)
                          const period = h >= 12 ? 'PM' : 'AM'
                          const hour12 = h % 12 || 12
                          return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                        })()}
                        {selectedJob.endTime && (
                          <>
                            {' - '}
                            {(() => {
                              const [h, m] = selectedJob.endTime!.split(':').map(Number)
                              const period = h >= 12 ? 'PM' : 'AM'
                              const hour12 = h % 12 || 12
                              return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                            })()}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">No time set</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedJob.jobType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{formatCurrency(selectedJob.price)}</span>
                  </div>
                  {selectedJob.customerAddress && (
                    <div className="flex items-center gap-2 text-sm col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedJob.customerAddress}</span>
                    </div>
                  )}
                </div>

                {selectedJob.notes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">{selectedJob.notes}</p>
                  </div>
                )}

                {/* Status-based workflow actions */}
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {selectedJob.status === 'Scheduled' && (
                    <Button size="sm" onClick={() => handleUpdateJobStatus('On the way')}>
                      Start Job
                    </Button>
                  )}
                  {selectedJob.status === 'On the way' && (
                    <Button size="sm" onClick={() => handleUpdateJobStatus('In progress')}>
                      Mark Arrived
                    </Button>
                  )}
                  {selectedJob.status === 'In progress' && (
                    <Button size="sm" onClick={() => handleUpdateJobStatus('Completed')}>
                      Complete Job
                    </Button>
                  )}
                  {selectedJob.status === 'Completed' && (
                    <Button size="sm" onClick={() => handleUpdateJobStatus('Invoiced')}>
                      Create Invoice
                    </Button>
                  )}
                  {(selectedJob.status === 'Completed' || selectedJob.status === 'Invoiced') && (
                    <Button size="sm" onClick={() => handleUpdateJobStatus('Paid')}>
                      Mark Paid
                    </Button>
                  )}
                  {selectedJob.status === 'Paid' && (
                    <Button size="sm" variant="outline" onClick={() => handleUpdateJobStatus('Closed')}>
                      Archive
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => router.push('/jobs')}>
                    View in Jobs
                  </Button>
                  {(selectedJob.status === 'Scheduled' || selectedJob.status === 'On the way') && (
                    <Button size="sm" variant="destructive" onClick={handleDeleteJob}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Booking Details Modal */}
        <Dialog open={showBookingModal} onOpenChange={setShowBookingModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Booking Details</DialogTitle>
              <DialogDescription>Sales appointment from lead pipeline</DialogDescription>
            </DialogHeader>
            {selectedBooking && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-purple-500/10">
                    <UserCheck className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{selectedBooking.lead_name || selectedBooking.customer_name || 'Unknown'}</p>
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full",
                      selectedBooking.status === 'scheduled' && "bg-blue-500/20 text-blue-400",
                      selectedBooking.status === 'confirmed' && "bg-emerald-500/20 text-emerald-400",
                      selectedBooking.status === 'completed' && "bg-green-500/20 text-green-400",
                      selectedBooking.status === 'cancelled' && "bg-red-500/20 text-red-400",
                      selectedBooking.status === 'no_show' && "bg-amber-500/20 text-amber-400"
                    )}>
                      {selectedBooking.status.charAt(0).toUpperCase() + selectedBooking.status.slice(1)}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(selectedBooking.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  {selectedBooking.scheduled_time && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {(() => {
                          const [h, m] = selectedBooking.scheduled_time.split(':').map(Number)
                          const period = h >= 12 ? 'PM' : 'AM'
                          const hour12 = h % 12 || 12
                          return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedBooking.service_type || 'Service'}</span>
                  </div>
                  {selectedBooking.lead_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedBooking.lead_phone}</span>
                    </div>
                  )}
                  {selectedBooking.address && (
                    <div className="flex items-center gap-2 text-sm col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedBooking.address}</span>
                    </div>
                  )}
                </div>

                {selectedBooking.notes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">{selectedBooking.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  {selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
                    <Button 
                      size="sm" 
                      onClick={handleConvertBookingToJob}
                      disabled={convertingBooking}
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      {convertingBooking ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Briefcase className="h-4 w-4 mr-2" />
                          Create Job
                        </>
                      )}
                    </Button>
                  )}
                  {selectedBooking.address && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(selectedBooking.address || '')}`)}
                    >
                      <Navigation className="h-4 w-4 mr-2" />
                      Directions
                    </Button>
                  )}
                  {selectedBooking.lead_phone && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.open(`tel:${selectedBooking.lead_phone}`)
                          requestLog(
                            'call',
                            { leadId: selectedBooking.lead_id, customerId: selectedBooking.customer_id },
                            selectedBooking.lead_name || selectedBooking.customer_name || '',
                          )
                        }}
                      >
                        <User className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          requestText(
                            { leadId: selectedBooking.lead_id, customerId: selectedBooking.customer_id },
                            selectedBooking.lead_name || selectedBooking.customer_name || '',
                            selectedBooking.lead_phone,
                          )
                        }
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Text
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {contactSheets}
      </div>
    </AppShell>
  )
}
