'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustomerPhotoHistory } from '@/components/job-photos/customer-photo-history'
import { 
  User, Phone, Mail, MapPin, Calendar, DollarSign, Briefcase, 
  FileText, Receipt, CreditCard, Plus, Clock, CheckCircle, XCircle,
  Tag, ChevronRight, ArrowLeft, Navigation, MessageSquare
} from 'lucide-react'
import { Customer, Job, Estimate, Invoice, Income } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CustomerPortalLink } from '@/components/customer-portal-link'
import { TakePaymentButton } from '@/components/payments/take-payment-button'
import { PaymentHistory } from '@/components/payments/payment-history'

interface CustomerDetailDrawerProps {
  customer: Customer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  jobs: Job[]
  estimates: Estimate[]
  invoices: Invoice[]
  incomes: Income[]
  onCreateJob: (customerId: string) => void
  onCreateEstimate: (customerId: string) => void
  onCreateInvoice: (customerId: string) => void
  onViewJob?: (job: Job) => void
  onViewEstimate?: (estimate: Estimate) => void
  onViewInvoice?: (invoice: Invoice) => void
}

export function CustomerDetailDrawer({
  customer,
  open,
  onOpenChange,
  jobs,
  estimates,
  invoices,
  incomes,
  onCreateJob,
  onCreateEstimate,
  onCreateInvoice,
  onViewJob,
  onViewEstimate,
  onViewInvoice,
}: CustomerDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [paymentRefresh, setPaymentRefresh] = useState(0)

  if (!customer) return null

  // Outstanding balance across this customer's invoices (suggested amount).
  const outstandingBalance = invoices
    .filter((i) => i.customerId === customer.id)
    .reduce((sum, i) => sum + Math.max(0, (i.total || 0) - (i.amountPaid || 0)), 0)

  // Filter data for this customer
  const customerJobs = jobs.filter(j => j.customerId === customer.id)
  const customerEstimates = estimates.filter(e => e.customerId === customer.id)
  const customerInvoices = invoices.filter(i => i.customerId === customer.id)
  const customerPayments = incomes.filter(i => 
    customerJobs.some(j => j.id === i.jobId) || 
    i.customerName?.toLowerCase() === customer.name.toLowerCase()
  )

  // Calculate stats
  const totalSpent = customerInvoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.total, 0)
  
  const pendingAmount = customerInvoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)

  const completedJobs = customerJobs.filter(j => j.status === 'Completed' || j.status === 'Paid').length
  const scheduledJobs = customerJobs.filter(j => j.status === 'Scheduled').length

  const lastServiceDate = customerJobs
    .filter(j => j.status === 'Completed' || j.status === 'Paid')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Scheduled': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'Completed': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      'Paid': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'draft': 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      'sent': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      'paid': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'overdue': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'accepted': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      'declined': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      'expired': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    }
    return colors[status] || colors['draft']
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* Header with Back Button */}
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="flex items-center gap-2 p-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold shrink-0">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate">{customer.name}</h2>
              {customer.phone && (
                <p className="text-sm text-muted-foreground truncate">{customer.phone}</p>
              )}
            </div>
          </div>

          {/* Contact Actions */}
          <div className="px-3 pb-3 flex gap-2">
            {customer.phone && (
              <>
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <a href={`tel:${customer.phone}`}>
                    <Phone className="h-4 w-4 mr-1" /> Call
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <a href={`sms:${customer.phone}`}>
                    <MessageSquare className="h-4 w-4 mr-1" /> Text
                  </a>
                </Button>
              </>
            )}
            {customer.email && (
              <Button size="sm" variant="outline" asChild className="flex-1">
                <a href={`mailto:${customer.email}`}>
                  <Mail className="h-4 w-4 mr-1" /> Email
                </a>
              </Button>
            )}
            {customer.address && (
              <Button size="sm" variant="outline" asChild>
                <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>

          {/* Take Payment */}
          <div className="px-3 pb-3">
            <TakePaymentButton
              size="sm"
              className="w-full"
              context={{
                customerId: customer.id,
                customerName: customer.name,
                customerPhone: customer.phone,
                customerEmail: customer.email,
                amount: outstandingBalance > 0 ? outstandingBalance : undefined,
              }}
              onRecorded={() => setPaymentRefresh((k) => k + 1)}
            />
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 sm:px-6 pt-4 sticky top-0 bg-background z-10">
              <TabsList className="w-full grid grid-cols-5 h-9">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="jobs" className="text-xs">Jobs</TabsTrigger>
                <TabsTrigger value="invoices" className="text-xs">Invoices</TabsTrigger>
                <TabsTrigger value="estimates" className="text-xs">Estimates</TabsTrigger>
                <TabsTrigger value="photos" className="text-xs">Photos</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-4 sm:p-6 pb-24">
              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-0 space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Total Spent</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-500">${totalSpent.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Briefcase className="h-4 w-4" />
                      <span className="text-xs">Jobs</span>
                    </div>
                    <p className="text-xl font-bold">{customerJobs.length}</p>
                    <p className="text-xs text-muted-foreground">{completedJobs} completed</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs">Last Service</span>
                    </div>
                    <p className="text-sm font-medium">
                      {lastServiceDate ? formatDate(lastServiceDate) : 'Never'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Receipt className="h-4 w-4" />
                      <span className="text-xs">Pending</span>
                    </div>
                    <p className={cn("text-xl font-bold", pendingAmount > 0 ? "text-amber-500" : "text-muted-foreground")}>
                      ${pendingAmount.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Quick Actions</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-auto py-3 flex-col gap-1"
                      onClick={() => { onCreateJob(customer.id); onOpenChange(false) }}
                    >
                      <Briefcase className="h-4 w-4" />
                      <span className="text-xs">New Job</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-auto py-3 flex-col gap-1"
                      onClick={() => { onCreateEstimate(customer.id); onOpenChange(false) }}
                    >
                      <FileText className="h-4 w-4" />
                      <span className="text-xs">Estimate</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-auto py-3 flex-col gap-1"
                      onClick={() => { onCreateInvoice(customer.id); onOpenChange(false) }}
                    >
                      <Receipt className="h-4 w-4" />
                      <span className="text-xs">Invoice</span>
                    </Button>
                    <CustomerPortalLink
                      customerId={customer.id}
                      customerName={customer.name}
                    />
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Recent Activity</h3>
                  <div className="space-y-2">
                    {[...customerJobs, ...customerInvoices, ...customerEstimates]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 5)
                      .map((item, idx) => {
                        const isJob = 'jobType' in item
                        const isInvoice = 'invoiceNumber' in item
                        const isEstimate = 'estimateNumber' in item
                        
                        return (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                              isJob ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                              isInvoice ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                            )}>
                              {isJob ? <Briefcase className="h-4 w-4" /> : 
                               isInvoice ? <Receipt className="h-4 w-4" /> : 
                               <FileText className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {isJob ? `${(item as Job).jobType} Job` :
                                 isInvoice ? (item as Invoice).invoiceNumber :
                                 (item as Estimate).estimateNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(item.createdAt)}
                              </p>
                            </div>
                            <Badge className={cn("text-[10px]", getStatusColor(item.status))}>
                              {item.status}
                            </Badge>
                          </div>
                        )
                      })}
                    {customerJobs.length === 0 && customerInvoices.length === 0 && customerEstimates.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {customerPayments.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Recent Payments</h3>
                    <div className="space-y-2">
                      {customerPayments.slice(0, 3).map((payment, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm">{payment.paymentMethod}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(payment.date)}</p>
                            </div>
                          </div>
                          <span className="font-medium text-emerald-500">+${payment.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Jobs Tab */}
              <TabsContent value="jobs" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{customerJobs.length} jobs</p>
                  <Button size="sm" variant="outline" onClick={() => { onCreateJob(customer.id); onOpenChange(false) }}>
                    <Plus className="h-4 w-4 mr-1" /> New Job
                  </Button>
                </div>
                {customerJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No jobs yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerJobs
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(job => (
                        <div 
                          key={job.id} 
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => onViewJob?.(job)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{job.jobType}</p>
                              <Badge className={cn("text-[10px]", getStatusColor(job.status))}>
                                {job.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{formatDate(job.date)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${job.price.toLocaleString()}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                  </div>
                )}
              </TabsContent>

              {/* Invoices Tab */}
            <TabsContent value="invoices" className="mt-0 space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Payment history</p>
                <PaymentHistory customerId={customer.id} refreshKey={paymentRefresh} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{customerInvoices.length} invoices</p>
                  <Button size="sm" variant="outline" onClick={() => { onCreateInvoice(customer.id); onOpenChange(false) }}>
                    <Plus className="h-4 w-4 mr-1" /> New Invoice
                  </Button>
                </div>
                {customerInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No invoices yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerInvoices
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map(invoice => (
                        <div 
                          key={invoice.id} 
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => onViewInvoice?.(invoice)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{invoice.invoiceNumber}</p>
                              <Badge className={cn("text-[10px]", getStatusColor(invoice.status))}>
                                {invoice.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${invoice.total.toLocaleString()}</p>
                            {invoice.amountPaid > 0 && invoice.amountPaid < invoice.total && (
                              <p className="text-xs text-muted-foreground">${invoice.amountPaid} paid</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                  </div>
                )}
              </TabsContent>

              {/* Estimates Tab */}
              <TabsContent value="estimates" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{customerEstimates.length} estimates</p>
                  <Button size="sm" variant="outline" onClick={() => { onCreateEstimate(customer.id); onOpenChange(false) }}>
                    <Plus className="h-4 w-4 mr-1" /> New Estimate
                  </Button>
                </div>
                {customerEstimates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No estimates yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerEstimates
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map(estimate => (
                        <div 
                          key={estimate.id} 
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => onViewEstimate?.(estimate)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{estimate.estimateNumber}</p>
                              <Badge className={cn("text-[10px]", getStatusColor(estimate.status))}>
                                {estimate.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Valid until {formatDate(estimate.expiryDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${estimate.total.toLocaleString()}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="photos" className="mt-0">
                <CustomerPhotoHistory customerId={customer.id} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
