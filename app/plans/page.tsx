'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Users,
  DollarSign,
  Calendar,
  TrendingUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  CreditCard,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Search,
  RefreshCw,
  Crown,
  Percent,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCustomers } from '@/lib/storage'
import type { Customer } from '@/lib/types'
import {
  getServicePlans,
  createServicePlan,
  updateServicePlan,
  deleteServicePlan,
  getCustomerPlans,
  assignCustomerToPlan,
  updateCustomerPlan,
  removeCustomerFromPlan,
  getAutomations,
  saveAutomations,
  type ServicePlan,
  type CustomerPlan,
  type PlanAutomations,
} from '@/lib/plans-storage'

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannual', label: 'Bi-Annual' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom' },
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlansPage() {
  const [plans, setPlans] = useState<ServicePlan[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerPlans, setCustomerPlans] = useState<CustomerPlan[]>([])
  const [automations, setAutomations] = useState<PlanAutomations | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modal states
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigningCustomer, setAssigningCustomer] = useState<Customer | null>(null)
  
  // Form state
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: '',
    frequency: 'monthly' as ServicePlan['frequency'],
    custom_days: '',
    visits_per_period: '1',
    auto_renew: true,
    is_priority: false,
    notes: '',
  })
  
  const [assignForm, setAssignForm] = useState({
    planId: '',
    autopay: false,
  })

  const [tablesMissing, setTablesMissing] = useState(false)

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [plansResult, customersData, customerPlansData, automationsData] = await Promise.all([
        getServicePlans(),
        getCustomers(),
        getCustomerPlans(),
        getAutomations(),
      ])
      // Detect missing tables via the explicit flag returned by getServicePlans
      if (plansResult.tablesMissing) {
        setTablesMissing(true)
      }
      setPlans(plansResult.data)
      setCustomers(customersData)
      setCustomerPlans(customerPlansData)
      setAutomations(automationsData || {
        id: '',
        user_id: '',
        auto_invoice: true,
        auto_schedule: true,
        send_reminders: true,
        retry_failed: false,
        ai_winback: false,
        ai_upsell: false,
      })
      setLoading(false)
    }
    loadData()
  }, [])

  // Computed stats
  const stats = useMemo(() => {
    const activeMembers = customerPlans.filter(cp => cp.status === 'active' && cp.plan_id).length
    const monthlyRevenue = customerPlans
      .filter(cp => cp.status === 'active' && cp.plan_id)
      .reduce((sum, cp) => {
        const plan = plans.find(p => p.id === cp.plan_id)
        if (!plan) return sum
        switch (plan.frequency) {
          case 'monthly': return sum + plan.price
          case 'quarterly': return sum + plan.price / 3
          case 'biannual': return sum + plan.price / 6
          case 'annual': return sum + plan.price / 12
          default: return sum + plan.price
        }
      }, 0)
    
    const today = new Date()
    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    
    const renewalsDue = customerPlans.filter(cp => {
      if (!cp.next_billing_date) return false
      const billingDate = new Date(cp.next_billing_date)
      return billingDate >= today && billingDate <= thirtyDaysFromNow
    }).length
    
    const totalCustomers = customers.length
    const retention = totalCustomers > 0 ? Math.round((activeMembers / totalCustomers) * 100) : 0
    
    return { activeMembers, monthlyRevenue, renewalsDue, retention }
  }, [customerPlans, plans, customers])

  // Plan member counts and revenue
  const planStats = useMemo(() => {
    const stats: Record<string, { members: number; revenue: number }> = {}
    customerPlans.forEach(cp => {
      if (cp.plan_id && cp.status === 'active') {
        const plan = plans.find(p => p.id === cp.plan_id)
        if (!stats[cp.plan_id]) stats[cp.plan_id] = { members: 0, revenue: 0 }
        stats[cp.plan_id].members++
        if (plan) stats[cp.plan_id].revenue += plan.price
      }
    })
    return stats
  }, [customerPlans, plans])

  // Top performing plan
  const topPlan = useMemo((): { plan: ServicePlan; revenue: number } | null => {
    let best: { plan: ServicePlan; revenue: number } | null = null
    for (const p of plans) {
      const revenue = planStats[p.id]?.revenue || 0
      if (!best || revenue > best.revenue) {
        best = { plan: p, revenue }
      }
    }
    return best
  }, [plans, planStats])

  // Customers with plan info
  const customersWithPlans = useMemo(() => {
    return customers.map(c => {
      const cp = customerPlans.find(cp => cp.customer_id === c.id)
      const plan = cp?.plan_id ? plans.find(p => p.id === cp.plan_id) : null
      return { ...c, customerPlan: cp, plan }
    })
  }, [customers, customerPlans, plans])

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customersWithPlans
    const q = searchQuery.toLowerCase()
    return customersWithPlans.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.email?.toLowerCase().includes(q) ||
      c.plan?.name.toLowerCase().includes(q)
    )
  }, [customersWithPlans, searchQuery])

  // Handlers
  const handleCreatePlan = async () => {
    // Validate
    if (!planForm.name.trim()) {
      toast.error('Plan name is required')
      return
    }
    const price = parseFloat(planForm.price)
    if (isNaN(price) || price <= 0) {
      toast.error('Price must be greater than 0')
      return
    }
    if (planForm.frequency === 'custom' && !parseInt(planForm.custom_days)) {
      toast.error('Custom frequency requires a day count')
      return
    }
    
    const { data: result, error } = await createServicePlan({
      name: planForm.name.trim(),
      description: planForm.description,
      price,
      frequency: planForm.frequency,
      custom_days: planForm.frequency === 'custom' ? parseInt(planForm.custom_days) : undefined,
      visits_per_period: parseInt(planForm.visits_per_period) || 1,
      auto_renew: planForm.auto_renew,
      is_priority: planForm.is_priority,
      active: true,
      notes: planForm.notes,
    })
    
    if (error) {
      toast.error(error)
      return
    }
    if (result) {
      setPlans(prev => [result, ...prev])
      setShowPlanModal(false)
      resetPlanForm()
      toast.success(`Plan "${result.name}" created`)
    }
  }

  const handleUpdatePlan = async () => {
    if (!editingPlan) return
    if (!planForm.name.trim()) { toast.error('Plan name is required'); return }
    const price = parseFloat(planForm.price)
    if (isNaN(price) || price <= 0) { toast.error('Price must be greater than 0'); return }
    
    const success = await updateServicePlan(editingPlan.id, {
      name: planForm.name.trim(),
      description: planForm.description,
      price,
      frequency: planForm.frequency,
      custom_days: planForm.frequency === 'custom' ? parseInt(planForm.custom_days) : undefined,
      visits_per_period: parseInt(planForm.visits_per_period) || 1,
      auto_renew: planForm.auto_renew,
      is_priority: planForm.is_priority,
      notes: planForm.notes,
    })
    if (success) {
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? { 
        ...p, 
        name: planForm.name.trim(),
        description: planForm.description,
        price,
        frequency: planForm.frequency,
        visits_per_period: parseInt(planForm.visits_per_period) || 1,
        auto_renew: planForm.auto_renew,
        is_priority: planForm.is_priority,
        notes: planForm.notes,
      } : p))
      setShowPlanModal(false)
      setEditingPlan(null)
      resetPlanForm()
      toast.success('Plan updated')
    } else {
      toast.error('Failed to update plan')
    }
  }

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Delete this plan? Customers will be unassigned.')) return
    const success = await deleteServicePlan(planId)
    if (success) {
      setPlans(prev => prev.filter(p => p.id !== planId))
      // also clear customer assignments locally
      setCustomerPlans(prev => prev.filter(cp => cp.plan_id !== planId))
      toast.success('Plan deleted')
    } else {
      toast.error('Failed to delete plan')
    }
  }

  const handleTogglePlanActive = async (plan: ServicePlan) => {
    const success = await updateServicePlan(plan.id, { active: !plan.active })
    if (success) {
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, active: !p.active } : p))
      toast.success(plan.active ? 'Plan paused' : 'Plan activated')
    } else {
      toast.error('Failed to update plan')
    }
  }

  const handleAssignCustomer = async () => {
    if (!assigningCustomer) return
    const planId = assignForm.planId === 'none' ? null : assignForm.planId
    const result = await assignCustomerToPlan(
      assigningCustomer.id,
      planId || null,
      { autopay: assignForm.autopay }
    )
    if (result) {
      setCustomerPlans(prev => {
        const existing = prev.findIndex(cp => cp.customer_id === assigningCustomer.id)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = result
          return updated
        }
        return [...prev, result]
      })
      setShowAssignModal(false)
      setAssigningCustomer(null)
      setAssignForm({ planId: '', autopay: false })
      toast.success(planId ? `${assigningCustomer.name} added to plan` : `${assigningCustomer.name} marked as one-time`)
    } else {
      toast.error('Failed to update customer')
    }
  }

  const handleRemoveFromPlan = async (customerId: string) => {
    if (!confirm('Remove this customer from their plan?')) return
    const success = await removeCustomerFromPlan(customerId)
    if (success) {
      setCustomerPlans(prev => prev.filter(cp => cp.customer_id !== customerId))
      toast.success('Customer removed from plan')
    } else {
      toast.error('Failed to remove customer')
    }
  }

  const handleToggleAutopay = async (customerId: string, currentAutopay: boolean) => {
    const success = await updateCustomerPlan(customerId, { autopay: !currentAutopay })
    if (success) {
      setCustomerPlans(prev => prev.map(cp => 
        cp.customer_id === customerId ? { ...cp, autopay: !currentAutopay } : cp
      ))
      toast.success(currentAutopay ? 'Autopay disabled' : 'Autopay enabled')
    } else {
      toast.error('Failed to update autopay')
    }
  }

  const handlePauseResume = async (customerId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paused' ? 'active' : 'paused'
    const success = await updateCustomerPlan(customerId, { status: newStatus })
    if (success) {
      setCustomerPlans(prev => prev.map(cp => 
        cp.customer_id === customerId ? { ...cp, status: newStatus } : cp
      ))
      toast.success(newStatus === 'paused' ? 'Plan paused' : 'Plan resumed')
    } else {
      toast.error('Failed to update plan')
    }
  }

  const handleAutomationToggle = async (key: keyof PlanAutomations, value: boolean) => {
    const updated = { ...automations, [key]: value }
    setAutomations(updated as PlanAutomations)
    const success = await saveAutomations({ [key]: value })
    if (!success) toast.error('Failed to save setting')
  }

  const resetPlanForm = () => {
    setPlanForm({
      name: '',
      description: '',
      price: '',
      frequency: 'monthly',
      custom_days: '',
      visits_per_period: '1',
      auto_renew: true,
      is_priority: false,
      notes: '',
    })
  }

  const openEditPlan = (plan: ServicePlan) => {
    setEditingPlan(plan)
    setPlanForm({
      name: plan.name,
      description: plan.description,
      price: plan.price.toString(),
      frequency: plan.frequency,
      custom_days: plan.custom_days?.toString() || '',
      visits_per_period: plan.visits_per_period.toString(),
      auto_renew: plan.auto_renew,
      is_priority: plan.is_priority,
      notes: plan.notes,
    })
    setShowPlanModal(true)
  }

  const openAssignModal = (customer: Customer) => {
    const existingPlan = customerPlans.find(cp => cp.customer_id === customer.id)
    setAssigningCustomer(customer)
    setAssignForm({
      planId: existingPlan?.plan_id || '',
      autopay: existingPlan?.autopay || false,
    })
    setShowAssignModal(true)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 pb-24 lg:pb-6 w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Service Plans</h1>
          <p className="text-muted-foreground">Manage recurring service memberships</p>
        </div>
        <Button 
          onClick={() => { resetPlanForm(); setEditingPlan(null); setShowPlanModal(true) }}
          disabled={tablesMissing}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Plan
        </Button>
      </div>

      {/* Database setup banner */}
      {tablesMissing && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-amber-500">Database setup required</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    The Service Plans tables don&apos;t exist in your Supabase yet. Run the SQL below in the Supabase SQL Editor, then refresh this page.
                  </p>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-500 hover:text-amber-400 font-medium">
                    Show SQL to run
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-background/50 border border-border overflow-x-auto text-[11px] leading-relaxed">{`CREATE TABLE IF NOT EXISTS service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  custom_days integer,
  visits_per_period integer NOT NULL DEFAULT 1,
  auto_renew boolean NOT NULL DEFAULT true,
  is_priority boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_plans_all_own ON service_plans FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS customer_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES service_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_billing_date date,
  next_service_date date,
  autopay boolean NOT NULL DEFAULT false,
  visits_used integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);
ALTER TABLE customer_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_plans_all_own ON customer_plans FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS plan_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  auto_invoice boolean NOT NULL DEFAULT true,
  auto_schedule boolean NOT NULL DEFAULT true,
  send_reminders boolean NOT NULL DEFAULT true,
  retry_failed boolean NOT NULL DEFAULT false,
  ai_winback boolean NOT NULL DEFAULT false,
  ai_upsell boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE plan_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_automations_all_own ON plan_automations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());`}</pre>
                </details>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-500">{stats.activeMembers}</p>
                <p className="text-xs text-muted-foreground">Active Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-500">{formatCurrency(stats.monthlyRevenue)}</p>
                <p className="text-xs text-muted-foreground">Monthly Recurring</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
                <Calendar className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-500">{stats.renewalsDue}</p>
                <p className="text-xs text-muted-foreground">Renewals (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
                <Percent className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-500">{stats.retention}%</p>
                <p className="text-xs text-muted-foreground">Plan Enrollment</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plans Grid + Insights */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Plans List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Plans</h2>
            <Badge variant="secondary">{plans.length} plans</Badge>
          </div>
          {plans.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="p-3 rounded-full bg-secondary mb-4">
                  <CreditCard className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No Plans Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first recurring service plan</p>
                <Button onClick={() => setShowPlanModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Plan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {plans.map(plan => {
                const pStats = planStats[plan.id] || { members: 0, revenue: 0 }
                return (
                  <Card key={plan.id} className={cn(
                    "relative overflow-hidden transition-all hover:shadow-lg",
                    !plan.active && "opacity-60"
                  )}>
                    {plan.is_priority && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold bg-amber-500 text-black rounded-bl">
                        PRIORITY
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">{plan.name}</h3>
                          <p className="text-xs text-muted-foreground capitalize">{plan.frequency}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditPlan(plan)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleTogglePlanActive(plan)}>
                              {plan.active ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                              {plan.active ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeletePlan(plan.id)} className="text-red-500">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-2xl font-bold mb-2">{formatCurrency(plan.price)}</p>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{plan.description}</p>
                      )}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Visits/Period</span>
                          <span className="font-medium text-foreground">{plan.visits_per_period}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Members</span>
                          <span className="font-medium text-foreground">{pStats.members}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Revenue</span>
                          <span className="font-medium text-emerald-500">{formatCurrency(pStats.revenue)}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                        <Badge variant={plan.active ? 'default' : 'secondary'} className="text-[10px]">
                          {plan.active ? 'Active' : 'Inactive'}
                        </Badge>
                        {plan.auto_renew && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            Auto-renew
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Insights Panel */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Insights</h2>
          
          {topPlan && topPlan.revenue > 0 && (
            <Card className="border-emerald-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Crown className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Top Performing</p>
                    <p className="text-xs text-muted-foreground">Highest revenue plan</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <p className="font-semibold">{topPlan.plan.name}</p>
                  <p className="text-sm text-emerald-500">{formatCurrency(topPlan.revenue)} revenue</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">AI Recommendation</p>
                  <p className="text-xs text-muted-foreground">Convert one-time to recurring</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {customersWithPlans.filter(c => !c.plan).length} customers could be converted to plans
              </p>
              <Button size="sm" variant="outline" className="w-full">
                <TrendingUp className="h-4 w-4 mr-2" />
                View Opportunities
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Customer Memberships */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Customer Memberships</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile: Cards layout */}
          <div className="lg:hidden p-4 space-y-3">
            {filteredCustomers.map(customer => (
              <div key={customer.id} className="p-4 rounded-xl border bg-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">{customer.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{customer.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{customer.email || customer.phone || '-'}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openAssignModal(customer)}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {customer.plan ? 'Change Plan' : 'Assign Plan'}
                      </DropdownMenuItem>
                      {customer.customerPlan && customer.plan && (
                        <>
                          <DropdownMenuItem onClick={() => handlePauseResume(customer.id, customer.customerPlan!.status)}>
                            {customer.customerPlan.status === 'paused' ? (
                              <><Play className="h-4 w-4 mr-2" />Resume</>
                            ) : (
                              <><Pause className="h-4 w-4 mr-2" />Pause</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRemoveFromPlan(customer.id)} className="text-red-500">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Plan
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  {customer.plan ? (
                    <Badge variant="outline" className="font-medium">
                      {customer.plan.name}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground">One-time</Badge>
                  )}
                  
                  {customer.customerPlan && customer.plan && (
                    <Badge className={cn(
                      "text-[10px]",
                      customer.customerPlan.status === 'active' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                      customer.customerPlan.status === 'paused' && "bg-amber-500/10 text-amber-500 border-amber-500/30",
                      customer.customerPlan.status === 'cancelled' && "bg-red-500/10 text-red-500 border-red-500/30"
                    )}>
                      {customer.customerPlan.status === 'active' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {customer.customerPlan.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                      {customer.customerPlan.status === 'cancelled' && <XCircle className="h-3 w-3 mr-1" />}
                      {customer.customerPlan.status}
                    </Badge>
                  )}
                </div>
                
                {customer.customerPlan && customer.plan && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground">
                      {customer.customerPlan.next_billing_date && (
                        <span>Next: {formatDate(customer.customerPlan.next_billing_date)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Autopay</span>
                      <Switch
                        checked={customer.customerPlan.autopay}
                        onCheckedChange={() => handleToggleAutopay(customer.id, customer.customerPlan!.autopay)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredCustomers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No customers match your search' : 'No customers yet'}
              </div>
            )}
          </div>
          
          {/* Desktop: Table layout */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Billing</TableHead>
                  <TableHead>Autopay</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map(customer => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.email || customer.phone || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.plan ? (
                        <Badge variant="outline" className="font-medium">
                          {customer.plan.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">One-time</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.customerPlan && customer.plan ? (
                        <Badge className={cn(
                          "text-[10px]",
                          customer.customerPlan.status === 'active' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                          customer.customerPlan.status === 'paused' && "bg-amber-500/10 text-amber-500 border-amber-500/30",
                          customer.customerPlan.status === 'cancelled' && "bg-red-500/10 text-red-500 border-red-500/30"
                        )}>
                          {customer.customerPlan.status === 'active' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {customer.customerPlan.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                          {customer.customerPlan.status === 'cancelled' && <XCircle className="h-3 w-3 mr-1" />}
                          {customer.customerPlan.status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.customerPlan?.next_billing_date 
                        ? formatDate(customer.customerPlan.next_billing_date)
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {customer.customerPlan && customer.plan && (
                        <Switch
                          checked={customer.customerPlan.autopay}
                          onCheckedChange={() => handleToggleAutopay(customer.id, customer.customerPlan!.autopay)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openAssignModal(customer)}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            {customer.plan ? 'Change Plan' : 'Assign Plan'}
                          </DropdownMenuItem>
                          {customer.customerPlan && customer.plan && (
                            <>
                              <DropdownMenuItem onClick={() => handlePauseResume(customer.id, customer.customerPlan!.status)}>
                                {customer.customerPlan.status === 'paused' ? (
                                  <><Play className="h-4 w-4 mr-2" />Resume</>
                                ) : (
                                  <><Pause className="h-4 w-4 mr-2" />Pause</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRemoveFromPlan(customer.id)} className="text-red-500">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove from Plan
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No customers match your search' : 'No customers yet'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Automations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Automations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {automations && (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Auto-Invoice</p>
                    <p className="text-xs text-muted-foreground">Generate invoices on billing date</p>
                  </div>
                  <Switch
                    checked={automations.auto_invoice}
                    onCheckedChange={v => handleAutomationToggle('auto_invoice', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Auto-Schedule</p>
                    <p className="text-xs text-muted-foreground">Create recurring jobs</p>
                  </div>
                  <Switch
                    checked={automations.auto_schedule}
                    onCheckedChange={v => handleAutomationToggle('auto_schedule', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Send Reminders</p>
                    <p className="text-xs text-muted-foreground">Email before renewal</p>
                  </div>
                  <Switch
                    checked={automations.send_reminders}
                    onCheckedChange={v => handleAutomationToggle('send_reminders', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">Retry Failed Payments</p>
                    <p className="text-xs text-muted-foreground">Auto-retry declined cards</p>
                  </div>
                  <Switch
                    checked={automations.retry_failed}
                    onCheckedChange={v => handleAutomationToggle('retry_failed', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      AI Win-Back
                    </p>
                    <p className="text-xs text-muted-foreground">Re-engage churned customers</p>
                  </div>
                  <Switch
                    checked={automations.ai_winback}
                    onCheckedChange={v => handleAutomationToggle('ai_winback', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" />
                      AI Upsell
                    </p>
                    <p className="text-xs text-muted-foreground">Suggest plan upgrades</p>
                  </div>
                  <Switch
                    checked={automations.ai_upsell}
                    onCheckedChange={v => handleAutomationToggle('ai_upsell', v)}
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Plan Modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input
                value={planForm.name}
                onChange={e => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Monthly Maintenance"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  value={planForm.price}
                  onChange={e => setPlanForm(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={planForm.frequency}
                  onValueChange={v => setPlanForm(prev => ({ ...prev, frequency: v as ServicePlan['frequency'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {planForm.frequency === 'custom' && (
              <div className="space-y-2">
                <Label>Custom Interval (days)</Label>
                <Input
                  type="number"
                  value={planForm.custom_days}
                  onChange={e => setPlanForm(prev => ({ ...prev, custom_days: e.target.value }))}
                  placeholder="e.g., 45"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Visits per Period</Label>
              <Input
                type="number"
                value={planForm.visits_per_period}
                onChange={e => setPlanForm(prev => ({ ...prev, visits_per_period: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={planForm.description}
                onChange={e => setPlanForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What's included in this plan?"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-Renew</Label>
              <Switch
                checked={planForm.auto_renew}
                onCheckedChange={v => setPlanForm(prev => ({ ...prev, auto_renew: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Priority Service</Label>
              <Switch
                checked={planForm.is_priority}
                onCheckedChange={v => setPlanForm(prev => ({ ...prev, is_priority: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (internal)</Label>
              <Textarea
                value={planForm.notes}
                onChange={e => setPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanModal(false)}>Cancel</Button>
            <Button onClick={editingPlan ? handleUpdatePlan : handleCreatePlan}>
              {editingPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Customer Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {assigningCustomer?.name ? `Assign Plan to ${assigningCustomer.name}` : 'Assign Plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Plan</Label>
              <Select
                value={assignForm.planId}
                onValueChange={v => setAssignForm(prev => ({ ...prev, planId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a plan..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time customer (no plan)</SelectItem>
                  {plans.filter(p => p.active).map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrency(plan.price)}/{plan.frequency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assignForm.planId && assignForm.planId !== 'none' && (
              <div className="flex items-center justify-between">
                <Label>Enable Autopay</Label>
                <Switch
                  checked={assignForm.autopay}
                  onCheckedChange={v => setAssignForm(prev => ({ ...prev, autopay: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancel</Button>
            <Button onClick={handleAssignCustomer}>
              {assignForm.planId && assignForm.planId !== 'none' ? 'Assign Plan' : 'Set as One-time'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AppShell>
  )
}
