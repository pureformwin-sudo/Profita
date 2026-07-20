import { createClient, getCachedUser } from '@/lib/supabase/client'
import type { Income, Expense, Settings, ProfitAllocation, PendingIncome, UpcomingExpense, Job, Customer, BusinessProfile, Estimate, Invoice, EstimateItem, InvoiceItem, EstimateStatus, InvoiceStatus, Employee, JobWorker, PayrollSummary } from './types'
import { DEFAULT_EXPENSE_CATEGORIES } from './types'
import { triggerCommissionForInvoicePaid, triggerCommissionForJobCreated } from './commission-triggers'

// Get Supabase client (singleton, see lib/supabase/client.ts)
function getSupabase() {
  return createClient()
}

// Get the current user's company ID (via RPC that bypasses RLS)
async function getUserCompanyId(): Promise<string | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
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

export const defaultProfitAllocation: ProfitAllocation = {
  profit: 40,
  expenses: 30,
  taxes: 20,
  misc: 10,
}

export const defaultProfile: BusinessProfile = {
  businessName: '',
  ownerName: '',
  phone: '',
  serviceArea: '',
  weeklyGoal: 1000,
  taxRate: 15,
}

export const defaultSettings: Settings = {
  profitAllocation: defaultProfitAllocation,
  expenseCategories: ['Fuel', 'Equipment', 'Supplies', 'Marketing', 'Software', 'Other'],
  darkMode: false,
  profile: defaultProfile,
}

// Income operations
export async function getIncome(): Promise<Income[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('income')
    .select('*')
    .order('date', { ascending: false })
  
  if (error) {
    console.error('Error fetching income:', error)
    return []
  }
  
  return data.map(item => ({
    id: item.id,
    amount: item.amount,
    customerName: item.customer_name,
    jobType: item.job_type,
    paymentMethod: item.payment_method,
    paymentStatus: item.payment_status || 'Paid',
    jobId: item.job_id,
    date: item.date,
    notes: item.notes,
    createdAt: item.created_at,
  }))
}

export async function addIncome(income: Omit<Income, 'id' | 'createdAt'>): Promise<Income | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null
  
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('income')
    .insert({
      user_id: user.id,
      company_id: companyId,
      amount: income.amount,
      customer_name: income.customerName,
      job_type: income.jobType,
      payment_method: income.paymentMethod,
      payment_status: income.paymentStatus,
      job_id: income.jobId,
      date: income.date,
      notes: income.notes,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error adding income:', error)
    return null
  }
  
  return {
    id: data.id,
    amount: data.amount,
    customerName: data.customer_name,
    jobType: data.job_type,
    paymentMethod: data.payment_method,
    paymentStatus: data.payment_status,
    jobId: data.job_id,
    date: data.date,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function deleteIncome(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('income').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting income:', error)
    return false
  }
  return true
}

// Money Location Tracker - completely separate from income tracking
// This is for tracking where your money is, stored monthly

export interface MoneyLocations {
  cash: number
  digital: number
  checks: number
  card: number
}

export interface MonthlyMoney extends MoneyLocations {
  month: string // Format: "YYYY-MM"
}

// Get current month key (e.g., "2026-05")
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Get previous month key
export function getPreviousMonthKey(): string {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
}

// Get all available months with money data
export async function getMoneyMonths(): Promise<string[]> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return [getCurrentMonthKey()]

  const { data: settings } = await supabase
    .from('settings')
    .select('profile')
    .eq('user_id', user.id)
    .single()

  let monthlyData = settings?.profile?.monthly_money || {}
  
  // Auto-migrate: if old money_locations exists but no monthly data, save it as previous month
  if (settings?.profile?.money_locations && Object.keys(monthlyData).length === 0) {
    const prevMonth = getPreviousMonthKey()
    monthlyData[prevMonth] = settings.profile.money_locations
    
    // Save the migration
    const updatedProfile = {
      ...settings.profile,
      monthly_money: monthlyData
    }
    await supabase
      .from('settings')
      .update({ profile: updatedProfile })
      .eq('user_id', user.id)
  }
  
  const months = Object.keys(monthlyData).sort().reverse()
  
  // Always include current month
  const currentMonth = getCurrentMonthKey()
  if (!months.includes(currentMonth)) {
    months.unshift(currentMonth)
  }
  
  return months
}

// Get money for a specific month
export async function getMoneyLocations(month?: string): Promise<MoneyLocations> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return { cash: 0, digital: 0, checks: 0, card: 0 }

  const targetMonth = month || getCurrentMonthKey()

  const { data, error } = await supabase
    .from('settings')
    .select('profile')
    .eq('user_id', user.id)
    .single()

  if (!error && data?.profile?.monthly_money?.[targetMonth]) {
    const ml = data.profile.monthly_money[targetMonth]
    return {
      cash: parseFloat(ml.cash) || 0,
      digital: parseFloat(ml.digital) || 0,
      checks: parseFloat(ml.checks) || 0,
      card: parseFloat(ml.card) || 0,
    }
  }

  // If no data for this month, return zeros (fresh start for new month)
  return { cash: 0, digital: 0, checks: 0, card: 0 }
}

// Update money for a specific month
export async function updateMoneyLocations(locations: MoneyLocations, month?: string): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const targetMonth = month || getCurrentMonthKey()

  // Get current settings
  const { data: existing } = await supabase
    .from('settings')
    .select('profile')
    .eq('user_id', user.id)
    .single()

  const currentProfile = existing?.profile || {}
  const monthlyMoney = currentProfile.monthly_money || {}
  
  // Update the specific month
  monthlyMoney[targetMonth] = locations

  const updatedProfile = {
    ...currentProfile,
    monthly_money: monthlyMoney,
    // Also keep money_locations for backwards compatibility (current month)
    money_locations: targetMonth === getCurrentMonthKey() ? locations : currentProfile.money_locations
  }

  const { error } = await supabase
    .from('settings')
    .upsert({
      user_id: user.id,
      profile: updatedProfile,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('Error updating money locations:', error)
    return false
  }

  return true
}

// Transfer money (within current month only)
export async function transferMoney(
  fromMethod: 'cash' | 'digital' | 'checks' | 'card',
  toMethod: 'cash' | 'digital' | 'checks' | 'card',
  amount: number
): Promise<boolean> {
  const currentMonth = getCurrentMonthKey()
  const locations = await getMoneyLocations(currentMonth)
  
  locations[fromMethod] -= amount
  locations[toMethod] += amount
  
  return await updateMoneyLocations(locations, currentMonth)
}

// Get formatted month name for display
export function formatMonthDisplay(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Expense operations
// Map a raw expenses row to the Expense type, including the accounting
// enrichment columns (script 34). Old rows lacking these get safe defaults.
function mapExpenseRow(item: any): Expense {
  return {
    id: item.id,
    amount: item.amount,
    category: item.category,
    description: item.description,
    date: item.date,
    paymentMethod: item.payment_method,
    recurrence: item.recurrence || 'none',
    notes: item.notes,
    createdAt: item.created_at,
    vendor: item.vendor ?? null,
    businessPurpose: item.business_purpose ?? null,
    transactionType: item.transaction_type || 'business_expense',
    taxTreatment: item.tax_treatment || 'unreviewed',
    taxNote: item.tax_note ?? null,
    jobId: item.job_id ?? null,
    customerId: item.customer_id ?? null,
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
  }
}

export async function getExpenses(): Promise<Expense[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
  
  if (error) {
    console.error('Error fetching expenses:', error)
    return []
  }
  
  return data.map(mapExpenseRow)
}

export async function addExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null
  
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: user.id,
      company_id: companyId,
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      payment_method: expense.paymentMethod,
      recurrence: expense.recurrence || 'none',
      notes: expense.notes,
      vendor: expense.vendor ?? null,
      business_purpose: expense.businessPurpose ?? null,
      transaction_type: expense.transactionType || 'business_expense',
      tax_treatment: expense.taxTreatment || 'unreviewed',
      tax_note: expense.taxNote ?? null,
      job_id: expense.jobId ?? null,
      customer_id: expense.customerId ?? null,
      attachments: expense.attachments ?? [],
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error adding expense:', error)
    return null
  }
  
  return mapExpenseRow(data)
}

export async function updateExpense(id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>): Promise<Expense | null> {
  const supabase = getSupabase()
  const updateData: Record<string, unknown> = {}
  if (updates.amount !== undefined) updateData.amount = updates.amount
  if (updates.category !== undefined) updateData.category = updates.category
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.date !== undefined) updateData.date = updates.date
  if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod
  if (updates.recurrence !== undefined) updateData.recurrence = updates.recurrence || 'none'
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.vendor !== undefined) updateData.vendor = updates.vendor
  if (updates.businessPurpose !== undefined) updateData.business_purpose = updates.businessPurpose
  if (updates.transactionType !== undefined) updateData.transaction_type = updates.transactionType
  if (updates.taxTreatment !== undefined) updateData.tax_treatment = updates.taxTreatment
  if (updates.taxNote !== undefined) updateData.tax_note = updates.taxNote
  if (updates.jobId !== undefined) updateData.job_id = updates.jobId
  if (updates.customerId !== undefined) updateData.customer_id = updates.customerId
  if (updates.attachments !== undefined) updateData.attachments = updates.attachments

  const { data, error } = await supabase
    .from('expenses')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating expense:', error)
    return null
  }
  return mapExpenseRow(data)
}

export async function deleteExpense(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting expense:', error)
    return false
  }
  return true
}

// Pending Income operations
export async function getPendingIncome(): Promise<PendingIncome[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pending_income')
    .select('*')
    .order('expected_date', { ascending: true })
  
  if (error) {
    console.error('Error fetching pending income:', error)
    return []
  }
  
  return data.map(item => ({
    id: item.id,
    clientName: item.client_name,
    amount: item.amount,
    source: item.source,
    status: item.status,
    expectedDate: item.expected_date,
    notes: item.notes,
    createdAt: item.created_at,
  }))
}

export async function addPendingIncome(income: Omit<PendingIncome, 'id' | 'createdAt'>): Promise<PendingIncome | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null
  
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('pending_income')
    .insert({
      user_id: user.id,
      company_id: companyId,
      client_name: income.clientName,
      amount: income.amount,
      source: income.source,
      status: income.status,
      expected_date: income.expectedDate,
      notes: income.notes,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error adding pending income:', error)
    return null
  }
  
  return {
    id: data.id,
    clientName: data.client_name,
    amount: data.amount,
    source: data.source,
    status: data.status,
    expectedDate: data.expected_date,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function deletePendingIncome(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('pending_income').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting pending income:', error)
    return false
  }
  return true
}

// Mark pending income as received - converts to actual income
export async function markPendingIncomeReceived(id: string, paymentMethod: string): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const companyId = await getUserCompanyId()

  // Get the pending income first
  const { data: pending, error: fetchError } = await supabase
    .from('pending_income')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !pending) return false

  // Create actual income record
  const { error: insertError } = await supabase
    .from('income')
    .insert({
      user_id: user.id,
      company_id: companyId,
      amount: pending.amount,
      job_type: pending.source || 'Other',
      customer_name: pending.client_name,
      payment_method: paymentMethod,
      payment_status: 'paid',
      date: new Date().toISOString().split('T')[0],
      notes: pending.notes,
    })

  if (insertError) {
    console.error('Error creating income:', insertError)
    return false
  }

  // Delete the pending income
  const { error: deleteError } = await supabase
    .from('pending_income')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('Error deleting pending income:', deleteError)
    return false
  }

  return true
}

// Upcoming Expenses operations
export async function getUpcomingExpenses(): Promise<UpcomingExpense[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('upcoming_expenses')
    .select('*')
    .order('due_date', { ascending: true })
  
  if (error) {
    console.error('Error fetching upcoming expenses:', error)
    return []
  }
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    amount: item.amount,
    category: item.category,
    dueDate: item.due_date,
    status: item.status,
    notes: item.notes,
    createdAt: item.created_at,
  }))
}

export async function addUpcomingExpense(expense: Omit<UpcomingExpense, 'id' | 'createdAt'>): Promise<UpcomingExpense | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null
  
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('upcoming_expenses')
    .insert({
      user_id: user.id,
      company_id: companyId,
      name: expense.name,
      amount: expense.amount,
      category: expense.category,
      due_date: expense.dueDate,
      status: expense.status,
      notes: expense.notes,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error adding upcoming expense:', error)
    return null
  }
  
  return {
    id: data.id,
    name: data.name,
    amount: data.amount,
    category: data.category,
    dueDate: data.due_date,
    status: data.status,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function deleteUpcomingExpense(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('upcoming_expenses').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting upcoming expense:', error)
    return false
  }
  return true
}

// Mark upcoming expense as paid - converts to actual expense
export async function markUpcomingExpensePaid(id: string, paymentMethod: string): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const companyId = await getUserCompanyId()

  // Get the upcoming expense first
  const { data: upcoming, error: fetchError } = await supabase
    .from('upcoming_expenses')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !upcoming) return false

  // Create actual expense record
  // Note: expenses table uses 'description' not 'vendor'
  const { error: insertError } = await supabase
    .from('expenses')
    .insert({
      user_id: user.id,
      company_id: companyId,
      amount: upcoming.amount,
      category: upcoming.category || 'Other',
      description: upcoming.name, // Use description field for the expense name
      date: new Date().toISOString().split('T')[0],
      notes: upcoming.notes,
      payment_method: paymentMethod,
    })

  if (insertError) {
    console.error('Error creating expense:', insertError)
    return false
  }

  // Delete the upcoming expense
  const { error: deleteError } = await supabase
    .from('upcoming_expenses')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('Error deleting upcoming expense:', deleteError)
    return false
  }

  return true
}

// Settings operations
export async function getSettings(): Promise<Settings> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single()
  
  if (error || !data) {
    return defaultSettings
  }
  
  return {
    profitAllocation: data.profit_allocation as ProfitAllocation,
    expenseCategories: data.expense_categories,
    darkMode: data.dark_mode,
    profile: data.profile as BusinessProfile || defaultProfile,
  }
}

export async function saveSettings(settings: Settings): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return false
  
  const companyId = await getUserCompanyId()
  
  const { error } = await supabase
    .from('settings')
    .upsert({
      user_id: user.id,
      company_id: companyId,
      profit_allocation: settings.profitAllocation,
      expense_categories: settings.expenseCategories,
      dark_mode: settings.darkMode,
      profile: settings.profile || defaultProfile,
    }, { onConflict: 'user_id' })
  
  if (error) {
    console.error('Error saving settings:', error)
    return false
  }
  return true
}

// Merged list of expense categories: defaults + user-saved custom categories
// + any category already present on existing expense rows (so free-text ones
// entered before this feature still appear in pickers/filters). De-duplicated,
// case-insensitive, with defaults kept first.
export async function getExpenseCategories(): Promise<string[]> {
  const [settings, expenses] = await Promise.all([getSettings(), getExpenses()])
  const seen = new Set<string>()
  const result: string[] = []
  const add = (c?: string | null) => {
    const v = (c || '').trim()
    if (!v) return
    const key = v.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(v)
  }
  DEFAULT_EXPENSE_CATEGORIES.forEach(add)
  ;(settings.expenseCategories || []).forEach(add)
  expenses.forEach((e) => add(e.category))
  return result
}

// Persist a new custom category into settings (idempotent, case-insensitive).
export async function addExpenseCategory(category: string): Promise<boolean> {
  const name = (category || '').trim()
  if (!name) return false
  const settings = await getSettings()
  const exists = (settings.expenseCategories || []).some(
    (c) => c.toLowerCase() === name.toLowerCase(),
  )
  if (exists) return true
  return saveSettings({
    ...settings,
    expenseCategories: [...(settings.expenseCategories || []), name],
  })
}

export async function resetAllData(): Promise<boolean> {
  const supabase = getSupabase()
  
  const results = await Promise.all([
    supabase.from('income').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('pending_income').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('upcoming_expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('settings').delete().neq('user_id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ])
  
  return results.every(r => !r.error)
}

// Jobs operations
export async function getJobs(): Promise<(Job & { job_workers?: { employee_id: string }[] })[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, job_workers(employee_id)')
    .order('date', { ascending: false })
  
  if (error) {
    console.error('Error fetching jobs:', error)
    return []
  }
  
return data.map(item => ({
  id: item.id,
  customerId: item.customer_id,
  estimateId: item.estimate_id,
  invoiceId: item.invoice_id,
  customerPlanId: item.customer_plan_id,
  pendingPlanEnrollment: item.pending_plan_enrollment || null,
  date: item.date,
  startTime: item.start_time,
  endTime: item.end_time,
  jobType: item.job_type,
  price: item.price,
  paidAmount: item.paid_amount || 0,
  expenses: item.expenses,
  status: item.status,
  notes: item.notes,
  createdAt: item.created_at,
  job_workers: item.job_workers || [],
  }))
}

export async function addJob(job: Omit<Job, 'id' | 'createdAt'>): Promise<Job | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null

  // Get company_id for team sync
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
  .from('jobs')
  .insert({
  user_id: user.id,
  company_id: companyId,
  customer_id: job.customerId,
  estimate_id: job.estimateId || null,
  customer_plan_id: job.customerPlanId || null,
  pending_plan_enrollment: job.pendingPlanEnrollment ?? null,
  date: job.date,
  start_time: job.startTime || null,
  end_time: job.endTime || null,
  job_type: job.jobType,
  price: job.price,
  paid_amount: job.paidAmount || 0,
  expenses: job.expenses,
  status: job.status,
  notes: job.notes,
  })
  .select()
  .single()
  
  if (error) {
  console.error('Error adding job:', error)
  return null
  }
  
  // Trigger commission for job_created (non-blocking)
  triggerCommissionForJobCreated({
    id: data.id,
    price: Number(data.price) || 0,
    estimateId: data.estimate_id,
  }).catch(err => console.error('[Commission] Failed to trigger for job:', err))
  
  return {
  id: data.id,
  customerId: data.customer_id,
  estimateId: data.estimate_id,
  invoiceId: data.invoice_id,
  customerPlanId: data.customer_plan_id,
  pendingPlanEnrollment: data.pending_plan_enrollment || null,
  date: data.date,
  startTime: data.start_time,
  endTime: data.end_time,
  jobType: data.job_type,
  price: data.price,
  paidAmount: data.paid_amount || 0,
  expenses: data.expenses,
  status: data.status,
  notes: data.notes,
  createdAt: data.created_at,
  }
}

export async function updateJob(id: string, updates: Partial<Omit<Job, 'id' | 'createdAt'>>): Promise<Job | null> {
  const supabase = getSupabase()
  
  const updateData: any = {}
  if (updates.customerId) updateData.customer_id = updates.customerId
  if (updates.estimateId !== undefined) updateData.estimate_id = updates.estimateId
  if (updates.invoiceId !== undefined) updateData.invoice_id = updates.invoiceId
  if (updates.customerPlanId !== undefined) updateData.customer_plan_id = updates.customerPlanId
  if (updates.pendingPlanEnrollment !== undefined) updateData.pending_plan_enrollment = updates.pendingPlanEnrollment
  if (updates.date) updateData.date = updates.date
  if (updates.startTime !== undefined) updateData.start_time = updates.startTime
  if (updates.endTime !== undefined) updateData.end_time = updates.endTime
  if (updates.jobType) updateData.job_type = updates.jobType
  if (updates.price !== undefined) updateData.price = updates.price
  if (updates.paidAmount !== undefined) updateData.paid_amount = updates.paidAmount
  if (updates.expenses !== undefined) updateData.expenses = updates.expenses
  if (updates.status) updateData.status = updates.status
  if (updates.notes !== undefined) updateData.notes = updates.notes
  
  const { data, error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating job:', error)
    return null
  }
  
return {
  id: data.id,
  customerId: data.customer_id,
  estimateId: data.estimate_id,
  invoiceId: data.invoice_id,
  customerPlanId: data.customer_plan_id,
  pendingPlanEnrollment: data.pending_plan_enrollment || null,
  date: data.date,
  startTime: data.start_time,
  endTime: data.end_time,
  jobType: data.job_type,
  price: data.price,
  paidAmount: data.paid_amount || 0,
  expenses: data.expenses,
  status: data.status,
  notes: data.notes,
  createdAt: data.created_at,
  }
  }
  
  export async function deleteJob(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting job:', error)
    return false
  }
  return true
}

// Customers operations
export async function getCustomers(): Promise<Customer[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('customers')
    .select('*, employees:sales_rep_id(name)')
    .order('name', { ascending: true })
  
  if (error) {
    console.error('Error fetching customers:', error)
    return []
  }
  
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    phone: item.phone,
    address: item.address,
    notes: item.notes,
    createdAt: item.created_at,
    salesRepId: item.sales_rep_id,
    salesRepName: item.employees?.name,
  }))
}

export async function addCustomer(customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  
  if (!user) return null

  // Get company_id for team sync
  const companyId = await getUserCompanyId()
  
  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id: user.id,
      company_id: companyId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error adding customer:', error)
    return null
  }
  
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    address: data.address,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function updateCustomer(id: string, updates: Partial<Omit<Customer, 'id' | 'createdAt'>>): Promise<Customer | null> {
  const supabase = getSupabase()

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.email !== undefined) updateData.email = updates.email
  if (updates.phone !== undefined) updateData.phone = updates.phone
  if (updates.address !== undefined) updateData.address = updates.address
  if (updates.notes !== undefined) updateData.notes = updates.notes

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating customer:', error)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    address: data.address,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('customers').delete().eq('id', id)
  
  if (error) {
    console.error('Error deleting customer:', error)
    return false
  }
  return true
}

// Estimate operations
export async function getEstimates(): Promise<Estimate[]> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('estimates')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching estimates:', error)
    return []
  }

  return data.map((e: any) => ({
    id: e.id,
    customerId: e.customer_id,
    customerName: e.customers?.name,
    estimateNumber: e.estimate_number,
    status: e.status,
    issueDate: e.issue_date,
    expiryDate: e.expiry_date,
    items: e.items || [],
    subtotal: parseFloat(e.subtotal),
    taxRate: parseFloat(e.tax_rate),
    taxAmount: parseFloat(e.tax_amount),
    total: parseFloat(e.total),
    notes: e.notes,
    createdAt: e.created_at,
  }))
}

export async function addEstimate(estimate: Omit<Estimate, 'id' | 'createdAt' | 'customerName'>): Promise<Estimate | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  // Get company_id for team sync
  const companyId = await getUserCompanyId()
  
  // Build insert data, only including optional fields if they have values
  const insertData: Record<string, any> = {
  user_id: user.id,
  company_id: companyId,
  customer_id: estimate.customerId,
    estimate_number: estimate.estimateNumber,
    status: estimate.status,
    issue_date: estimate.issueDate,
    expiry_date: estimate.expiryDate,
    items: estimate.items || [],
    subtotal: estimate.subtotal,
    tax_rate: estimate.taxRate,
    tax_amount: estimate.taxAmount,
    total: estimate.total,
  }
  
  if (estimate.notes) insertData.notes = estimate.notes

  const { data, error } = await supabase
    .from('estimates')
    .insert(insertData)
    .select('*, customers(name)')
    .single()

  if (error) {
    console.error('Error adding estimate:', error.message, error.details, error.hint)
    return null
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customers?.name,
    estimateNumber: data.estimate_number,
    status: data.status,
    issueDate: data.issue_date,
    expiryDate: data.expiry_date,
    items: data.items || [],
    subtotal: parseFloat(data.subtotal),
    taxRate: parseFloat(data.tax_rate),
    taxAmount: parseFloat(data.tax_amount),
    total: parseFloat(data.total),
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function updateEstimate(id: string, updates: Partial<Estimate>): Promise<Estimate | null> {
  const supabase = getSupabase()

  const updateData: any = {}
  if (updates.customerId !== undefined) updateData.customer_id = updates.customerId
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.issueDate !== undefined) updateData.issue_date = updates.issueDate
  if (updates.expiryDate !== undefined) updateData.expiry_date = updates.expiryDate
  if (updates.items !== undefined) updateData.items = updates.items
  if (updates.subtotal !== undefined) updateData.subtotal = updates.subtotal
  if (updates.taxRate !== undefined) updateData.tax_rate = updates.taxRate
  if (updates.taxAmount !== undefined) updateData.tax_amount = updates.taxAmount
  if (updates.total !== undefined) updateData.total = updates.total
  if (updates.notes !== undefined) updateData.notes = updates.notes

  const { data, error } = await supabase
    .from('estimates')
    .update(updateData)
    .eq('id', id)
    .select('*, customers(name)')
    .single()

  if (error) {
    console.error('Error updating estimate:', error)
    return null
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customers?.name,
    estimateNumber: data.estimate_number,
    status: data.status,
    issueDate: data.issue_date,
    expiryDate: data.expiry_date,
    items: data.items || [],
    subtotal: parseFloat(data.subtotal),
    taxRate: parseFloat(data.tax_rate),
    taxAmount: parseFloat(data.tax_amount),
    total: parseFloat(data.total),
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function deleteEstimate(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('estimates').delete().eq('id', id)
  if (error) {
    console.error('Error deleting estimate:', error)
    return false
  }
  return true
}

// Invoice operations
export async function getInvoices(): Promise<Invoice[]> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching invoices:', error)
    return []
  }

  return data.map((i: any) => ({
    id: i.id,
    customerId: i.customer_id,
    customerName: i.customers?.name,
    jobId: i.job_id,
    estimateId: i.estimate_id,
    invoiceNumber: i.invoice_number,
    status: i.status,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    items: i.items || [],
    subtotal: parseFloat(i.subtotal),
    taxRate: parseFloat(i.tax_rate),
    taxAmount: parseFloat(i.tax_amount),
    total: parseFloat(i.total),
    amountPaid: parseFloat(i.amount_paid),
    notes: i.notes,
    stripePaymentIntentId: i.stripe_payment_intent_id,
    createdAt: i.created_at,
  }))
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('invoices')
    .select('*, customers(name, phone, address)')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching invoice:', error)
    return null
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customers?.name,
    jobId: data.job_id,
    estimateId: data.estimate_id,
    invoiceNumber: data.invoice_number,
    status: data.status,
    issueDate: data.issue_date,
    dueDate: data.due_date,
    items: data.items || [],
    subtotal: parseFloat(data.subtotal),
    taxRate: parseFloat(data.tax_rate),
    taxAmount: parseFloat(data.tax_amount),
    total: parseFloat(data.total),
    amountPaid: parseFloat(data.amount_paid),
    notes: data.notes,
    stripePaymentIntentId: data.stripe_payment_intent_id,
    createdAt: data.created_at,
  }
}

export async function addInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'customerName'>): Promise<Invoice | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  // Get company_id for team sync
  const companyId = await getUserCompanyId()
  
  // Build insert data, only including optional fields if they have values
  const insertData: Record<string, any> = {
  user_id: user.id,
  company_id: companyId,
  customer_id: invoice.customerId,
    invoice_number: invoice.invoiceNumber,
    status: invoice.status,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    items: invoice.items || [],
    subtotal: invoice.subtotal,
    tax_rate: invoice.taxRate,
    tax_amount: invoice.taxAmount,
    total: invoice.total,
    amount_paid: invoice.amountPaid || 0,
  }
  
  // Only add optional fields if they have values
  if (invoice.jobId) insertData.job_id = invoice.jobId
  if (invoice.estimateId) insertData.estimate_id = invoice.estimateId
  if (invoice.notes) insertData.notes = invoice.notes
  if (invoice.stripePaymentIntentId) insertData.stripe_payment_intent_id = invoice.stripePaymentIntentId

  const { data, error } = await supabase
    .from('invoices')
    .insert(insertData)
    .select('*, customers(name)')
    .single()

  if (error) {
    console.error('Error adding invoice:', error.message, error.details, error.hint)
    return null
  }

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customers?.name,
    jobId: data.job_id,
    estimateId: data.estimate_id,
    invoiceNumber: data.invoice_number,
    status: data.status,
    issueDate: data.issue_date,
    dueDate: data.due_date,
    items: data.items || [],
    subtotal: parseFloat(data.subtotal),
    taxRate: parseFloat(data.tax_rate),
    taxAmount: parseFloat(data.tax_amount),
    total: parseFloat(data.total),
    amountPaid: parseFloat(data.amount_paid),
    notes: data.notes,
    stripePaymentIntentId: data.stripe_payment_intent_id,
    createdAt: data.created_at,
  }
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice | null> {
  const supabase = getSupabase()
  
  // Check if we're updating to 'paid' status for commission trigger
  const statusChangingToPaid = updates.status === 'paid'
  
  const updateData: any = {}
  if (updates.customerId !== undefined) updateData.customer_id = updates.customerId
  if (updates.jobId !== undefined) updateData.job_id = updates.jobId
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.issueDate !== undefined) updateData.issue_date = updates.issueDate
  if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate
  if (updates.items !== undefined) updateData.items = updates.items
  if (updates.subtotal !== undefined) updateData.subtotal = updates.subtotal
  if (updates.taxRate !== undefined) updateData.tax_rate = updates.taxRate
  if (updates.taxAmount !== undefined) updateData.tax_amount = updates.taxAmount
  if (updates.total !== undefined) updateData.total = updates.total
  if (updates.amountPaid !== undefined) updateData.amount_paid = updates.amountPaid
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.stripePaymentIntentId !== undefined) updateData.stripe_payment_intent_id = updates.stripePaymentIntentId
  
  const { data, error } = await supabase
  .from('invoices')
  .update(updateData)
  .eq('id', id)
  .select('*, customers(name)')
  .single()
  
  if (error) {
  console.error('Error updating invoice:', error)
  return null
  }
  
  // Trigger commission if status changed to 'paid' (non-blocking)
  if (statusChangingToPaid) {
    triggerCommissionForInvoicePaid({
      id: data.id,
      jobId: data.job_id,
      total: parseFloat(data.total),
    }).catch(err => console.error('[Commission] Failed to trigger for invoice:', err))
  }
  
  return {
  id: data.id,
  customerId: data.customer_id,
  customerName: data.customers?.name,
  jobId: data.job_id,
  estimateId: data.estimate_id,
  invoiceNumber: data.invoice_number,
  status: data.status,
  issueDate: data.issue_date,
  dueDate: data.due_date,
  items: data.items || [],
  subtotal: parseFloat(data.subtotal),
  taxRate: parseFloat(data.tax_rate),
  taxAmount: parseFloat(data.tax_amount),
  total: parseFloat(data.total),
  amountPaid: parseFloat(data.amount_paid),
  notes: data.notes,
  stripePaymentIntentId: data.stripe_payment_intent_id,
  createdAt: data.created_at,
  }
  }

export async function deleteInvoice(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) {
    console.error('Error deleting invoice:', error)
    return false
  }
  return true
}

// Generate next invoice/estimate number
export async function getNextInvoiceNumber(): Promise<string> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return 'INV-0001'

  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'INV-0001'
  
  const lastNum = parseInt(data[0].invoice_number.replace('INV-', '')) || 0
  return `INV-${String(lastNum + 1).padStart(4, '0')}`
}

export async function getNextEstimateNumber(): Promise<string> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return 'EST-0001'

  const { data } = await supabase
    .from('estimates')
    .select('estimate_number')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'EST-0001'
  
  const lastNum = parseInt(data[0].estimate_number.replace('EST-', '')) || 0
  return `EST-${String(lastNum + 1).padStart(4, '0')}`
}

// Employee operations
export async function getEmployees(): Promise<Employee[]> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching employees:', error)
    return []
  }

  return data.map((e: any) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    paymentType: e.pay_type === 'hourly' ? 'Hourly' : 'PerJob',
    hourlyRate: e.pay_type === 'hourly' ? e.pay_rate : undefined,
    perJobRate: e.pay_type === 'per_job' ? e.pay_rate : undefined,
    notes: e.notes,
    active: e.active,
    createdAt: e.created_at,
    role: e.role || 'worker',
  }))
}

export async function addEmployee(employee: Omit<Employee, 'id' | 'createdAt'>): Promise<Employee | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const companyId = await getUserCompanyId()
  const payType = employee.paymentType === 'Hourly' ? 'hourly' : 'per_job'
  const payRate = employee.paymentType === 'Hourly' ? employee.hourlyRate : employee.perJobRate

  const { data, error } = await supabase
    .from('employees')
    .insert({
      user_id: user.id,
      company_id: companyId,
      name: employee.name,
      email: employee.email || null,
      phone: employee.phone || null,
      pay_type: payType,
      pay_rate: payRate || 0,
      notes: employee.notes || null,
      active: employee.active,
      role: (employee as any).role || 'worker',
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding employee:', error.message)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    paymentType: data.pay_type === 'hourly' ? 'Hourly' : 'PerJob',
    hourlyRate: data.pay_type === 'hourly' ? data.pay_rate : undefined,
    perJobRate: data.pay_type === 'per_job' ? data.pay_rate : undefined,
    notes: data.notes,
    active: data.active,
    createdAt: data.created_at,
    role: data.role || 'worker',
  } as Employee
}

export async function updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee | null> {
  const supabase = getSupabase()

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.email !== undefined) updateData.email = updates.email
  if (updates.phone !== undefined) updateData.phone = updates.phone
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.active !== undefined) updateData.active = updates.active
  if ((updates as any).role !== undefined) updateData.role = (updates as any).role
  
  // Handle payment type and rate
  if (updates.paymentType !== undefined) {
    updateData.pay_type = updates.paymentType === 'Hourly' ? 'hourly' : 'per_job'
  }
  if (updates.hourlyRate !== undefined && updates.paymentType === 'Hourly') {
    updateData.pay_rate = updates.hourlyRate
  }
  if (updates.perJobRate !== undefined && updates.paymentType === 'PerJob') {
    updateData.pay_rate = updates.perJobRate
  }

  const { data, error } = await supabase
    .from('employees')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating employee:', error.message, error.details, error.hint)
    return null
  }

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    paymentType: data.pay_type === 'hourly' ? 'Hourly' : 'PerJob',
    hourlyRate: data.pay_type === 'hourly' ? data.pay_rate : undefined,
    perJobRate: data.pay_type === 'per_job' ? data.pay_rate : undefined,
    notes: data.notes,
    active: data.active,
    createdAt: data.created_at,
    role: data.role,
  } as Employee
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('employees')
    .update({ active: false })
    .eq('id', id)

  if (error) {
    console.error('Error deactivating employee:', error)
    return false
  }
  return true
}

// Job Worker operations
export async function addJobWorker(jobWorker: Omit<JobWorker, 'id' | 'createdAt' | 'employeeName'>): Promise<JobWorker | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('job_workers')
    .insert({
      job_id: jobWorker.jobId,
      employee_id: jobWorker.employeeId,
      hours_worked: jobWorker.hoursWorked || null,
      amount_earned: jobWorker.amountEarned,
    })
    .select('*, employees(name)')
    .single()

  if (error) {
    console.error('Error adding job worker:', error.message, error.details, error.hint)
    return null
  }

  return {
    id: data.id,
    jobId: data.job_id,
    employeeId: data.employee_id,
    employeeName: data.employees?.name,
    hoursWorked: data.hours_worked,
    amountEarned: data.amount_earned,
    createdAt: data.created_at,
  }
}

export async function getJobWorkers(jobId: string): Promise<JobWorker[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('job_workers')
    .select('*, employees(name)')
    .eq('job_id', jobId)

  if (error) {
    console.error('Error fetching job workers:', error)
    return []
  }

  return data.map((w: any) => ({
    id: w.id,
    jobId: w.job_id,
    employeeId: w.employee_id,
    employeeName: w.employees?.name,
    hoursWorked: w.hours_worked,
    amountEarned: w.amount_earned,
    createdAt: w.created_at,
  }))
}

export async function deleteJobWorker(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('job_workers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting job worker:', error)
    return false
  }
  return true
}

// Payroll summary - only unpaid workers
export async function getPayrollSummary(): Promise<PayrollSummary[]> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return []

  const { data: workers, error } = await supabase
    .from('job_workers')
    .select('*, employees(name, pay_rate), jobs(date, price, customers(name))')
    .or('paid.is.null,paid.eq.false')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching payroll:', error)
    return []
  }

  // Group by employee
  const summary: Record<string, PayrollSummary> = {}

  for (const worker of workers) {
    const empId = worker.employee_id
    const empName = worker.employees?.name || 'Unknown'

    if (!summary[empId]) {
      summary[empId] = {
        employeeId: empId,
        employeeName: empName,
        totalEarned: 0,
        totalHours: 0,
        jobCount: 0,
        jobs: [],
        paymentStatus: 'Unpaid',
      }
    }

    // Calculate commission: use stored amount_earned OR calculate from job price
    const jobPrice = worker.jobs?.price || 0
    const percentage = worker.employees?.pay_rate || 20
    const commission = worker.amount_earned || (jobPrice * (percentage / 100))
    
    summary[empId].totalEarned += commission
    summary[empId].totalHours = (summary[empId].totalHours || 0) + (worker.hours_worked || 0)
    summary[empId].jobCount += 1
    summary[empId].jobs.push({
      id: worker.job_id,
      customerName: worker.jobs?.customers?.name || 'Unknown Customer',
      amount: commission,
      jobPrice: jobPrice,
      date: worker.jobs?.date || '',
      hours: worker.hours_worked,
    })
  }

  return Object.values(summary)
}

// ============ JOB-INCOME SYNC FUNCTIONS ============

/**
 * When a job is marked as "Paid", create an income record
 * This ensures finances stay in sync with job payments
 */
export async function syncJobToIncome(jobId: string, customerId: string, customerName: string, price: number, jobType: string, date: string): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const companyId = await getUserCompanyId()

  // Check if income already exists for this job
  const { data: existing } = await supabase
    .from('income')
    .select('id')
    .eq('job_id', jobId)
    .maybeSingle()

  if (existing) {
    // Already synced
    return true
  }

  // Create new income record
  const { error } = await supabase
    .from('income')
    .insert({
      user_id: user.id,
      company_id: companyId,
      job_id: jobId,
      amount: price,
      customer_name: customerName,
      job_type: jobType,
      payment_method: 'Cash', // Default, can be updated
      payment_status: 'Paid',
      date: date,
      notes: `Auto-created from job payment`,
    })

  if (error) {
    console.error('Error syncing job to income:', error)
    return false
  }

  return true
}

/**
 * Update job status and sync related data
 * - When marked as "Paid", creates income record
 * - Can also handle invoice creation
 */
export async function updateJobWithSync(
  jobId: string, 
  updates: Partial<Omit<Job, 'id' | 'createdAt'>>,
  customerName?: string
): Promise<{ job: Job | null; synced: boolean }> {
  const result = await updateJob(jobId, updates)
  
  if (!result) {
    return { job: null, synced: false }
  }

  // If status changed to Paid, sync to income
  if (updates.status === 'Paid' && customerName) {
    const synced = await syncJobToIncome(
      jobId,
      result.customerId,
      customerName,
      result.price,
      result.jobType,
      result.date
    )
    return { job: result, synced }
  }

  return { job: result, synced: true }
}

/**
 * Delete income records associated with a job
 * Called when a job is deleted or status is changed from Paid
 */
export async function unsyncJobFromIncome(jobId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('income')
    .delete()
    .eq('job_id', jobId)

  if (error) {
    console.error('Error unsyncing job from income:', error)
    return false
  }
  return true
}

// ============ CRM WORKFLOW FUNCTIONS ============
// Customer → Estimate → Job → Invoice → Payment → Closed Won

/**
 * Convert an accepted estimate to a job
 * Links the job back to the estimate
 */
export async function convertEstimateToJob(
  estimateId: string,
  scheduledDate: string,
  jobType: 'Residential' | 'Commercial' | 'Storefront' = 'Residential'
): Promise<Job | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const companyId = await getUserCompanyId()

  // Get the estimate
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single()

  if (estError || !estimate) {
    console.error('Error fetching estimate:', estError)
    return null
  }

  // Create job linked to the estimate
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: estimate.customer_id,
      estimate_id: estimateId,
      date: scheduledDate,
      job_type: jobType,
      price: estimate.total,
      status: 'Scheduled',
      notes: `From ${estimate.estimate_number}: ${estimate.items?.map((i: any) => i.description).join(', ') || ''}`,
    })
    .select()
    .single()

  if (jobError) {
    console.error('Error creating job from estimate:', jobError)
    return null
  }

  // Mark estimate as accepted
  await supabase
    .from('estimates')
    .update({ status: 'accepted' })
    .eq('id', estimateId)

  return {
    id: job.id,
    customerId: job.customer_id,
    estimateId: job.estimate_id,
    invoiceId: job.invoice_id,
    date: job.date,
    jobType: job.job_type,
    price: job.price,
    expenses: job.expenses,
    status: job.status,
    notes: job.notes,
    createdAt: job.created_at,
  }
}

/**
 * Create an invoice from a completed job
 * Links the invoice to both job and customer
 */
export async function createInvoiceFromJob(
  jobId: string,
  dueInDays: number = 30
): Promise<Invoice | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  const companyId = await getUserCompanyId()

  // Get the job with customer info
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*, customers(name)')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    console.error('Error fetching job:', jobError)
    return null
  }

  // Get next invoice number
  const invoiceNumber = await getNextInvoiceNumber()
  const today = new Date().toISOString().split('T')[0]
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + dueInDays)

  // Get tax rate from settings
  const settings = await getSettings()
  const taxRate = settings?.profile?.taxRate || 0

  // Create line items from job
  const items = [{
    id: crypto.randomUUID(),
    description: `${job.job_type} Service`,
    quantity: 1,
    unitPrice: job.price,
    total: job.price,
  }]

  const subtotal = job.price
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  // Create invoice with 'sent' status since it's being created from a completed job
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: job.customer_id,
      job_id: jobId,
      estimate_id: job.estimate_id,
      invoice_number: invoiceNumber,
      status: 'sent', // Changed from 'draft' - invoice is ready for payment
      issue_date: today,
      due_date: dueDate.toISOString().split('T')[0],
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      amount_paid: 0,
      notes: job.notes || '',
    })
    .select('*, customers(name)')
    .single()

  if (invError) {
    console.error('Error creating invoice from job:', invError)
    return null
  }

  // Link invoice back to the job
  await supabase
    .from('jobs')
    .update({ invoice_id: invoice.id })
    .eq('id', jobId)

  return {
    id: invoice.id,
    customerId: invoice.customer_id,
    customerName: invoice.customers?.name,
    jobId: invoice.job_id,
    estimateId: invoice.estimate_id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    items: invoice.items || [],
    subtotal: parseFloat(invoice.subtotal),
    taxRate: parseFloat(invoice.tax_rate),
    taxAmount: parseFloat(invoice.tax_amount),
    total: parseFloat(invoice.total),
    amountPaid: parseFloat(invoice.amount_paid),
    notes: invoice.notes,
    createdAt: invoice.created_at,
  }
}

/**
 * Mark invoice as paid and cascade updates:
 * - Creates income record
 * - Updates job status to 'Paid'
 * - All linked records stay connected for reporting
 */
export async function markInvoicePaid(
  invoiceId: string,
  paymentMethod: 'Cash' | 'Card' | 'Check' | 'Zelle' | 'Other' | 'Venmo' = 'Cash'
): Promise<{ success: boolean; invoice?: Invoice }> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return { success: false }

  const companyId = await getUserCompanyId()

  // Get the invoice with customer info
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*, customers(name)')
    .eq('id', invoiceId)
    .single()

  if (invError || !invoice) {
    console.error('Error fetching invoice:', invError)
    return { success: false }
  }

  const today = new Date().toISOString().split('T')[0]

  // 1. Update invoice status to paid
  const { data: updatedInvoice, error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      amount_paid: invoice.total,
    })
    .eq('id', invoiceId)
    .select('*, customers(name)')
    .single()

  if (updateError) {
    console.error('Error updating invoice:', updateError)
    return { success: false }
  }

  // 2. If linked to a job, mark job as Paid
  if (invoice.job_id) {
    await supabase
      .from('jobs')
      .update({ status: 'Paid' })
      .eq('id', invoice.job_id)
  }

  // 3. Create income record
  await supabase
    .from('income')
    .insert({
      user_id: user.id,
      company_id: companyId,
      amount: invoice.total,
      customer_name: invoice.customers?.name || 'Unknown',
      job_type: 'Residential', // Default
      payment_method: paymentMethod,
      payment_status: 'Paid',
      job_id: invoice.job_id,
      date: today,
      notes: `Payment for ${invoice.invoice_number}`,
    })

  return {
    success: true,
    invoice: {
      id: updatedInvoice.id,
      customerId: updatedInvoice.customer_id,
      customerName: updatedInvoice.customers?.name,
      jobId: updatedInvoice.job_id,
      estimateId: updatedInvoice.estimate_id,
      invoiceNumber: updatedInvoice.invoice_number,
      status: updatedInvoice.status,
      issueDate: updatedInvoice.issue_date,
      dueDate: updatedInvoice.due_date,
      items: updatedInvoice.items || [],
      subtotal: parseFloat(updatedInvoice.subtotal),
      taxRate: parseFloat(updatedInvoice.tax_rate),
      taxAmount: parseFloat(updatedInvoice.tax_amount),
      total: parseFloat(updatedInvoice.total),
      amountPaid: parseFloat(updatedInvoice.amount_paid),
      notes: updatedInvoice.notes,
      createdAt: updatedInvoice.created_at,
    },
  }
}

/**
 * Get all linked records for a customer (CRM view)
 */
export async function getCustomerCRMData(customerId: string): Promise<{
  estimates: Estimate[]
  jobs: Job[]
  invoices: Invoice[]
  totalSpent: number
  pendingAmount: number
}> {
  const supabase = getSupabase()

  const [estimatesRes, jobsRes, invoicesRes] = await Promise.all([
    supabase.from('estimates').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    supabase.from('jobs').select('*').eq('customer_id', customerId).order('date', { ascending: false }),
    supabase.from('invoices').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
  ])

  const estimates = (estimatesRes.data || []).map(e => ({
    id: e.id,
    customerId: e.customer_id,
    estimateNumber: e.estimate_number,
    status: e.status,
    issueDate: e.issue_date,
    expiryDate: e.expiry_date,
    items: e.items || [],
    subtotal: parseFloat(e.subtotal),
    taxRate: parseFloat(e.tax_rate),
    taxAmount: parseFloat(e.tax_amount),
    total: parseFloat(e.total),
    notes: e.notes,
    createdAt: e.created_at,
  }))

  const jobs = (jobsRes.data || []).map(j => ({
    id: j.id,
    customerId: j.customer_id,
    estimateId: j.estimate_id,
    invoiceId: j.invoice_id,
    date: j.date,
    jobType: j.job_type,
    price: j.price,
    expenses: j.expenses,
    status: j.status,
    notes: j.notes,
    createdAt: j.created_at,
  }))

  const invoices = (invoicesRes.data || []).map(i => ({
    id: i.id,
    customerId: i.customer_id,
    jobId: i.job_id,
    estimateId: i.estimate_id,
    invoiceNumber: i.invoice_number,
    status: i.status,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    items: i.items || [],
    subtotal: parseFloat(i.subtotal),
    taxRate: parseFloat(i.tax_rate),
    taxAmount: parseFloat(i.tax_amount),
    total: parseFloat(i.total),
    amountPaid: parseFloat(i.amount_paid),
    notes: i.notes,
    createdAt: i.created_at,
  }))

  const totalSpent = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.total, 0)

  const pendingAmount = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)

  return { estimates, jobs, invoices, totalSpent, pendingAmount }
}

/**
 * Get linked records for a job
 */
export async function getJobLinkedRecords(jobId: string): Promise<{
  estimate: Estimate | null
  invoice: Invoice | null
}> {
  const supabase = getSupabase()

  const { data: job } = await supabase
    .from('jobs')
    .select('estimate_id, invoice_id')
    .eq('id', jobId)
    .single()

  if (!job) return { estimate: null, invoice: null }

  let estimate: Estimate | null = null
  let invoice: Invoice | null = null

  if (job.estimate_id) {
    const { data: e } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', job.estimate_id)
      .single()
    if (e) {
      estimate = {
        id: e.id,
        customerId: e.customer_id,
        estimateNumber: e.estimate_number,
        status: e.status,
        issueDate: e.issue_date,
        expiryDate: e.expiry_date,
        items: e.items || [],
        subtotal: parseFloat(e.subtotal),
        taxRate: parseFloat(e.tax_rate),
        taxAmount: parseFloat(e.tax_amount),
        total: parseFloat(e.total),
        notes: e.notes,
        createdAt: e.created_at,
      }
    }
  }

  if (job.invoice_id) {
    const { data: i } = await supabase
      .from('invoices')
      .select('*, customers(name)')
      .eq('id', job.invoice_id)
      .single()
    if (i) {
      invoice = {
        id: i.id,
        customerId: i.customer_id,
        customerName: i.customers?.name,
        jobId: i.job_id,
        estimateId: i.estimate_id,
        invoiceNumber: i.invoice_number,
        status: i.status,
        issueDate: i.issue_date,
        dueDate: i.due_date,
        items: i.items || [],
        subtotal: parseFloat(i.subtotal),
        taxRate: parseFloat(i.tax_rate),
        taxAmount: parseFloat(i.tax_amount),
        total: parseFloat(i.total),
        amountPaid: parseFloat(i.amount_paid),
        notes: i.notes,
        createdAt: i.created_at,
      }
    }
  }

  return { estimate, invoice }
}

// ============ SALES REP FUNCTIONS ============

// Check if a user is a sales rep
export async function isSalesRepUser(userId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('sales_rep_users')
    .select('id')
    .eq('user_id', userId)
    .single()
  
  return !!data
}

// Get sales rep info including their owner
export async function getSalesRepInfo(userId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('sales_rep_users')
    .select('*, employees(name, email, phone)')
    .eq('user_id', userId)
    .single()
  
  if (error || !data) return null
  return data
}

// Get owner user ID for a sales rep
export async function getOwnerForSalesRep(userId: string): Promise<string | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('sales_rep_users')
    .select('owner_user_id')
    .eq('user_id', userId)
    .single()
  
  return data?.owner_user_id || null
}

// Link a new user to an employee as sales rep
export async function linkSalesRepUser(
  userId: string, 
  employeeId: string, 
  ownerUserId: string
): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('sales_rep_users')
    .insert({
      user_id: userId,
      employee_id: employeeId,
      owner_user_id: ownerUserId,
    })
  
  return !error
}

// Get all sales reps for an owner
export async function getSalesRepsForOwner(ownerUserId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('sales_rep_users')
    .select('*, employees(name, email, phone, role)')
    .eq('owner_user_id', ownerUserId)
  
  if (error) return []
  return data || []
}


