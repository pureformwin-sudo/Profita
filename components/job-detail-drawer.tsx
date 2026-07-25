'use client'

import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Job, JobStatus, Customer, Estimate, Invoice, Employee, PaymentMethod, Income } from '@/lib/types'
import {
  type CustomerPlan,
  type ServicePlan,
  effectivePlanPrice,
  effectiveFrequency,
} from '@/lib/plans-storage'
import { formatDate } from '@/lib/utils-finance'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  Phone, Mail, MapPin, Navigation, MessageSquare, Calendar, Clock, 
  DollarSign, FileText, Receipt, User, ChevronDown, ChevronRight,
  Play, CheckCircle, Truck, MoreVertical, Pencil, Camera,
  Upload, Paperclip, Tag, ArrowLeft, Copy, Archive, Eye, Repeat
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { JobPhotosTab } from '@/components/job-photos/job-photos-tab'
import { JobTimerPanel } from '@/components/job-timer/job-timer-panel'
import { TimeTrackingSection } from '@/components/job-timer/time-tracking-section'

const paymentMethods: PaymentMethod[] = ['Cash', 'Card', 'Check', 'Zelle', 'Venmo', 'Other']

interface JobDetailDrawerProps {
  job: Job | null
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  estimate: Estimate | null
  invoice: Invoice | null
  employees: Employee[]
  incomes: Income[]
  customerPlans: CustomerPlan[]
  servicePlans: ServicePlan[]
  onStatusChange: (jobId: string, status: JobStatus) => Promise<void>
  onMarkPaid: (jobId: string, paymentMethod: PaymentMethod, amount: number, notes?: string) => Promise<void>
  onCreateInvoice: (jobId: string) => Promise<void>
  onEdit: (job: Job) => void
  onRefresh: () => void
  // Quick-enroll a customer into a plan from the drawer. Resolves when done so
  // the drawer can refresh. Returns true on success.
  onEnrollInPlan: (
    job: Job,
    opts: { planId: string; priceOverride: number | null; autoRenew: boolean; anchorDate: string },
  ) => Promise<boolean>
}

const statusConfig: Record<JobStatus, { label: string; color: string; bg: string }> = {
  'Scheduled': { label: 'Scheduled', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  'On the way': { label: 'On the way', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  'In progress': { label: 'In progress', color: 'text-purple-600', bg: 'bg-purple-500/10' },
  'Completed': { label: 'Completed', color: 'text-green-600', bg: 'bg-green-500/10' },
  'Invoiced': { label: 'Invoiced', color: 'text-orange-600', bg: 'bg-orange-500/10' },
  'Paid': { label: 'Paid', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  'Closed': { label: 'Closed', color: 'text-muted-foreground', bg: 'bg-muted' },
}

export function JobDetailDrawer({
  job,
  open,
  onOpenChange,
  customer,
  estimate,
  invoice,
  employees,
  incomes,
  customerPlans,
  servicePlans,
  onStatusChange,
  onMarkPaid,
  onCreateInvoice,
  onEdit,
  onRefresh,
  onEnrollInPlan,
}: JobDetailDrawerProps) {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [expandedSections, setExpandedSections] = useState<string[]>(['customer', 'schedule'])
  // Quick-enroll dialog state
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [enrollPlanId, setEnrollPlanId] = useState('')
  const [enrollPrice, setEnrollPrice] = useState('')
  const [enrollAutoRenew, setEnrollAutoRenew] = useState(true)
  const [enrollingNow, setEnrollingNow] = useState(false)

  if (!job || !customer) return null

  const paidAmount = job.paidAmount || 0
  const remainingBalance = job.price - paidAmount
  const isFullyPaid = remainingBalance <= 0
  const jobPayments = incomes.filter(i => i.jobId === job.id)

  // Recurring service plan context for this customer.
  const membership = customerPlans.find(
    (cp) => cp.customer_id === job.customerId && cp.status === 'active' && cp.plan_id,
  ) || null
  const membershipPlan = membership ? servicePlans.find((p) => p.id === membership.plan_id) || null : null
  const pendingEnrollPlan = job.pendingPlanEnrollment
    ? servicePlans.find((p) => p.id === job.pendingPlanEnrollment!.planId) || null
    : null
  const isDoneJob = job.status === 'Completed' || job.status === 'Paid'

  const handleQuickEnroll = async () => {
    if (!enrollPlanId) {
      toast.error('Select a plan')
      return
    }
    setEnrollingNow(true)
    try {
      const ok = await onEnrollInPlan(job, {
        planId: enrollPlanId,
        priceOverride: enrollPrice.trim() !== '' ? parseFloat(enrollPrice) : null,
        autoRenew: enrollAutoRenew,
        anchorDate: job.date ? job.date.split('T')[0] : new Date().toISOString().split('T')[0],
      })
      if (ok) {
        setShowEnrollModal(false)
        setEnrollPlanId('')
        setEnrollPrice('')
        onRefresh()
      }
    } finally {
      setEnrollingNow(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    )
  }

  const handleStatusAction = async (newStatus: JobStatus) => {
    // Prevent marking as Paid if balance > 0
    if (newStatus === 'Paid' && remainingBalance > 0) {
      toast.error('Cannot mark as Paid - balance is not zero. Record payment first.')
      return
    }

    setIsProcessing(true)
    try {
      await onStatusChange(job.id, newStatus)
      toast.success(`Status updated to ${newStatus}`)
      onRefresh()
    } catch (error) {
      toast.error('Failed to update status')
    }
    setIsProcessing(false)
  }

  const handleCompleteAndInvoice = async () => {
    setIsProcessing(true)
    try {
      await onStatusChange(job.id, 'Completed')
      await onCreateInvoice(job.id)
      toast.success('Job completed and invoice created!')
      onRefresh()
    } catch (error) {
      toast.error('Failed to complete job')
    }
    setIsProcessing(false)
  }

  const openPaymentModal = () => {
    setPaymentAmount(String(remainingBalance.toFixed(2)))
    setPaymentMethod('Cash')
    setPaymentNotes('')
    setShowPaymentModal(true)
  }

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (amount > remainingBalance + 0.01) { // Small tolerance for floating point
      toast.error('Amount exceeds remaining balance')
      return
    }

    setIsProcessing(true)
    try {
      await onMarkPaid(job.id, paymentMethod, amount, paymentNotes)
      setShowPaymentModal(false)
      toast.success('Payment recorded!')
      onRefresh()
    } catch (error) {
      toast.error('Failed to record payment')
    }
    setIsProcessing(false)
  }

  // Status-based primary actions
  const getPrimaryAction = () => {
    switch (job.status) {
      // Scheduled / On the way / In progress are all driven by the job timer,
      // which owns Start Job, Pause, Resume and Finish Job.
      case 'Scheduled':
      case 'On the way':
      case 'In progress':
        return (
          <JobTimerPanel
            job={job}
            onRefresh={onRefresh}
            // Preserve the existing completion workflow: finishing a job still
            // creates the invoice, but never marks it paid.
            onCompleted={async () => {
              if (!invoice) {
                try {
                  await onCreateInvoice(job.id)
                } catch {
                  toast.error('Job completed, but the invoice could not be created')
                }
              }
              onRefresh()
            }}
          />
        )
      case 'Completed':
        return (
          <div className="flex gap-2">
            {!invoice && (
              <Button onClick={() => onCreateInvoice(job.id)} variant="outline" className="flex-1" disabled={isProcessing}>
                <FileText className="h-4 w-4 mr-2" /> Create Invoice
              </Button>
            )}
            <Button onClick={openPaymentModal} className="flex-1" size="lg" disabled={isProcessing}>
              <DollarSign className="h-4 w-4 mr-2" /> Record Payment
            </Button>
          </div>
        )
      case 'Invoiced':
        return (
          <div className="flex gap-2">
            <Button onClick={openPaymentModal} className="flex-1" size="lg" disabled={isProcessing}>
              <DollarSign className="h-4 w-4 mr-2" /> Record Payment
            </Button>
            <Button variant="outline" onClick={() => toast.info('Send reminder coming soon')}>
              <Mail className="h-4 w-4" />
            </Button>
          </div>
        )
      case 'Paid':
        // Paid jobs show secondary actions only - no big "Close" button
        return (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info('View receipt coming soon')} className="flex-1">
              <Eye className="h-4 w-4 mr-2" /> View Receipt
            </Button>
            <Button variant="outline" onClick={() => toast.info('Duplicate job coming soon')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )
      case 'Closed':
        return (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info('View receipt coming soon')} className="flex-1">
              <Eye className="h-4 w-4 mr-2" /> View Receipt
            </Button>
            <Button variant="ghost" onClick={() => handleStatusAction('Paid')} disabled={isProcessing}>
              Reopen
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  const statusInfo = statusConfig[job.status]

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          {/* Fixed Header with Back Button */}
          <div className="border-b border-border bg-background sticky top-0 z-10">
            {/* Top Bar with Back */}
            <div className="flex items-center gap-2 p-3 pb-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 shrink-0"
                onClick={() => onOpenChange(false)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold truncate">Job #{job.id.slice(0, 8).toUpperCase()}</h2>
                <p className="text-sm text-muted-foreground truncate">{customer.name}</p>
              </div>
              <Badge className={cn('shrink-0 text-xs font-medium', statusInfo.bg, statusInfo.color)}>
                {statusInfo.label}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { onOpenChange(false); onEdit(job) }}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit Job
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info('Duplicate coming soon')}>
                    <Copy className="h-4 w-4 mr-2" /> Duplicate Job
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {job.status !== 'Scheduled' && job.status !== 'Closed' && (
                    <DropdownMenuItem onClick={() => handleStatusAction('Scheduled')}>
                      <Calendar className="h-4 w-4 mr-2" /> Reschedule
                    </DropdownMenuItem>
                  )}
                  {job.status === 'Paid' && (
                    <DropdownMenuItem onClick={() => handleStatusAction('Closed')}>
                      <Archive className="h-4 w-4 mr-2" /> Archive Job
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Financial Summary Card */}
            <div className="px-3 pb-3">
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/50">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-lg font-bold">${job.price.toLocaleString()}</p>
                </div>
                <div className="text-center border-x border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Paid</p>
                  <p className="text-lg font-bold text-emerald-600">${paidAmount.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</p>
                  <p className={cn('text-lg font-bold', remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                    ${remainingBalance.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Action */}
            <div className="px-3 pb-3">
              {getPrimaryAction()}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto pb-safe">
            {/* Customer Section */}
            <Collapsible open={expandedSections.includes('customer')} onOpenChange={() => toggleSection('customer')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Customer</span>
                </div>
                {expandedSections.includes('customer') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 space-y-3 bg-muted/20 border-b border-border">
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    {customer.address && (
                      <p className="text-sm text-muted-foreground">{customer.address}</p>
                    )}
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {customer.phone && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`tel:${customer.phone}`}>
                            <Phone className="h-4 w-4 mr-1" /> Call
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`sms:${customer.phone}`}>
                            <MessageSquare className="h-4 w-4 mr-1" /> Text
                          </a>
                        </Button>
                      </>
                    )}
                    {customer.email && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`mailto:${customer.email}`}>
                          <Mail className="h-4 w-4 mr-1" /> Email
                        </a>
                      </Button>
                    )}
                    {customer.address && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer">
                          <Navigation className="h-4 w-4 mr-1" /> Directions
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Schedule Section */}
            <Collapsible open={expandedSections.includes('schedule')} onOpenChange={() => toggleSection('schedule')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Schedule</span>
                </div>
                {expandedSections.includes('schedule') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Date</span>
                    <span className="font-medium">{formatDate(job.date)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Time</span>
                    <span className="font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {job.startTime ? (
                        <>
                          {(() => {
                            const [h, m] = job.startTime!.split(':').map(Number)
                            const period = h >= 12 ? 'PM' : 'AM'
                            const hour12 = h % 12 || 12
                            return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                          })()}
                          {job.endTime && (() => {
                            const [h, m] = job.endTime!.split(':').map(Number)
                            const period = h >= 12 ? 'PM' : 'AM'
                            const hour12 = h % 12 || 12
                            return ` - ${hour12}:${m.toString().padStart(2, '0')} ${period}`
                          })()}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">Not set</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <Badge variant="secondary">{job.jobType}</Badge>
                  </div>
                  {job.status === 'Scheduled' && (
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { onOpenChange(false); onEdit(job) }}>
                      <Calendar className="h-4 w-4 mr-2" /> Reschedule
                    </Button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Service Plan Section */}
            <Collapsible open={expandedSections.includes('plan')} onOpenChange={() => toggleSection('plan')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Service Plan</span>
                  {membershipPlan && (
                    <Badge variant="secondary" className="ml-1">{membershipPlan.name}</Badge>
                  )}
                  {!membership && pendingEnrollPlan && (
                    <Badge variant="outline" className="ml-1 border-amber-500/30 bg-amber-500/10 text-amber-500">
                      Pending
                    </Badge>
                  )}
                </div>
                {expandedSections.includes('plan') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                  {membership && membershipPlan ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Plan</span>
                        <span className="font-medium">{membershipPlan.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Frequency</span>
                        <span className="font-medium capitalize">
                          {effectiveFrequency(membership, membershipPlan).frequency || membershipPlan.frequency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Price</span>
                        <span className="font-medium">
                          ${effectivePlanPrice(membership, membershipPlan) ?? membershipPlan.price}
                          {membership.price_override != null && (
                            <span className="ml-1 text-xs text-muted-foreground">(custom)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Last service</span>
                        <span className="font-medium">
                          {membership.last_service_date ? formatDate(membership.last_service_date) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Next service</span>
                        <span className="font-medium">
                          {membership.next_service_date ? formatDate(membership.next_service_date) : 'Needs setup'}
                        </span>
                      </div>
                    </>
                  ) : pendingEnrollPlan ? (
                    <div className="space-y-2">
                      <p className="text-sm">
                        Will enroll in <span className="font-medium">{pendingEnrollPlan.name}</span> when this job is
                        completed.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Edit the job to change or remove this enrollment.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        This customer isn&apos;t on a recurring service plan.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setEnrollPlanId('')
                          setEnrollPrice('')
                          setEnrollAutoRenew(true)
                          setShowEnrollModal(true)
                        }}
                        disabled={servicePlans.length === 0}
                      >
                        <Repeat className="h-4 w-4 mr-2" />
                        {servicePlans.length === 0 ? 'No plans available' : 'Add Customer to Service Plan'}
                      </Button>
                      {!isDoneJob && servicePlans.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Tip: enrolling here activates immediately. To enroll on completion, use the job form instead.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Linked Records Section */}
            <Collapsible open={expandedSections.includes('linked')} onOpenChange={() => toggleSection('linked')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Linked Records</span>
                  {(estimate || invoice) && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {[estimate, invoice].filter(Boolean).length}
                    </Badge>
                  )}
                </div>
                {expandedSections.includes('linked') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                  {estimate && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-500" />
                        <div>
                          <p className="text-sm font-medium">Estimate {estimate.estimateNumber}</p>
                          <p className="text-xs text-muted-foreground">${estimate.total.toLocaleString()}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{estimate.status}</Badge>
                    </div>
                  )}
                  {invoice && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">Invoice {invoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">${invoice.total.toLocaleString()}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{invoice.status}</Badge>
                    </div>
                  )}
                  {!estimate && !invoice && (
                    <p className="text-sm text-muted-foreground text-center py-2">No linked records</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Payments Section */}
            <Collapsible open={expandedSections.includes('payments')} onOpenChange={() => toggleSection('payments')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Payments</span>
                  {jobPayments.length > 0 && (
                    <Badge variant="secondary" className="text-xs ml-1">{jobPayments.length}</Badge>
                  )}
                </div>
                {expandedSections.includes('payments') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 space-y-2 bg-muted/20 border-b border-border">
                  {jobPayments.length > 0 ? (
                    jobPayments.map(payment => (
                      <div key={payment.id} className="flex items-center justify-between p-2 rounded-lg bg-background">
                        <div>
                          <p className="text-sm font-medium">${payment.amount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(payment.date)} via {payment.paymentMethod}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs text-emerald-600">Received</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No payments recorded</p>
                  )}
                  {remainingBalance > 0 && (
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={openPaymentModal}>
                      <DollarSign className="h-4 w-4 mr-2" /> Record Payment
                    </Button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Notes Section */}
            <Collapsible open={expandedSections.includes('notes')} onOpenChange={() => toggleSection('notes')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Notes</span>
                </div>
                {expandedSections.includes('notes') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-3 bg-muted/20 border-b border-border">
                  {job.notes ? (
                    <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">No notes</p>
                  )}
                  <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => toast.info('Add note coming soon')}>
                    Add Note
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Photos Section */}
            <Collapsible open={expandedSections.includes('photos')} onOpenChange={() => toggleSection('photos')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Photos</span>
                </div>
                {expandedSections.includes('photos') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-4 bg-muted/20 border-b border-border">
                  {customer ? (
                    <JobPhotosTab jobId={job.id} customerId={customer.id} canEdit />
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">
                      Link a customer to this job to add photos.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Attachments Section */}
            <Collapsible open={expandedSections.includes('attachments')} onOpenChange={() => toggleSection('attachments')}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors border-b border-border">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Attachments</span>
                </div>
                {expandedSections.includes('attachments') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 py-4 bg-muted/20 border-b border-border">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Camera className="h-4 w-4 mr-2" /> Camera
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Upload className="h-4 w-4 mr-2" /> Upload
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-3">No attachments yet</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">Remaining Balance</p>
              <p className="text-2xl font-bold">${remainingBalance.toFixed(2)}</p>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(method => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="pl-7"
                  step="0.01"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Payment notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
            <Button onClick={handlePayment} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-enroll in a service plan */}
      <Dialog open={showEnrollModal} onOpenChange={setShowEnrollModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {customer.name} to a Service Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Plan</Label>
              <Select
                value={enrollPlanId}
                onValueChange={(v) => {
                  setEnrollPlanId(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service plan" />
                </SelectTrigger>
                <SelectContent>
                  {servicePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ${p.price}/{p.frequency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">
                Price {enrollPlanId && `(plan: $${servicePlans.find((p) => p.id === enrollPlanId)?.price ?? ''})`}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder={
                  enrollPlanId ? String(servicePlans.find((p) => p.id === enrollPlanId)?.price ?? '') : 'Plan price'
                }
                value={enrollPrice}
                onChange={(e) => setEnrollPrice(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Auto-renew</Label>
                <p className="text-xs text-muted-foreground">Keep service recurring automatically.</p>
              </div>
              <Switch checked={enrollAutoRenew} onCheckedChange={setEnrollAutoRenew} aria-label="Auto-renew" />
            </div>
            <p className="text-xs text-muted-foreground">
              The schedule anchors on this job&apos;s service date ({formatDate(job.date)}). Next service is calculated
              from the plan frequency.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnrollModal(false)}>Cancel</Button>
            <Button onClick={handleQuickEnroll} disabled={enrollingNow || !enrollPlanId}>
              {enrollingNow ? 'Enrolling...' : 'Enroll Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
