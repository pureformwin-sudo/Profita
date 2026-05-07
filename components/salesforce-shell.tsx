'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { useMode } from '@/lib/mode-context'
import { createClient, clearUserCache } from '@/lib/supabase/client'
import {
  Home,
  Map,
  MoreHorizontal,
  Users,
  Layers,
  CalendarClock,
  FileText,
  CalendarCheck,
  BarChart3,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Settings,
  ArrowLeft,
  Target,
  Zap,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

// Full navigation items
const NAV_ITEMS = [
  { href: '/sales', label: 'Home', icon: Home, exact: true },
  { href: '/sales/map', label: 'SalesHub', icon: Map },
  { href: '/sales/leads', label: 'Leads', icon: Users },
  { href: '/sales/pipeline', label: 'Pipeline', icon: Layers },
  { href: '/sales/follow-ups', label: 'Follow Ups', icon: CalendarClock },
  { href: '/sales/quotes', label: 'Quotes', icon: FileText },
  { href: '/sales/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/sales/my-stats', label: 'My Stats', icon: BarChart3 },
  { href: '/sales/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/sales/territories', label: 'Territories', icon: Target },
]

// Mobile bottom nav - simplified 3-tab design
const BOTTOM_NAV = [
  { href: '/sales', label: 'Home', icon: Home, exact: true },
  { href: '/sales/map', label: 'SalesHub', icon: Zap },
  { href: '/sales/more', label: 'More', icon: MoreHorizontal },
]

// More menu items (shown in More sheet on mobile)
const MORE_ITEMS = [
  { href: '/sales/leads', label: 'Leads', icon: Users },
  { href: '/sales/pipeline', label: 'Pipeline', icon: Layers },
  { href: '/sales/follow-ups', label: 'Follow Ups', icon: CalendarClock },
  { href: '/sales/quotes', label: 'Quotes', icon: FileText },
  { href: '/sales/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/sales/my-stats', label: 'My Stats', icon: BarChart3 },
  { href: '/sales/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/sales/territories', label: 'Territories', icon: Target },
]

export function SalesforceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { availableModes, loading: modeLoading } = useMode()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U'

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Check if we're on a full-screen page (like map)
  const isFullScreen = pathname === '/sales/map'

  const handleLogout = async () => {
    const supabase = createClient()
    clearUserCache()
    await supabase.auth.signOut()
    logout()
  }

  const handleBackToAdmin = () => {
    router.push('/')
  }

  const canSwitchToAdmin = !modeLoading && (availableModes.includes('admin') || availableModes.length === 0)

  // For full-screen pages, render minimal shell
  if (isFullScreen) {
    return (
      <div className="flex flex-col h-dvh bg-background overflow-hidden">
        {children}
        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-2 safe-area-pb z-50">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href, item.exact)
            if (item.href === '/sales/more') {
              return (
                <Sheet key="more" open={moreOpen} onOpenChange={setMoreOpen}>
                  <SheetTrigger asChild>
                    <button
                      className={cn(
                        'flex flex-col items-center justify-center gap-0.5 py-1.5 px-4 rounded-xl transition-all',
                        moreOpen ? 'text-emerald-400' : 'text-zinc-500'
                      )}
                    >
                      <MoreHorizontal className="h-6 w-6" />
                      <span className="text-[10px] font-medium">More</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl">
                    <SheetHeader className="pb-4">
                      <SheetTitle>More</SheetTitle>
                    </SheetHeader>
                    <div className="grid grid-cols-4 gap-4 pb-8">
                      {MORE_ITEMS.map((moreItem) => (
                        <Link
                          key={moreItem.href}
                          href={moreItem.href}
                          onClick={() => setMoreOpen(false)}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className={cn(
                            'h-12 w-12 rounded-2xl flex items-center justify-center',
                            isActive(moreItem.href) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                          )}>
                            <moreItem.icon className="h-6 w-6" />
                          </div>
                          <span className="text-xs text-center text-zinc-300">{moreItem.label}</span>
                        </Link>
                      ))}
                    </div>
                    {canSwitchToAdmin && (
                      <Button
                        variant="outline"
                        className="w-full mb-4"
                        onClick={() => {
                          setMoreOpen(false)
                          handleBackToAdmin()
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Admin
                      </Button>
                    )}
                  </SheetContent>
                </Sheet>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-1.5 px-4 rounded-xl transition-all',
                  active 
                    ? 'text-emerald-400' 
                    : 'text-zinc-500 active:scale-95'
                )}
              >
                <item.icon className={cn('h-6 w-6', item.href === '/sales/map' && 'h-7 w-7')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-[68px]'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center h-16 px-4 border-b border-zinc-800">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm text-white">Profita</div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">Salesforce</div>
              </div>
            </div>
          ) : (
            <div className="h-9 w-9 mx-auto rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
          )}
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white',
                  !sidebarOpen && 'justify-center px-2'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-zinc-800 p-3 space-y-2">
          {canSwitchToAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'w-full justify-start gap-2 text-zinc-400 hover:text-white hover:bg-zinc-800',
                !sidebarOpen && 'justify-center'
              )}
              onClick={handleBackToAdmin}
            >
              <ArrowLeft className="h-4 w-4" />
              {sidebarOpen && <span>Back to Admin</span>}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-full text-zinc-500 hover:text-white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 lg:h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl flex items-center px-4 gap-4 sticky top-0 z-40">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-zinc-400"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm text-white">Salesforce</span>
          </div>

          <div className="hidden lg:block flex-1" />

          {/* User menu */}
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Sales Rep</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/sales/my-stats">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    My Stats
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {canSwitchToAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleBackToAdmin}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Admin
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto relative pb-20 lg:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-2 safe-area-pb z-50">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href, item.exact)
            if (item.href === '/sales/more') {
              return (
                <Sheet key="more" open={moreOpen} onOpenChange={setMoreOpen}>
                  <SheetTrigger asChild>
                    <button
                      className={cn(
                        'flex flex-col items-center justify-center gap-0.5 py-1.5 px-4 rounded-xl transition-all',
                        moreOpen ? 'text-emerald-400' : 'text-zinc-500'
                      )}
                    >
                      <MoreHorizontal className="h-6 w-6" />
                      <span className="text-[10px] font-medium">More</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl">
                    <SheetHeader className="pb-4">
                      <SheetTitle>More</SheetTitle>
                    </SheetHeader>
                    <div className="grid grid-cols-4 gap-4 pb-8">
                      {MORE_ITEMS.map((moreItem) => (
                        <Link
                          key={moreItem.href}
                          href={moreItem.href}
                          onClick={() => setMoreOpen(false)}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className={cn(
                            'h-12 w-12 rounded-2xl flex items-center justify-center',
                            isActive(moreItem.href) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                          )}>
                            <moreItem.icon className="h-6 w-6" />
                          </div>
                          <span className="text-xs text-center text-zinc-300">{moreItem.label}</span>
                        </Link>
                      ))}
                    </div>
                    {canSwitchToAdmin && (
                      <Button
                        variant="outline"
                        className="w-full mb-4"
                        onClick={() => {
                          setMoreOpen(false)
                          handleBackToAdmin()
                        }}
                      >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Admin
                      </Button>
                    )}
                  </SheetContent>
                </Sheet>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-1.5 px-4 rounded-xl transition-all',
                  active 
                    ? 'text-emerald-400' 
                    : 'text-zinc-500 active:scale-95'
                )}
              >
                <item.icon className={cn('h-6 w-6', item.href === '/sales/map' && 'h-7 w-7')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-zinc-950 border-r border-zinc-800 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">Profita</div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-400">Salesforce</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-zinc-400">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href, item.exact)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      active
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
            {canSwitchToAdmin && (
              <div className="absolute bottom-4 left-0 right-0 px-4">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    handleBackToAdmin()
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Admin
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
