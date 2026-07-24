'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, FileText, Send, Trash2, Eye, MoreHorizontal, DollarSign, Clock, CheckCircle, AlertCircle, Search, Link2, Sparkles, Receipt, ArrowRight, Download, Mail, Briefcase, XCircle, RefreshCw, CreditCard, Loader2, History } from 'lucide-react'
import { LineItemEditor, TotalsSummary, type LineItem } from '@/components/line-item-editor'
import { toast } from 'sonner'
import { getInvoices, getEstimates, getCustomers, addInvoice, addEstimate, updateInvoice, updateEstimate, deleteInvoice, deleteEstimate, getNextInvoiceNumber, getNextEstimateNumber, getSettings, getJobs, convertEstimateToJob, createInvoiceFromJob, markInvoicePaid, updateJob } from '@/lib/storage'
import { Invoice, Estimate, Customer, InvoiceItem, EstimateItem, InvoiceStatus, EstimateStatus, Job } from '@/lib/types'
import { formatDate } from '@/lib/utils-finance'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { generateInvoiceSuggestion, generateInvoiceReminderMessage } from '@/lib/ai/insights'
import { NotificationActionsDialog } from '@/components/notification-actions'
import { cn } from '@/lib/utils'
import { PaymentMethodDialog, PaymentMethodType } from '@/components/payment-method-dialog'
import { notifyInvoiceCreated, notifyInvoicePaid, notifyEstimateCreated, notifyEstimateAccepted } from '@/lib/in-app-notifications'
import { recordPayment, getPaymentsForInvoice, type PaymentMethod as NewPaymentMethod } from '@/lib/payments-storage'
import { type Payment } from '@/lib/payments-types'
import { AdminDocumentPreview } from '@/components/admin-document-preview'
import { TakePaymentSheet, type TakePaymentContext } from '@/components/payments/take-payment-sheet'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('invoices')
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [showCreateEstimate, setShowCreateEstimate] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null)
  const [taxRate, setTaxRate] = useState(0)
  const [notificationInvoice, setNotificationInvoice] = useState<Invoice | null>(null)
  const [businessInfo, setBusinessInfo] = useState<{ name?: string; phone?: string; email?: string }>({})
  
  // Payment method dialog state (legacy - kept for backwards compat)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  // JIM / Take Payment sheet (single instance, opened per-invoice)
  const [takePaymentCtx, setTakePaymentCtx] = useState<TakePaymentContext | null>(null)
  const [invoiceToMarkPaid, setInvoiceToMarkPaid] = useState<Invoice | null>(null)
  
  // Record Payment modal state (new Phase 4)
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [recordPaymentInvoice, setRecordPaymentInvoice] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<NewPaymentMethod>('cash')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  const [invoicePayments, setInvoicePayments] = useState<Payment[]>([])

  // Form state
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formJobId, setFormJobId] = useState<string | null>(null)
  const [formItems, setFormItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }
  ])
  const [formNotes, setFormNotes] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  
  // Get jobs for selected customer (for invoice linking)
  const customerJobs = formCustomerId 
    ? jobs.filter(j => j.customerId === formCustomerId && !j.invoiceId)
    : []
  
  // Check if selected job already has an invoice
  const selectedJobHasInvoice = formJobId 
    ? jobs.find(j => j.id === formJobId)?.invoiceId 
    : false

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [invoicesData, estimatesData, customersData, jobsData, settings] = await Promise.all([
      getInvoices(),
      getEstimates(),
      getCustomers(),
      getJobs(),
      getSettings(),
    ])
    setInvoices(invoicesData)
    setEstimates(estimatesData)
    setCustomers(customersData)
    setJobs(jobsData)
    setTaxRate(settings?.profile?.taxRate || 0)
    setBusinessInfo({
      name: settings?.profile?.businessName,
      phone: settings?.profile?.phone,
      email: settings?.profile?.email,
    })
    setIsLoading(false)
  }

  function calculateTotals(items: LineItem[]) {
    const subtotal = items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      return sum + (qty * price)
    }, 0)
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount
    return { subtotal, taxAmount, total }
  }

  async function handleCreateInvoice() {
    if (!formCustomerId) {
      toast.error('Please select a customer')
      return
    }
    
    const validItems = formItems.filter(item => {
      const desc = String(item.description || '').trim()
      const price = Number(item.unitPrice) || 0
      return desc.length > 0 && price > 0
    })
    
    if (validItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    const invoiceNumber = await getNextInvoiceNumber()
    const today = new Date().toISOString().split('T')[0]
    const dueDate = formDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const itemsForDb = validItems.map(item => ({
      id: item.id,
      description: String(item.description),
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)
    }))
    
    const subtotal = itemsForDb.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount

    const newInvoice = await addInvoice({
      customerId: formCustomerId,
      jobId: formJobId || undefined,
      invoiceNumber,
      status: 'draft',
      issueDate: today,
      dueDate,
      items: itemsForDb,
      subtotal,
      taxRate,
      taxAmount,
      total,
      amountPaid: 0,
      notes: formNotes || undefined,
    })

if (newInvoice) {
      // Update job with invoice_id if linked
      if (formJobId) {
        await updateJob(formJobId, { invoiceId: newInvoice.id, status: 'Invoiced' })
      }
      
      const customer = customers.find(c => c.id === formCustomerId)
      if (customer) {
        notifyInvoiceCreated({ id: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber, total: newInvoice.total, customerId: formCustomerId }, customer.name)
      }
      toast.success(formJobId ? 'Invoice created and linked to job!' : 'Invoice created!')
      setShowCreateInvoice(false)
      resetForm()
      loadData()
    } else {
      toast.error('Failed to create invoice')
    }
  }

  async function handleCreateEstimate() {
    if (!formCustomerId) {
      toast.error('Please select a customer')
      return
    }
    
    const validItems = formItems.filter(item => {
      const desc = String(item.description || '').trim()
      const price = Number(item.unitPrice) || 0
      return desc.length > 0 && price > 0
    })
    
    if (validItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }

    const estimateNumber = await getNextEstimateNumber()
    const today = new Date().toISOString().split('T')[0]
    const expiryDate = formDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const itemsForDb = validItems.map(item => ({
      id: item.id,
      description: String(item.description),
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)
    }))
    
    const subtotal = itemsForDb.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = subtotal * (taxRate / 100)
    const total = subtotal + taxAmount

    const newEstimate = await addEstimate({
      customerId: formCustomerId,
      estimateNumber,
      status: 'draft',
      issueDate: today,
      expiryDate,
      items: itemsForDb,
      subtotal,
      taxRate,
      taxAmount,
      total,
      notes: formNotes || undefined,
    })

if (newEstimate) {
  const customer = customers.find(c => c.id === formCustomerId)
  if (customer) {
    notifyEstimateCreated(newEstimate, customer.name)
  }
  toast.success('Estimate created!')
  setShowCreateEstimate(false)
  resetForm()
  loadData()
  } else {
  toast.error('Failed to create estimate')
    }
  }

  async function handleSendInvoice(invoice: Invoice) {
    await updateInvoice(invoice.id, { status: 'sent' })
    toast.success('Invoice marked as sent!')
    loadData()
    
    const customer = customers.find(c => c.id === invoice.customerId)
    if (customer && (customer.phone || customer.email)) {
      setNotificationInvoice({ ...invoice, customerName: customer.name })
    }
  }

function openPaymentDialog(invoice: Invoice) {
  setInvoiceToMarkPaid(invoice)
  setShowPaymentDialog(true)
  }

  async function handleConfirmPayment(paymentMethod: PaymentMethodType) {
  if (!invoiceToMarkPaid) return
  
  // Use CRM workflow function that cascades updates (marks linked job as Paid, creates income record)
  const result = await markInvoicePaid(invoiceToMarkPaid.id, paymentMethod)
  
  if (result.success) {
  // Create notification
  const customer = customers.find(c => c.id === invoiceToMarkPaid.customerId)
  if (customer) {
    notifyInvoicePaid(
      { id: invoiceToMarkPaid.id, invoiceNumber: invoiceToMarkPaid.invoiceNumber, total: invoiceToMarkPaid.total, customerId: invoiceToMarkPaid.customerId },
      customer.name
    )
  }
  toast.success(`Invoice marked as paid via ${paymentMethod}! Income recorded and linked job updated.`)
  setSelectedInvoice(null)
  setInvoiceToMarkPaid(null)
  loadData()
  } else {
  toast.error('Failed to mark invoice as paid')
  }
  }

  async function handleConvertToInvoice(estimate: Estimate) {
    const invoiceNumber = await getNextInvoiceNumber()
    const today = new Date().toISOString().split('T')[0]

    const newInvoice = await addInvoice({
      customerId: estimate.customerId,
      estimateId: estimate.id,
      invoiceNumber,
      status: 'draft',
      issueDate: today,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: estimate.items as InvoiceItem[],
      subtotal: estimate.subtotal,
      taxRate: estimate.taxRate,
      taxAmount: estimate.taxAmount,
      total: estimate.total,
      amountPaid: 0,
      notes: estimate.notes,
    })

    if (newInvoice) {
      await updateEstimate(estimate.id, { status: 'accepted' })
      toast.success('Estimate converted to invoice!')
      setSelectedEstimate(null)
      loadData()
    }
  }

async function handleConvertToJob(estimate: Estimate) {
  const today = new Date().toISOString().split('T')[0]
  
  // Use CRM workflow function that links job back to estimate
  const newJob = await convertEstimateToJob(estimate.id, today, 'Residential')
  
  if (newJob) {
  toast.success('Job created from estimate! The job is now linked to this estimate.')
  setSelectedEstimate(null)
  loadData()
  } else {
  toast.error('Failed to create job')
  }
  }

  async function handleMarkEstimateStatus(estimate: Estimate, status: EstimateStatus) {
    await updateEstimate(estimate.id, { status })
    toast.success(`Estimate marked as ${status}`)
    setSelectedEstimate(null)
    loadData()
  }

  function resetForm() {
    setFormCustomerId('')
    setFormJobId(null)
    setFormItems([{ id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }])
    setFormNotes('')
    setFormDueDate('')
  }
  
  // Auto-fill invoice from selected job
  function handleJobSelect(jobId: string) {
    if (jobId === 'none') {
      setFormJobId(null)
      return
    }
    
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    
    setFormJobId(jobId)
    
    // Auto-fill from job
    const customer = customers.find(c => c.id === job.customerId)
    if (customer) {
      setFormCustomerId(job.customerId)
    }
    
    // Create line item from job
    const jobDescription = `${job.jobType} Service${job.notes ? ` - ${job.notes}` : ''}`
    setFormItems([{
      id: '1',
      description: jobDescription,
      quantity: 1,
      unitPrice: job.price,
      total: job.price
    }])
  }

  // Open Record Payment modal
  async function openRecordPaymentModal(invoice: Invoice) {
    setRecordPaymentInvoice(invoice)
    const balance = invoice.total - invoice.amountPaid
    setPaymentAmount(balance.toFixed(2))
    setPaymentMethod('cash')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentReference('')
    setPaymentNotes('')
    
    // Load existing payments for this invoice
    const payments = await getPaymentsForInvoice(invoice.id)
    setInvoicePayments(payments)
    
    setShowRecordPayment(true)
  }

  // Handle recording a payment
  async function handleRecordPayment() {
    if (!recordPaymentInvoice) return
    
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }
    
    const balance = recordPaymentInvoice.total - recordPaymentInvoice.amountPaid
    if (amount > balance) {
      toast.error(`Payment amount cannot exceed balance due ($${balance.toFixed(2)})`)
      return
    }
    
    setIsRecordingPayment(true)
    
    const result = await recordPayment({
      invoiceId: recordPaymentInvoice.id,
      jobId: recordPaymentInvoice.jobId || undefined,
      customerId: recordPaymentInvoice.customerId,
      amount,
      paymentMethod,
      paymentDate,
      referenceNumber: paymentReference || undefined,
      notes: paymentNotes || undefined,
    })
    
    setIsRecordingPayment(false)
    
    if (result.success) {
      const customer = customers.find(c => c.id === recordPaymentInvoice.customerId)
      if (customer && result.invoiceFullyPaid) {
        notifyInvoicePaid(
          { id: recordPaymentInvoice.id, invoiceNumber: recordPaymentInvoice.invoiceNumber, total: recordPaymentInvoice.total, customerId: recordPaymentInvoice.customerId },
          customer.name
        )
      }
      toast.success(result.invoiceFullyPaid ? 'Invoice fully paid!' : 'Payment recorded successfully!')
      setShowRecordPayment(false)
      setSelectedInvoice(null)
      loadData()
    } else {
      toast.error(result.error || 'Failed to record payment')
    }
  }

  function getStatusColor(status: InvoiceStatus | EstimateStatus) {
    const colors: Record<string, string> = {
      'draft': 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      'sent': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'paid': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'overdue': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'cancelled': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
      'accepted': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'declined': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'expired': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    }
    return colors[status] || colors['draft']
  }

  const filteredInvoices = invoices.filter(inv =>
    inv.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredEstimates = estimates.filter(est =>
    est.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    est.estimateNumber.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Stats
  const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length
  const pendingEstimates = estimates.filter(e => e.status === 'sent' || e.status === 'draft').length

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full">
          <div className="h-10 w-64 bg-muted rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Invoices & Estimates</h1>
            <p className="text-muted-foreground text-sm mt-1">Create and manage quotes and billing</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setShowCreateEstimate(true) }}>
              <FileText className="h-4 w-4 mr-2" />
              New Estimate
            </Button>
            <Button onClick={() => { resetForm(); setShowCreateInvoice(true) }} className="bg-primary">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Outstanding</p>
                <p className="text-xl font-bold text-amber-500">${totalOutstanding.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Collected</p>
                <p className="text-xl font-bold text-emerald-500">${totalPaid.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-red-500/10">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Overdue</p>
                <p className="text-xl font-bold text-red-500">{overdueCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Pending Quotes</p>
                <p className="text-xl font-bold text-blue-500">{pendingEstimates}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer or number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 sm:w-[280px]">
              <TabsTrigger value="invoices" className="gap-2">
                <Receipt className="h-4 w-4" />
                Invoices
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{invoices.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="estimates" className="gap-2">
                <FileText className="h-4 w-4" />
                Estimates
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{estimates.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {activeTab === 'invoices' ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-1">No invoices yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first invoice to start getting paid</p>
                <Button onClick={() => { resetForm(); setShowCreateInvoice(true) }}>
                  <Plus className="h-4 w-4 mr-2" /> Create Invoice
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredInvoices.map(invoice => {
                  const suggestion = generateInvoiceSuggestion(invoice)
                  return (
                    <div 
                      key={invoice.id} 
                      className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedInvoice(invoice)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            invoice.status === 'paid' ? "bg-emerald-500/10" : 
                            invoice.status === 'overdue' ? "bg-red-500/10" : "bg-blue-500/10"
                          )}>
                            <Receipt className={cn(
                              "h-5 w-5",
                              invoice.status === 'paid' ? "text-emerald-500" : 
                              invoice.status === 'overdue' ? "text-red-500" : "text-blue-500"
                            )} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold truncate">{invoice.customerName || 'Unknown'}</p>
                              <Badge className={cn("text-xs", getStatusColor(invoice.status))}>
                                {invoice.status}
                              </Badge>
                              {invoice.jobId ? (
                                <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Briefcase className="h-2.5 w-2.5" />
                                  Job linked
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  Standalone
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {invoice.invoiceNumber} &middot; Due {formatDate(invoice.dueDate)}
                            </p>
                            {suggestion && (
                              <div className={cn(
                                "flex items-center gap-1.5 mt-2 text-xs",
                                suggestion.tone === 'warning' ? 'text-amber-500' : 'text-blue-500'
                              )}>
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>{suggestion.title}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold">${invoice.total.toFixed(2)}</p>
                            {invoice.amountPaid > 0 && invoice.amountPaid < invoice.total && (
                              <p className="text-xs text-muted-foreground">Paid: ${invoice.amountPaid.toFixed(2)}</p>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => setSelectedInvoice(invoice)}>
                                <Eye className="h-4 w-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              {invoice.status === 'draft' && (
                                <DropdownMenuItem onClick={() => handleSendInvoice(invoice)}>
                                  <Send className="h-4 w-4 mr-2" /> Send Invoice
                                </DropdownMenuItem>
                              )}
                              {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                                <>
                                  <DropdownMenuItem onClick={() => {
                                    const c = customers.find(cust => cust.id === invoice.customerId)
                                    setTakePaymentCtx({
                                      customerId: invoice.customerId,
                                      customerName: invoice.customerName || c?.name,
                                      customerPhone: c?.phone,
                                      customerEmail: c?.email,
                                      invoiceId: invoice.id,
                                      amount: Math.max(0, invoice.total - invoice.amountPaid),
                                    })
                                  }}>
                                    <CreditCard className="h-4 w-4 mr-2" /> Take Payment (JIM)
                                  </DropdownMenuItem>
<DropdownMenuItem onClick={() => openPaymentDialog(invoice)}>
  <DollarSign className="h-4 w-4 mr-2" /> Mark as Paid
  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    const paymentLink = `${window.location.origin}/pay/${invoice.id}`
                                    navigator.clipboard.writeText(paymentLink)
                                    toast.success('Payment link copied!')
                                  }}>
                                    <Link2 className="h-4 w-4 mr-2" /> Copy Payment Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    const msg = generateInvoiceReminderMessage(invoice, invoice.customerName)
                                    navigator.clipboard.writeText(msg)
                                    toast.success('Reminder message copied')
                                  }}>
                                    <Sparkles className="h-4 w-4 mr-2" /> Generate Reminder
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  await deleteInvoice(invoice.id)
                                  toast.success('Invoice deleted')
                                  loadData()
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {filteredEstimates.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-1">No estimates yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create quotes for potential jobs</p>
                <Button onClick={() => { resetForm(); setShowCreateEstimate(true) }}>
                  <Plus className="h-4 w-4 mr-2" /> Create Estimate
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredEstimates.map(estimate => (
                  <div 
                    key={estimate.id} 
                    className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedEstimate(estimate)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          estimate.status === 'accepted' ? "bg-emerald-500/10" : 
                          estimate.status === 'declined' ? "bg-red-500/10" : "bg-purple-500/10"
                        )}>
                          <FileText className={cn(
                            "h-5 w-5",
                            estimate.status === 'accepted' ? "text-emerald-500" : 
                            estimate.status === 'declined' ? "text-red-500" : "text-purple-500"
                          )} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold truncate">{estimate.customerName || 'Unknown'}</p>
                            <Badge className={cn("text-xs", getStatusColor(estimate.status))}>
                              {estimate.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {estimate.estimateNumber} &middot; Valid until {formatDate(estimate.expiryDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-lg font-bold">${estimate.total.toFixed(2)}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => setSelectedEstimate(estimate)}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            {estimate.status === 'draft' && (
                              <DropdownMenuItem onClick={async () => {
                                await updateEstimate(estimate.id, { status: 'sent' })
                                toast.success('Estimate marked as sent')
                                loadData()
                              }}>
                                <Send className="h-4 w-4 mr-2" /> Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {(estimate.status === 'draft' || estimate.status === 'sent') && (
                              <DropdownMenuItem onClick={() => handleConvertToInvoice(estimate)}>
                                <ArrowRight className="h-4 w-4 mr-2" /> Convert to Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                await deleteEstimate(estimate.id)
                                toast.success('Estimate deleted')
                                loadData()
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Invoice Dialog */}
        <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Create Invoice
              </DialogTitle>
              <DialogDescription>
                Create a new invoice for your customer
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Job Selection - Primary way to create invoice */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Link to Job (Recommended)
                </Label>
                <Select 
                  value={formJobId || 'none'} 
                  onValueChange={handleJobSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a job to invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No job (standalone invoice)</SelectItem>
                    {jobs.filter(j => !j.invoiceId && (j.status === 'Completed' || j.status === 'In progress')).map(job => {
                      const customer = customers.find(c => c.id === job.customerId)
                      return (
                        <SelectItem key={job.id} value={job.id}>
                          {customer?.name} - {job.jobType} (${job.price}) - {formatDate(job.date)}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {!formJobId && (
                  <p className="text-xs text-muted-foreground">
                    Linking to a job tracks revenue and profit accurately. Standalone invoices only appear in customer balance.
                  </p>
                )}
                {formJobId && (
                  <p className="text-xs text-emerald-600">
                    Invoice will be linked to this job for accurate revenue tracking.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select 
                    value={formCustomerId} 
                    onValueChange={(v) => {
                      setFormCustomerId(v)
                      setFormJobId(null) // Reset job when customer changes
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input 
                    type="date" 
                    value={formDueDate} 
                    onChange={e => setFormDueDate(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Line Items</Label>
                <LineItemEditor items={formItems} onItemsChange={setFormItems} />
              </div>

              <TotalsSummary items={formItems} taxRate={taxRate} />

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea 
                  value={formNotes} 
                  onChange={e => setFormNotes(e.target.value)} 
                  placeholder="Payment terms, special instructions..." 
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleCreateInvoice}>
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Estimate Dialog */}
        <Dialog open={showCreateEstimate} onOpenChange={setShowCreateEstimate}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Create Estimate
              </DialogTitle>
              <DialogDescription>
                Create a quote for a potential job
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input 
                    type="date" 
                    value={formDueDate} 
                    onChange={e => setFormDueDate(e.target.value)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Line Items</Label>
                <LineItemEditor items={formItems} onItemsChange={setFormItems} />
              </div>

              <TotalsSummary items={formItems} taxRate={taxRate} />

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea 
                  value={formNotes} 
                  onChange={e => setFormNotes(e.target.value)} 
                  placeholder="Scope of work, materials included..." 
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleCreateEstimate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Estimate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invoice Detail Dialog - Professional Preview */}
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {selectedInvoice && (
              <AdminDocumentPreview
                type="invoice"
                documentNumber={selectedInvoice.invoiceNumber}
                status={selectedInvoice.status}
                issueDate={selectedInvoice.issueDate}
                dueDate={selectedInvoice.dueDate}
                company={{
                  name: businessInfo.name || 'Your Company',
                  phone: businessInfo.phone,
                  email: businessInfo.email,
                }}
                customer={{
                  name: selectedInvoice.customerName || 'Customer',
                  email: customers.find(c => c.id === selectedInvoice.customerId)?.email,
                  phone: customers.find(c => c.id === selectedInvoice.customerId)?.phone,
                  address: customers.find(c => c.id === selectedInvoice.customerId)?.address,
                }}
                items={selectedInvoice.items.map(item => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  total: item.quantity * item.unitPrice,
                }))}
                subtotal={selectedInvoice.subtotal}
                taxRate={selectedInvoice.taxRate}
                taxAmount={selectedInvoice.taxAmount}
                total={selectedInvoice.total}
                amountPaid={selectedInvoice.amountPaid}
                notes={selectedInvoice.notes}
                internalNotes={(selectedInvoice as any).internalNotes}
                linkedEstimateNumber={selectedInvoice.estimateId ? estimates.find(e => e.id === selectedInvoice.estimateId)?.estimateNumber : null}
                linkedJobId={selectedInvoice.jobId}
                documentId={selectedInvoice.id}
                onSend={() => { handleSendInvoice(selectedInvoice); setSelectedInvoice(null) }}
                onCopyLink={() => {
                  const paymentLink = `${window.location.origin}/pay/${selectedInvoice.id}`
                  navigator.clipboard.writeText(paymentLink)
                  toast.success('Payment link copied!')
                }}
                onRecordPayment={() => openRecordPaymentModal(selectedInvoice)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Estimate Detail Dialog - Professional Preview */}
        <Dialog open={!!selectedEstimate} onOpenChange={() => setSelectedEstimate(null)}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {selectedEstimate && (
              <AdminDocumentPreview
                type="estimate"
                documentNumber={selectedEstimate.estimateNumber}
                status={selectedEstimate.status}
                issueDate={selectedEstimate.issueDate}
                expiryDate={selectedEstimate.expiryDate}
                company={{
                  name: businessInfo.name || 'Your Company',
                  phone: businessInfo.phone,
                  email: businessInfo.email,
                }}
                customer={{
                  name: selectedEstimate.customerName || 'Customer',
                  email: customers.find(c => c.id === selectedEstimate.customerId)?.email,
                  phone: customers.find(c => c.id === selectedEstimate.customerId)?.phone,
                  address: customers.find(c => c.id === selectedEstimate.customerId)?.address,
                }}
                items={selectedEstimate.items.map(item => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  total: item.quantity * item.unitPrice,
                }))}
                subtotal={selectedEstimate.subtotal}
                taxRate={selectedEstimate.taxRate}
                taxAmount={selectedEstimate.taxAmount}
                total={selectedEstimate.total}
                notes={selectedEstimate.notes}
                internalNotes={(selectedEstimate as any).internalNotes}
                documentId={selectedEstimate.id}
                onSend={() => { handleMarkEstimateStatus(selectedEstimate, 'sent'); setSelectedEstimate(null) }}
                onMarkAccepted={() => { handleMarkEstimateStatus(selectedEstimate, 'accepted'); setSelectedEstimate(null) }}
                onMarkDeclined={() => { handleMarkEstimateStatus(selectedEstimate, 'declined'); setSelectedEstimate(null) }}
                onConvertToJob={() => { handleConvertToJob(selectedEstimate); setSelectedEstimate(null) }}
                onConvertToInvoice={() => { handleConvertToInvoice(selectedEstimate); setSelectedEstimate(null) }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Invoice Notification Dialog */}
        {notificationInvoice && (
          <NotificationActionsDialog
            open={!!notificationInvoice}
            onOpenChange={(open) => !open && setNotificationInvoice(null)}
            customer={{
              id: notificationInvoice.customerId,
              name: notificationInvoice.customerName || 'Customer',
              phone: customers.find(c => c.id === notificationInvoice.customerId)?.phone,
              email: customers.find(c => c.id === notificationInvoice.customerId)?.email,
            }}
            type="invoice_sent"
            invoiceNumber={notificationInvoice.invoiceNumber}
            invoiceAmount={notificationInvoice.total.toFixed(2)}
            onComplete={() => setNotificationInvoice(null)}
          />
        )}

        {/* Take Payment (JIM) sheet */}
        {takePaymentCtx && (
          <TakePaymentSheet
            open={!!takePaymentCtx}
            onOpenChange={(o) => { if (!o) setTakePaymentCtx(null) }}
            context={takePaymentCtx}
            onRecorded={() => loadData()}
          />
        )}

        {/* Payment Method Dialog (legacy) */}
        <PaymentMethodDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          onConfirm={handleConfirmPayment}
          invoiceNumber={invoiceToMarkPaid?.invoiceNumber}
          amount={invoiceToMarkPaid?.total}
        />

        {/* Record Payment Dialog (Phase 4) */}
        <Dialog open={showRecordPayment} onOpenChange={setShowRecordPayment}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                Record Payment
              </DialogTitle>
              <DialogDescription>
                {recordPaymentInvoice && (
                  <span>
                    Invoice {recordPaymentInvoice.invoiceNumber} - Balance due: ${(recordPaymentInvoice.total - recordPaymentInvoice.amountPaid).toFixed(2)}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="payment-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="pl-9"
                    placeholder="0.00"
                  />
                </div>
                {recordPaymentInvoice && parseFloat(paymentAmount) < (recordPaymentInvoice.total - recordPaymentInvoice.amountPaid) && (
                  <p className="text-xs text-amber-600">This is a partial payment. Remaining balance will be ${((recordPaymentInvoice.total - recordPaymentInvoice.amountPaid) - parseFloat(paymentAmount || '0')).toFixed(2)}</p>
                )}
              </div>
              
              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as NewPaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="venmo">Venmo</SelectItem>
                    <SelectItem value="zelle">Zelle</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Payment Date */}
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              
              {/* Reference Number */}
              <div className="space-y-2">
                <Label htmlFor="payment-ref">Reference Number (Optional)</Label>
                <Input
                  id="payment-ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Check #, transaction ID, etc."
                />
              </div>
              
              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes (Optional)</Label>
                <Textarea
                  id="payment-notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Additional payment details..."
                  rows={2}
                />
              </div>
              
              {/* Payment History */}
              {invoicePayments.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Payment History</span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {invoicePayments.map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded">
                        <div>
                          <span className="font-medium">${payment.amount.toFixed(2)}</span>
                          <span className="text-muted-foreground ml-2">via {payment.paymentMethod}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">{formatDate(payment.paymentDate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRecordPayment(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleRecordPayment} 
                disabled={isRecordingPayment || !paymentAmount}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isRecordingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Record Payment
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
