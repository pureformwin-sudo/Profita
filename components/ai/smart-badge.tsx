'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Crown, Clock, Sparkles, MoonStar, Star } from 'lucide-react'
import type { CustomerTag } from '@/lib/ai/insights'

const TAG_CONFIG: Record<CustomerTag, { label: string; icon: React.ComponentType<{ className?: string }>; classes: string }> = {
  VIP: {
    label: 'VIP',
    icon: Crown,
    classes: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  DueSoon: {
    label: 'Due Soon',
    icon: Clock,
    classes: 'bg-primary/15 text-primary border-primary/30',
  },
  UpsellReady: {
    label: 'Upsell Ready',
    icon: Sparkles,
    classes: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  },
  Inactive: {
    label: 'Inactive 90+',
    icon: MoonStar,
    classes: 'bg-muted text-muted-foreground border-border',
  },
  New: {
    label: 'New',
    icon: Star,
    classes: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
}

export function SmartBadge({ tag, className }: { tag: CustomerTag; className?: string }) {
  const cfg = TAG_CONFIG[tag]
  const Icon = cfg.icon
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 px-1.5 py-0 h-5 text-[10px] font-medium border',
        cfg.classes,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  )
}
