import { createClient } from '@/lib/supabase/client'

// Super admin emails - add your admin emails here
const SUPER_ADMIN_EMAILS = [
  'admin@profita.app',
  'support@profita.app',
  // Add more super admin emails as needed
]

export interface CompanyWithStats {
  id: string
  name: string
  owner_email: string | null
  plan_type: 'free' | 'starter' | 'pro' | 'enterprise'
  trial_ends_at: string | null
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
  mrr: number
  created_at: string
  member_count: number
  job_count: number
  invoice_count: number
  last_activity: string | null
}

export interface PlatformStats {
  totalCompanies: number
  totalUsers: number
  totalJobs: number
  totalInvoices: number
  totalRevenue: number
  mrr: number
  activeTrials: number
  churnedThisMonth: number
  newCompaniesThisMonth: number
}

export interface AuditLogEntry {
  id: string
  company_id: string | null
  user_id: string | null
  action: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
  user_email?: string
  company_name?: string
}

/**
 * Check if the current user is a super admin
 */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user?.email) return false
  
  // Check hardcoded list first
  if (SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return true
  }
  
  // Check profiles.is_admin flag as fallback
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  
  return profile?.is_admin === true
}

/**
 * Get platform-wide statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = createClient()
  
  // Get company count
  const { count: totalCompanies } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
  
  // Get user count (profiles)
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  
  // Get job count
  const { count: totalJobs } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
  
  // Get invoice count
  const { count: totalInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
  
  // Get total revenue from paid invoices
  const { data: revenueData } = await supabase
    .from('invoices')
    .select('total')
    .eq('status', 'paid')
  
  const totalRevenue = revenueData?.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0) || 0
  
  // Get MRR from active subscriptions (placeholder - would need Stripe data)
  const mrr = 0 // TODO: Integrate with Stripe subscriptions
  
  // Get companies created this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { count: newCompaniesThisMonth } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())
  
  return {
    totalCompanies: totalCompanies || 0,
    totalUsers: totalUsers || 0,
    totalJobs: totalJobs || 0,
    totalInvoices: totalInvoices || 0,
    totalRevenue,
    mrr,
    activeTrials: 0, // TODO: Implement trial tracking
    churnedThisMonth: 0, // TODO: Implement churn tracking
    newCompaniesThisMonth: newCompaniesThisMonth || 0,
  }
}

/**
 * Get all companies with usage stats
 */
export async function getAllCompanies(): Promise<CompanyWithStats[]> {
  const supabase = createClient()
  
  // Get all companies
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error || !companies) {
    console.error('[SuperAdmin] Error fetching companies:', error)
    return []
  }
  
  // Get member counts per company
  const { data: memberCounts } = await supabase
    .from('company_members')
    .select('company_id')
  
  const memberCountMap: Record<string, number> = {}
  memberCounts?.forEach(m => {
    memberCountMap[m.company_id] = (memberCountMap[m.company_id] || 0) + 1
  })
  
  // Get job counts per company
  const { data: jobCounts } = await supabase
    .from('jobs')
    .select('company_id')
  
  const jobCountMap: Record<string, number> = {}
  jobCounts?.forEach(j => {
    if (j.company_id) {
      jobCountMap[j.company_id] = (jobCountMap[j.company_id] || 0) + 1
    }
  })
  
  // Get invoice counts per company
  const { data: invoiceCounts } = await supabase
    .from('invoices')
    .select('company_id')
  
  const invoiceCountMap: Record<string, number> = {}
  invoiceCounts?.forEach(i => {
    if (i.company_id) {
      invoiceCountMap[i.company_id] = (invoiceCountMap[i.company_id] || 0) + 1
    }
  })
  
  return companies.map(company => ({
    id: company.id,
    name: company.name || 'Unnamed Company',
    owner_email: company.owner_email || null,
    plan_type: company.plan_type || 'free',
    trial_ends_at: company.trial_ends_at || null,
    subscription_status: company.subscription_status || 'trialing',
    mrr: parseFloat(company.mrr) || 0,
    created_at: company.created_at,
    member_count: memberCountMap[company.id] || 0,
    job_count: jobCountMap[company.id] || 0,
    invoice_count: invoiceCountMap[company.id] || 0,
    last_activity: null, // TODO: Track last activity
  }))
}

/**
 * Update a company's plan
 */
export async function updateCompanyPlan(
  companyId: string,
  planType: 'free' | 'starter' | 'pro' | 'enterprise',
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  
  const updateData: Record<string, unknown> = { plan_type: planType }
  if (subscriptionStatus) {
    updateData.subscription_status = subscriptionStatus
  }
  
  const { error } = await supabase
    .from('companies')
    .update(updateData)
    .eq('id', companyId)
  
  if (error) {
    console.error('[SuperAdmin] Error updating company plan:', error)
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Get audit log entries
 */
export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const supabase = createClient()
  
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    // Table might not exist yet
    console.log('[SuperAdmin] Audit log not available:', error.message)
    return []
  }
  
  return logs || []
}

/**
 * Impersonate a company (set session context for viewing their data)
 * Note: This is for viewing only, actual impersonation requires secure server-side implementation
 */
export async function getCompanyDetails(companyId: string): Promise<{
  company: CompanyWithStats | null
  members: Array<{ id: string; email: string; role: string; joined_at: string }>
  recentJobs: Array<{ id: string; title: string; status: string; created_at: string }>
  recentInvoices: Array<{ id: string; invoice_number: string; total: number; status: string }>
}> {
  const supabase = createClient()
  
  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()
  
  if (!company) {
    return { company: null, members: [], recentJobs: [], recentInvoices: [] }
  }
  
  // Get members
  const { data: members } = await supabase
    .from('company_members')
    .select('id, user_id, role, created_at, profiles(email)')
    .eq('company_id', companyId)
    .limit(50)
  
  // Get recent jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(10)
  
  // Get recent invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, status')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(10)
  
  // Get counts
  const { count: memberCount } = await supabase
    .from('company_members')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
  
  const { count: jobCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
  
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
  
  return {
    company: {
      id: company.id,
      name: company.name || 'Unnamed Company',
      owner_email: company.owner_email || null,
      plan_type: company.plan_type || 'free',
      trial_ends_at: company.trial_ends_at || null,
      subscription_status: company.subscription_status || 'trialing',
      mrr: parseFloat(company.mrr) || 0,
      created_at: company.created_at,
      member_count: memberCount || 0,
      job_count: jobCount || 0,
      invoice_count: invoiceCount || 0,
      last_activity: null,
    },
    members: (members || []).map(m => ({
      id: m.id,
      email: (m.profiles as { email?: string })?.email || 'Unknown',
      role: m.role || 'member',
      joined_at: m.created_at,
    })),
    recentJobs: (jobs || []).map(j => ({
      id: j.id,
      title: j.title || 'Untitled',
      status: j.status || 'Scheduled',
      created_at: j.created_at,
    })),
    recentInvoices: (invoices || []).map(i => ({
      id: i.id,
      invoice_number: i.invoice_number || 'N/A',
      total: parseFloat(i.total) || 0,
      status: i.status || 'draft',
    })),
  }
}
