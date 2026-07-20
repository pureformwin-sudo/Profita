import { createClient } from '@/lib/supabase/client'

// Get the current user's company ID
async function getUserCompanyId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // First check if user owns a company
  const { data: ownedCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (ownedCompany) return ownedCompany.id

  // Check if user is a member of a company via RPC
  const { data: membership } = await supabase.rpc('get_my_membership')
  if (membership?.company_id) return membership.company_id

  return null
}

export interface ServicePlan {
  id: string
  user_id: string
  name: string
  description: string
  price: number
  frequency: 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'custom'
  custom_days?: number
  visits_per_period: number
  auto_renew: boolean
  is_priority: boolean
  active: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface CustomerPlan {
  id: string
  user_id: string
  customer_id: string
  plan_id: string | null
  status: 'active' | 'paused' | 'cancelled' | 'expired'
  start_date: string
  next_billing_date: string | null
  next_service_date: string | null
  autopay: boolean
  visits_used: number
  notes: string
  created_at: string
  updated_at: string
  // Recurring-service scheduling (script 31, additive)
  last_service_date: string | null
  service_start_date: string | null
  auto_renew: boolean | null // null = inherit from plan
  frequency_override: string | null // null = use plan frequency
  custom_days_override: number | null
}

// Derived schedule status for a membership (not stored — computed from dates).
export type ScheduleStatus =
  | 'upcoming'
  | 'due-soon'
  | 'due'
  | 'overdue'
  | 'paused'
  | 'cancelled'
  | 'needs-setup'

export const SCHEDULE_STATUS_META: Record<
  ScheduleStatus,
  { label: string; className: string }
> = {
  'upcoming': { label: 'Upcoming', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  'due-soon': { label: 'Due Soon', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  'due': { label: 'Due', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  'overdue': { label: 'Overdue', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  'paused': { label: 'Paused', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  'cancelled': { label: 'Cancelled', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  'needs-setup': { label: 'Schedule Needs Setup', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
}

// Number of days for a given frequency. Returns null for unknown/custom-without-days.
export function frequencyToDays(frequency: string, customDays?: number | null): number | null {
  switch (frequency) {
    case 'weekly': return 7
    case 'biweekly': return 14
    case 'monthly': return 30
    case 'quarterly': return 91
    case 'biannual':
    case 'semiannual': return 182
    case 'annual':
    case 'yearly': return 365
    case 'custom': return customDays && customDays > 0 ? customDays : null
    default: return null
  }
}

// Add one recurrence interval to a YYYY-MM-DD date string. Uses calendar
// months/years where appropriate so dates stay on the same day-of-month.
export function addInterval(dateStr: string, frequency: string, customDays?: number | null): string | null {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'biannual':
    case 'semiannual': d.setMonth(d.getMonth() + 6); break
    case 'annual':
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    case 'custom': {
      if (!customDays || customDays <= 0) return null
      d.setDate(d.getDate() + customDays)
      break
    }
    default: return null
  }
  return d.toISOString().split('T')[0]
}

// Resolve the effective frequency + custom days for a membership, honoring
// any per-member override, otherwise falling back to the plan.
export function effectiveFrequency(
  cp: Pick<CustomerPlan, 'frequency_override' | 'custom_days_override'>,
  plan: Pick<ServicePlan, 'frequency' | 'custom_days'> | null | undefined,
): { frequency: string | null; customDays: number | null } {
  const frequency = cp.frequency_override || plan?.frequency || null
  const customDays = cp.frequency_override
    ? cp.custom_days_override ?? null
    : plan?.custom_days ?? null
  return { frequency, customDays }
}

// Derive the schedule status for a membership from its dates + status.
// NEVER guesses dates — a membership with no next_service_date and no
// last_service_date is flagged 'needs-setup'.
export function deriveScheduleStatus(
  cp: Pick<CustomerPlan, 'status' | 'next_service_date' | 'last_service_date' | 'plan_id'>,
  now: Date = new Date(),
): ScheduleStatus {
  if (cp.status === 'cancelled' || !cp.plan_id) return 'cancelled'
  if (cp.status === 'paused') return 'paused'
  if (!cp.next_service_date) return 'needs-setup'

  const due = new Date(cp.next_service_date + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due'
  if (diffDays <= 7) return 'due-soon'
  return 'upcoming'
}

export interface PlanAutomations {
  id: string
  user_id: string
  auto_invoice: boolean
  auto_schedule: boolean
  send_reminders: boolean
  retry_failed: boolean
  ai_winback: boolean
  ai_upsell: boolean
}

// Service Plans CRUD
export async function getServicePlans(): Promise<{ data: ServicePlan[]; tablesMissing: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], tablesMissing: false }
  
  const { data, error } = await supabase
    .from('service_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('[Plans] Failed to load plans:', error)
    return { data: [], tablesMissing: error.code === '42P01' }
  }
  return { data: data || [], tablesMissing: false }
}

export async function createServicePlan(plan: Omit<ServicePlan, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<{ data: ServicePlan | null; error: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated. Please sign in again.' }
  
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('service_plans')
    .insert({ ...plan, user_id: user.id, company_id: companyId })
    .select()
    .single()
  
  if (error) {
    console.error('[Plans] Failed to create plan:', error)
    const msg = error.code === '42P01'
      ? 'Service plans table does not exist. Run the SQL migration first.'
      : error.message || 'Failed to create plan.'
    return { data: null, error: msg }
  }
  return { data, error: null }
}

export async function updateServicePlan(id: string, updates: Partial<ServicePlan>): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('service_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  
  if (error) {
    console.error('[Plans] Failed to update plan:', error.message)
    return false
  }
  return true
}

export async function deleteServicePlan(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('service_plans')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('[Plans] Failed to delete plan:', error.message)
    return false
  }
  return true
}

// Customer Plans CRUD
export async function getCustomerPlans(): Promise<CustomerPlan[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const { data, error } = await supabase
    .from('customer_plans')
    .select('*')
    .eq('user_id', user.id)
  
  if (error) {
    console.error('[Plans] Failed to load customer plans:', error.message)
    return []
  }
  return data || []
}

export async function assignCustomerToPlan(
  customerId: string,
  planId: string | null,
  options?: { autopay?: boolean; startDate?: string }
): Promise<CustomerPlan | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const startDate = options?.startDate || new Date().toISOString().split('T')[0]
  
  // Calculate next billing date based on plan frequency
  let nextBillingDate: string | null = null
  if (planId) {
    const { data: plan } = await supabase
      .from('service_plans')
      .select('frequency, custom_days')
      .eq('id', planId)
      .single()
    
    if (plan) {
      const start = new Date(startDate)
      switch (plan.frequency) {
        case 'monthly':
          start.setMonth(start.getMonth() + 1)
          break
        case 'quarterly':
          start.setMonth(start.getMonth() + 3)
          break
        case 'biannual':
          start.setMonth(start.getMonth() + 6)
          break
        case 'annual':
          start.setFullYear(start.getFullYear() + 1)
          break
        case 'custom':
          if (plan.custom_days) {
            start.setDate(start.getDate() + plan.custom_days)
          }
          break
      }
      nextBillingDate = start.toISOString().split('T')[0]
    }
  }
  
  const { data, error } = await supabase
    .from('customer_plans')
    .upsert({
      user_id: user.id,
      customer_id: customerId,
      plan_id: planId,
      status: planId ? 'active' : 'cancelled',
      start_date: startDate,
      next_billing_date: nextBillingDate,
      autopay: options?.autopay ?? false,
      visits_used: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'customer_id' })
    .select()
    .single()
  
  if (error) {
    console.error('[Plans] Failed to assign customer to plan:', error.message)
    return null
  }
  return data
}

export async function updateCustomerPlan(customerId: string, updates: Partial<CustomerPlan>): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customer_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('customer_id', customerId)
  
  if (error) {
    console.error('[Plans] Failed to update customer plan:', error.message)
    return false
  }
  return true
}

// Update an individual membership's schedule by its own row id. This scopes
// the write to ONE customer_plans row so editing one member never affects
// another member on the same plan.
export async function updateCustomerPlanScheduleById(
  customerPlanId: string,
  updates: Partial<Pick<CustomerPlan,
    'last_service_date' | 'next_service_date' | 'service_start_date' |
    'auto_renew' | 'frequency_override' | 'custom_days_override' | 'status'>>,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customer_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', customerPlanId)

  if (error) {
    console.error('[Plans] Failed to update membership schedule:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}

// Safely advance a customer's recurring schedule when a service is completed.
// - Only touches an ACTIVE membership that has a plan.
// - Sets last_service_date to the completion date.
// - Computes next_service_date from the effective frequency.
// - Idempotent per occurrence: if last_service_date already equals the
//   completion date, it does nothing (prevents double-advancing from repeated
//   "Completed" events on the same job).
// - Never creates jobs and never deletes anything.
export async function advanceServiceScheduleForCustomer(
  customerId: string,
  completionDate: string, // YYYY-MM-DD
): Promise<{ advanced: boolean; nextServiceDate: string | null; reason?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { advanced: false, nextServiceDate: null, reason: 'not-authenticated' }

  const { data: cp, error } = await supabase
    .from('customer_plans')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error || !cp) return { advanced: false, nextServiceDate: null, reason: 'no-membership' }
  if (cp.status !== 'active' || !cp.plan_id) {
    return { advanced: false, nextServiceDate: null, reason: 'inactive' }
  }
  // Idempotency guard against duplicate completion events.
  if (cp.last_service_date === completionDate) {
    return { advanced: false, nextServiceDate: cp.next_service_date, reason: 'already-recorded' }
  }

  const { data: plan } = await supabase
    .from('service_plans')
    .select('frequency, custom_days')
    .eq('id', cp.plan_id)
    .maybeSingle()

  const { frequency, customDays } = effectiveFrequency(cp, plan)
  const nextServiceDate = frequency
    ? addInterval(completionDate, frequency, customDays)
    : null

  const { error: updErr } = await supabase
    .from('customer_plans')
    .update({
      last_service_date: completionDate,
      next_service_date: nextServiceDate,
      service_start_date: cp.service_start_date || cp.start_date || completionDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cp.id)

  if (updErr) {
    console.error('[Plans] Failed to advance schedule:', updErr.message)
    return { advanced: false, nextServiceDate: null, reason: updErr.message }
  }
  return { advanced: true, nextServiceDate }
}

export async function removeCustomerFromPlan(customerId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customer_plans')
    .delete()
    .eq('customer_id', customerId)
  
  if (error) {
    console.error('[Plans] Failed to remove customer from plan:', error.message)
    return false
  }
  return true
}

// Automations
export async function getAutomations(): Promise<PlanAutomations | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('plan_automations')
    .select('*')
    .eq('user_id', user.id)
    .single()
  
  if (error && error.code !== 'PGRST116') {
    console.error('[Plans] Failed to load automations:', error.message)
  }
  return data
}

export async function saveAutomations(automations: Partial<PlanAutomations>): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  
  const { error } = await supabase
    .from('plan_automations')
    .upsert({
      user_id: user.id,
      ...automations,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  
  if (error) {
    console.error('[Plans] Failed to save automations:', error.message)
    return false
  }
  return true
}
