'use client'

import { Sparkles } from 'lucide-react'

export function AIGrowthHeader() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6">
      {/* Decorative glow */}
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30">
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">AI Growth Center</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
              Premium
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Your AI business assistant. Find missed revenue, close more leads, raise prices, and grow smarter — powered by your own business data.
          </p>
        </div>
      </div>
    </div>
  )
}
