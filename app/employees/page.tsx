'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/app-shell'
import { getEmployees, getPayrollSummary, addEmployee, updateEmployee, deleteEmployee } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Employee, PaymentType, PayrollSummary } from '@/lib/types'
import { Plus, Trash2, DollarSign, Clock, Mail, Phone, Pencil, Search, User, TrendingUp, Briefcase } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'

export default function TeamPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payroll, setPayroll] = useState<PayrollSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    paymentType: 'PerJob' as PaymentType,
    hourlyRate: 0,
    perJobRate: 0,
    notes: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [employeesData, payrollData] = await Promise.all([
      getEmployees(),
      getPayrollSummary(),
    ])
    setEmployees(employeesData)
    setPayroll(payrollData)
    setLoading(false)
  }

  async function handleSave() {
    if (saving) return
    
    if (!formData.name.trim()) {
      toast.error('Please enter employee name')
      return
    }

    if (formData.paymentType === 'Hourly' && formData.hourlyRate <= 0) {
      toast.error('Please set hourly rate')
      return
    }

    if (formData.paymentType === 'PerJob' && formData.perJobRate <= 0) {
      toast.error('Please set per-job rate')
      return
    }

    setSaving(true)

    if (editingId) {
      const result = await updateEmployee(editingId, formData)
      setSaving(false)
      if (result) {
        toast.success('Employee updated')
        loadData()
        setShowDialog(false)
        resetForm()
      } else {
        toast.error('Failed to update employee')
      }
    } else {
      const result = await addEmployee({ ...formData, active: true })
      setSaving(false)
      if (result) {
        toast.success('Employee added')
        loadData()
        setShowDialog(false)
        resetForm()
      } else {
        toast.error('Failed to add employee')
      }
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Are you sure? This will deactivate the employee.')) {
      if (await deleteEmployee(id)) {
        toast.success('Employee deactivated')
        loadData()
      }
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      email: '',
      phone: '',
      paymentType: 'PerJob',
      hourlyRate: 0,
      perJobRate: 0,
      notes: '',
    })
    setEditingId(null)
  }

  function openEditDialog(employee: Employee) {
    setFormData({
      name: employee.name,
      email: employee.email || '',
      phone: employee.phone || '',
      paymentType: employee.paymentType,
      hourlyRate: employee.hourlyRate || 0,
      perJobRate: employee.perJobRate || 0,
      notes: employee.notes || '',
    })
    setEditingId(employee.id)
    setShowDialog(true)
  }

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.phone?.includes(searchQuery)
  )

  // Get payroll info for each employee
  const getEmployeePayroll = (empId: string) => payroll.find(p => p.employeeId === empId)

  // Calculate top performer
  const topPerformer = payroll.length > 0 
    ? payroll.reduce((max, curr) => curr.totalEarned > (max?.totalEarned || 0) ? curr : max)
    : null

  // Totals
  const totalWorkers = employees.length
  const totalMonthEarnings = payroll.reduce((sum, p) => sum + p.totalEarned, 0)
  const avgEarningsPerWorker = totalWorkers > 0 ? totalMonthEarnings / totalWorkers : 0

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground text-lg">Loading team...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-3 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Team</h1>
            <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{totalWorkers}</strong> workers</span>
              <span className="text-border">|</span>
              <span><strong className="text-emerald-600">${totalMonthEarnings.toFixed(0)}</strong> payroll</span>
              <span className="text-border">|</span>
              <span><strong className="text-foreground">${avgEarningsPerWorker.toFixed(0)}</strong> avg</span>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowDialog(true) }} size="sm" className="gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>

        {/* Worker List */}
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No workers found</div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="divide-y">
              {filteredEmployees.map((employee) => {
                const payrollData = getEmployeePayroll(employee.id)
                return (
                  <div key={employee.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    {/* Avatar */}
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-medium text-xs text-primary">
                      {employee.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Name & Rate */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{employee.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {employee.paymentType === 'Hourly' ? `$${employee.hourlyRate?.toFixed(0)}/hr` : `$${employee.perJobRate?.toFixed(0)}/job`}
                      </p>
                    </div>
                    {/* Jobs */}
                    <div className="text-center shrink-0">
                      <p className="text-sm font-medium">{payrollData?.jobCount || 0}</p>
                      <p className="text-[10px] text-muted-foreground">jobs</p>
                    </div>
                    {/* Earned */}
                    <p className="text-sm font-medium text-emerald-600 shrink-0 w-16 text-right">${payrollData?.totalEarned.toFixed(0) || '0'}</p>
                    {/* Status */}
                    <Badge 
                      variant="secondary"
                      className={`shrink-0 text-[10px] h-5 ${
                        payrollData?.paymentStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : payrollData?.paymentStatus === 'Unpaid'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {payrollData?.paymentStatus || 'N/A'}
                    </Badge>
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(employee)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(employee.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Worker' : 'Add Worker'}</DialogTitle>
              <DialogDescription>
                {editingId ? 'Update worker information' : 'Add a new team member'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Name */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Smith"
                  className="h-10"
                />
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Payment Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Type <span className="text-destructive">*</span></Label>
                <Select 
                  value={formData.paymentType} 
                  onValueChange={(value) => setFormData({ ...formData, paymentType: value as PaymentType })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hourly">Hourly Rate</SelectItem>
                    <SelectItem value="PerJob">Per Job Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Rate */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {formData.paymentType === 'Hourly' ? 'Hourly Rate' : 'Per Job Rate'} ($)
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.paymentType === 'Hourly' ? formData.hourlyRate || '' : formData.perJobRate || ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0
                    if (formData.paymentType === 'Hourly') {
                      setFormData({ ...formData, hourlyRate: value })
                    } else {
                      setFormData({ ...formData, perJobRate: value })
                    }
                  }}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDialog(false)} 
                  disabled={saving}
                  className="flex-1 h-10"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="flex-1 h-10"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add Worker'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
