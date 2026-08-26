'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// NOTE: this list must stay in sync with the server-side allowlist in
// lib/supabase/middleware.ts. Middleware alone is not enough — this provider
// redirects unauthenticated visitors client-side, so a route missing here
// renders correctly on the server and then bounces to /login in the browser.
const publicPaths = ['/login', '/signup', '/forgot-password', '/auth/callback', '/invite', '/pay', '/portal', '/worker', '/pending-approval', '/reports', '/sign']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const [supabase] = useState(() => {
    if (typeof window === 'undefined') {
      return null
    }
    return createClient()
  })

  useEffect(() => {
    if (!supabase) return

    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setIsLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (isLoading) return

    const isPublicPath = publicPaths.some(path => pathname.startsWith(path))
    
    if (!user && !isPublicPath) {
      router.push('/login')
    } else if (user && (pathname === '/login' || pathname === '/signup')) {
      router.push('/')
    }
  }, [user, isLoading, pathname, router])

  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
