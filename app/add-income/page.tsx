'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addIncome, getCustomers, getJobs } from '@/lib/storage'
import { JobType, PaymentMethod, PaymentStatus, Customer, Job } from '@/lib/types'
import { formatDate } from '@/lib/utils-finance'
import { toast } from 'sonner'
import { ArrowLeft, DollarSign, User, Briefcase, CreditCard, FileText, Calendar, CheckCircle, ChevronDown, X } from 'lucide-react'
import Link from 'next/link'

const jobTypes: JobType[] = ['Residential', 'Commercial', 'Storefront']
const paymentMethods: PaymentMethod[] = ['Cash', 'Card', 'Check', 'Zelle', 'Venmo', 'Other']
const paymentStatuses: PaymentStatus[] = ['Paid', 'Pending']

export default function AddIncomePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [linkToJob, setLinkToJob] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    jobType: 'Residential' as JobType,
    paymentMethod: 'Cash' as PaymentMethod,
    paymentStatus: 'Paid' as PaymentStatus,
    jobId: '',
    notes: '',
  })

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setFormData(prev => ({ ...prev, customerName: customer.name }))
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
    // Auto-enable job linking if this customer has jobs
    const customerJobs = jobs.filter(j => j.customerId === customer.id)
    if (customerJobs.length > 0) setLinkToJob(true)
  }

  const handleClearCustomer = () => {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setFormData(prev => ({ ...prev, customerName: '' }))
  }

  // Load customers and jobs on mount
  useEffect(() => {
    const loadData = async () => {
      const [customersData, jobsData] = await Promise.all([getCustomers(), getJobs()])
      setCustomers(customersData)
      setJobs(jobsData)
    }
    loadData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    if (!formData.amount || !formData.customerName) {
      toast.error('Please fill in all required fields')
      setIsSubmitting(false)
      return
    }

    const result = await addIncome({
      amount: parseFloat(formData.amount),
      date: formData.date,
      customerName: formData.customerName,
      jobType: formData.jobType,
      paymentMethod: formData.paymentMethod,
      paymentStatus: formData.paymentStatus,
      jobId: linkToJob ? formData.jobId : undefined,
      notes: formData.notes,
    })

    if (result) {
      toast.success('Income added successfully!')
      router.push('/')
    } else {
      toast.error('Failed to add income')
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto space-y-6 p-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-4 animate-fade-in">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 hover-scale">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Add Income</h1>
            <p className="text-sm text-muted-foreground">Record a new payment</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Card - Prominent */}
          <Card className="border-primary/20 bg-primary/5 animate-fade-in-up">
            <CardContent className="p-4">
              <Label htmlFor="amount" className="text-sm font-medium text-muted-foreground mb-2 block">
                Amount
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="pl-12 h-14 text-2xl font-bold border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="animate-fade-in-up delay-100">
            <CardContent className="p-4 space-y-4">
              {/* Customer Picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Customer Name
                </Label>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Search or type a name..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value)
                          setFormData(prev => ({ ...prev, customerName: e.target.value }))
                          setSelectedCustomer(null)
                          setShowCustomerDropdown(true)
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                        className="h-12 pr-8"
                        required
                      />
                      {customerSearch ? (
                        <button
                          type="button"
                          onClick={handleClearCustomer}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      )}
                    </div>
                  </div>

                  {/* Dropdown list */}
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border bg-background shadow-lg overflow-hidden">
                      <div className="max-h-52 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={() => handleSelectCustomer(customer)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent transition-colors border-b last:border-0"
                          >
                            <div>
                              <p className="text-sm font-medium">{customer.name}</p>
                              {(customer.phone || customer.address) && (
                                <p className="text-xs text-muted-foreground truncate max-w-xs">
                                  {customer.phone}{customer.phone && customer.address ? ' · ' : ''}{customer.address}
                                </p>
                              )}
                            </div>
                            {selectedCustomer?.id === customer.id && (
                              <CheckCircle className="h-4 w-4 text-primary shrink-0 ml-2" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No matches hint */}
                  {showCustomerDropdown && customerSearch.length > 0 && filteredCustomers.length === 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border bg-background shadow-lg px-4 py-3">
                      <p className="text-sm text-muted-foreground">No customer found — name will be saved as typed.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="date" className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="h-12"
                />
              </div>

              {/* Job Type & Payment Method - Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="jobType" className="text-sm font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    Job Type
                  </Label>
                  <Select
                    value={formData.jobType}
                    onValueChange={(value) => setFormData({ ...formData, jobType: value as JobType })}
                  >
                    <SelectTrigger id="jobType" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod" className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Payment Method
                  </Label>
                  <Select
                    value={formData.paymentMethod}
                    onValueChange={(value) => setFormData({ ...formData, paymentMethod: value as PaymentMethod })}
                  >
                    <SelectTrigger id="paymentMethod" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Status */}
              <div className="space-y-2">
                <Label htmlFor="paymentStatus" className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  Payment Status
                </Label>
                <Select
                  value={formData.paymentStatus}
                  onValueChange={(value) => setFormData({ ...formData, paymentStatus: value as PaymentStatus })}
                >
                  <SelectTrigger id="paymentStatus" className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Link to Job Toggle */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant={linkToJob ? 'default' : 'outline'}
                  className="w-full h-11"
                  onClick={() => setLinkToJob(!linkToJob)}
                >
                  {linkToJob ? 'Linked to Job' : 'Link to Job'}
                </Button>
              </div>

              {/* Job Selector - Shows when linked */}
              {linkToJob && (
                <div className="space-y-2">
                  <Label htmlFor="jobId" className="text-sm font-medium">
                    Select Job
                  </Label>
                  <Select
                    value={formData.jobId}
                    onValueChange={(value) => {
                      const job = jobs.find(j => j.id === value)
                      if (job) {
                        // Fill every field from the job automatically
                        setFormData(prev => ({
                          ...prev,
                          jobId: value,
                          amount: String(job.price),
                          date: job.date,
                          jobType: job.jobType,
                          paymentStatus: job.status === 'Paid' ? 'Paid' : 'Pending',
                          notes: job.notes || prev.notes,
                        }))
                      } else {
                        setFormData(prev => ({ ...prev, jobId: value }))
                      }
                    }}
                  >
                    <SelectTrigger id="jobId" className="h-12">
                      <SelectValue placeholder="Choose a job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedCustomer
                        ? jobs.filter(j => j.customerId === selectedCustomer.id)
                        : jobs
                      ).map((job) => {
                        const customerName = customers.find(c => c.id === job.customerId)?.name || 'Unknown'
                        return (
                          <SelectItem key={job.id} value={job.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {formatDate(job.date)} — ${job.price}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {!selectedCustomer && `${customerName} · `}{job.jobType} · {job.status}{job.notes ? ` · ${job.notes}` : ''}
                              </span>
                            </div>
                          </SelectItem>
                        )
                      })}
                      {selectedCustomer && jobs.filter(j => j.customerId === selectedCustomer.id).length === 0 && (
                        <SelectItem value="none" disabled>No jobs for this customer yet</SelectItem>
                      )}
                      {!selectedCustomer && jobs.length === 0 && (
                        <SelectItem value="none" disabled>No jobs found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.jobId && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      <p className="text-xs text-emerald-700 font-medium">
                        Amount, date, job type, status and notes auto-filled from job
                      </p>
                    </div>
                  )}
                  {selectedCustomer && !formData.jobId && (
                    <p className="text-xs text-muted-foreground">Showing jobs for {selectedCustomer.name}</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Notes (optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2 animate-fade-in-up delay-200">
            <Button 
              type="submit" 
              className="flex-1 h-12 text-base font-semibold hover-scale"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Income'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 hover-scale"
              onClick={() => router.push('/')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
