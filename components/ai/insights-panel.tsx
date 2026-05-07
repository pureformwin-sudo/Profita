'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, Info, ArrowRight, ChevronDown } from 'lucide-react'
import type { AIInsight } from '@/lib/ai/insights'

const TONE_CONFIG: Record<
  AIInsight['tone'],
  { icon: React.ComponentType<{ className?: string }>; accent: string; dot: string }
> = {
  positive: { icon: TrendingUp, accent: 'text-emerald-500', dot: 'bg-emerald-500' },
  warning: { icon: AlertCircle, accent: 'text-amber-500', dot: 'bg-amber-500' },
  opportunity: { icon: Lightbulb, accent: 'text-primary', dot: 'bg-primary' },
  neutral: { icon: Info, accent: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

export function InsightsPanel({
  insights,
  title = 'AI Insights',
  subtitle,
  compact = false,
  className,
  defaultOpen = false,
}: {
  insights: AIInsight[]
  title?: string
  subtitle?: string
  compact?: boolean
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (insights.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3', className)}>
        <div className="rounded-md bg-primary/15 p-1.5 shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground leading-tight">
            Add more jobs to unlock insights.
          </p>
        </div>
      </div>
    )
  }

  // Count by tone for the preview
  const toneCounts = insights.reduce(
    (acc, ins) => {
      acc[ins.tone] = (acc[ins.tone] || 0) + 1
      return acc
    },
    {} as Record<AIInsight['tone'], number>,
  )

  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      {/* Collapsed/header row - always clickable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 transition-colors text-left',
          'hover:bg-secondary/40',
          open && 'border-b border-border',
        )}
        aria-expanded={open}
        aria-label={open ? 'Collapse AI insights' : 'Expand AI insights'}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-md bg-primary/15 p-1.5 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm tracking-tight truncate">{title}</p>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                {insights.length} {insights.length === 1 ? 'insight' : 'insights'}
              </span>
            </div>
            {/* Dot preview of tones when collapsed */}
            {!open && (
              <div className="flex items-center gap-2 mt-1">
                {(['positive', 'opportunity', 'warning', 'neutral'] as const).map((tone) => {
                  const count = toneCounts[tone] || 0
                  if (count === 0) return null
                  return (
                    <div key={tone} className="flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', TONE_CONFIG[tone].dot)} />
                      <span className="text-[11px] text-muted-foreground">{count}</span>
                    </div>
                  )
                })}
                <span className="text-[11px] text-muted-foreground">· tap to expand</span>
              </div>
            )}
            {open && subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded content */}
      {open && (
        <div className="divide-y divide-border">
          {insights.map((ins) => {
            const cfg = TONE_CONFIG[ins.tone]
            const Icon = cfg.icon
            return (
              <div
                key={ins.id}
                className={cn(
                  'flex items-start gap-3 px-4',
                  compact ? 'py-2.5' : 'py-3',
                )}
              >
                <div className={cn('mt-0.5 shrink-0', cfg.accent)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{ins.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {ins.detail}
                  </p>
                </div>
                {ins.action?.href && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs shrink-0 gap-1 px-2"
                  >
                    <Link href={ins.action.href}>
                      {ins.action.label}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
