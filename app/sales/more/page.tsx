'use client'

import Link from 'next/link'
import {
  FileText,
  CalendarCheck,
  Trophy,
  Calendar,
  FileCheck,
  Settings,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  User,
  Shield,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const MENU_SECTIONS = [
  {
    title: 'Sales Tools',
    items: [
      { href: '/sales/pipeline', icon: FileText, label: 'Pipeline', description: 'Manage deal stages' },
      { href: '/sales/follow-ups', icon: CalendarCheck, label: 'Follow Ups', description: 'Scheduled callbacks' },
      { href: '/sales/bookings', icon: Calendar, label: 'Bookings', description: 'Appointments & demos' },
      { href: '/sales/quotes', icon: FileCheck, label: 'Quotes', description: 'Proposals & pricing' },
    ],
  },
  {
    title: 'Performance',
    items: [
      { href: '/sales/leaderboard', icon: Trophy, label: 'Leaderboard', description: 'Team rankings' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/sales/settings', icon: Settings, label: 'Settings', description: 'Preferences & profile' },
      { href: '/sales/notifications', icon: Bell, label: 'Notifications', description: 'Alerts & reminders' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/', icon: Shield, label: 'Switch to Admin', description: 'Back to admin dashboard', highlight: true },
    ],
  },
]

export default function MorePage() {
  return (
    <div className="min-h-full bg-zinc-950">
      {/* Content */}
      <div className="p-4 space-y-6 pb-24 lg:pb-8">
        {/* User Card */}
        <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <User className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-white">Sales Rep</p>
              <p className="text-sm text-zinc-400 truncate">rep@company.com</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 rounded-full">
              <Zap className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">Active</span>
            </div>
          </div>
        </div>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-2">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-1">
              {section.title}
            </h3>
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-zinc-800',
                      'highlight' in item && item.highlight && 'bg-emerald-500/5'
                    )}
                  >
                    <div className={cn(
                      'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                      'highlight' in item && item.highlight 
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-400'
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-semibold',
                        'highlight' in item && item.highlight ? 'text-emerald-400' : 'text-white'
                      )}>
                        {item.label}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{item.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-600 shrink-0" />
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Help Link */}
        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 overflow-hidden">
          <Link
            href="/sales/help"
            className="flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-zinc-800"
          >
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Help & Support</p>
              <p className="text-xs text-zinc-500">Get assistance</p>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-600" />
          </Link>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-zinc-600 pt-4">
          Profita SalesHub v1.0.0
        </p>
      </div>
    </div>
  )
}
