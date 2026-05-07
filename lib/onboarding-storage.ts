import { createClient, getCachedUser } from '@/lib/supabase/client'

// =============================================================================
// Onboarding Types
// =============================================================================

export interface OnboardingCompanyInfo {
  name: string
  industry?: string
  phone?: string
  email?: string
  address?: string
  website?: string
  serviceArea?: string
  teamSize?: string
}

export interface OnboardingServices {
  servicesOffered: string[]
  defaultJobTypes: string[]
}

export interface OnboardingPricing {
  defaultPricing: {
    hourlyRate?: number
    minimumCharge?: number
    taxRate?: number
  }
  revenueGoals: {
    weeklyTarget?: number
    monthlyTarget?: number
  }
  jobGoals: {
    weeklyTarget?: number
    monthlyTarget?: number
  }
}

export interface OnboardingSales {
  usesSalesForce: boolean
  salesGoals?: {
    doorsPerDay?: number
    leadsPerWeek?: number
    appointmentsPerWeek?: number
  }
}

export interface OnboardingInvoicing {
  invoiceSettings: {
    prefix?: string
    paymentTermsDays?: number
    defaultNotes?: string
  }
  taxSettings: {
    taxRate?: number
    taxName?: string
    taxEnabled?: boolean
  }
  paymentMethods: string[]
}

export interface CompanyOnboardingData {
  // From database
  id: string
  name: string
  onboardingCompleted: boolean
  onboardingStep: number
  // Company profile
  industry?: string
  phone?: string
  email?: string
  address?: string
  website?: string
  serviceArea?: string
  teamSize?: string
  // Services
  servicesOffered: string[]
  defaultJobTypes: string[]
  // Pricing & goals
  defaultPricing: Record<string, any>
  revenueGoals: Record<string, any>
  jobGoals: Record<string, any>
  // Sales
  usesSalesForce: boolean
  salesGoals: Record<string, any>
  // Invoicing
  invoiceSettings: Record<string, any>
  taxSettings: Record<string, any>
  paymentMethods: string[]
  // Notifications
  notificationPreferences: Record<string, any>
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_SERVICES = [
  'Window Cleaning',
  'Pressure Washing',
  'Gutter Cleaning',
  'Roof Cleaning',
  'Solar Panel Cleaning',
  'House Washing',
]

export const DEFAULT_JOB_TYPES = [
  'Residential',
  'Commercial',
  'Storefront',
]

export const DEFAULT_PAYMENT_METHODS = [
  'Cash',
  'Card',
  'Check',
  'Zelle',
  'Venmo',
]

export const INDUSTRY_OPTIONS = [
  'Window Cleaning',
  'Pressure Washing',
  'Landscaping',
  'HVAC',
  'Plumbing',
  'Electrical',
  'General Contracting',
  'Cleaning Services',
  'Handyman Services',
  'Other',
]

export const TEAM_SIZE_OPTIONS = [
  'Just me',
  '2-5 employees',
  '6-10 employees',
  '11-25 employees',
  '26+ employees',
]

// =============================================================================
// Storage Functions
// =============================================================================

function getSupabase() {
  return createClient()
}

/**
 * Get the current user's company onboarding data
 */
export async function getCompanyOnboarding(): Promise<CompanyOnboardingData | null> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return null

  // Get company owned by this user
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (error || !company) {
    console.error('Error fetching company for onboarding:', error)
    return null
  }

  return {
    id: company.id,
    name: company.name || '',
    onboardingCompleted: company.onboarding_completed ?? false,
    onboardingStep: company.onboarding_step ?? 0,
    // Profile
    industry: company.industry,
    phone: company.phone,
    email: company.email,
    address: company.address,
    website: company.website,
    serviceArea: company.service_area,
    teamSize: company.team_size,
    // Services
    servicesOffered: company.services_offered ?? [],
    defaultJobTypes: company.default_job_types ?? DEFAULT_JOB_TYPES,
    // Pricing & goals
    defaultPricing: company.default_pricing ?? {},
    revenueGoals: company.revenue_goals ?? {},
    jobGoals: company.job_goals ?? {},
    // Sales
    usesSalesForce: company.uses_sales_force ?? false,
    salesGoals: company.sales_goals ?? {},
    // Invoicing
    invoiceSettings: company.invoice_settings ?? {},
    taxSettings: company.tax_settings ?? {},
    paymentMethods: company.payment_methods ?? DEFAULT_PAYMENT_METHODS,
    // Notifications
    notificationPreferences: company.notification_preferences ?? {},
  }
}

/**
 * Check if user needs onboarding (company exists but not completed)
 */
export async function needsOnboarding(): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { data: company } = await supabase
    .from('companies')
    .select('onboarding_completed')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  // If no company yet, they need onboarding after it's created
  if (!company) return true

  // If company exists but onboarding not complete
  return company.onboarding_completed !== true
}

/**
 * Update company info (Step 1)
 */
export async function saveCompanyInfo(data: OnboardingCompanyInfo): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      name: data.name,
      industry: data.industry,
      phone: data.phone,
      email: data.email,
      address: data.address,
      website: data.website,
      service_area: data.serviceArea,
      team_size: data.teamSize,
      onboarding_step: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error saving company info:', error)
    return false
  }
  return true
}

/**
 * Update services configuration (Step 2)
 */
export async function saveServicesConfig(data: OnboardingServices): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      services_offered: data.servicesOffered,
      default_job_types: data.defaultJobTypes,
      onboarding_step: 2,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error saving services config:', error)
    return false
  }
  return true
}

/**
 * Update pricing and goals (Step 3)
 */
export async function savePricingGoals(data: OnboardingPricing): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      default_pricing: data.defaultPricing,
      revenue_goals: data.revenueGoals,
      job_goals: data.jobGoals,
      onboarding_step: 3,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error saving pricing/goals:', error)
    return false
  }
  return true
}

/**
 * Update sales force settings (Step 4)
 */
export async function saveSalesConfig(data: OnboardingSales): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      uses_sales_force: data.usesSalesForce,
      sales_goals: data.salesGoals ?? {},
      onboarding_step: 4,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error saving sales config:', error)
    return false
  }
  return true
}

/**
 * Update invoicing settings (Step 5)
 */
export async function saveInvoicingConfig(data: OnboardingInvoicing): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      invoice_settings: data.invoiceSettings,
      tax_settings: data.taxSettings,
      payment_methods: data.paymentMethods,
      onboarding_step: 5,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error saving invoicing config:', error)
    return false
  }
  return true
}

/**
 * Mark onboarding as complete
 */
export async function completeOnboarding(): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const { error } = await supabase
    .from('companies')
    .update({
      onboarding_completed: true,
      onboarding_step: 5,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error completing onboarding:', error)
    return false
  }
  return true
}

/**
 * Skip onboarding (for users who want to set up later)
 */
export async function skipOnboarding(): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  // Set defaults and mark as complete
  const { error } = await supabase
    .from('companies')
    .update({
      onboarding_completed: true,
      onboarding_step: 5,
      services_offered: DEFAULT_SERVICES.slice(0, 3),
      default_job_types: DEFAULT_JOB_TYPES,
      payment_methods: DEFAULT_PAYMENT_METHODS,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error skipping onboarding:', error)
    return false
  }
  return true
}

/**
 * Update all company settings at once (for settings page)
 */
export async function updateCompanySettings(data: Partial<CompanyOnboardingData>): Promise<boolean> {
  const supabase = getSupabase()
  const user = await getCachedUser()
  if (!user) return false

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  // Map fields to database columns
  if (data.name !== undefined) updateData.name = data.name
  if (data.industry !== undefined) updateData.industry = data.industry
  if (data.phone !== undefined) updateData.phone = data.phone
  if (data.email !== undefined) updateData.email = data.email
  if (data.address !== undefined) updateData.address = data.address
  if (data.website !== undefined) updateData.website = data.website
  if (data.serviceArea !== undefined) updateData.service_area = data.serviceArea
  if (data.teamSize !== undefined) updateData.team_size = data.teamSize
  if (data.servicesOffered !== undefined) updateData.services_offered = data.servicesOffered
  if (data.defaultJobTypes !== undefined) updateData.default_job_types = data.defaultJobTypes
  if (data.defaultPricing !== undefined) updateData.default_pricing = data.defaultPricing
  if (data.revenueGoals !== undefined) updateData.revenue_goals = data.revenueGoals
  if (data.jobGoals !== undefined) updateData.job_goals = data.jobGoals
  if (data.usesSalesForce !== undefined) updateData.uses_sales_force = data.usesSalesForce
  if (data.salesGoals !== undefined) updateData.sales_goals = data.salesGoals
  if (data.invoiceSettings !== undefined) updateData.invoice_settings = data.invoiceSettings
  if (data.taxSettings !== undefined) updateData.tax_settings = data.taxSettings
  if (data.paymentMethods !== undefined) updateData.payment_methods = data.paymentMethods
  if (data.notificationPreferences !== undefined) updateData.notification_preferences = data.notificationPreferences

  const { error } = await supabase
    .from('companies')
    .update(updateData)
    .eq('owner_user_id', user.id)

  if (error) {
    console.error('Error updating company settings:', error)
    return false
  }
  return true
}
