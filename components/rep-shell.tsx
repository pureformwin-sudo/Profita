'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  CalendarDays,
  Menu, 
  X, 
  LogOut,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const navItems = [
  { href: '/rep', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/rep/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/rep/jobs', label: 'My Jobs', icon: Briefcase },
  { href: '/rep/customers', label: 'Customers', icon: Users },
]

export function RepShell({ children, repName }: { children: React.ReactNode; repName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const userName = repName || 'Sales Rep'
  const userInitials = userName.slice(0, 2).toUpperCase()

  const isActive = (href: string) => {
    if (href === '/rep') return pathname === '/rep'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/rep/login')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center px-4 lg:px-6">
          {/* Logo */}
          <Link href="/rep" className="flex items-center gap-2.5 mr-6">
            <Image 
              src="/logo.png" 
              alt="Profita" 
              width={32} 
              height={32} 
              className="rounded-lg"
            />
            <span className="text-lg font-semibold tracking-tight hidden sm:block">Profita</span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
              Rep
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Right Side */}
          <div className="ml-auto flex items-center gap-3">
            {/* Add Job Button - Desktop */}
            <Link href="/rep/jobs/new" className="hidden md:block">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New Job
              </Button>
            </Link>

            {/* User Menu */}
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs text-muted-foreground">Sales Rep</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="h-9 w-9 rounded-full"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
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
                        className="rounded-lg"
                      />
                      <span className="text-lg font-semibold">Profita</span>
                    </div>
                  </div>

                  {/* Mobile User Info */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary-foreground">{userInitials}</span>
                      </div>
                      <div>
                        <p className="font-medium">{userName}</p>
                        <p className="text-sm text-muted-foreground">Sales Rep</p>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Navigation */}
                  <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-secondary text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.label}
                        </Link>
                      )
                    })}
                  </nav>

                  {/* Mobile Add Job */}
                  <div className="p-4 border-t border-border">
                    <Link href="/rep/jobs/new" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full gap-2">
                        <Plus className="h-4 w-4" />
                        New Job
                      </Button>
                    </Link>
                  </div>

                  {/* Mobile Sign Out */}
                  <div className="p-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
