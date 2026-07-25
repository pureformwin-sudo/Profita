'use client'

// =============================================================================
// Active Job Timer context
// =============================================================================
// Holds the current user's running timer so the global active-job bar, the job
// drawer, and the Jobs list all read the SAME reconciled server state.
//
// Reconciliation strategy (see spec 18 - Reliability):
//  - Server timestamps are the only source of truth.
//  - A 1s tick re-renders the DERIVED elapsed value; it never accumulates.
//  - We re-fetch on mount, on window focus, on visibilitychange (phone unlock /
//    tab restore), on network reconnect, and on a slow safety interval.
// That combination is what keeps the timer correct after refresh, screen lock,
// backgrounding, or a temporary connection drop.
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getMyActiveTimer, type ActiveTimer } from '@/lib/job-timer-storage'
import { useAuth } from '@/components/auth-provider'

interface JobTimerContextValue {
  active: ActiveTimer | null
  loading: boolean
  tableMissing: boolean
  /** Re-reads the running timer from the server. */
  refresh: () => Promise<void>
}

const JobTimerContext = createContext<JobTimerContextValue>({
  active: null,
  loading: false,
  tableMissing: false,
  refresh: async () => {},
})

export function JobTimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [active, setActive] = useState<ActiveTimer | null>(null)
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setActive(null)
      setLoading(false)
      return
    }
    try {
      const { active: a, tableMissing: missing } = await getMyActiveTimer()
      setActive(a)
      setTableMissing(missing)
    } catch (err) {
      // Offline or transient failure: keep showing the last known timer rather
      // than wrongly implying the timer stopped.
      console.error('[JobTimer] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return

    // Reconcile whenever the app could have missed time (lock screen, tab
    // switch, sleep) and when connectivity returns.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisible)

    // Safety net for a page left open in the foreground.
    const interval = setInterval(refresh, 60_000)

    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [user, refresh])

  return (
    <JobTimerContext.Provider value={{ active, loading, tableMissing, refresh }}>
      {children}
    </JobTimerContext.Provider>
  )
}

export function useJobTimer() {
  return useContext(JobTimerContext)
}

/**
 * Returns a value that changes every `intervalMs` so components re-render and
 * recompute elapsed time from timestamps. Pass enabled=false to stop ticking
 * when nothing is running (avoids needless renders).
 */
export function useNow(enabled: boolean = true, intervalMs: number = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])

  return now
}
