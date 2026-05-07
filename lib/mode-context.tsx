'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth-provider'
import { getCurrentRoleInfo, readModePreference, writeModePreference, defaultRouteForMode, type Mode, type RoleInfo } from '@/lib/get-current-role'

interface ModeContextValue extends RoleInfo {
  /** Currently selected mode, or null while resolving on first load. */
  currentMode: Mode | null
  /** Switch to a different mode and persist the choice. Navigates to the mode's default route. */
  setMode: (mode: Mode) => Promise<void>
  /** True until the very first mode resolution completes. */
  loading: boolean
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined)

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>')
  return ctx
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const [roleInfo, setRoleInfo] = useState<RoleInfo>({
    availableModes: [],
    ownerUserId: null,
    employeeId: null,
    userId: null,
  })
  const [currentMode, setCurrentMode] = useState<Mode | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Track if we've already resolved for this user to avoid re-fetching on every render
  const resolvedUserIdRef = useRef<string | null>(null)

  // Resolve role info ONLY when user identity changes (not on every navigation)
  useEffect(() => {
    let cancelled = false

    if (authLoading) return

    if (!user) {
      // Logged out — clear state
      setRoleInfo({ availableModes: [], ownerUserId: null, employeeId: null, userId: null })
      setCurrentMode(null)
      setLoading(false)
      resolvedUserIdRef.current = null
      return
    }

    // Skip if we've already resolved for this exact user to avoid re-fetching on navigation
    if (resolvedUserIdRef.current === user.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    ;(async () => {
      const info = await getCurrentRoleInfo()
      if (cancelled) return
      setRoleInfo(info)
      resolvedUserIdRef.current = user.id

      if (info.availableModes.length === 0) {
        setCurrentMode(null)
        setLoading(false)
        return
      }

      const stored = info.userId ? await readModePreference(info.userId) : null
      const resolved: Mode =
        stored && info.availableModes.includes(stored)
          ? stored
          : info.availableModes.includes('admin')
            ? 'admin'
            : info.availableModes[0]
      if (!cancelled) {
        setCurrentMode(resolved)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, authLoading])

  const setMode = useCallback(async (mode: Mode) => {
    if (!roleInfo.availableModes.includes(mode)) {
      toast.error('You do not have access to that mode.')
      return
    }
    if (!roleInfo.userId) return
    
    // Update state immediately for instant UI feedback
    setCurrentMode(mode)
    
    // Persist in background
    const ok = await writeModePreference(roleInfo.userId, mode)
    if (!ok) {
      toast.error('Could not save mode preference.')
      return
    }
    
    toast.success(`Switched to ${mode === 'sales_rep' ? 'Salesforce' : mode === 'crew' ? 'Crew' : 'Admin'} mode`)
    router.push(defaultRouteForMode(mode))
  }, [roleInfo, router])

  const value = useMemo<ModeContextValue>(() => ({
    ...roleInfo,
    currentMode,
    setMode,
    loading,
  }), [roleInfo, currentMode, setMode, loading])

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}
