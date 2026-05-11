'use client'

import { Shield, Hammer, MapPin, ChevronDown, Check, Zap } from 'lucide-react'
import { useMode } from '@/lib/mode-context'
import type { Mode } from '@/lib/get-current-role'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const MODE_META: Record<Mode, { label: string; description: string; icon: typeof Shield; color: string }> = {
  admin: {
    label: 'Admin',
    description: 'Full business management',
    icon: Shield,
    color: 'text-emerald-500',
  },
  sales_rep: {
    label: 'Sales Mode',
    description: 'Map, leads, pipeline',
    icon: MapPin,
    color: 'text-violet-500',
  },
  crew: {
    label: 'Crew',
    description: "Today's jobs, clock in/out",
    icon: Hammer,
    color: 'text-amber-500',
  },
}

interface ModeSwitcherProps {
  compact?: boolean
  variant?: 'default' | 'sales-button'
}

export function ModeSwitcher({ compact = false, variant = 'default' }: ModeSwitcherProps) {
  const { availableModes, currentMode, setMode, loading } = useMode()

  // Sales button variant: show a prominent "Salesforce" toggle button when the user has sales_rep available
  if (variant === 'sales-button') {
    // Only show if user has sales_rep mode AND is currently in admin mode
    if (loading || !currentMode || currentMode !== 'admin' || !availableModes.includes('sales_rep')) {
      return null
    }

    return (
      <Button
        onClick={() => setMode('sales_rep')}
        className="h-9 gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all px-4"
      >
        <Zap className="h-4 w-4" />
        <span className="font-semibold">Salesforce</span>
      </Button>
    )
  }

  // Default dropdown variant
  // Don't render if user has fewer than 2 modes available
  if (loading || !currentMode || availableModes.length < 2) return null

  const current = MODE_META[currentMode]
  const Icon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md border border-border bg-secondary/50 hover:bg-secondary transition-colors',
            compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'
          )}
          aria-label="Switch mode"
        >
          <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', current.color)} />
          <span className="font-medium hidden sm:inline">{current.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Switch mode
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableModes.map((mode) => {
          const meta = MODE_META[mode]
          const ModeIcon = meta.icon
          const active = mode === currentMode
          return (
            <DropdownMenuItem
              key={mode}
              onClick={() => { if (!active) setMode(mode) }}
              className="flex items-start gap-3 py-2.5"
            >
              <div className={cn('mt-0.5 rounded-md p-1.5 bg-secondary', meta.color)}>
                <ModeIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{meta.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                </div>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
