import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Singleton browser client — creating a new one per call leads to multiple
// auth lock holders and causes "Lock broken by another request" errors when
// many storage functions run in parallel.
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}

// Cached current user. All parallel callers share the same promise so only
// ONE auth lock acquisition happens per page session.
let _userPromise: Promise<User | null> | null = null

export function getCachedUser(): Promise<User | null> {
  if (_userPromise) return _userPromise
  const supabase = createClient()
  _userPromise = supabase.auth.getUser().then(
    ({ data }) => data.user,
    () => null,
  )
  return _userPromise
}

// Clear cached user (on sign out or auth state change)
export function clearUserCache() {
  _userPromise = null
}

// Listen for auth state changes once and invalidate the cache
if (typeof window !== 'undefined') {
  const client = createClient()
  client.auth.onAuthStateChange(() => {
    _userPromise = null
  })
}
