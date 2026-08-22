/**
 * Shared normalizer for the `get_my_membership` RPC.
 *
 * WHY THIS EXISTS
 * ---------------
 * `get_my_membership` is declared `RETURNS TABLE (...)` in Postgres, so
 * supabase-js resolves it to an ARRAY of rows, not a single object.
 *
 * Reading `data?.company_id` straight off that array is always `undefined`.
 * That silently broke every "which company do I belong to?" lookup for invited
 * team members: they fell through to the owner/auto-create path and ended up
 * scoped to an empty auto-created "My Company" instead of the real tenant, so
 * jobs, plans, payroll, payments, commissions and notifications all looked
 * empty to them.
 *
 * The same two-line mistake was independently duplicated across ~14 call sites,
 * which is exactly why it went unnoticed. Route every caller through this
 * helper instead of re-deriving the shape locally.
 *
 * It intentionally accepts both shapes so it keeps working if the SQL function
 * is ever changed to return a single row / JSON object.
 */
export type MembershipRow = {
  id?: string | null
  company_id?: string | null
  user_id?: string | null
  email?: string | null
  name?: string | null
  phone?: string | null
  role?: string | null
  status?: string | null
  [key: string]: unknown
}

/** Narrow a `get_my_membership` result to a single row (or null). */
export function normalizeMembership(data: unknown): MembershipRow | null {
  if (!data) return null
  const row = Array.isArray(data) ? data[0] : data
  return (row as MembershipRow) ?? null
}

/**
 * Minimal shape we need from a Supabase client. Keeping this structural avoids
 * coupling to whether the caller passes a browser or server client.
 */
type RpcCapableClient = {
  rpc: (fn: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/** Call `get_my_membership` and return a single normalized row (or null). */
export async function fetchMyMembership(supabase: RpcCapableClient): Promise<MembershipRow | null> {
  const { data, error } = await supabase.rpc('get_my_membership')
  if (error) return null
  return normalizeMembership(data)
}

/**
 * Convenience for the most common use: the company id the current user belongs
 * to as a team member. Returns null when they aren't a member of one.
 */
export async function fetchMyMembershipCompanyId(supabase: RpcCapableClient): Promise<string | null> {
  const row = await fetchMyMembership(supabase)
  return row?.company_id ?? null
}
