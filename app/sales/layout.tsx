'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Map,
  Users,
  BarChart3,
  Trophy,
  CalendarCheck,
  FileText,
  ChevronLeft,
  Settings,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Bottom nav items for mobile - always visible
const NAV_ITEMS = [
  { href: '/sales', icon: Home, label: 'Home', exact: true },
  { href: '/sales/map', icon: Map, label: 'Map' },
  { href: '/sales/leads', icon: Users, label: 'Leads' },
  { href: '/sales/my-stats', icon: BarChart3, label: 'Stats' },
  { href: '/sales/more', icon: MoreHorizontal, label: 'More' },
]

// Sidebar items for desktop
const SIDEBAR_ITEMS = [
  { href: '/sales', icon: Home, label: 'Home', exact: true },
  { href: '/sales/map', icon: Map, label: 'Sales Map' },
  { href: '/sales/leads', icon: Users, label: 'Leads' },
  { href: '/sales/pipeline', icon: FileText, label: 'Pipeline' },
  { href: '/sales/follow-ups', icon: CalendarCheck, label: 'Follow Ups' },
  { href: '/sales/my-stats', icon: BarChart3, label: 'My Stats' },
  { href: '/sales/leaderboard', icon: Trophy, label: 'Leaderboard' },
]

// Page titles for mobile header
const PAGE_TITLES: Record<string, string> = {
  '/sales': 'Home',
  '/sales/map': 'Sales Map',
  '/sales/leads': 'Leads',
  '/sales/pipeline': 'Pipeline',
  '/sales/follow-ups': 'Follow Ups',
  '/sales/my-stats': 'My Stats',
  '/sales/leaderboard': 'Leaderboard',
  '/sales/bookings': 'Bookings',
  '/sales/quotes': 'Quotes',
  '/sales/quotes/new': 'New Quote',
  '/sales/more': 'More',
  '/sales/settings': 'Settings',
  '/sales/notifications': 'Notifications',
  '/sales/help': 'Help & Support',
}

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMapPage = pathname === '/sales/map'
  
  // Get page title
  const pageTitle = PAGE_TITLES[pathname] || 'SalesHub'

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col">
      {/* Top Header (Mobile) - Fixed height, always visible */}
      <header className="lg:hidden shrink-0 sticky top-0 z-40 bg-zinc-900/95 backdrop-blur-xl border-b border-zinc-800 safe-area-pt">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-zinc-400 hover:text-white active:text-white">
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Admin</span>
          </Link>
          <span className="text-base font-bold text-white">{pageTitle}</span>
          <Link href="/sales/more" className="p-2 -mr-2 text-zinc-400 hover:text-white active:text-white">
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Desktop Sidebar + Content Container */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-zinc-900/50 border-r border-zinc-800">
          {/* Logo */}
          <div className="h-16 px-4 flex items-center border-b border-zinc-800 shrink-0">
            <Link href="/sales" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Map className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white">SalesHub</p>
                <p className="text-xs text-zinc-500">Profita Sales</p>
              </div>
            </Link>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1 overflow-auto">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  )}
                >
                  <Icon className={cn('h-5 w-5', isActive && 'text-emerald-400')} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-800 shrink-0">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
              Back to Admin
            </Link>
          </div>
        </aside>

        {/* Main Content - Flex container for proper height management */}
        <main className={cn(
          'flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden',
          // On mobile, account for bottom nav (64px) + safe area
          'lg:min-h-screen'
        )}>
          {/* Content wrapper with proper overflow */}
          <div className={cn(
            'flex-1 min-h-0',
            // Map page needs special handling - no scroll, fixed layout
            isMapPage ? 'flex flex-col overflow-hidden' : 'overflow-auto pb-20 lg:pb-0'
          )}>
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Nav (Mobile) - ALWAYS visible, fixed at bottom */}
      <nav className="lg:hidden shrink-0 fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 safe-area-pb">
        <div className="flex items-center justify-around h-16 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact 
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[60px] rounded-xl transition-colors',
                  isActive ? 'text-emerald-400' : 'text-zinc-500 active:text-white'
                )}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-emerald-400')} />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
