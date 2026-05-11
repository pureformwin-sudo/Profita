import { createClient } from '@/lib/supabase/client'

export type Mode = 'admin' | 'crew' | 'sales_rep'

export interface RoleInfo {
  /** All modes this user is allowed to use. */
  availableModes: Mode[]
  /** The workspace owner this user belongs to. For owners this is their own auth id. */
  ownerUserId: string | null
  /** The employees row id when this user is a sales rep or crew member. */
  employeeId: string | null
  /** The current user's auth id. */
  userId: string | null
}

const EMPTY: RoleInfo = {
  availableModes: [],
  ownerUserId: null,
  employeeId: null,
  userId: null,
}

/**
 * Returns the modes a user is allowed to enter and the workspace they belong to.
 *
 * Resolution rules:
 *   - Anyone with their own auth user that isn't a linked rep or crew member is treated as the workspace owner -> 'admin' mode.
 *   - sales_rep_users row -> 'sales_rep' mode is added (workspace = sales_rep_users.owner_user_id).
 *   - crew_users row -> 'crew' mode is added (workspace = crew_users.owner_user_id).
 *
 * A single auth user CAN have multiple modes (e.g. a small-shop owner who also canvasses can flip to Sales Rep).
 */
export async function getCurrentRoleInfo(): Promise<RoleInfo> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY

  const modes = new Set<Mode>()
  let ownerUserId: string | null = null
  let employeeId: string | null = null

  // Probe sales_rep_users link
  const { data: repRow } = await supabase
    .from('sales_rep_users')
    .select('employee_id, owner_user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (repRow) {
    modes.add('sales_rep')
    ownerUserId = repRow.owner_user_id
    employeeId = repRow.employee_id
  }

  // Probe crew_users link (table may not exist yet on first deploy)
  const { data: crewRow, error: crewErr } = await supabase
    .from('crew_users')
    .select('employee_id, owner_user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  // 42P01 = table does not exist (migration not run yet) — silently ignore so admin still works
  if (!crewErr || crewErr.code === '42P01') {
    if (crewRow) {
      modes.add('crew')
      ownerUserId = ownerUserId || crewRow.owner_user_id
      employeeId = employeeId || crewRow.employee_id
    }
  }

  // If user has any data they own (customers/jobs/etc.) OR isn't linked as rep/crew, they can use Admin mode.
  // Cheapest probe: count of customers owned by this user.
  const { count: ownedCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const isLinkedOnly = !!(repRow || crewRow)
  const looksLikeOwner = !isLinkedOnly || (ownedCustomers ?? 0) > 0
  if (looksLikeOwner) {
    modes.add('admin')
    // Admins can also use Salesforce (sales_rep mode) to canvass or demo the feature
    modes.add('sales_rep')
    ownerUserId = ownerUserId || user.id
  }

  return {
    availableModes: Array.from(modes),
    ownerUserId: ownerUserId || user.id,
    employeeId,
    userId: user.id,
  }
}

/** Default landing route for a given mode. */
export function defaultRouteForMode(mode: Mode): string {
  switch (mode) {
    case 'sales_rep': return '/sales'
    case 'crew': return '/crew'
    case 'admin':
    default: return '/'
  }
}

const MODE_STORAGE_KEY = 'profita:mode'

/**
 * Reads the user's persisted mode preference.
 * Tries database first, falls back to localStorage if table doesn't exist.
 */
export async function readModePreference(userId: string): Promise<Mode | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_mode_preference')
    .select('current_mode')
    .eq('user_id', userId)
    .maybeSingle()
  
  // If table exists and we got data, use it
  if (!error && data?.current_mode) {
    return data.current_mode as Mode
  }
  
  // Fallback to localStorage (table may not exist yet)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${MODE_STORAGE_KEY}:${userId}`)
    if (stored && ['admin', 'sales_rep', 'crew'].includes(stored)) {
      return stored as Mode
    }
  }
  
  return null
}

export async function writeModePreference(userId: string, mode: Mode): Promise<boolean> {
  // Always save to localStorage as fallback (works immediately)
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${MODE_STORAGE_KEY}:${userId}`, mode)
  }
  
  // Try to save to database (may fail if table doesn't exist)
  const supabase = createClient()
  const { error } = await supabase
    .from('user_mode_preference')
    .upsert({ user_id: userId, current_mode: mode, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  
  // Return true even if DB save fails - localStorage worked
  if (error) {
    console.warn('[Mode] Could not save to database (table may not exist), using localStorage:', error.message)
  }
  return true
}
