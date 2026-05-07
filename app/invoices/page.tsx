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
import { Plus, FileText, Send, Trash2, Eye, MoreHorizontal, DollarSign, Clock, CheckCircle, AlertCircle, Search, Link2, Sparkles, Receipt, ArrowRight, Download, Mail, Briefcase, XCircle, RefreshCw } from 'lucide-react'
import { LineItemEditor, TotalsSummary, type LineItem } from '@/components/line-item-editor'
import { toast } from 'sonner'
import { getInvoices, getEstimates, getCustomers, addInvoice, addEstimate, updateInvoice, updateEstimate, deleteInvoice, deleteEstimate, getNextInvoiceNumber, getNextEstimateNumber, getSettings, getJobs, convertEstimateToJob, createInvoiceFromJob, markInvoicePaid } from '@/lib/storage'
import { Invoice, Estimate, Customer, InvoiceItem, EstimateItem, InvoiceStatus, EstimateStatus, Job } from '@/lib/types'
import { formatDate } from '@/lib/utils-finance'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { generateInvoiceSuggestion, generateInvoiceReminderMessage } from '@/lib/ai/insights'
import { NotificationActionsDialog } from '@/components/notification-actions'
import { cn } from '@/lib/utils'
import { PaymentMethodDialog, PaymentMethodType } from '@/components/payment-method-dialog'
import { notifyInvoiceCreated, notifyInvoicePaid, notifyEstimateCreated, notifyEstimateAccepted } from '@/lib/in-app-notifications'

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
  
  // Payment method dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [invoiceToMarkPaid, setInvoiceToMarkPaid] = useState<Invoice | null>(null)

  // Form state
  const [formCustomerId, setFormCustomerId] = useState('')
  const [formItems, setFormItems] = useState<LineItem[]>([
    { id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }
  ])
  const [formNotes, setFormNotes] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])

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
  const customer = customers.find(c => c.id === formCustomerId)
  if (customer) {
    notifyInvoiceCreated({ id: newInvoice.id, invoiceNumber: newInvoice.invoiceNumber, total: newInvoice.total, customerId: formCustomerId }, customer.name)
  }
  toast.success('Invoice created!')
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
    setFormItems([{ id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }])
    setFormNotes('')
    setFormDueDate('')
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

        {/* Invoice Detail Dialog */}
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
            {selectedInvoice && (
              <>
                <DialogHeader className="pb-4 border-b pr-8">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <DialogTitle className="text-lg sm:text-xl">{selectedInvoice.invoiceNumber}</DialogTitle>
                      <p className="text-muted-foreground text-sm mt-1">
                        Issued {formatDate(selectedInvoice.issueDate)}
                      </p>
                    </div>
                    <Badge className={cn("text-xs sm:text-sm px-2 sm:px-3 py-1 w-fit", getStatusColor(selectedInvoice.status))}>
                      {selectedInvoice.status}
                    </Badge>
                  </div>
                </DialogHeader>
                
                <div className="space-y-4 sm:space-y-6 py-4">
                  {/* Customer Info */}
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:gap-0">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bill To</p>
                      <p className="font-semibold text-base sm:text-lg">{selectedInvoice.customerName}</p>
                      {customers.find(c => c.id === selectedInvoice.customerId)?.email && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[200px]">{customers.find(c => c.id === selectedInvoice.customerId)?.email}</span>
                        </p>
                      )}
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Due Date</p>
                      <p className="font-medium">{formatDate(selectedInvoice.dueDate)}</p>
                    </div>
                  </div>

                  {/* Line Items - Card layout on mobile, table on desktop */}
                  <div className="border rounded-lg overflow-hidden">
                    {/* Desktop table */}
                    <table className="w-full text-sm hidden sm:table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Description</th>
                          <th className="text-center p-3 w-16 font-medium">Qty</th>
                          <th className="text-right p-3 w-20 font-medium">Price</th>
                          <th className="text-right p-3 w-20 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedInvoice.items.map((item, i) => (
                          <tr key={i}>
                            <td className="p-3">{item.description}</td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3 text-right">${item.unitPrice.toFixed(2)}</td>
                            <td className="p-3 text-right font-medium">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Mobile card layout */}
                    <div className="sm:hidden divide-y">
                      {selectedInvoice.items.map((item, i) => (
                        <div key={i} className="p-3 space-y-1">
                          <p className="font-medium">{item.description}</p>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{item.quantity} x ${item.unitPrice.toFixed(2)}</span>
                            <span className="font-medium text-foreground">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-muted/30 rounded-lg p-3 sm:p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${selectedInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({selectedInvoice.taxRate}%)</span>
                      <span>${selectedInvoice.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg sm:text-xl font-bold pt-2 border-t">
                      <span>Total</span>
                      <span className="text-primary">${selectedInvoice.total.toFixed(2)}</span>
                    </div>
                    {selectedInvoice.amountPaid > 0 && (
                      <>
                        <div className="flex justify-between text-sm text-emerald-600">
                          <span>Amount Paid</span>
                          <span>-${selectedInvoice.amountPaid.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Balance Due</span>
                          <span>${(selectedInvoice.total - selectedInvoice.amountPaid).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedInvoice.notes && (
                    <div className="bg-muted/30 rounded-lg p-3 sm:p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
                      <p className="text-sm">{selectedInvoice.notes}</p>
                    </div>
                  )}

                  {/* Linked Records */}
                  {(selectedInvoice.estimateId || selectedInvoice.jobId) && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 sm:p-4">
                      <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> Linked Records
                      </p>
                      <div className="space-y-1 text-sm">
                        {selectedInvoice.estimateId && (
                          <p>From Estimate: {estimates.find(e => e.id === selectedInvoice.estimateId)?.estimateNumber || 'Unknown'}</p>
                        )}
                        {selectedInvoice.jobId && (
                          <p>Job: {jobs.find(j => j.id === selectedInvoice.jobId)?.id?.slice(0, 8) || 'Unknown'}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col gap-2 border-t pt-4">
                  {selectedInvoice.status === 'draft' && (
                    <Button onClick={() => { handleSendInvoice(selectedInvoice); setSelectedInvoice(null) }} className="w-full sm:w-auto">
                      <Send className="h-4 w-4 mr-2" /> Send Invoice
                    </Button>
                  )}
                  {(selectedInvoice.status === 'sent' || selectedInvoice.status === 'overdue') && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full">
                      <Button variant="outline" onClick={() => {
                        const paymentLink = `${window.location.origin}/pay/${selectedInvoice.id}`
                        navigator.clipboard.writeText(paymentLink)
                        toast.success('Payment link copied!')
                      }} className="flex-1">
                        <Link2 className="h-4 w-4 mr-2" /> Copy Link
                      </Button>
<Button onClick={() => openPaymentDialog(selectedInvoice)} className="flex-1">
  <DollarSign className="h-4 w-4 mr-2" /> Mark as Paid
  </Button>
                    </div>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Estimate Detail Dialog */}
        <Dialog open={!!selectedEstimate} onOpenChange={() => setSelectedEstimate(null)}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
            {selectedEstimate && (
              <>
                <DialogHeader className="pb-4 border-b pr-8">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <DialogTitle className="text-lg sm:text-xl">{selectedEstimate.estimateNumber}</DialogTitle>
                      <p className="text-muted-foreground text-sm mt-1">
                        Issued {formatDate(selectedEstimate.issueDate)}
                      </p>
                    </div>
                    <Badge className={cn("text-xs sm:text-sm px-2 sm:px-3 py-1 w-fit", getStatusColor(selectedEstimate.status))}>
                      {selectedEstimate.status}
                    </Badge>
                  </div>
                </DialogHeader>
                
                <div className="space-y-4 sm:space-y-6 py-4">
                  {/* Customer Info */}
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:gap-0">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Prepared For</p>
                      <p className="font-semibold text-base sm:text-lg">{selectedEstimate.customerName}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Valid Until</p>
                      <p className="font-medium">{formatDate(selectedEstimate.expiryDate)}</p>
                    </div>
                  </div>

                  {/* Line Items - Card layout on mobile, table on desktop */}
                  <div className="border rounded-lg overflow-hidden">
                    {/* Desktop table */}
                    <table className="w-full text-sm hidden sm:table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Description</th>
                          <th className="text-center p-3 w-16 font-medium">Qty</th>
                          <th className="text-right p-3 w-20 font-medium">Price</th>
                          <th className="text-right p-3 w-20 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedEstimate.items.map((item, i) => (
                          <tr key={i}>
                            <td className="p-3">{item.description}</td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3 text-right">${item.unitPrice.toFixed(2)}</td>
                            <td className="p-3 text-right font-medium">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Mobile card layout */}
                    <div className="sm:hidden divide-y">
                      {selectedEstimate.items.map((item, i) => (
                        <div key={i} className="p-3 space-y-1">
                          <p className="font-medium">{item.description}</p>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{item.quantity} x ${item.unitPrice.toFixed(2)}</span>
                            <span className="font-medium text-foreground">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-muted/30 rounded-lg p-3 sm:p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${selectedEstimate.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({selectedEstimate.taxRate}%)</span>
                      <span>${selectedEstimate.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-lg sm:text-xl font-bold pt-2 border-t">
                      <span>Total</span>
                      <span className="text-primary">${selectedEstimate.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {selectedEstimate.notes && (
                    <div className="bg-muted/30 rounded-lg p-3 sm:p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
                      <p className="text-sm">{selectedEstimate.notes}</p>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col gap-2 border-t pt-4">
                  {/* Status action buttons */}
                  {selectedEstimate.status === 'draft' && (
                    <Button variant="outline" onClick={() => handleMarkEstimateStatus(selectedEstimate, 'sent')} className="w-full sm:w-auto">
                      <Send className="h-4 w-4 mr-2" /> Mark as Sent
                    </Button>
                  )}
                  {selectedEstimate.status === 'sent' && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full">
                      <Button variant="outline" onClick={() => handleMarkEstimateStatus(selectedEstimate, 'declined')} className="text-red-600 hover:text-red-700 flex-1">
                        <XCircle className="h-4 w-4 mr-2" /> Declined
                      </Button>
                      <Button variant="outline" onClick={() => handleMarkEstimateStatus(selectedEstimate, 'accepted')} className="text-emerald-600 hover:text-emerald-700 flex-1">
                        <CheckCircle className="h-4 w-4 mr-2" /> Accepted
                      </Button>
                    </div>
                  )}
                  
                  {/* Conversion buttons - show for Draft, Sent, or Accepted */}
                  {(selectedEstimate.status === 'draft' || selectedEstimate.status === 'sent' || selectedEstimate.status === 'accepted') && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full">
                      <Button variant="outline" onClick={() => handleConvertToJob(selectedEstimate)} className="flex-1">
                        <Briefcase className="h-4 w-4 mr-2" /> Convert to Job
                      </Button>
                      <Button onClick={() => handleConvertToInvoice(selectedEstimate)} className="flex-1">
                        <Receipt className="h-4 w-4 mr-2" /> Convert to Invoice
                      </Button>
                    </div>
                  )}
                </DialogFooter>
              </>
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

        {/* Payment Method Dialog */}
        <PaymentMethodDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          onConfirm={handleConfirmPayment}
          invoiceNumber={invoiceToMarkPaid?.invoiceNumber}
          amount={invoiceToMarkPaid?.total}
        />
      </div>
    </AppShell>
  )
}
