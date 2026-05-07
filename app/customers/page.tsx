'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getCustomers, addCustomer, deleteCustomer, updateCustomer, getIncome, getJobs, getEstimates, getInvoices } from '@/lib/storage'
import { Customer, Income, Job, Estimate, Invoice } from '@/lib/types'
import { toast } from 'sonner'
import { Plus, Trash2, Phone, MapPin, Search, Pencil, Mail, MoreVertical, Users } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { SmartBadge } from '@/components/ai/smart-badge'
import { customerTag } from '@/lib/ai/insights'
import { CustomerDetailDrawer } from '@/components/customer-detail-drawer'
import { useRouter } from 'next/navigation'
import { notifyCustomerAdded } from '@/lib/in-app-notifications'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editData, setEditData] = useState({ name: '', phone: '', address: '', email: '', notes: '' })
  
  // Customer Detail Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDetailDrawer, setShowDetailDrawer] = useState(false)
  const router = useRouter()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [customersData, incomesData, jobsData, estimatesData, invoicesData] = await Promise.all([
      getCustomers(),
      getIncome(),
      getJobs(),
      getEstimates(),
      getInvoices(),
    ])
    setCustomers(customersData)
    setIncomes(incomesData)
    setJobs(jobsData)
    setEstimates(estimatesData)
    setInvoices(invoicesData)
    setLoading(false)
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.phone?.includes(searchQuery)
  )

  // Get customer lifetime value
  const getCustomerValue = (customerId: string) => {
    return incomes.filter(i => {
      const job = jobs.find(j => j.id === i.jobId)
      return job?.customerId === customerId
    }).reduce((sum, i) => sum + i.amount, 0)
  }

  // Get customer job count
  const getCustomerJobCount = (customerId: string) => {
    return jobs.filter(j => j.customerId === customerId).length
  }

// Get last service date
  const getLastServiceDate = (customerId: string) => {
  const customerJobs = jobs.filter(j => j.customerId === customerId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return customerJobs[0]?.date || null
  }

  // Get customer CRM stats
  const getCustomerCRMStats = (customerId: string) => {
  const customerEstimates = estimates.filter(e => e.customerId === customerId)
  const customerInvoices = invoices.filter(i => i.customerId === customerId)
  const pendingInvoices = customerInvoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const paidInvoices = customerInvoices.filter(i => i.status === 'paid')
  
  return {
    estimateCount: customerEstimates.length,
    invoiceCount: customerInvoices.length,
    pendingAmount: pendingInvoices.reduce((sum, i) => sum + (i.total - i.amountPaid), 0),
    totalPaid: paidInvoices.reduce((sum, i) => sum + i.total, 0),
  }
  }

  // Separate sales rep customers from regular customers
  const regularCustomers = filteredCustomers.filter(c => !c.salesRepId)
  const salesRepCustomers = filteredCustomers.filter(c => c.salesRepId)

  // Sort by customer value (descending)
  const sortedRegularCustomers = [...regularCustomers].sort((a, b) => {
    const valueA = getCustomerValue(a.id)
    const valueB = getCustomerValue(b.id)
    return valueB - valueA
  })

  const sortedSalesRepCustomers = [...salesRepCustomers].sort((a, b) => {
    const valueA = getCustomerValue(a.id)
    const valueB = getCustomerValue(b.id)
    return valueB - valueA
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    if (!formData.name) {
      toast.error('Please enter customer name')
      setIsSubmitting(false)
      return
    }

    const result = await addCustomer({
      name: formData.name,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
      notes: formData.notes || undefined,
    })

if (result) {
  notifyCustomerAdded(result)
  toast.success('Customer added!')
  setFormData({ name: '', email: '', phone: '', address: '', notes: '' })
  setShowForm(false)
  loadData()
  } else {
  toast.error('Failed to add customer')
    }
    setIsSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this customer?')) {
      if (await deleteCustomer(id)) {
        toast.success('Customer deleted')
        loadData()
      }
    }
  }

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer)
    setEditData({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      email: customer.email || '',
      notes: customer.notes || '',
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingCustomer || !editData.name) {
      toast.error('Name is required')
      return
    }
    const result = await updateCustomer(editingCustomer.id, editData)
    if (result) {
      toast.success('Customer updated!')
      setShowEditModal(false)
      setEditingCustomer(null)
      loadData()
    } else {
      toast.error('Failed to update customer')
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading customers...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  // Calculate totals
  const totalCustomerValue = filteredCustomers.reduce((sum, c) => sum + getCustomerValue(c.id), 0)
  const totalJobs = filteredCustomers.reduce((sum, c) => sum + getCustomerJobCount(c.id), 0)
  const avgCustomerValue = filteredCustomers.length > 0 ? totalCustomerValue / filteredCustomers.length : 0

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Customers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{filteredCustomers.length}</span> total
              <span className="mx-2 text-border">|</span>
              <span className="text-emerald-500 font-medium">${totalCustomerValue.toLocaleString()}</span> lifetime value
              <span className="mx-2 text-border">|</span>
              <span className="font-medium text-foreground">${avgCustomerValue.toFixed(0)}</span> avg
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Customer</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Add Customer Form */}
        {showForm && (
          <div className="border border-border rounded-lg p-4 bg-card">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Name *" className="h-9" />
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email" className="h-9" />
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Phone" className="h-9" />
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Address" className="h-9" />
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Customer'}</Button>
              </div>
            </form>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>

        {/* Customer List */}
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="font-medium mb-1">No customers found</p>
            <p className="text-sm text-muted-foreground mb-4">Add your first customer to get started</p>
            <Button onClick={() => setShowForm(true)} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Customer
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Regular Customers */}
            {sortedRegularCustomers.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
{/* Table Header */}
  <div className="hidden lg:grid lg:grid-cols-[40px_1fr_80px_100px_80px_80px_80px] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
  <div></div>
  <div>Customer</div>
  <div className="text-center">Jobs</div>
  <div className="text-center">Inv</div>
  <div className="text-right">Value</div>
  <div className="text-right">Last Service</div>
  <div></div>
  </div>
                
                {sortedRegularCustomers.map((customer, idx) => {
                  const value = getCustomerValue(customer.id)
                  const jobCount = getCustomerJobCount(customer.id)
                  const lastService = getLastServiceDate(customer.id)
                  const daysAgo = lastService ? Math.floor((new Date().getTime() - new Date(lastService).getTime()) / (1000 * 60 * 60 * 24)) : null
                  const crmStats = getCustomerCRMStats(customer.id)
                  
return (
                    <div
                      key={customer.id}
                      className={`group grid grid-cols-[40px_1fr_auto] lg:grid-cols-[40px_1fr_80px_80px_100px_80px_80px] items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${idx !== 0 ? 'border-t border-border' : ''}`}
                      onClick={() => { setSelectedCustomer(customer); setShowDetailDrawer(true) }}
                    >
                      {/* Avatar */}
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm font-medium">{customer.name.charAt(0).toUpperCase()}</span>
                      </div>
                      
                      {/* Customer Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{customer.name}</span>
                          {(() => {
                            const tag = customerTag(customer, jobs)
                            return tag ? <SmartBadge tag={tag} /> : null
                          })()}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {customer.email || customer.phone || 'No contact info'}
                        </p>
                      </div>
                      
                      {/* Mobile: Value + Actions */}
                      <div className="lg:hidden flex items-center gap-2">
                        <div className="text-right">
                          <span className="font-semibold text-emerald-500">${value.toLocaleString()}</span>
                          <p className="text-xs text-muted-foreground">{jobCount} jobs</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openEditModal(customer)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Customer
                            </DropdownMenuItem>
                            {customer.phone && (
                              <DropdownMenuItem onClick={() => window.open(`tel:${customer.phone}`)}>
                                <Phone className="h-4 w-4 mr-2" />
                                Call
                              </DropdownMenuItem>
                            )}
                            {customer.email && (
                              <DropdownMenuItem onClick={() => window.open(`mailto:${customer.email}`)}>
                                <Mail className="h-4 w-4 mr-2" />
                                Email
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(customer.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      {/* Desktop: Jobs */}
                      <div className="hidden lg:block text-center">
                        <span className="font-medium">{jobCount}</span>
                      </div>
                      
                      {/* Desktop: Invoices */}
                      <div className="hidden lg:block text-center">
                        <span className="font-medium">{crmStats.invoiceCount}</span>
                        {crmStats.pendingAmount > 0 && (
                          <p className="text-[10px] text-amber-500">${crmStats.pendingAmount.toFixed(0)} due</p>
                        )}
                      </div>
                      
                      {/* Desktop: Value */}
                      <div className="hidden lg:block text-right">
                        <span className="font-semibold text-emerald-500">${value.toLocaleString()}</span>
                      </div>
                      
                      {/* Desktop: Last Service */}
                      <div className="hidden lg:block text-right text-sm text-muted-foreground">
                        {daysAgo !== null ? `${daysAgo}d ago` : 'Never'}
                      </div>
                      
                      {/* Actions */}
                      <div className="hidden lg:flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditModal(customer)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(customer.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Sales Rep Customers */}
            {sortedSalesRepCustomers.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Sales Rep Customers ({sortedSalesRepCustomers.length})</h3>
                <div className="border border-border rounded-lg overflow-hidden bg-card">
                  {sortedSalesRepCustomers.map((customer, idx) => {
                    const value = getCustomerValue(customer.id)
                    const jobCount = getCustomerJobCount(customer.id)
                    const lastService = getLastServiceDate(customer.id)
                    const daysAgo = lastService ? Math.floor((new Date().getTime() - new Date(lastService).getTime()) / (1000 * 60 * 60 * 24)) : null
                    
return (
                    <div
                      key={customer.id}
                      className={`group grid grid-cols-[40px_1fr_auto] lg:grid-cols-[40px_1fr_80px_100px_80px_80px] items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${idx !== 0 ? 'border-t border-border' : ''}`}
                      onClick={() => { setSelectedCustomer(customer); setShowDetailDrawer(true) }}
                    >
                      {/* Avatar */}
                        <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <span className="text-sm font-medium text-amber-600">{customer.name.charAt(0).toUpperCase()}</span>
                        </div>
                        
                        {/* Customer Info */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{customer.name}</span>
                            {customer.salesRepName && (
                              <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">
                                via {customer.salesRepName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {customer.email || customer.phone || 'No contact info'}
                          </p>
                        </div>
                        
                        {/* Mobile: Value + Actions */}
                        <div className="lg:hidden flex items-center gap-2">
                          <div className="text-right">
                            <span className="font-semibold text-emerald-500">${value.toLocaleString()}</span>
                            <p className="text-xs text-muted-foreground">{jobCount} jobs</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => openEditModal(customer)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Customer
                              </DropdownMenuItem>
                              {customer.phone && (
                                <DropdownMenuItem onClick={() => window.open(`tel:${customer.phone}`)}>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Call
                                </DropdownMenuItem>
                              )}
                              {customer.email && (
                                <DropdownMenuItem onClick={() => window.open(`mailto:${customer.email}`)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Email
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDelete(customer.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        {/* Desktop: Jobs */}
                        <div className="hidden lg:block text-center">
                          <span className="font-medium">{jobCount}</span>
                        </div>
                        
                        {/* Desktop: Value */}
                        <div className="hidden lg:block text-right">
                          <span className="font-semibold text-emerald-500">${value.toLocaleString()}</span>
                        </div>
                        
                        {/* Desktop: Last Service */}
                        <div className="hidden lg:block text-right text-sm text-muted-foreground">
                          {daysAgo !== null ? `${daysAgo}d ago` : 'Never'}
                        </div>
                        
                        {/* Actions */}
                        <div className="hidden lg:flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditModal(customer)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(customer.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Name</Label>
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Phone</Label>
                  <Input
                    value={editData.phone}
                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Address</Label>
                <Input
                  value={editData.address}
                  onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes</Label>
                <Textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveEdit} className="flex-1 h-10">
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setShowEditModal(false)} className="h-10">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Detail Drawer */}
        <CustomerDetailDrawer
          customer={selectedCustomer}
          open={showDetailDrawer}
          onOpenChange={setShowDetailDrawer}
          jobs={jobs}
          estimates={estimates}
          invoices={invoices}
          incomes={incomes}
          onCreateJob={(customerId) => router.push(`/jobs?customerId=${customerId}&action=new`)}
          onCreateEstimate={(customerId) => router.push(`/invoices?customerId=${customerId}&action=estimate`)}
          onCreateInvoice={(customerId) => router.push(`/invoices?customerId=${customerId}&action=invoice`)}
        />
      </div>
    </AppShell>
  )
}
