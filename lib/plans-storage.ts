import { createClient } from '@/lib/supabase/client'

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
  
  const { data, error } = await supabase
    .from('service_plans')
    .insert({ ...plan, user_id: user.id })
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
