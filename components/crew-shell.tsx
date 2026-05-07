'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ClipboardList, CalendarDays, User, LogOut, Settings, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { ModeSwitcher } from '@/components/mode-switcher'
import { clearUserCache } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { getUnreadNotificationCount } from '@/lib/in-app-notifications'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const tabs = [
  { href: '/crew/today', label: 'Today', icon: ClipboardList },
  { href: '/crew/week', label: 'Schedule', icon: CalendarDays },
  { href: '/notifications', label: 'Alerts', icon: Bell, showBadge: true },
  { href: '/crew/me', label: 'Profile', icon: User },
]

export function CrewShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const loadUnread = async () => {
      const count = await getUnreadNotificationCount()
      setUnreadCount(count)
    }
    loadUnread()
    const interval = setInterval(loadUnread, 15000)
    return () => clearInterval(interval)
  }, [user])

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Crew'
  const userInitials = userName.slice(0, 2).toUpperCase()

  const isActive = (href: string) => {
    if (href === '/crew/today') {
      return pathname === '/crew' || pathname === '/crew/today' || pathname.startsWith('/crew/today/') || pathname.startsWith('/crew/job/')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  const handleLogout = () => {
    clearUserCache()
    logout()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center px-4 gap-3">
          <Link href="/crew" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Profita" width={28} height={28} className="rounded-md" />
            <span className="text-base font-semibold tracking-tight hidden sm:inline">Profita</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider">Crew</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ModeSwitcher compact />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white text-xs font-semibold">
                    {userInitials}
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
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 pb-20">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="flex items-stretch justify-around max-w-md mx-auto h-16">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative',
                  active ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="relative">
                  <Icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]')} />
                  {tab.showBadge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
