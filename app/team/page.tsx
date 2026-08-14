'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { 
  Plus, 
  Users, 
  DollarSign, 
  Briefcase, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  X,
  Check,
  Clock,
  ChevronRight,
  ChevronDown,
  Search,
  Banknote,
  Wallet,
  UserPlus,
  Copy,
  ExternalLink,
  Activity,
  MapPin,
  Phone,
  RefreshCw,
  Play,
  CheckCircle2,
  TrendingUp,
  Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { 
  getEmployees, 
  addEmployee, 
  updateEmployee, 
  deleteEmployee,
  getPayrollSummary,
  getJobs,
  getCustomers,
  getJobWorkers,
  addJobWorker,
  deleteJobWorker
} from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'
import type { Employee, PayrollSummary, PaymentType, Job, Customer, JobWorker } from '@/lib/types'
import {
  getCompanyMembers,
  addCompanyMember,
  updateCompanyMember,
  deleteCompanyMember,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type CompanyMember,
  type Role,
} from '@/lib/permissions'
import { usePermissions, AdminOnly } from '@/lib/permissions-context'
import { Mail, Shield, UserX, Link2, Award, Percent, AlertCircle, CheckCircle, XCircle, Settings } from 'lucide-react'
import { HoursTab } from '@/components/team/hours-tab'
import { WorkPayTab } from '@/components/team/work-pay-tab'
import {
  getCommissions,
  getCommissionRules,
  addCommissionRule,
  updateCommissionRule,
  updateCommission,
  bulkMarkCommissionsPaid,
} from '@/lib/commissions-storage'
import type { Commission, CommissionRule, CommissionStatus, CommissionTrigger, CommissionRateType } from '@/lib/commissions-types'

type TabType = 'activity' | 'team' | 'payroll' | 'workpay' | 'hours' | 'commissions' | 'users'

function TeamPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') as TabType | null
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'activity')
  
  // Sync tab with URL
  function switchTab(tab: TabType) {
    setActiveTab(tab)
    router.push(`/team?tab=${tab}`, { scroll: false })
  }
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payrollData, setPayrollData] = useState<PayrollSummary[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Panel states
  const [showEmployeePanel, setShowEmployeePanel] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Payroll detail states
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payingEmployee, setPayingEmployee] = useState<PayrollSummary | null>(null)
  
  // Employee form
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    phone: '',
    paymentType: 'PerJob' as PaymentType,
    rate: '',
    notes: '',
    role: 'worker' as 'worker' | 'sales_rep',
  })
  
  // For copying invite link
  const [copiedLink, setCopiedLink] = useState(false)
  
  // Company members (for Users tab)
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([])
  const [showMemberPanel, setShowMemberPanel] = useState(false)
  const [editingMember, setEditingMember] = useState<CompanyMember | null>(null)
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'worker' as Role,
  })
  
  const { isOwner, isAdmin, hasPermission } = usePermissions()

  // Commission state
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([])
  const [showRulePanel, setShowRulePanel] = useState(false)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    triggerType: 'payment_received' as CommissionTrigger,
    rateType: 'percentage' as CommissionRateType,
    rateValue: '',
    minBaseAmount: '',
    maxCommission: '',
    appliesToRoles: ['sales_rep'] as string[],
    active: true,
  })
  const [commissionFilter, setCommissionFilter] = useState<CommissionStatus | 'all'>('all')

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const [empData, payroll, jobsData, custData, membersData, commissionsData, rulesData] = await Promise.all([
        getEmployees(),
        getPayrollSummary(),
        getJobs(),
        getCustomers(),
        getCompanyMembers(),
        getCommissions(),
        getCommissionRules()
      ])
      setEmployees(empData)
      setPayrollData(payroll)
      setCompanyMembers(membersData)
      setJobs(jobsData)
      setCustomers(custData)
      setCommissions(commissionsData)
      setCommissionRules(rulesData)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load team data')
    } finally {
      setIsLoading(false)
    }
  }

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!searchQuery) return employees
    const query = searchQuery.toLowerCase()
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(query) ||
      emp.email?.toLowerCase().includes(query) ||
      emp.phone?.includes(query)
    )
  }, [employees, searchQuery])

  // Get customer name
  function getCustomerName(customerId: string) {
    const customer = customers.find(c => c.id === customerId)
    return customer?.name || 'Unknown'
  }

  // Calculate totals
  const totalOwed = useMemo(() => {
    return payrollData.reduce((sum, p) => sum + p.totalEarned, 0)
  }, [payrollData])

  const totalJobs = useMemo(() => {
    return payrollData.reduce((sum, p) => sum + p.jobCount, 0)
  }, [payrollData])

  // Open employee panel for new/edit
  function openEmployeePanel(employee?: Employee) {
    if (employee) {
      setEditingEmployee(employee)
      setEmployeeForm({
        name: employee.name,
        email: employee.email || '',
        phone: employee.phone || '',
        paymentType: employee.paymentType,
        rate: employee.paymentType === 'Hourly' 
          ? (employee.hourlyRate?.toString() || '') 
          : (employee.perJobRate?.toString() || ''),
        notes: employee.notes || '',
        role: (employee as Employee & { role?: string }).role as 'worker' | 'sales_rep' || 'worker',
      })
    } else {
      setEditingEmployee(null)
      setEmployeeForm({
        name: '',
        email: '',
        phone: '',
        paymentType: 'PerJob',
        rate: '',
        notes: '',
        role: 'worker',
      })
    }
    setShowEmployeePanel(true)
  }

  // Save employee
  async function handleSaveEmployee() {
    if (!employeeForm.name.trim()) {
      toast.error('Please enter a name')
      return
    }
    
    // Sales reps require an email to sign up
    if (employeeForm.role === 'sales_rep' && !employeeForm.email.trim()) {
      toast.error('Email is required for sales reps')
      return
    }

    setIsSubmitting(true)
    try {
      const employeeData: Omit<Employee, 'id' | 'createdAt'> & { role: string } = {
        name: employeeForm.name.trim(),
        email: employeeForm.email.trim() || undefined,
        phone: employeeForm.phone.trim() || undefined,
        paymentType: employeeForm.paymentType,
        hourlyRate: employeeForm.paymentType === 'Hourly' ? parseFloat(employeeForm.rate) || 0 : undefined,
        perJobRate: employeeForm.paymentType === 'PerJob' ? parseFloat(employeeForm.rate) || 0 : undefined,
        notes: employeeForm.notes.trim() || undefined,
        active: true,
        role: employeeForm.role,
      }

      if (editingEmployee) {
        const updated = await updateEmployee(editingEmployee.id, employeeData)
        if (updated) {
          setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? updated : e))
          toast.success('Team member updated')
        }
      } else {
        const created = await addEmployee(employeeData)
        if (created) {
          setEmployees(prev => [created, ...prev])
          toast.success('Team member added')
        }
      }
      setShowEmployeePanel(false)
    } catch (error) {
      toast.error('Failed to save team member')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete employee
  async function handleDeleteEmployee(id: string) {
    if (!confirm('Remove this team member?')) return
    
    const success = await deleteEmployee(id)
    if (success) {
      setEmployees(prev => prev.filter(e => e.id !== id))
      toast.success('Team member removed')
    } else {
      toast.error('Failed to remove team member')
    }
  }

  // Mark worker as paid
  async function handleMarkPaid(employeeId: string) {
    const supabase = createClient()
    
    // Update all unpaid job_workers for this employee
    const { error } = await supabase
      .from('job_workers')
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq('employee_id', employeeId)
      .eq('paid', false)

    if (error) {
      toast.error('Failed to mark as paid')
      return
    }

    toast.success('Marked as paid')
    setShowPayModal(false)
    setPayingEmployee(null)
    // Reload payroll data
    const newPayroll = await getPayrollSummary()
    setPayrollData(newPayroll)
  }

  // Format date
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {employees.length} members · <span className="text-warning">${totalOwed.toLocaleString()}</span> owed
            </p>
          </div>
          <Button onClick={() => openEmployeePanel()} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Member
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
          <button 
            onClick={() => switchTab('activity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'activity' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="h-4 w-4" />
            Live
          </button>
          <button 
            onClick={() => switchTab('team')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'team' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            Members
          </button>
          <button 
            onClick={() => switchTab('payroll')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'payroll' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Banknote className="h-4 w-4" />
            Payroll
            {totalOwed > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-500">
                ${totalOwed.toLocaleString()}
              </span>
            )}
          </button>
          <button
            onClick={() => switchTab('workpay')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'workpay'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Wallet className="h-4 w-4" />
            Work &amp; Pay
          </button>
          <button
            onClick={() => switchTab('hours')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'hours'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="h-4 w-4" />
            Hours
          </button>
          {(hasPermission('view_commissions') || hasPermission('manage_commissions')) && (
            <button 
              onClick={() => switchTab('commissions')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'commissions' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Award className="h-4 w-4" />
              Commissions
              {commissions.filter(c => c.status === 'pending' || c.status === 'earned').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-500">
                  {commissions.filter(c => c.status === 'pending' || c.status === 'earned').length}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => switchTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'users' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shield className="h-4 w-4" />
              Users
              {companyMembers.filter(m => m.status === 'invited').length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-blue-500/20 text-blue-500">
                  {companyMembers.filter(m => m.status === 'invited').length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Activity Tab - Live Worker Status */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(() => {
                const workers = employees.filter(e => (e as Employee & { role?: string }).role !== 'sales_rep')
                const todayStr = new Date().toISOString().split('T')[0]
                let working = 0, scheduled = 0, completedToday = 0, idle = 0
                
                workers.forEach(worker => {
                  const workerJobs = jobs.filter(job => {
                    const jw = (job as Job & { job_workers?: { employee_id: string }[] }).job_workers || []
                    return jw.some(j => j.employee_id === worker.id)
                  })
                  const todayJobs = workerJobs.filter(j => j.date === todayStr)
                  if (todayJobs.some(j => j.status === 'In progress')) working++
                  else if (todayJobs.some(j => j.status === 'Scheduled')) scheduled++
                  else idle++
                  completedToday += todayJobs.filter(j => j.status === 'Completed').length
                })
                
                return (
                  <>
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs text-muted-foreground">Working</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-500 mt-1">{working}</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-amber-500" />
                        <span className="text-xs text-muted-foreground">Scheduled</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-500 mt-1">{scheduled}</p>
                    </div>
                    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-xs text-muted-foreground">Done Today</span>
                      </div>
                      <p className="text-2xl font-bold text-green-500 mt-1">{completedToday}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-secondary/30 p-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Idle</span>
                      </div>
                      <p className="text-2xl font-bold mt-1">{idle}</p>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Workers List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Workers</p>
                <Button variant="ghost" size="sm" onClick={loadData} className="gap-2 h-8">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {employees.filter(e => (e as Employee & { role?: string }).role !== 'sales_rep').map((worker) => {
                  const workerJobs = jobs.filter(job => {
                    const jobWorkersList = (job as Job & { job_workers?: { employee_id: string }[] }).job_workers || []
                    return jobWorkersList.some(jw => jw.employee_id === worker.id)
                  })
                  const todayStr = new Date().toISOString().split('T')[0]
                  const todayJobs = workerJobs.filter(j => j.date === todayStr)
                  const inProgress = todayJobs.find(j => j.status === 'In progress')
                  const scheduled = todayJobs.filter(j => j.status === 'Scheduled')
                  const completed = todayJobs.filter(j => j.status === 'Completed')
                  
                  const currentCustomer = inProgress 
                    ? customers.find(c => c.id === inProgress.customerId)
                    : null

                  const status = inProgress ? 'working' : scheduled.length > 0 ? 'scheduled' : 'idle'

                  return (
                    <div 
                      key={worker.id} 
                      className={`rounded-xl border bg-card overflow-hidden transition-all ${
                        status === 'working' 
                          ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' 
                          : status === 'scheduled'
                            ? 'border-amber-500/30'
                            : 'border-border'
                      }`}
                    >
                      {/* Header */}
                      <div className="p-4 flex items-center gap-3">
                        <div className={`relative h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${
                          status === 'working' 
                            ? 'bg-blue-500 text-white' 
                            : status === 'scheduled' 
                              ? 'bg-amber-500/20 text-amber-500' 
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          <span className="text-sm font-bold">
                            {worker.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                          {status === 'working' && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-background flex items-center justify-center">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{worker.name}</p>
                          <p className={`text-xs ${
                            status === 'working' ? 'text-blue-500' : 
                            status === 'scheduled' ? 'text-amber-500' : 
                            'text-muted-foreground'
                          }`}>
                            {status === 'working' ? 'Working now' : 
                             status === 'scheduled' ? `${scheduled.length} job${scheduled.length > 1 ? 's' : ''} today` : 
                             'No jobs today'}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/worker/${worker.id}`)
                              toast.success('Link copied!')
                            }}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/worker/${worker.id}`, '_blank')}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Portal
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEmployeePanel(worker)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Current Job */}
                      {inProgress && currentCustomer && (
                        <div className="px-4 pb-4">
                          <div className="rounded-lg bg-blue-500/10 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-blue-500">CURRENT JOB</p>
                              <Badge variant="outline" className="text-[10px] h-5 bg-blue-500/10 text-blue-500 border-blue-500/30">
                                ${inProgress.price?.toFixed(0) || '0'}
                              </Badge>
                            </div>
                            <p className="font-medium text-sm">{currentCustomer.name}</p>
                            {currentCustomer.address && (
                              <p className="text-xs text-muted-foreground truncate">{currentCustomer.address}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="px-4 pb-4 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          <span className="text-muted-foreground">{completed.length} done</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span className="text-muted-foreground">{scheduled.length} left</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {employees.filter(e => (e as Employee & { role?: string }).role !== 'sales_rep').length === 0 && (
                <div className="text-center py-12 rounded-xl border border-dashed border-border">
                  <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No workers yet</p>
                  <Button onClick={() => openEmployeePanel()} variant="outline" size="sm" className="mt-4">
                    Add your first worker
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Team List */}
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No team members found' : 'No team members yet'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => openEmployeePanel()} variant="outline" size="sm" className="mt-4">
                    Add your first team member
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {filteredEmployees.map((employee) => {
                    const payroll = payrollData.find(p => p.employeeId === employee.id)
                    const owed = payroll?.totalEarned || 0
                    const jobCount = payroll?.jobCount || 0
                    
                    return (
                      <div 
                        key={employee.id} 
                        className="group flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
                        onClick={() => openEmployeePanel(employee)}
                      >
                        {/* Avatar */}
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-primary-foreground">
                            {employee.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{employee.name}</p>
                            {(employee as Employee & { role?: string }).role === 'sales_rep' && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                Sales Rep
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {(employee as Employee & { role?: string }).role === 'sales_rep' 
? (employee.email || 'No email')
                  : (employee.paymentType === 'Hourly'
                  ? `$${employee.hourlyRate}/hr`
                  : `${employee.perJobRate || 20}% commission`)}
                            {employee.phone && ` · ${employee.phone}`}
                          </p>
                        </div>
                        
                        {/* Stats */}
                        <div className="text-center shrink-0 hidden sm:block">
                          <p className="font-semibold">{jobCount}</p>
                          <p className="text-xs text-muted-foreground">jobs</p>
                        </div>
                        
                        {/* Owed */}
                        <div className="text-right shrink-0">
                          <p className={`font-semibold ${owed > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                            ${owed.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">owed</p>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEmployeePanel(employee)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {(employee as Employee & { role?: string }).role !== 'sales_rep' && (
                                <DropdownMenuItem onClick={() => {
                                  const link = `${window.location.origin}/worker/${employee.id}`
                                  navigator.clipboard.writeText(link)
                                  toast.success('Worker schedule link copied!')
                                }}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Copy Schedule Link
                                </DropdownMenuItem>
                              )}
                              {owed > 0 && (
                                <DropdownMenuItem onClick={() => {
                                  setPayingEmployee(payroll || null)
                                  setShowPayModal(true)
                                }}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Mark Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => handleDeleteEmployee(employee.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payroll Tab */}
        {activeTab === 'payroll' && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${totalOwed.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Owed</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalJobs}</p>
                    <p className="text-xs text-muted-foreground">Jobs Done</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 hidden sm:block">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{payrollData.length}</p>
                    <p className="text-xs text-muted-foreground">Workers</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payroll List */}
            {payrollData.length === 0 ? (
              <div className="text-center py-12">
                <Banknote className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No payroll data yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Assign workers to jobs to track earnings
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {payrollData.map((payroll) => {
                    const isExpanded = expandedEmployee === payroll.employeeId
                    
                    return (
                      <div key={payroll.employeeId}>
                        {/* Employee Row */}
                        <div 
                          className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedEmployee(isExpanded ? null : payroll.employeeId)}
                        >
                          {/* Expand Icon */}
                          <div className="shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          
                          {/* Avatar */}
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-warning/80 to-warning/40 flex items-center justify-center shrink-0">
                            <span className="text-sm font-semibold text-warning-foreground">
                              {payroll.employeeName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{payroll.employeeName}</p>
                            <p className="text-sm text-muted-foreground">
                              {payroll.jobCount} job{payroll.jobCount !== 1 ? 's' : ''}
                              {payroll.totalHours ? ` · ${payroll.totalHours} hrs` : ''}
                            </p>
                          </div>
                          
                          {/* Amount Owed */}
                          <div className="text-right shrink-0">
                            <p className="font-bold text-warning text-lg">
                              ${payroll.totalEarned.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">owed</p>
                          </div>
                          
                          {/* Pay Button */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setPayingEmployee(payroll)
                                setShowPayModal(true)
                              }}
                              className="gap-1.5 hidden sm:flex"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Pay
                            </Button>
                          </div>
                        </div>
                        
                        {/* Expanded Job Details */}
                        {isExpanded && (
                          <div className="bg-secondary/20 border-t border-border">
                            <div className="p-4 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Jobs Completed
                              </p>
                              {payroll.jobs.map((job, idx) => (
                                <div 
                                  key={idx}
                                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-background/50"
                                >
                                  <div>
                                    <p className="font-medium text-sm">{job.customerName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(job.date)}
                                      {job.jobPrice && ` · $${job.jobPrice} job`}
                                      {job.hours && ` · ${job.hours} hrs`}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold text-success">
                                      ${job.amount.toFixed(2)}
                                    </p>
                                    {job.jobPrice && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {((job.amount / job.jobPrice) * 100).toFixed(0)}% commission
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Mobile Pay Button */}
                            <div className="p-4 pt-0 sm:hidden">
                              <Button 
                                size="sm" 
                                onClick={() => {
                                  setPayingEmployee(payroll)
                                  setShowPayModal(true)
                                }}
                                className="w-full gap-1.5"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Mark as Paid
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hours Tab - timer hours and accrued labor, kept separate from
            Payroll so job_workers earnings are never double-counted. */}
        {activeTab === 'workpay' && <WorkPayTab />}

        {activeTab === 'hours' && (
          <HoursTab employees={employees} onEmployeesChanged={loadData} />
        )}

        {/* Commissions Tab */}
        {activeTab === 'commissions' && (hasPermission('view_commissions') || hasPermission('manage_commissions')) && (
          <div className="space-y-6">
            {/* Commission Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Award className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Earned</span>
                </div>
                <p className="text-2xl font-bold text-emerald-500 mt-1">
                  ${commissions.filter(c => c.status === 'earned').reduce((sum, c) => sum + c.amount, 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Pending</span>
                </div>
                <p className="text-2xl font-bold text-amber-500 mt-1">
                  ${commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Paid</span>
                </div>
                <p className="text-2xl font-bold text-blue-500 mt-1">
                  ${commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Rules</span>
                </div>
                <p className="text-2xl font-bold mt-1">{commissionRules.filter(r => r.active).length}</p>
              </div>
            </div>

            {/* Commission Rules Section - Admin Only */}
            {hasPermission('manage_commissions') && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Commission Rules
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Define how commissions are calculated</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setEditingRule(null)
                      setRuleForm({
                        name: '',
                        description: '',
                        triggerType: 'payment_received',
                        rateType: 'percentage',
                        rateValue: '',
                        minBaseAmount: '',
                        maxCommission: '',
                        appliesToRoles: ['sales_rep'],
                        active: true,
                      })
                      setShowRulePanel(true)
                    }}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add Rule
                  </Button>
                </div>

                {commissionRules.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Percent className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No commission rules defined</p>
                    <p className="text-xs">Create a rule to start tracking commissions</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {commissionRules.map((rule) => (
                      <div 
                        key={rule.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          rule.active ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{rule.name}</p>
                            {!rule.active && (
                              <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {rule.rateType === 'percentage' ? `${rule.rateValue}%` : `$${rule.rateValue}`} on {rule.triggerType.replace(/_/g, ' ')}
                            {rule.appliesToRoles && rule.appliesToRoles.length > 0 && (
                              <span> &middot; {rule.appliesToRoles.map(r => ROLE_LABELS[r as Role] || r).join(', ')}</span>
                            )}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditingRule(rule)
                              setRuleForm({
                                name: rule.name,
                                description: rule.description || '',
                                triggerType: rule.triggerType,
                                rateType: rule.rateType,
                                rateValue: rule.rateValue.toString(),
                                minBaseAmount: rule.minBaseAmount?.toString() || '',
                                maxCommission: rule.maxCommission?.toString() || '',
                                appliesToRoles: rule.appliesToRoles || ['sales_rep'],
                                active: rule.active,
                              })
                              setShowRulePanel(true)
                            }}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              const success = await updateCommissionRule(rule.id, { active: !rule.active })
                              if (success) {
                                setCommissionRules(prev => prev.map(r => 
                                  r.id === rule.id ? { ...r, active: !r.active } : r
                                ))
                                toast.success(rule.active ? 'Rule deactivated' : 'Rule activated')
                              } else {
                                toast.error('Failed to update rule')
                              }
                            }}>
                              {rule.active ? (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Commission List Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Commissions</p>
                <Select value={commissionFilter} onValueChange={(v) => setCommissionFilter(v as CommissionStatus | 'all')}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="earned">Earned</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasPermission('manage_commissions') && commissions.filter(c => c.status === 'earned' || c.status === 'approved').length > 0 && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={async () => {
                    const toPay = commissions.filter(c => c.status === 'earned' || c.status === 'approved')
                    if (toPay.length === 0) return
                    if (!confirm(`Mark ${toPay.length} commission(s) as paid?`)) return
                    
                    const result = await bulkMarkCommissionsPaid(toPay.map(c => c.id), 'admin')
                    if (result.success > 0) {
                      toast.success(`${result.success} commission(s) marked as paid`)
                      loadData()
                    } else {
                      toast.error('Failed to mark commissions as paid')
                    }
                  }}
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Mark All Paid
                </Button>
              )}
            </div>

            {/* Commission List */}
            {commissions.length === 0 ? (
              <div className="text-center py-12">
                <Award className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No commissions yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Commissions will appear here when triggered
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {commissions
                    .filter(c => commissionFilter === 'all' || c.status === commissionFilter)
                    .map((commission) => {
                      const employee = employees.find(e => e.id === commission.employeeId)
                      
                      return (
                        <div key={commission.id} className="flex items-center gap-4 p-4 hover:bg-secondary/30 transition-colors">
                          <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <Award className="h-5 w-5 text-emerald-500" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{employee?.name || 'Unknown'}</p>
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] ${
                                  commission.status === 'paid' 
                                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                    : commission.status === 'earned'
                                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                      : commission.status === 'approved'
                                        ? 'bg-green-500/10 text-green-500 border-green-500/30'
                                        : commission.status === 'void'
                                          ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                          : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                }`}
                              >
                                {commission.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {commission.triggerType.replace(/_/g, ' ')}
                              {commission.rateType === 'percentage' ? ` · ${commission.rate}% of $${commission.baseAmount.toLocaleString()}` : ` · $${commission.rate} flat`}
                            </p>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <p className="font-bold text-emerald-500 text-lg">
                              ${commission.amount.toLocaleString()}
                            </p>
                          </div>
                          
                          {hasPermission('manage_commissions') && commission.status !== 'paid' && commission.status !== 'void' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {commission.status === 'pending' && (
                                  <DropdownMenuItem onClick={async () => {
                                    const updated = await updateCommission(commission.id, { status: 'earned', earnedAt: new Date().toISOString() })
                                    if (updated) {
                                      setCommissions(prev => prev.map(c => 
                                        c.id === commission.id ? { ...c, status: 'earned' as const, earnedAt: new Date().toISOString() } : c
                                      ))
                                      toast.success('Commission marked as earned')
                                    } else {
                                      toast.error('Failed to update commission')
                                    }
                                  }}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Mark Earned
                                  </DropdownMenuItem>
                                )}
                                {(commission.status === 'pending' || commission.status === 'earned') && (
                                  <DropdownMenuItem onClick={async () => {
                                    const updated = await updateCommission(commission.id, { status: 'approved', approvedAt: new Date().toISOString() })
                                    if (updated) {
                                      setCommissions(prev => prev.map(c => 
                                        c.id === commission.id ? { ...c, status: 'approved' as const, approvedAt: new Date().toISOString() } : c
                                      ))
                                      toast.success('Commission approved')
                                    } else {
                                      toast.error('Failed to approve commission')
                                    }
                                  }}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </DropdownMenuItem>
                                )}
                                {(commission.status === 'earned' || commission.status === 'approved') && (
                                  <DropdownMenuItem onClick={async () => {
                                    const updated = await updateCommission(commission.id, { status: 'paid', paidAt: new Date().toISOString() })
                                    if (updated) {
                                      setCommissions(prev => prev.map(c => 
                                        c.id === commission.id ? { ...c, status: 'paid' as const, paidAt: new Date().toISOString() } : c
                                      ))
                                      toast.success('Commission marked as paid')
                                    } else {
                                      toast.error('Failed to update commission')
                                    }
                                  }}>
                                    <DollarSign className="h-4 w-4 mr-2" />
                                    Mark Paid
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={async () => {
                                    if (!confirm('Void this commission?')) return
                                    const updated = await updateCommission(commission.id, { status: 'void' })
                                    if (updated) {
                                      setCommissions(prev => prev.map(c => 
                                        c.id === commission.id ? { ...c, status: 'void' as const } : c
                                      ))
                                      toast.success('Commission voided')
                                    } else {
                                      toast.error('Failed to void commission')
                                    }
                                  }}
                                  className="text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Void
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Users Tab - Company Members with Roles */}
        {activeTab === 'users' && isAdmin && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
                <p className="text-2xl font-bold text-green-500 mt-1">
                  {companyMembers.filter(m => m.status === 'active').length}
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Invited</span>
                </div>
                <p className="text-2xl font-bold text-blue-500 mt-1">
                  {companyMembers.filter(m => m.status === 'invited').length}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-3 w-3 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Admins</span>
                </div>
                <p className="text-2xl font-bold text-amber-500 mt-1">
                  {companyMembers.filter(m => m.role === 'admin' || m.role === 'owner').length + 1}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total</span>
                </div>
                <p className="text-2xl font-bold mt-1">{companyMembers.length + 1}</p>
              </div>
            </div>

            {/* Add User Button */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Company Users</p>
              <Button 
                size="sm" 
                onClick={() => {
                  setEditingMember(null)
                  setMemberForm({ name: '', email: '', phone: '', role: 'worker' })
                  setShowMemberPanel(true)
                }}
                className="gap-1.5"
              >
                <UserPlus className="h-4 w-4" />
                Invite User
              </Button>
            </div>

            {/* Users List */}
            <div className="space-y-3">
              {/* Owner Card (current user) */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold">YOU</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">You (Owner)</p>
                    <p className="text-xs text-muted-foreground">Full access to everything</p>
                  </div>
                  <Badge className="bg-primary/20 text-primary border-primary/30">Owner</Badge>
                </div>
              </div>

              {/* Company Members */}
              {companyMembers.map((member) => (
                <div 
                  key={member.id}
                  className={`rounded-xl border bg-card p-4 ${
                    member.status === 'disabled' ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${
                      member.status === 'invited' 
                        ? 'bg-blue-500/20 text-blue-500' 
                        : member.status === 'active'
                          ? 'bg-green-500/20 text-green-500'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      <span className="text-sm font-bold">
                        {member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{member.name}</p>
                        {member.status === 'invited' && (
                          <Badge variant="outline" className="text-blue-500 border-blue-500/30 text-[10px]">
                            Pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
<Badge 
                                      variant="outline" 
                                      className={`${
                                        member.role === 'admin' 
                                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                                          : member.role === 'manager'
                                            ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                                            : member.role === 'worker'
                                              ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                              : member.role === 'sales_rep'
                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                                : member.role === 'dispatcher'
                                                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                                                  : member.role === 'office_staff'
                                                    ? 'bg-pink-500/10 text-pink-500 border-pink-500/30'
                                                    : member.role === 'accountant'
                                                      ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30'
                                                      : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                      {ROLE_LABELS[member.role]}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.status === 'invited' && (
                          <DropdownMenuItem onClick={() => {
                            const inviteUrl = `${window.location.origin}/invite/${member.inviteToken}`
                            navigator.clipboard.writeText(inviteUrl)
                            toast.success('Invite link copied!')
                          }}>
                            <Link2 className="h-4 w-4 mr-2" />
                            Copy Invite Link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                          setEditingMember(member)
                          setMemberForm({
                            name: member.name,
                            email: member.email,
                            phone: member.phone || '',
                            role: member.role,
                          })
                          setShowMemberPanel(true)
                        }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {member.status === 'active' && (
                          <DropdownMenuItem 
                            onClick={async () => {
                              const success = await updateCompanyMember(member.id, { status: 'disabled' })
                              if (success) {
                                setCompanyMembers(prev => prev.map(m => 
                                  m.id === member.id ? { ...m, status: 'disabled' as const } : m
                                ))
                                toast.success('User disabled')
                              } else {
                                toast.error('Failed to disable user')
                              }
                            }}
                            className="text-amber-500"
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Disable
                          </DropdownMenuItem>
                        )}
                        {member.status === 'disabled' && (
                          <DropdownMenuItem 
                            onClick={async () => {
                              const success = await updateCompanyMember(member.id, { status: 'active' })
                              if (success) {
                                setCompanyMembers(prev => prev.map(m => 
                                  m.id === member.id ? { ...m, status: 'active' as const } : m
                                ))
                                toast.success('User enabled')
                              } else {
                                toast.error('Failed to enable user')
                              }
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Enable
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={async () => {
                            if (!confirm(`Remove ${member.name} from your company?`)) return
                            const success = await deleteCompanyMember(member.id)
                            if (success) {
                              setCompanyMembers(prev => prev.filter(m => m.id !== member.id))
                              toast.success('User removed')
                            } else {
                              toast.error('Failed to remove user')
                            }
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {member.status === 'invited' && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>Invitation sent {member.inviteSentAt ? new Date(member.inviteSentAt).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {companyMembers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No team members yet</p>
                  <p className="text-sm">Invite your first team member to get started</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Member Panel */}
      <Sheet open={showMemberPanel} onOpenChange={setShowMemberPanel}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full">
          <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
            <SheetTitle>
              {editingMember ? 'Edit User' : 'Invite User'}
            </SheetTitle>
            <SheetDescription>
              {editingMember ? 'Update user details and role' : 'Add a new team member with role-based access'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Name *</Label>
                <Input
                  placeholder="Full name"
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                />
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Email *</Label>
                <Input
                  placeholder="email@example.com"
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                  disabled={!!editingMember}
                />
                {!editingMember && (
                  <p className="text-xs text-muted-foreground mt-1">
                    They&apos;ll use this email to sign up
                  </p>
                )}
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
                <Input
                  placeholder="(555) 000-0000"
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                />
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Role *</Label>
                <Select 
                  value={memberForm.role} 
                  onValueChange={(v) => setMemberForm({ ...memberForm, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
<SelectContent>
                                    <SelectItem value="worker">Worker</SelectItem>
                                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                                    <SelectItem value="office_staff">Office Staff</SelectItem>
                                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="accountant">Accountant</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {ROLE_DESCRIPTIONS[memberForm.role]}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 pt-4 border-t border-border shrink-0">
            <Button 
              onClick={async () => {
                if (!memberForm.name.trim() || !memberForm.email.trim()) {
                  toast.error('Name and email are required')
                  return
                }
                
                setIsSubmitting(true)
                try {
                  if (editingMember) {
                    const success = await updateCompanyMember(editingMember.id, {
                      name: memberForm.name.trim(),
                      phone: memberForm.phone.trim() || undefined,
                      role: memberForm.role,
                    })
                    if (success) {
                      setCompanyMembers(prev => prev.map(m => 
                        m.id === editingMember.id 
                          ? { ...m, name: memberForm.name.trim(), phone: memberForm.phone.trim() || undefined, role: memberForm.role }
                          : m
                      ))
                      toast.success('User updated')
                      setShowMemberPanel(false)
                    } else {
                      toast.error('Failed to update user')
                    }
                  } else {
                    const newMember = await addCompanyMember({
                      companyId: '',
                      email: memberForm.email.trim(),
                      name: memberForm.name.trim(),
                      phone: memberForm.phone.trim() || undefined,
                      role: memberForm.role,
                      status: 'invited',
                    })
                    if (newMember) {
                      setCompanyMembers(prev => [...prev, newMember])
                      toast.success('Invitation sent!')
                      setShowMemberPanel(false)
                      
                      // Copy invite link
                      const inviteUrl = `${window.location.origin}/invite/${newMember.inviteToken}`
                      navigator.clipboard.writeText(inviteUrl)
                      toast.info('Invite link copied to clipboard')
                    } else {
                      toast.error('Failed to invite user')
                    }
                  }
                } finally {
                  setIsSubmitting(false)
                }
              }}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Saving...' : editingMember ? 'Save Changes' : 'Send Invitation'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Employee Panel */}
      <Sheet open={showEmployeePanel} onOpenChange={setShowEmployeePanel}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full">
          <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
            <SheetTitle>
              {editingEmployee ? 'Edit Team Member' : 'Add Team Member'}
            </SheetTitle>
            <SheetDescription>
              {editingEmployee ? 'Update team member details' : 'Add a worker or sales rep to your team'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" />
                Basic Info
              </Label>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Name *</Label>
                <Input
                  placeholder="Worker name"
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Email {employeeForm.role === 'sales_rep' && '*'}</Label>
                  <Input
                    placeholder="email@example.com"
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
                  <Input
                    placeholder="(555) 000-0000"
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Role</Label>
                <Select 
                  value={employeeForm.role} 
                  onValueChange={(v) => setEmployeeForm({ ...employeeForm, role: v as 'worker' | 'sales_rep' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Worker</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sales Rep Invite Info */}
              {employeeForm.role === 'sales_rep' && employeeForm.email && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <UserPlus className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium">Sales Rep Portal Access</p>
                      <p className="text-xs text-muted-foreground">
                        After saving, share this link with your sales rep. They&apos;ll create an account using the email above.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/rep/login`}
                      className="text-xs bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/rep/login`)
                        setCopiedLink(true)
                        setTimeout(() => setCopiedLink(false), 2000)
                        toast.success('Link copied!')
                      }}
                      className="shrink-0"
                    >
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Info - Only for Workers */}
            {employeeForm.role === 'worker' && (
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <DollarSign className="h-4 w-4" />
                Payment
              </Label>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Pay Type</Label>
                  <Select 
                    value={employeeForm.paymentType} 
                    onValueChange={(v) => setEmployeeForm({ ...employeeForm, paymentType: v as PaymentType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PerJob">Per Job</SelectItem>
                      <SelectItem value="Hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    {employeeForm.paymentType === 'Hourly' ? 'Hourly Rate ($)' : 'Commission (%)'}
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder={employeeForm.paymentType === 'Hourly' ? '15.00' : '20'}
                    value={employeeForm.rate}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, rate: e.target.value })}
                  />
                  {employeeForm.paymentType === 'PerJob' && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      % of job price paid to worker
                    </p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Notes */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                Notes
              </Label>
              <Textarea
                placeholder="Add notes about this team member..."
                value={employeeForm.notes}
                onChange={(e) => setEmployeeForm({ ...employeeForm, notes: e.target.value })}
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 p-6 pt-4 border-t border-border bg-background">
            <div className="flex gap-3">
              <Button
                onClick={handleSaveEmployee}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Saving...' : editingEmployee ? 'Save Changes' : 'Add Member'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowEmployeePanel(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pay Confirmation Modal */}
      <Dialog open={showPayModal} onOpenChange={setShowPayModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Mark all outstanding payments for {payingEmployee?.employeeName} as paid?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Jobs completed</span>
                <span className="font-medium">{payingEmployee?.jobCount}</span>
              </div>
              {payingEmployee?.totalHours && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total hours</span>
                  <span className="font-medium">{payingEmployee.totalHours}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="font-medium">Total Amount</span>
                <span className="font-bold text-success">${payingEmployee?.totalEarned.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => payingEmployee && handleMarkPaid(payingEmployee.employeeId)}>
              <Check className="h-4 w-4 mr-2" />
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Rule Panel */}
      <Sheet open={showRulePanel} onOpenChange={setShowRulePanel}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full">
          <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
            <SheetTitle>
              {editingRule ? 'Edit Commission Rule' : 'Add Commission Rule'}
            </SheetTitle>
            <SheetDescription>
              {editingRule ? 'Update commission rule settings' : 'Define how commissions are calculated'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Rule Name *</Label>
                <Input
                  placeholder="e.g., Standard Sales Commission"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                />
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
                <Input
                  placeholder="Optional description"
                  value={ruleForm.description}
                  onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                />
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Trigger *</Label>
                <Select 
                  value={ruleForm.triggerType} 
                  onValueChange={(v) => setRuleForm({ ...ruleForm, triggerType: v as CommissionTrigger })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead_created">Lead Created</SelectItem>
                    <SelectItem value="job_created">Job Created</SelectItem>
                    <SelectItem value="job_completed">Job Completed</SelectItem>
                    <SelectItem value="invoice_paid">Invoice Paid</SelectItem>
                    <SelectItem value="payment_received">Payment Received</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  When this event occurs, a commission will be created
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Rate Type</Label>
                  <Select 
                    value={ruleForm.rateType} 
                    onValueChange={(v) => setRuleForm({ ...ruleForm, rateType: v as CommissionRateType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="flat">Flat Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    {ruleForm.rateType === 'percentage' ? 'Rate (%)' : 'Amount ($)'}
                  </Label>
                  <Input
                    type="number"
                    placeholder={ruleForm.rateType === 'percentage' ? '10' : '50'}
                    value={ruleForm.rateValue}
                    onChange={(e) => setRuleForm({ ...ruleForm, rateValue: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Min Base Amount</Label>
                  <Input
                    type="number"
                    placeholder="Optional"
                    value={ruleForm.minBaseAmount}
                    onChange={(e) => setRuleForm({ ...ruleForm, minBaseAmount: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Max Commission</Label>
                  <Input
                    type="number"
                    placeholder="Optional"
                    value={ruleForm.maxCommission}
                    onChange={(e) => setRuleForm({ ...ruleForm, maxCommission: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Applies to Roles</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(['sales_rep', 'worker', 'manager', 'dispatcher'] as Role[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const roles = ruleForm.appliesToRoles.includes(role)
                          ? ruleForm.appliesToRoles.filter(r => r !== role)
                          : [...ruleForm.appliesToRoles, role]
                        setRuleForm({ ...ruleForm, appliesToRoles: roles })
                      }}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        ruleForm.appliesToRoles.includes(role)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Label className="text-sm">Active</Label>
                <button
                  type="button"
                  onClick={() => setRuleForm({ ...ruleForm, active: !ruleForm.active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    ruleForm.active ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      ruleForm.active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 pt-4 border-t border-border shrink-0">
            <Button 
              onClick={async () => {
                if (!ruleForm.name.trim()) {
                  toast.error('Rule name is required')
                  return
                }
                if (!ruleForm.rateValue || parseFloat(ruleForm.rateValue) <= 0) {
                  toast.error('Rate value must be greater than 0')
                  return
                }
                
                setIsSubmitting(true)
                try {
                  const ruleData = {
                    name: ruleForm.name.trim(),
                    description: ruleForm.description.trim() || undefined,
                    triggerType: ruleForm.triggerType,
                    rateType: ruleForm.rateType,
                    rateValue: parseFloat(ruleForm.rateValue),
                    minBaseAmount: ruleForm.minBaseAmount ? parseFloat(ruleForm.minBaseAmount) : undefined,
                    maxCommission: ruleForm.maxCommission ? parseFloat(ruleForm.maxCommission) : undefined,
                    appliesToRoles: ruleForm.appliesToRoles,
                    active: ruleForm.active,
                  }
                  
                  if (editingRule) {
                    const success = await updateCommissionRule(editingRule.id, ruleData)
                    if (success) {
                      setCommissionRules(prev => prev.map(r => 
                        r.id === editingRule.id ? { ...r, ...ruleData } : r
                      ))
                      toast.success('Rule updated')
                      setShowRulePanel(false)
                    } else {
                      toast.error('Failed to update rule')
                    }
                  } else {
                    const newRule = await addCommissionRule(ruleData)
                    if (newRule) {
                      setCommissionRules(prev => [newRule, ...prev])
                      toast.success('Rule created')
                      setShowRulePanel(false)
                    } else {
                      toast.error('Failed to create rule')
                    }
                  }
                } finally {
                  setIsSubmitting(false)
                }
              }}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Saving...' : editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  )
}

export default function TeamPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    }>
      <TeamPageContent />
    </Suspense>
  )
}
