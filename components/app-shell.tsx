'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  FileText, 
  Receipt, 
  BarChart3, 
  Settings, 
  Menu, 
  X, 
  LogOut, 
  CalendarDays,
  Users2,
  DollarSign,
  Plus,
  Bell,
  Shield,
  Sparkles,
  Repeat,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { useMode } from '@/lib/mode-context'
import { ModeSwitcher } from '@/components/mode-switcher'

import { CrewShell } from '@/components/crew-shell'
import { QuickAddButton } from '@/components/quick-add-button'
import { createClient, clearUserCache } from '@/lib/supabase/client'
import { getUnreadNotificationCount } from '@/lib/in-app-notifications'
import { Badge } from '@/components/ui/badge'
import { usePermissions } from '@/lib/permissions-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { AskAIFloating } from '@/components/ai/ask-ai-floating'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'

import type { Permission } from '@/lib/permissions'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  premium?: boolean
  requiredPermission?: Permission
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: FileText, requiredPermission: 'view_invoices' },
  { href: '/transactions', label: 'Finances', icon: Receipt, requiredPermission: 'view_finances' },
  { href: '/analytics', label: 'Reports', icon: BarChart3, requiredPermission: 'view_reports' },
  { href: '/calendar', label: 'Schedule', icon: CalendarDays },
  { href: '/team', label: 'Team', icon: Users2, requiredPermission: 'manage_team' },
  { href: '/plans', label: 'Plans', icon: Repeat, requiredPermission: 'manage_service_plans' },
  { href: '/ai-growth', label: 'AI Growth', icon: Sparkles, premium: true, requiredPermission: 'use_ai_growth' },
]

const adminItems: NavItem[] = [
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/users', label: 'User Management', icon: Shield, adminOnly: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()
  const { currentMode, loading: modeLoading } = useMode()

  // Use the new permissions system
  const { isOwner, isAdmin, hasPermission, loading: permissionsLoading } = usePermissions()
  const [mounted, setMounted] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  
  // Mark as mounted after first render
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load unread notification count and trigger daily reminders
  useEffect(() => {
    if (!user) return
    const loadUnread = async () => {
      const count = await getUnreadNotificationCount()
      setUnreadCount(count)
    }
    loadUnread()
    // Refresh every 15 seconds for more responsive updates
    const interval = setInterval(loadUnread, 15000)
    return () => clearInterval(interval)
  }, [user])

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const userInitials = userName.slice(0, 2).toUpperCase()

  

  // Note: Sales Rep mode pages use /sales/layout.tsx which wraps with SalesforceShell directly.
  // Crew mode pages also have their own shell. This admin shell is only for admin mode pages.
  // If the user is in sales_rep or crew mode but viewing an admin page (like settings),
  // we show the admin shell - navigation handles routing to the correct mode-specific pages.
  if (!modeLoading && currentMode === 'crew' && !pathname?.startsWith('/sales') && !pathname?.startsWith('/settings')) {
    return <CrewShell>{children}</CrewShell>
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('profita:approvalStatus')
    clearUserCache()
    logout()
  }

  // Build menu items based on permissions
  // During SSR/loading, show all items to prevent hydration mismatch
  // Permissions filter only applies after client-side loading is complete
  const allItems = useMemo(() => {
    // Before mount or during permissions loading, show all nav items
    // This prevents hydration mismatch since server always shows all items
    if (!mounted || permissionsLoading) {
      return [...navItems, ...adminItems]
    }
    
    // Owner ALWAYS sees everything - no filtering
    if (isOwner) {
      return [...navItems, ...adminItems]
    }
    
    // After permissions load, filter based on actual permissions
    return [...navItems, ...(isAdmin ? adminItems : [])].filter(item => {
      if (item.adminOnly && !isAdmin) return false
      if (item.requiredPermission && !hasPermission(item.requiredPermission)) return false
      return true
    })
  }, [mounted, permissionsLoading, isOwner, isAdmin, hasPermission])

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center px-4 lg:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mr-6">
            <Image 
              src="/logo.png" 
              alt="Profita" 
              width={32} 
              height={32} 
              className="rounded-lg w-8 h-8"
            />
            <span className="text-lg font-semibold tracking-tight hidden sm:block">Profita</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0" suppressHydrationWarning>
            {allItems.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              const premium = 'premium' in item && !!(item as { premium?: boolean }).premium
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                    active
                      ? premium
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-foreground'
                      : premium
                        ? 'text-primary/80 hover:text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  )}
                >
                  <Icon className={cn('h-4 w-4', premium && 'text-primary')} />
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {/* Salesforce button - always visible for admin users */}
            <Link
              href="/sales"
              className="h-9 gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all px-4 rounded-md font-semibold text-sm flex items-center"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Salesforce</span>
            </Link>

            {/* Notifications */}
            <Link
              href="/notifications"
              className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Quick Add - Desktop */}
            <QuickAddButton />

            {/* User Menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full p-1 hover:bg-secondary transition-colors">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-sm font-semibold">
                      {userInitials}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleLogout} 
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Mobile Menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  {/* Mobile Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2.5">
<Image
                    src="/logo.png"
                    alt="Profita"
                    width={32}
                    height={32}
                    className="rounded-lg w-8 h-8"
                  />
                      <span className="text-lg font-semibold">Profita</span>
                    </div>
                  </div>

                  {/* Mobile Navigation */}
                  <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {allItems.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {item.label}
                        </Link>
                      )
                    })}
                  </nav>

                  {/* Mobile User Section */}
                  {user && (
                    <div className="border-t border-border p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-semibold">
                          {userInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{userName}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign out
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-[calc(100vh-3.5rem)] pb-20 lg:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Global Ask AI - positioned above mobile nav */}
      <AskAIFloating />
    </div>
  )
}
