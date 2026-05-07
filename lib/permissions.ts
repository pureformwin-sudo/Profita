import { createClient } from '@/lib/supabase/client'

// =============================================================================
// Role & Permission System
// =============================================================================

export type Role = 'owner' | 'admin' | 'dispatcher' | 'worker' | 'sales_rep' | 'accountant'

export type Permission =
  // Jobs
  | 'view_all_jobs'
  | 'view_assigned_jobs_only'
  | 'create_jobs'
  | 'edit_jobs'
  | 'delete_jobs'
  | 'assign_workers'
  // Customers
  | 'view_all_customers'
  | 'view_assigned_customers_only'
  | 'create_customers'
  | 'edit_customers'
  // Estimates
  | 'create_estimates'
  | 'send_estimates'
  | 'convert_estimates_to_jobs'
  // Invoices
  | 'view_invoices'
  | 'create_invoices'
  | 'send_invoices'
  | 'mark_invoice_paid'
  // Payments
  | 'collect_payments'
  | 'view_finances'
  | 'manage_expenses'
  // Reports & Analytics
  | 'view_reports'
  | 'view_payroll'
  // Team
  | 'manage_team'
  | 'manage_service_plans'
  // AI & Settings
  | 'use_ai_growth'
  | 'manage_notifications'
  | 'manage_user_roles'
  | 'manage_settings'
  // Sales
  | 'access_saleshub'
  | 'view_sales_dashboard'
  | 'create_leads'
  | 'view_all_leads'
  | 'view_assigned_leads_only'

// Default permissions per role
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: [
    // Full access to everything
    'view_all_jobs', 'create_jobs', 'edit_jobs', 'delete_jobs', 'assign_workers',
    'view_all_customers', 'create_customers', 'edit_customers',
    'create_estimates', 'send_estimates', 'convert_estimates_to_jobs',
    'view_invoices', 'create_invoices', 'send_invoices', 'mark_invoice_paid',
    'collect_payments', 'view_finances', 'manage_expenses',
    'view_reports', 'view_payroll',
    'manage_team', 'manage_service_plans',
    'use_ai_growth', 'manage_notifications', 'manage_user_roles', 'manage_settings',
    'access_saleshub', 'view_sales_dashboard', 'create_leads', 'view_all_leads',
  ],
  admin: [
    // Almost everything except owner-level settings
    'view_all_jobs', 'create_jobs', 'edit_jobs', 'delete_jobs', 'assign_workers',
    'view_all_customers', 'create_customers', 'edit_customers',
    'create_estimates', 'send_estimates', 'convert_estimates_to_jobs',
    'view_invoices', 'create_invoices', 'send_invoices', 'mark_invoice_paid',
    'collect_payments', 'view_finances', 'manage_expenses',
    'view_reports', 'view_payroll',
    'manage_team', 'manage_service_plans',
    'use_ai_growth', 'manage_notifications',
    'access_saleshub', 'view_sales_dashboard', 'create_leads', 'view_all_leads',
  ],
  dispatcher: [
    // Job management and scheduling focus
    'view_all_jobs', 'create_jobs', 'edit_jobs', 'assign_workers',
    'view_all_customers', 'create_customers',
    'create_estimates', 'send_estimates',
    'view_invoices', 'create_invoices',
    'manage_notifications',
  ],
  worker: [
    // Minimal - only assigned jobs/customers
    'view_assigned_jobs_only',
    'view_assigned_customers_only',
    'manage_notifications',
  ],
  sales_rep: [
    // Sales-focused permissions
    'view_assigned_customers_only',
    'create_customers',
    'create_estimates', 'send_estimates',
    'access_saleshub', 'view_sales_dashboard', 'create_leads', 'view_assigned_leads_only',
    'manage_notifications',
  ],
  accountant: [
    // Finance-focused permissions
    'view_all_jobs',
    'view_all_customers',
    'view_invoices', 'create_invoices', 'send_invoices', 'mark_invoice_paid',
    'collect_payments', 'view_finances', 'manage_expenses',
    'view_reports', 'view_payroll',
    'manage_notifications',
  ],
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  worker: 'Worker',
  sales_rep: 'Sales Rep',
  accountant: 'Accountant',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access to everything. Can manage billing and delete company.',
  admin: 'Manages jobs, team, and most settings. Cannot delete company or manage billing.',
  dispatcher: 'Creates and assigns jobs, manages schedule. Limited finance access.',
  worker: 'Views and completes assigned jobs only. Cannot see finances or other jobs.',
  sales_rep: 'Manages leads, creates estimates, closes deals. Sales-focused access.',
  accountant: 'Manages invoices, payments, expenses, and reports. Cannot manage jobs.',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_all_jobs: 'View All Jobs',
  view_assigned_jobs_only: 'View Assigned Jobs Only',
  create_jobs: 'Create Jobs',
  edit_jobs: 'Edit Jobs',
  delete_jobs: 'Delete Jobs',
  assign_workers: 'Assign Workers',
  view_all_customers: 'View All Customers',
  view_assigned_customers_only: 'View Assigned Customers Only',
  create_customers: 'Create Customers',
  edit_customers: 'Edit Customers',
  create_estimates: 'Create Estimates',
  send_estimates: 'Send Estimates',
  convert_estimates_to_jobs: 'Convert Estimates to Jobs',
  view_invoices: 'View Invoices',
  create_invoices: 'Create Invoices',
  send_invoices: 'Send Invoices',
  mark_invoice_paid: 'Mark Invoice Paid',
  collect_payments: 'Collect Payments',
  view_finances: 'View Finances',
  manage_expenses: 'Manage Expenses',
  view_reports: 'View Reports',
  view_payroll: 'View Payroll',
  manage_team: 'Manage Team',
  manage_service_plans: 'Manage Service Plans',
  use_ai_growth: 'Use AI Growth',
  manage_notifications: 'Manage Notifications',
  manage_user_roles: 'Manage User Roles',
  manage_settings: 'Manage Settings',
  access_saleshub: 'Access SalesHub',
  view_sales_dashboard: 'View Sales Dashboard',
  create_leads: 'Create Leads',
  view_all_leads: 'View All Leads',
  view_assigned_leads_only: 'View Assigned Leads Only',
}

export const PERMISSION_CATEGORIES = {
  jobs: ['view_all_jobs', 'view_assigned_jobs_only', 'create_jobs', 'edit_jobs', 'delete_jobs', 'assign_workers'] as Permission[],
  customers: ['view_all_customers', 'view_assigned_customers_only', 'create_customers', 'edit_customers'] as Permission[],
  estimates: ['create_estimates', 'send_estimates', 'convert_estimates_to_jobs'] as Permission[],
  invoices: ['view_invoices', 'create_invoices', 'send_invoices', 'mark_invoice_paid'] as Permission[],
  finance: ['collect_payments', 'view_finances', 'manage_expenses', 'view_reports', 'view_payroll'] as Permission[],
  team: ['manage_team', 'manage_service_plans', 'manage_user_roles'] as Permission[],
  settings: ['use_ai_growth', 'manage_notifications', 'manage_settings'] as Permission[],
  sales: ['access_saleshub', 'view_sales_dashboard', 'create_leads', 'view_all_leads', 'view_assigned_leads_only'] as Permission[],
}

// =============================================================================
// Company Member Types
// =============================================================================

export type MemberStatus = 'invited' | 'active' | 'disabled'
export type WorkerStatus = 'idle' | 'on_the_way' | 'working' | 'completed' | 'late' | 'offline'

export interface Company {
  id: string
  ownerUserId: string
  name: string
  phone?: string
  email?: string
  address?: string
  logoUrl?: string
  settings?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CompanyMember {
  id: string
  companyId: string
  userId?: string
  email: string
  name: string
  phone?: string
  role: Role
  status: MemberStatus
  currentStatus?: WorkerStatus
  currentJobId?: string
  lastSeenAt?: string
  customPermissions?: Permission[]
  inviteToken?: string
  inviteSentAt?: string
  inviteAcceptedAt?: string
  createdAt: string
  updatedAt: string
}

export interface JobAssignment {
  id: string
  jobId: string
  memberId: string
  status: 'assigned' | 'on_the_way' | 'working' | 'completed' | 'cancelled'
  assignedAt: string
  startedAt?: string
  completedAt?: string
  notes?: string
}

export interface TimeEntry {
  id: string
  memberId: string
  jobId?: string
  entryType: 'travel' | 'work' | 'break'
  startTime: string
  endTime?: string
  durationMinutes?: number
  notes?: string
  createdAt: string
}

// =============================================================================
// Permission Checking Functions
// =============================================================================

/**
 * Get effective permissions for a member (role defaults + custom overrides)
 */
export function getEffectivePermissions(member: CompanyMember): Permission[] {
  const roleDefaults = ROLE_DEFAULTS[member.role] || []
  const customPermissions = member.customPermissions || []
  
  // Merge role defaults with custom permissions (custom takes precedence)
  const permissionSet = new Set([...roleDefaults, ...customPermissions])
  return Array.from(permissionSet)
}

/**
 * Check if a member has a specific permission
 */
export function hasPermission(member: CompanyMember, permission: Permission): boolean {
  const permissions = getEffectivePermissions(member)
  return permissions.includes(permission)
}

/**
 * Check if a member has any of the specified permissions
 */
export function hasAnyPermission(member: CompanyMember, permissions: Permission[]): boolean {
  const memberPermissions = getEffectivePermissions(member)
  return permissions.some(p => memberPermissions.includes(p))
}

/**
 * Check if a member has all of the specified permissions
 */
export function hasAllPermissions(member: CompanyMember, permissions: Permission[]): boolean {
  const memberPermissions = getEffectivePermissions(member)
  return permissions.every(p => memberPermissions.includes(p))
}

// =============================================================================
// Company & Member Storage Functions
// =============================================================================

export async function getCompany(): Promise<Company | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Try to get company where user is owner
  let { data: ownedCompany, error: fetchError } = await supabase
    .from('companies')
    .select('*')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  // If no company exists for this user, check if they're a team member
  if (!ownedCompany) {
    // Use RPC to get membership (bypasses RLS)
    const { data: membership } = await supabase.rpc('get_my_membership')

    if (membership?.company_id) {
      // User is a team member, fetch the company they belong to
      const { data: memberCompany } = await supabase.rpc('get_company_by_id', { p_company_id: membership.company_id })
      
      if (memberCompany) {
        return {
          id: memberCompany.id,
          ownerUserId: memberCompany.owner_user_id,
          name: memberCompany.name,
          phone: memberCompany.phone,
          email: memberCompany.email,
          address: memberCompany.address,
          logoUrl: memberCompany.logo_url,
          settings: memberCompany.settings,
          createdAt: memberCompany.created_at,
          updatedAt: memberCompany.updated_at,
        }
      }
    }

    // Not a member of any company AND not an owner - create a new one
    // This only happens for new users who signed up directly (not via invite)
    const { data: newCompanyId, error: rpcError } = await supabase
      .rpc('create_company_for_user', { p_user_id: user.id, p_name: 'My Company' })

    if (!rpcError && newCompanyId) {
      // Fetch the newly created company
      const { data: createdCompany } = await supabase
        .from('companies')
        .select('*')
        .eq('id', newCompanyId)
        .single()
      
      if (createdCompany) {
        ownedCompany = createdCompany
      }
    }
  }

  if (ownedCompany) {
    return {
      id: ownedCompany.id,
      ownerUserId: ownedCompany.owner_user_id,
      name: ownedCompany.name,
      phone: ownedCompany.phone,
      email: ownedCompany.email,
      address: ownedCompany.address,
      logoUrl: ownedCompany.logo_url,
      settings: ownedCompany.settings,
      createdAt: ownedCompany.created_at,
      updatedAt: ownedCompany.updated_at,
    }
  }

  return null
}

export async function getMyMembership(): Promise<CompanyMember | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check if user is owner
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (company) {
    // Return synthetic owner membership
    return {
      id: 'owner',
      companyId: company.id,
      userId: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'Owner',
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  // Get membership record via RPC to bypass RLS
  const { data: membership, error } = await supabase
    .rpc('get_my_membership')

  if (error || !membership) return null

  return {
    id: membership.id,
    companyId: membership.company_id,
    userId: membership.user_id,
    email: membership.email,
    name: membership.name,
    phone: membership.phone,
    role: membership.role as Role,
    status: membership.status as MemberStatus,
    currentStatus: membership.current_status as WorkerStatus | undefined,
    currentJobId: membership.current_job_id,
    lastSeenAt: membership.last_seen_at,
    customPermissions: membership.custom_permissions,
    inviteToken: membership.invite_token,
    inviteSentAt: membership.invite_sent_at,
    inviteAcceptedAt: membership.invite_accepted_at,
    createdAt: membership.created_at,
    updatedAt: membership.updated_at,
  }
}

export async function getCompanyMembers(): Promise<CompanyMember[]> {
  const supabase = createClient()
  const company = await getCompany()
  if (!company) return []

  // Use RPC to bypass RLS
  const { data, error } = await supabase
    .rpc('get_company_members', { p_company_id: company.id })

  if (error) {
    console.error('Error fetching company members:', error)
    return []
  }

  return (data || []).map(m => ({
    id: m.id,
    companyId: m.company_id,
    userId: m.user_id,
    email: m.email,
    name: m.name,
    phone: m.phone,
    role: m.role as Role,
    status: m.status as MemberStatus,
    currentStatus: m.current_status as WorkerStatus | undefined,
    currentJobId: m.current_job_id,
    lastSeenAt: m.last_seen_at,
    customPermissions: m.custom_permissions,
    inviteToken: m.invite_token,
    inviteSentAt: m.invite_sent_at,
    inviteAcceptedAt: m.invite_accepted_at,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }))
}

export async function addCompanyMember(member: Omit<CompanyMember, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompanyMember | null> {
  const supabase = createClient()
  const company = await getCompany()
  if (!company) return null

  // Use RPC function to bypass RLS - returns full member row
  const { data, error: rpcError } = await supabase
    .rpc('add_company_member', {
      p_company_id: company.id,
      p_email: member.email,
      p_name: member.name,
      p_phone: member.phone || null,
      p_role: member.role,
    })

  if (rpcError || !data) {
    console.error('Error adding company member:', rpcError)
    return null
  }

  // RPC returns full member row
  const m = data
  return {
    id: m.id,
    companyId: m.company_id,
    userId: m.user_id,
    email: m.email,
    name: m.name,
    phone: m.phone,
    role: m.role as Role,
    status: m.status as MemberStatus,
    inviteToken: m.invite_token,
    inviteSentAt: m.invite_sent_at,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }
}

export async function updateCompanyMember(
  memberId: string, 
  updates: Partial<Pick<CompanyMember, 'name' | 'phone' | 'role' | 'status' | 'customPermissions' | 'currentStatus' | 'currentJobId'>>
): Promise<boolean> {
  const supabase = createClient()

  // Use RPC to bypass RLS
  const { data, error } = await supabase.rpc('update_company_member', {
    p_member_id: memberId,
    p_name: updates.name || null,
    p_phone: updates.phone || null,
    p_role: updates.role || null,
    p_status: updates.status || null,
  })

  if (error) {
    console.error('Error updating company member:', error)
    return false
  }

  return data === true
}

export async function deleteCompanyMember(memberId: string): Promise<boolean> {
  const supabase = createClient()

  // Use RPC to bypass RLS
  const { data, error } = await supabase.rpc('delete_company_member', {
    p_member_id: memberId,
  })

  if (error) {
    console.error('Error deleting company member:', error)
    return false
  }

  return data === true
}

// =============================================================================
// Job Assignment Functions
// =============================================================================

export async function getJobAssignments(jobId: string): Promise<JobAssignment[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('job_assignments')
    .select('*')
    .eq('job_id', jobId)

  if (error) {
    console.error('Error fetching job assignments:', error)
    return []
  }

  return (data || []).map(a => ({
    id: a.id,
    jobId: a.job_id,
    memberId: a.member_id,
    status: a.status,
    assignedAt: a.assigned_at,
    startedAt: a.started_at,
    completedAt: a.completed_at,
    notes: a.notes,
  }))
}

export async function assignWorkerToJob(jobId: string, memberId: string): Promise<JobAssignment | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('job_assignments')
    .insert({
      job_id: jobId,
      member_id: memberId,
      status: 'assigned',
    })
    .select()
    .single()

  if (error) {
    console.error('Error assigning worker to job:', error)
    return null
  }

  return {
    id: data.id,
    jobId: data.job_id,
    memberId: data.member_id,
    status: data.status,
    assignedAt: data.assigned_at,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    notes: data.notes,
  }
}

export async function updateJobAssignment(
  assignmentId: string,
  updates: Partial<Pick<JobAssignment, 'status' | 'startedAt' | 'completedAt' | 'notes'>>
): Promise<boolean> {
  const supabase = createClient()

  const updateData: any = {}
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.startedAt !== undefined) updateData.started_at = updates.startedAt
  if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt
  if (updates.notes !== undefined) updateData.notes = updates.notes

  const { error } = await supabase
    .from('job_assignments')
    .update(updateData)
    .eq('id', assignmentId)

  if (error) {
    console.error('Error updating job assignment:', error)
    return false
  }

  return true
}

export async function removeWorkerFromJob(jobId: string, memberId: string): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase
    .from('job_assignments')
    .delete()
    .eq('job_id', jobId)
    .eq('member_id', memberId)

  if (error) {
    console.error('Error removing worker from job:', error)
    return false
  }

  return true
}

export async function getMyAssignedJobs(): Promise<string[]> {
  const supabase = createClient()
  const membership = await getMyMembership()
  if (!membership || membership.id === 'owner') return []

  const { data, error } = await supabase
    .from('job_assignments')
    .select('job_id')
    .eq('member_id', membership.id)
    .in('status', ['assigned', 'on_the_way', 'working'])

  if (error) {
    console.error('Error fetching assigned jobs:', error)
    return []
  }

  return (data || []).map(a => a.job_id)
}

// =============================================================================
// Time Entry Functions
// =============================================================================

export async function startTimeEntry(jobId: string, entryType: 'travel' | 'work' | 'break'): Promise<TimeEntry | null> {
  const supabase = createClient()
  const membership = await getMyMembership()
  if (!membership) return null

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      member_id: membership.id,
      job_id: jobId,
      entry_type: entryType,
      start_time: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error starting time entry:', error)
    return null
  }

  return {
    id: data.id,
    memberId: data.member_id,
    jobId: data.job_id,
    entryType: data.entry_type,
    startTime: data.start_time,
    endTime: data.end_time,
    durationMinutes: data.duration_minutes,
    notes: data.notes,
    createdAt: data.created_at,
  }
}

export async function endTimeEntry(entryId: string): Promise<boolean> {
  const supabase = createClient()

  const { data: entry } = await supabase
    .from('time_entries')
    .select('start_time')
    .eq('id', entryId)
    .single()

  if (!entry) return false

  const startTime = new Date(entry.start_time)
  const endTime = new Date()
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000)

  const { error } = await supabase
    .from('time_entries')
    .update({
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq('id', entryId)

  if (error) {
    console.error('Error ending time entry:', error)
    return false
  }

  return true
}

export async function getTimeEntriesForJob(jobId: string): Promise<TimeEntry[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('job_id', jobId)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('Error fetching time entries:', error)
    return []
  }

  return (data || []).map(e => ({
    id: e.id,
    memberId: e.member_id,
    jobId: e.job_id,
    entryType: e.entry_type,
    startTime: e.start_time,
    endTime: e.end_time,
    durationMinutes: e.duration_minutes,
    notes: e.notes,
    createdAt: e.created_at,
  }))
}

export async function getMyTimeEntriesToday(): Promise<TimeEntry[]> {
  const supabase = createClient()
  const membership = await getMyMembership()
  if (!membership) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('member_id', membership.id)
    .gte('start_time', today.toISOString())
    .order('start_time', { ascending: true })

  if (error) {
    console.error('Error fetching my time entries:', error)
    return []
  }

  return (data || []).map(e => ({
    id: e.id,
    memberId: e.member_id,
    jobId: e.job_id,
    entryType: e.entry_type,
    startTime: e.start_time,
    endTime: e.end_time,
    durationMinutes: e.duration_minutes,
    notes: e.notes,
    createdAt: e.created_at,
  }))
}
