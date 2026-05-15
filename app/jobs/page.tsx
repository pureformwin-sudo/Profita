'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { getJobs, addJob, deleteJob, updateJob, getCustomers, addCustomer, getIncome, getEmployees, addJobWorker, getJobWorkers, deleteJobWorker, createInvoiceFromJob, getEstimates, getInvoices, markInvoicePaid, updateInvoice } from '@/lib/storage'
import { recordPayment } from '@/lib/payments-storage'
import { Job, JobType, JobStatus, Customer, PaymentMethod, Employee, JobWorker, Estimate, Invoice, Income } from '@/lib/types'
import { JobDetailDrawer } from '@/components/job-detail-drawer'
import { notifyJobCreated, notifyJobCompleted, notifyPaymentReceived, notifyPaymentNeedsDeposit } from '@/lib/in-app-notifications'
import { formatDate } from '@/lib/utils-finance'
import { toast } from 'sonner'
import { Plus, Trash2, CheckCircle, Calendar, Pencil, Users, X, MoreVertical, Clock, FileText, UserPlus, ChevronRight, Search, Sparkles, TrendingUp, Repeat, AlertTriangle, Briefcase, DollarSign } from 'lucide-react'
import { generateJobSuggestion, estimatedProfitability, customerTag } from '@/lib/ai/insights'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { NotificationActionsDialog } from '@/components/notification-actions'

const jobTypes: JobType[] = ['Residential', 'Commercial', 'Storefront']
const jobStatuses: JobStatus[] = ['Scheduled', 'On the way', 'In progress', 'Completed', 'Invoiced', 'Paid', 'Closed']
const paymentMethods: PaymentMethod[] = ['Cash', 'Venmo', 'Zelle', 'Check', 'Card', 'Other']

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Job Detail Drawer
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [showJobDetail, setShowJobDetail] = useState(false)
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'All'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [aiFilter, setAiFilter] = useState<'all' | 'highProfit' | 'upsell' | 'repeat' | 'risk'>('all')
  
  // Job panel state
  const [showJobPanel, setShowJobPanel] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  
  // Job form data
  const [jobForm, setJobForm] = useState({
    customerId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    jobType: 'Residential' as JobType,
    price: '',
    expenses: '',
    status: 'Scheduled' as JobStatus,
    notes: '',
  })
  
  // New customer form
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  })
  
  // Workers for current job
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([])
  const [jobWorkers, setJobWorkers] = useState<JobWorker[]>([])

  // Mark as Paid modal
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [selectedJobForPaid, setSelectedJobForPaid] = useState<Job | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Cash')
  
  // Job completion notification
  const [notificationJob, setNotificationJob] = useState<Job | null>(null)

  useEffect(() => {
    loadData()
  }, [])

const loadData = async () => {
  const [jobsData, customersData, employeesData, estimatesData, invoicesData, incomesData] = await Promise.all([
  getJobs(),
  getCustomers(),
  getEmployees(),
  getEstimates(),
  getInvoices(),
  getIncome(),
  ])
  setJobs(jobsData)
  setCustomers(customersData)
  setEmployees(employeesData)
  setEstimates(estimatesData)
  setInvoices(invoicesData)
  setIncomes(incomesData)
  }

  const resetJobForm = () => {
    setJobForm({
      customerId: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '10:00',
      jobType: 'Residential',
      price: '',
      expenses: '',
      status: 'Scheduled',
      notes: '',
    })
    setSelectedWorkers([])
    setNewCustomer({ name: '', email: '', phone: '', address: '' })
    setShowNewCustomerForm(false)
  }

  const openNewJobPanel = () => {
    setEditingJob(null)
    resetJobForm()
    setShowJobPanel(true)
  }

const openEditJobPanel = async (job: Job) => {
  setEditingJob(job)
  setJobForm({
  customerId: job.customerId,
  date: job.date,
  startTime: job.startTime || '09:00',
  endTime: job.endTime || '10:00',
  jobType: job.jobType,
  price: String(job.price),
  expenses: job.expenses ? String(job.expenses) : '',
      status: job.status,
      notes: job.notes || '',
    })
    
    // Load existing workers
    const workers = await getJobWorkers(job.id)
    setJobWorkers(workers)
    setSelectedWorkers(workers.map(w => w.employeeId))
    
    setShowJobPanel(true)
  }

  const handleCreateCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required')
      return
    }
    
    const result = await addCustomer({
      name: newCustomer.name,
      email: newCustomer.email || undefined,
      phone: newCustomer.phone || undefined,
      address: newCustomer.address || undefined,
    })
    
    if (result) {
      toast.success('Customer created!')
      await loadData()
      setJobForm({ ...jobForm, customerId: result.id })
      setShowNewCustomerForm(false)
      setNewCustomer({ name: '', email: '', phone: '', address: '' })
    } else {
      toast.error('Failed to create customer')
    }
  }

  const handleSaveJob = async () => {
    if (!jobForm.customerId || !jobForm.price) {
      toast.error('Please select a customer and enter a price')
      return
    }

    setIsSubmitting(true)

    try {
      if (editingJob) {
// Update existing job
  const result = await updateJob(editingJob.id, {
  customerId: jobForm.customerId,
  date: jobForm.date,
  startTime: jobForm.startTime || undefined,
  endTime: jobForm.endTime || undefined,
  jobType: jobForm.jobType,
  price: parseFloat(jobForm.price),
  expenses: jobForm.expenses ? parseFloat(jobForm.expenses) : undefined,
  status: jobForm.status,
  notes: jobForm.notes,
  })
        
        if (result) {
          // Handle worker assignments
          const currentWorkerIds = jobWorkers.map(w => w.employeeId)
          const newWorkerIds = selectedWorkers.filter(id => !currentWorkerIds.includes(id))
          const removedWorkerIds = currentWorkerIds.filter(id => !selectedWorkers.includes(id))
          
          // Remove workers
          for (const workerId of removedWorkerIds) {
            const worker = jobWorkers.find(w => w.employeeId === workerId)
            if (worker) await deleteJobWorker(worker.id)
          }
          
          // Add new workers - pay is percentage of job price
          const jobPrice = parseFloat(jobForm.price)
          for (const empId of newWorkerIds) {
            const emp = employees.find(e => e.id === empId)
            // Use employee's rate as percentage (e.g., 20 = 20%), or default to 20%
            const percentage = emp?.perJobRate || 20
            const amount = jobPrice * (percentage / 100)
            await addJobWorker({
              jobId: editingJob.id,
              employeeId: empId,
              amountEarned: amount,
            })
          }
          
          toast.success('Job updated!')
        }
      } else {
// Create new job
  const result = await addJob({
  customerId: jobForm.customerId,
  date: jobForm.date,
  startTime: jobForm.startTime || undefined,
  endTime: jobForm.endTime || undefined,
  jobType: jobForm.jobType,
  price: parseFloat(jobForm.price),
  expenses: jobForm.expenses ? parseFloat(jobForm.expenses) : undefined,
  status: jobForm.status,
  notes: jobForm.notes,
  })

        if (result) {
          // Add workers - pay is percentage of job price
          const jobPrice = parseFloat(jobForm.price)
          for (const empId of selectedWorkers) {
            const emp = employees.find(e => e.id === empId)
            // Use employee's rate as percentage (e.g., 20 = 20%), or default to 20%
            const percentage = emp?.perJobRate || 20
            const amount = jobPrice * (percentage / 100)
            await addJobWorker({
              jobId: result.id,
              employeeId: empId,
              amountEarned: amount,
            })
          }
          
          // Create notification
          const customer = customers.find(c => c.id === jobForm.customerId)
          if (customer) {
            notifyJobCreated(result, customer.name)
          }
          
          toast.success('Job created!')
        }
      }

      setShowJobPanel(false)
      resetJobForm()
      loadData()
    } catch {
      toast.error('Failed to save job')
    }
    
    setIsSubmitting(false)
  }

const handleDeleteJob = async (id: string) => {
  if (confirm('Delete this job?')) {
  await deleteJob(id)
  toast.success('Job deleted')
  loadData()
  }
  }

  const handleCreateInvoice = async (job: Job) => {
  if (job.invoiceId) {
  toast.info('Invoice already exists for this job')
  return
  }
  
  const invoice = await createInvoiceFromJob(job.id)
  if (invoice) {
  toast.success(`Invoice ${invoice.invoiceNumber} created!`)
  loadData()
  } else {
  toast.error('Failed to create invoice')
  }
  }
  
  const handleStatusChange = async (jobId: string, newStatus: JobStatus) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    if (newStatus === 'Paid') {
      setSelectedJobForPaid(job)
      setSelectedPaymentMethod('Cash')
      setShowPaidModal(true)
      return
    }

    await updateJob(jobId, { status: newStatus })
    toast.success(`Job marked as ${newStatus}`)
    loadData()
    
    // Show notification dialog when job is completed
    if (newStatus === 'Completed') {
      const customer = customers.find(c => c.id === job.customerId)
      if (customer && (customer.phone || customer.email)) {
        setNotificationJob(job)
      }
    }
  }

  const handleMarkAsPaid = async () => {
    if (!selectedJobForPaid) return
    
    setIsSubmitting(true)
    
    // Use recordPayment which handles income table sync automatically
    const result = await recordPayment({
      invoiceId: selectedJobForPaid.invoiceId || undefined,
      jobId: selectedJobForPaid.id,
      customerId: selectedJobForPaid.customerId,
      amount: selectedJobForPaid.price,
      paymentMethod: selectedPaymentMethod,
      paymentDate: selectedJobForPaid.date,
      notes: `Payment for job`,
      status: 'completed',
    })
    
    if (!result.success) {
      toast.error(result.error || 'Failed to record payment')
      setIsSubmitting(false)
      return
    }
    
    // Update job status
    await updateJob(selectedJobForPaid.id, { status: 'Paid', paidAmount: selectedJobForPaid.price })
    
    toast.success(`Job paid via ${selectedPaymentMethod}!`)
    setShowPaidModal(false)
    setSelectedJobForPaid(null)
    setIsSubmitting(false)
    loadData()
  }

  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unknown'
  }

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'Scheduled':
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30'
      case 'On the way':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      case 'In progress':
        return 'bg-purple-500/15 text-purple-500 border-purple-500/30'
      case 'Completed':
        return 'bg-green-500/15 text-green-500 border-green-500/30'
      case 'Invoiced':
        return 'bg-orange-500/15 text-orange-500 border-orange-500/30'
      case 'Paid':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
      case 'Closed':
        return 'bg-muted text-muted-foreground border-muted'
      default:
        return 'bg-muted text-muted-foreground border-muted'
    }
  }

  // Job Detail Drawer handlers
  const openJobDetail = (job: Job) => {
    setSelectedJob(job)
    setShowJobDetail(true)
  }

  const handleJobStatusChange = async (jobId: string, status: JobStatus) => {
    // Prevent marking as Paid if balance > 0
    if (status === 'Paid') {
      const job = jobs.find(j => j.id === jobId)
      if (job) {
        const balance = job.price - (job.paidAmount || 0)
        if (balance > 0) {
          toast.error('Cannot mark as Paid - balance is not zero')
          return
        }
      }
    }
    await updateJob(jobId, { status })
    
    // Immediately update selectedJob so drawer shows new status
    if (selectedJob && selectedJob.id === jobId) {
      setSelectedJob({ ...selectedJob, status })
    }
    
    // Also update jobs array immediately for list UI
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
    
    // Then refresh from server for complete data sync
    loadData()
  }

  const handleJobPayment = async (jobId: string, paymentMethod: PaymentMethod, amount: number, notes?: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    const customerName = getCustomerName(job.customerId)
    const newPaidAmount = (job.paidAmount || 0) + amount
    const remainingBalance = job.price - newPaidAmount
    const fullyPaid = remainingBalance <= 0

    // Check if job has a linked invoice
    const linkedInvoice = job.invoiceId ? invoices.find(inv => inv.id === job.invoiceId) : null
    
    // Use recordPayment for all payments - it handles income table sync automatically
    const result = await recordPayment({
      invoiceId: linkedInvoice?.id || undefined,
      jobId: job.id,
      customerId: job.customerId,
      amount,
      paymentMethod,
      paymentDate: new Date().toISOString().split('T')[0],
      notes: notes || `Payment for job`,
      status: 'completed',
    })
    
    if (!result.success) {
      toast.error(result.error || 'Failed to record payment')
      return
    }
    
    // Update invoice in local state immediately if linked
    if (linkedInvoice) {
      const newInvoiceAmountPaid = (linkedInvoice.amountPaid || 0) + amount
      const invoiceFullyPaid = newInvoiceAmountPaid >= linkedInvoice.total
      setInvoices(prev => prev.map(inv => 
        inv.id === linkedInvoice.id 
          ? { ...inv, amountPaid: newInvoiceAmountPaid, status: invoiceFullyPaid ? 'paid' : inv.status }
          : inv
      ))
    }

    // Update job paid amount
    const updates: Partial<Job> = { paidAmount: newPaidAmount }
    
    // If fully paid, update status
    if (fullyPaid) {
      updates.status = 'Paid'
    }

    await updateJob(jobId, updates)
    
    // Immediately update selectedJob so drawer shows new state
    if (selectedJob && selectedJob.id === jobId) {
      setSelectedJob({ ...selectedJob, ...updates })
    }
    
    // Also update jobs array immediately for list UI
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j))
    
    // Create notifications
    notifyPaymentReceived(amount, customerName, paymentMethod, jobId, job.customerId)
    if (paymentMethod === 'Cash' || paymentMethod === 'Check') {
      notifyPaymentNeedsDeposit(amount, customerName, paymentMethod)
    }
    
    toast.success(`Payment of $${amount.toFixed(2)} recorded!`)
    
    // Then refresh from server for complete data sync
    loadData()
  }

  const handleCreateJobInvoice = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    const invoice = await createInvoiceFromJob(jobId)
    if (invoice) {
      const updates = { status: 'Invoiced' as JobStatus, invoiceId: invoice.id }
      await updateJob(jobId, updates)
      
      // Immediately update selectedJob so drawer shows new state
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob({ ...selectedJob, ...updates })
      }
      
      // Also update jobs array immediately for list UI
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j))
      
      toast.success(`Invoice ${invoice.invoiceNumber} created!`)
      loadData()
    } else {
      toast.error('Failed to create invoice')
    }
  }

  // Generate consistent avatar colors based on customer name
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-emerald-600',
      'from-purple-500 to-purple-600',
      'from-amber-500 to-amber-600',
      'from-pink-500 to-pink-600',
      'from-cyan-500 to-cyan-600',
      'from-orange-500 to-orange-600',
      'from-indigo-500 to-indigo-600',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  // AI-powered filter helpers
  const jobAIFilterFn = (j: Job): boolean => {
    if (aiFilter === 'all') return true
    const customer = customers.find((c) => c.id === j.customerId)
    if (aiFilter === 'highProfit') {
      const { tier } = estimatedProfitability(j)
      return tier === 'high'
    }
    if (aiFilter === 'upsell') {
      const s = generateJobSuggestion(j, customer, jobs)
      return s?.type === 'upsell'
    }
    if (aiFilter === 'repeat') {
      if (!customer) return false
      const tag = customerTag(customer, jobs)
      return tag === 'VIP' || tag === 'DueSoon'
    }
    if (aiFilter === 'risk') {
      // At risk = scheduled but within next 2 days AND low profit
      if (j.status !== 'Scheduled') return false
      const now = new Date()
      const days = (new Date(j.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      return days >= 0 && days <= 2 && estimatedProfitability(j).tier === 'low'
    }
    return true
  }

  // Filter and search
  const filteredJobs = jobs
    .filter(j => filterStatus === 'All' || j.status === filterStatus)
    .filter(j => {
      if (!searchQuery) return true
      const customerName = getCustomerName(j.customerId).toLowerCase()
      return customerName.includes(searchQuery.toLowerCase())
    })
    .filter(jobAIFilterFn)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const totalRevenue = filteredJobs.reduce((sum, j) => sum + j.price, 0)
  const totalExpenses = filteredJobs.reduce((sum, j) => sum + (j.expenses || 0), 0)
  const totalProfit = totalRevenue - totalExpenses
  
  // Calculate collected revenue from income records linked to filtered jobs
  const filteredJobIds = new Set(filteredJobs.map(j => j.id))
  const collectedRevenue = incomes
    .filter(i => i.jobId && filteredJobIds.has(i.jobId))
    .reduce((sum, i) => sum + i.amount, 0)

  return (
    <AppShell>
      {/* Mark as Paid Modal */}
      <Dialog open={showPaidModal} onOpenChange={setShowPaidModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Job as Paid</DialogTitle>
            <DialogDescription>
              {selectedJobForPaid && (
                <span>
                  {getCustomerName(selectedJobForPaid.customerId)} - <strong className="text-success">${selectedJobForPaid.price.toFixed(2)}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method}
                    type="button"
                    variant={selectedPaymentMethod === method ? 'default' : 'outline'}
                    className="h-10"
                    onClick={() => setSelectedPaymentMethod(method)}
                  >
                    {method}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPaidModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : `Paid via ${selectedPaymentMethod}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Panel (Slide-out) */}
      <Sheet open={showJobPanel} onOpenChange={setShowJobPanel}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full">
          <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
            <SheetTitle>
              {editingJob ? 'Edit Job' : 'New Job'}
            </SheetTitle>
            <SheetDescription>
              {editingJob ? 'Update job details' : 'Create a new job with customer and schedule'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Customer Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Customer
                </Label>
                {!showNewCustomerForm && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={() => setShowNewCustomerForm(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    New customer
                  </Button>
                )}
              </div>
              
              {showNewCustomerForm ? (
                <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">New Customer</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowNewCustomerForm(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Name *</Label>
                      <Input
                        placeholder="Customer name"
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                        <Input
                          placeholder="email@example.com"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
                        <Input
                          placeholder="(555) 000-0000"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Address</Label>
                      <Input
                        placeholder="123 Main St, City, State"
                        value={newCustomer.address}
                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button onClick={handleCreateCustomer} className="w-full">
                    Create & Select Customer
                  </Button>
                </div>
              ) : (
                <Select value={jobForm.customerId} onValueChange={(v) => setJobForm({ ...jobForm, customerId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                            {c.name.charAt(0)}
                          </div>
                          <span>{c.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Schedule Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Schedule
              </Label>
              <Input
                type="date"
                value={jobForm.date}
                onChange={(e) => setJobForm({ ...jobForm, date: e.target.value })}
              />
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Start</Label>
                  <Input
                    type="time"
                    value={jobForm.startTime}
                    onChange={(e) => setJobForm({ ...jobForm, startTime: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">End</Label>
                  <Input
                    type="time"
                    value={jobForm.endTime}
                    onChange={(e) => setJobForm({ ...jobForm, endTime: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Job Details Section */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Job Details
              </Label>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Job Type</Label>
                  <Select value={jobForm.jobType} onValueChange={(v) => setJobForm({ ...jobForm, jobType: v as JobType })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
                  <Select value={jobForm.status} onValueChange={(v) => setJobForm({ ...jobForm, status: v as JobStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={jobForm.price}
                    onChange={(e) => setJobForm({ ...jobForm, price: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Expenses</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={jobForm.expenses}
                    onChange={(e) => setJobForm({ ...jobForm, expenses: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Team Section */}
            {employees.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Team
                </Label>
                <div className="flex flex-wrap gap-2">
                  {employees.map((emp) => (
                    <Button
                      key={emp.id}
                      type="button"
                      variant={selectedWorkers.includes(emp.id) ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        if (selectedWorkers.includes(emp.id)) {
                          setSelectedWorkers(selectedWorkers.filter(id => id !== emp.id))
                        } else {
                          setSelectedWorkers([...selectedWorkers, emp.id])
                        }
                      }}
                    >
                      {emp.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" />
                Notes
              </Label>
              <Textarea
                placeholder="Add notes about this job..."
                value={jobForm.notes}
                onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })}
                rows={4}
                className="resize-none text-sm"
              />
            </div>

          </div>

          {/* Fixed Footer */}
          <div className="shrink-0 p-6 pt-4 border-t border-border bg-background">
            <div className="flex gap-3">
              <Button
                onClick={handleSaveJob}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Saving...' : editingJob ? 'Save Changes' : 'Create Job'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowJobPanel(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Jobs</h1>
<p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{jobs.length}</span> jobs
              <span className="mx-2 text-border">|</span>
              <span className="text-emerald-500 font-medium">${totalRevenue.toLocaleString()}</span> job revenue
              {collectedRevenue > 0 && (
                <>
                  <span className="mx-2 text-border">|</span>
                  <span className="text-emerald-600 font-medium">${collectedRevenue.toLocaleString()}</span> collected
                </>
              )}
              <span className="mx-2 text-border">|</span>
              <span className={`font-medium ${totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${totalProfit.toLocaleString()}</span> job profit
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Standalone invoices (without jobs) are tracked separately in customer balances
            </p>
          </div>
          <Button onClick={openNewJobPanel} size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Job</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* AI Smart Filters */}
        <div className="flex items-center gap-2.5 overflow-x-auto py-1 -my-1">
          <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Picks
          </span>
          <div className="h-4 w-px bg-border shrink-0" />
          {([
            { key: 'all', label: 'All', icon: null },
            { key: 'highProfit', label: 'Highest profit', icon: TrendingUp },
            { key: 'upsell', label: 'Upsell candidates', icon: Sparkles },
            { key: 'repeat', label: 'Repeat customers', icon: Repeat },
            { key: 'risk', label: 'At risk', icon: AlertTriangle },
          ] as const).map((chip) => {
            const active = aiFilter === chip.key
            const Icon = chip.icon
            return (
              <button
                key={chip.key}
                onClick={() => setAiFilter(chip.key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {chip.label}
              </button>
            )
          })}
        </div>

        {/* Search + Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {(['All', 'Scheduled', 'Completed', 'Paid'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                  filterStatus === status
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {status}
                {status !== 'All' && (
                  <span className={cn(
                    "ml-1.5 tabular-nums",
                    filterStatus === status ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {jobs.filter(j => j.status === status).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Jobs List */}
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="font-medium mb-1">No jobs found</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first job to get started</p>
            <Button onClick={openNewJobPanel} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Job
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            {/* Table Header - Desktop */}
            <div className="hidden lg:grid lg:grid-cols-[40px_1fr_100px_90px_40px] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div></div>
              <div>Customer</div>
              <div className="text-right">Amount</div>
              <div className="text-center">Status</div>
              <div></div>
            </div>
            
            {filteredJobs.map((job, idx) => {
              const customer = customers.find((c) => c.id === job.customerId)
              const customerName = getCustomerName(job.customerId)
              const aiSuggestion = generateJobSuggestion(job, customer, jobs)
              const profitTier = estimatedProfitability(job).tier
              
              return (
                <div 
                  key={job.id} 
                  className={cn(
                    "group grid grid-cols-[40px_1fr_auto] lg:grid-cols-[40px_1fr_100px_90px_40px] items-center gap-4 px-4 py-3 cursor-pointer transition-colors",
                    "hover:bg-muted/30",
                    idx !== 0 && "border-t border-border"
                  )}
onClick={() => openJobDetail(job)}
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {customerName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Customer Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{customerName}</span>
                      {profitTier === 'high' && (
                        <span className="hidden sm:inline-flex text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium items-center gap-0.5 shrink-0">
                          <TrendingUp className="h-2.5 w-2.5" />
                          High margin
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5 flex-wrap">
                      <span>{formatDate(job.date)}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {job.startTime ? (
                          <>
                            {(() => {
                              const [h, m] = job.startTime.split(':').map(Number)
                              const period = h >= 12 ? 'PM' : 'AM'
                              const hour12 = h % 12 || 12
                              return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                            })()}
                            {job.endTime && (
                              <>
                                {' - '}
                                {(() => {
                                  const [h, m] = job.endTime.split(':').map(Number)
                                  const period = h >= 12 ? 'PM' : 'AM'
                                  const hour12 = h % 12 || 12
                                  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
                                })()}
                              </>
                            )}
                          </>
                        ) : (
                          <span className="italic text-muted-foreground/70">No time</span>
                        )}
                      </span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{job.jobType}</span>
                      {job.notes && <FileText className="h-3 w-3 ml-1" />}
                    </div>
                    {aiSuggestion && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-primary">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        <span className="truncate">{aiSuggestion.text}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Mobile: Price + Status + Actions */}
                  <div className="lg:hidden flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold">${job.price.toLocaleString()}</span>
                      <span className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded",
                        job.status === 'Scheduled' && "bg-blue-500/10 text-blue-500",
                        job.status === 'Completed' && "bg-amber-500/10 text-amber-500",
                        job.status === 'Paid' && "bg-emerald-500/10 text-emerald-500"
                      )}>
                        {job.status}
                      </span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => openEditJobPanel(job)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Job
                        </DropdownMenuItem>
                        {job.status === 'Scheduled' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job.id, 'Completed')}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark Completed
                          </DropdownMenuItem>
                        )}
{job.status === 'Completed' && (
  <>
  <DropdownMenuItem onClick={() => handleStatusChange(job.id, 'Paid')}>
  <DollarSign className="h-4 w-4 mr-2" />
  Mark Paid
  </DropdownMenuItem>
  {!job.invoiceId && (
  <DropdownMenuItem onClick={() => handleCreateInvoice(job)}>
  <FileText className="h-4 w-4 mr-2" />
  Create Invoice
  </DropdownMenuItem>
  )}
  </>
  )}
  {job.status !== 'Scheduled' && (
  <DropdownMenuItem onClick={() => handleStatusChange(job.id, 'Scheduled')}>
  <Clock className="h-4 w-4 mr-2" />
  Mark Scheduled
  </DropdownMenuItem>
  )}
  {job.estimateId && (
  <DropdownMenuItem onClick={() => {
  const est = estimates.find(e => e.id === job.estimateId)
  if (est) toast.info(`From estimate ${est.estimateNumber}`)
  }}>
  <FileText className="h-4 w-4 mr-2" />
  View Estimate
  </DropdownMenuItem>
  )}
  {job.invoiceId && (
                          <DropdownMenuItem onClick={() => {
                            window.location.href = `/invoices?highlight=${job.invoiceId}`
                          }}>
                            <FileText className="h-4 w-4 mr-2" />
                            View Invoice
                          </DropdownMenuItem>
                        )}
  <DropdownMenuItem onClick={() => handleDeleteJob(job.id)} className="text-destructive">
  <Trash2 className="h-4 w-4 mr-2" />
  Delete
  </DropdownMenuItem>
  </DropdownMenuContent>
  </DropdownMenu>
  </div>
  
  {/* Desktop: Price column */}
                  <div className="hidden lg:block text-right">
                    <span className="font-semibold">${job.price.toLocaleString()}</span>
                    {(job.expenses ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">-${job.expenses}</p>
                    )}
                  </div>
                  
                  {/* Desktop: Status column */}
                  <div className="hidden lg:flex justify-center">
                    <span className={cn(
                      "text-xs font-medium px-2.5 py-1 rounded w-[80px] text-center",
                      job.status === 'Scheduled' && "bg-blue-500/10 text-blue-500",
                      job.status === 'Completed' && "bg-amber-500/10 text-amber-500",
                      job.status === 'Paid' && "bg-emerald-500/10 text-emerald-500"
                    )}>
                      {job.status}
                    </span>
                  </div>
                  
                  {/* Actions */}
                  <div className="hidden lg:block" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditJobPanel(job)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {job.status !== 'Paid' && (
                          <DropdownMenuItem onClick={() => handleStatusChange(job.id, job.status === 'Scheduled' ? 'Completed' : 'Paid')}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {job.status === 'Scheduled' ? 'Complete' : 'Mark Paid'}
                          </DropdownMenuItem>
                        )}
                        {job.status === 'Completed' && !job.invoiceId && (
                          <DropdownMenuItem onClick={() => handleCreateInvoice(job)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Create Invoice
                          </DropdownMenuItem>
                        )}
                        {job.estimateId && (
                          <DropdownMenuItem onClick={() => {
                            const est = estimates.find(e => e.id === job.estimateId)
                            if (est) toast.info(`From estimate ${est.estimateNumber}`)
                          }}>
                            <FileText className="h-4 w-4 mr-2" />
                            View Linked Estimate
                          </DropdownMenuItem>
                        )}
                        {job.invoiceId && (
                          <DropdownMenuItem onClick={() => {
                            window.location.href = `/invoices?highlight=${job.invoiceId}`
                          }}>
                            <FileText className="h-4 w-4 mr-2" />
                            View Invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDeleteJob(job.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
)}

        {/* Job Completion Notification Dialog */}
        {notificationJob && (
          <NotificationActionsDialog
            open={!!notificationJob}
            onOpenChange={(open) => !open && setNotificationJob(null)}
            customer={{
              id: notificationJob.customerId,
              name: getCustomerName(notificationJob.customerId),
              phone: customers.find(c => c.id === notificationJob.customerId)?.phone,
              email: customers.find(c => c.id === notificationJob.customerId)?.email,
            }}
            type="job_completed"
            onComplete={() => setNotificationJob(null)}
          />
        )}

        {/* Job Detail Drawer */}
        <JobDetailDrawer
          job={selectedJob}
          open={showJobDetail}
          onOpenChange={setShowJobDetail}
          customer={selectedJob ? customers.find(c => c.id === selectedJob.customerId) || null : null}
          estimate={selectedJob?.estimateId ? estimates.find(e => e.id === selectedJob.estimateId) || null : null}
          invoice={selectedJob?.invoiceId ? invoices.find(i => i.id === selectedJob.invoiceId) || null : null}
          employees={employees}
          incomes={incomes}
          onStatusChange={handleJobStatusChange}
          onMarkPaid={handleJobPayment}
          onCreateInvoice={handleCreateJobInvoice}
          onEdit={(job) => { setShowJobDetail(false); openEditJobPanel(job) }}
          onRefresh={loadData}
        />
        </div>
      </AppShell>
  )
}
