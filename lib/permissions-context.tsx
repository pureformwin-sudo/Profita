'use client'

import { createContext, useContext, useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { useAuth } from '@/components/auth-provider'
import { 
  Company, 
  CompanyMember, 
  Permission, 
  Role,
  getCompany, 
  getMyMembership, 
  hasPermission as checkPermission,
  hasAnyPermission as checkAnyPermission,
  getEffectivePermissions,
  ROLE_DEFAULTS,
} from '@/lib/permissions'

interface PermissionsContextValue {
  /** Current company */
  company: Company | null
  /** Current user's membership */
  membership: CompanyMember | null
  /** Current user's role */
  role: Role | null
  /** Whether the current user is the owner */
  isOwner: boolean
  /** Whether the current user can access admin features */
  isAdmin: boolean
  /** All permissions the current user has */
  permissions: Permission[]
  /** Check if user has a specific permission */
  hasPermission: (permission: Permission) => boolean
  /** Check if user has any of the specified permissions */
  hasAnyPermission: (permissions: Permission[]) => boolean
  /** Loading state */
  loading: boolean
  /** Refresh permissions */
  refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined)

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>')
  return ctx
}

/**
 * Hook to check a permission - returns false if no context (e.g., during SSR)
 */
export function useCan(permission: Permission): boolean {
  const ctx = useContext(PermissionsContext)
  if (!ctx) return false
  return ctx.hasPermission(permission)
}

/**
 * Hook to check multiple permissions - returns true if user has ANY of them
 */
export function useCanAny(permissions: Permission[]): boolean {
  const ctx = useContext(PermissionsContext)
  if (!ctx) return false
  return ctx.hasAnyPermission(permissions)
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [membership, setMembership] = useState<CompanyMember | null>(null)
  const [loading, setLoading] = useState(true)
  const resolvedUserIdRef = useRef<string | null>(null)

  const loadPermissions = async () => {
    if (!user) {
      setCompany(null)
      setMembership(null)
      setLoading(false)
      resolvedUserIdRef.current = null
      return
    }

    // Skip if already resolved for this user
    if (resolvedUserIdRef.current === user.id && !loading) {
      return
    }

    setLoading(true)
    try {
      const [companyData, membershipData] = await Promise.all([
        getCompany(),
        getMyMembership(),
      ])
      console.log('[v0] Permissions loaded for user:', user.id, {
        company: companyData?.id,
        membership: membershipData?.id,
        role: membershipData?.role,
        isOwnerByCompany: companyData?.ownerUserId === user.id
      })
      setCompany(companyData)
      setMembership(membershipData)
      resolvedUserIdRef.current = user.id
    } catch (error) {
      console.error('Error loading permissions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    loadPermissions()
  }, [user?.id, authLoading])

  const value = useMemo<PermissionsContextValue>(() => {
    const role = membership?.role || null
    // User is owner if:
    // 1. They have a membership with role 'owner', OR
    // 2. They own the company (company.ownerUserId === user.id)
    const isOwner = role === 'owner' || 
      (company !== null && user !== null && company.ownerUserId === user.id)
    const isAdmin = isOwner || role === 'admin'
    const permissions = membership ? getEffectivePermissions(membership) : []

    return {
      company,
      membership,
      role,
      isOwner,
      isAdmin,
      permissions,
      hasPermission: (permission: Permission) => {
        // Owner has all permissions
        if (isOwner) return true
        if (!membership) return false
        return checkPermission(membership, permission)
      },
      hasAnyPermission: (permissions: Permission[]) => {
        // Owner has all permissions
        if (isOwner) return true
        if (!membership) return false
        return checkAnyPermission(membership, permissions)
      },
      loading,
      refresh: loadPermissions,
    }
  }, [company, membership, loading, user])

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

/**
 * Component that only renders children if user has the specified permission
 */
export function Can({ 
  permission, 
  children, 
  fallback = null 
}: { 
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}) {
  const { hasPermission, loading } = usePermissions()
  
  if (loading) return null
  if (!hasPermission(permission)) return <>{fallback}</>
  return <>{children}</>
}

/**
 * Component that only renders children if user has ANY of the specified permissions
 */
export function CanAny({ 
  permissions, 
  children, 
  fallback = null 
}: { 
  permissions: Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { hasAnyPermission, loading } = usePermissions()
  
  if (loading) return null
  if (!hasAnyPermission(permissions)) return <>{fallback}</>
  return <>{children}</>
}

/**
 * Component that only renders children if user is owner or admin
 */
export function AdminOnly({ 
  children, 
  fallback = null 
}: { 
  children: ReactNode
  fallback?: ReactNode
}) {
  const { isAdmin, loading } = usePermissions()
  
  if (loading) return null
  if (!isAdmin) return <>{fallback}</>
  return <>{children}</>
}

/**
 * Component that only renders children if user is owner
 */
export function OwnerOnly({ 
  children, 
  fallback = null 
}: { 
  children: ReactNode
  fallback?: ReactNode
}) {
  const { isOwner, loading } = usePermissions()
  
  if (loading) return null
  if (!isOwner) return <>{fallback}</>
  return <>{children}</>
}
