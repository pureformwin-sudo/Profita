'use client'

import { useEffect, useState } from 'react'
import { createClient, getCachedUser } from '@/lib/supabase/client'
import { usePathname, useRouter } from 'next/navigation'
import { Clock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ApprovalGateProps {
  children: React.ReactNode
}

// Pages that don't require approval (or have their own auth handling)
// Note: '/' must be exact match, others use startsWith
// Keep in sync with publicPaths in components/auth-provider.tsx and the
// server-side allowlist in lib/supabase/middleware.ts. '/sign' is the public
// contract-signing route, gated by an unguessable share token instead of auth.
const PUBLIC_PATHS = ['/', '/login', '/signup', '/pending', '/worker', '/book', '/pay', '/api', '/rep', '/sales', '/crew', '/onboarding', '/invite', '/portal', '/auth', '/reports', '/sign']

type GateStatus = 'loading' | 'approved' | 'pending' | 'rejected' | 'no-auth'

// Module-level cache: once we verify a user is approved, we don't re-query
// the DB on every navigation. Keyed by user id, cleared on auth changes.
const approvalCache = new Map<string, Exclude<GateStatus, 'loading'>>()

export function ApprovalGate({ children }: ApprovalGateProps) {
  const pathname = usePathname()
  const router = useRouter()
  
  // Check if on public path - this is known on both server and client
  // '/' must be exact match, others use startsWith
  const isPublicPath = pathname === '/' || PUBLIC_PATHS.slice(1).some((p) => pathname.startsWith(p))
  
  // Always start as 'approved' on public paths or 'loading' elsewhere to prevent hydration mismatch.
  // sessionStorage read happens in useEffect after mount.
  const [status, setStatus] = useState<GateStatus>(isPublicPath ? 'approved' : 'loading')
  const [mounted, setMounted] = useState(false)

  // After mount, read from sessionStorage for instant navigation on protected pages
  useEffect(() => {
    setMounted(true)
    if (isPublicPath) {
      setStatus('approved')
      return
    }
    // Check sessionStorage cache first
    const cached = sessionStorage.getItem('profita:approvalStatus')
    if (cached === 'approved' || cached === 'pending' || cached === 'rejected' || cached === 'no-auth') {
      setStatus(cached)
    }
    checkApproval()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  async function checkApproval() {
    const user = await getCachedUser()

    if (!user) {
      setStatus('no-auth')
      return
    }

    // Use module cache if we already checked this user this session.
    const cached = approvalCache.get(user.id)
    if (cached) {
      setStatus(cached)
      sessionStorage.setItem('profita:approvalStatus', cached)
      return
    }

    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, is_admin')
      .eq('id', user.id)
      .single()

    let next: Exclude<GateStatus, 'loading'> = 'approved'

    if (!profile || profile.status === undefined || profile.status === null || profile.is_admin) {
      next = 'approved'
    } else if (profile.status === 'approved') {
      // Check if this user is a sales rep - if so, redirect to /rep
      if (!pathname.startsWith('/rep')) {
        const { data: salesRep } = await supabase
          .from('sales_rep_users')
          .select('id')
          .eq('user_id', user.id)
          .single()
        if (salesRep) {
          router.replace('/rep')
          return
        }
      }
      next = 'approved'
    } else if (profile.status === 'rejected') {
      next = 'rejected'
    } else {
      next = 'pending'
    }

    approvalCache.set(user.id, next)
    sessionStorage.setItem('profita:approvalStatus', next)
    setStatus(next)
  }

  async function handleLogout() {
    const supabase = createClient()
    approvalCache.clear()
    sessionStorage.removeItem('profita:approvalStatus')
    sessionStorage.removeItem('profita:isAdmin')
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Show loading only after mount to prevent hydration mismatch
  if (status === 'loading' && mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }
  
  // During SSR or before mount, render children to prevent hydration mismatch
  if (status === 'loading' && !mounted) {
    return <>{children}</>
  }

  if (status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pending Approval</h1>
            <p className="text-muted-foreground mt-2">
              Your account is waiting for admin approval. You&apos;ll get access once approved.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <span className="text-3xl">✕</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground mt-2">
              Your sign-up request was not approved. Contact the admin if you think this is a mistake.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
