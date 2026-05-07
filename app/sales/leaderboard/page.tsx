'use client'

import { useEffect, useState } from 'react'
import {
  Trophy,
  Crown,
  Medal,
  DoorOpen,
  MessageSquare,
  DollarSign,
  TrendingUp,
  RefreshCw,
  User,
  Flame,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Demo leaderboard data - in production this would come from aggregated sales data
const DEMO_LEADERBOARD = [
  { id: '1', name: 'Alex Rivera', initials: 'AR', doors: 142, leads: 38, revenue: 1845000, closeRate: 27 },
  { id: '2', name: 'Jordan Lee', initials: 'JL', doors: 128, leads: 31, revenue: 1620000, closeRate: 24 },
  { id: '3', name: 'Casey Morgan', initials: 'CM', doors: 115, leads: 29, revenue: 1490000, closeRate: 25 },
  { id: '4', name: 'Taylor Chen', initials: 'TC', doors: 98, leads: 24, revenue: 1180000, closeRate: 24 },
  { id: '5', name: 'Sam Williams', initials: 'SW', doors: 87, leads: 19, revenue: 980000, closeRate: 22 },
  { id: '6', name: 'Morgan Davis', initials: 'MD', doors: 76, leads: 16, revenue: 720000, closeRate: 21 },
  { id: '7', name: 'Riley Johnson', initials: 'RJ', doors: 65, leads: 12, revenue: 540000, closeRate: 18 },
  { id: '8', name: 'Drew Smith', initials: 'DS', doors: 52, leads: 9, revenue: 380000, closeRate: 17 },
]

type SortKey = 'doors' | 'leads' | 'revenue' | 'closeRate'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" />
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-300" />
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>
}

function getRankBg(rank: number) {
  if (rank === 1) return 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 border-amber-500/30'
  if (rank === 2) return 'bg-gradient-to-r from-slate-400/20 to-slate-400/5 border-slate-400/30'
  if (rank === 3) return 'bg-gradient-to-r from-amber-700/20 to-amber-700/5 border-amber-700/30'
  return ''
}

export default function LeaderboardPage() {
  const [sortBy, setSortBy] = useState<SortKey>('doors')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(timer)
  }, [])

  const sortedData = [...DEMO_LEADERBOARD].sort((a, b) => b[sortBy] - a[sortBy])

  const topThree = sortedData.slice(0, 3)
  const rest = sortedData.slice(3)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            This month&apos;s top performers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-xs text-muted-foreground">Demo data</span>
        </div>
      </div>

      {/* Sort Tabs */}
      <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="doors" className="text-xs">
            <DoorOpen className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Doors
          </TabsTrigger>
          <TabsTrigger value="leads" className="text-xs">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="closeRate" className="text-xs">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Close %
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-3 gap-3">
        {/* 2nd Place */}
        <Card className={cn('order-1', getRankBg(2))}>
          <CardContent className="p-4 text-center">
            <div className="flex justify-center mb-2">
              {getRankIcon(2)}
            </div>
            <Avatar className="h-12 w-12 mx-auto mb-2 border-2 border-slate-400/50">
              <AvatarFallback className="bg-slate-500/20 text-slate-300">
                {topThree[1]?.initials}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-semibold text-sm truncate">{topThree[1]?.name}</h3>
            <p className="text-lg font-bold mt-1">
              {sortBy === 'revenue'
                ? formatCurrency(topThree[1]?.[sortBy] || 0)
                : sortBy === 'closeRate'
                ? `${topThree[1]?.[sortBy]}%`
                : topThree[1]?.[sortBy]}
            </p>
          </CardContent>
        </Card>

        {/* 1st Place */}
        <Card className={cn('order-0 sm:order-1 col-span-3 sm:col-span-1', getRankBg(1))}>
          <CardContent className="p-4 text-center">
            <div className="flex justify-center mb-2">
              {getRankIcon(1)}
            </div>
            <Avatar className="h-16 w-16 mx-auto mb-2 border-2 border-amber-400/50 ring-2 ring-amber-400/20 ring-offset-2 ring-offset-background">
              <AvatarFallback className="bg-amber-500/20 text-amber-400 text-lg">
                {topThree[0]?.initials}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-semibold truncate">{topThree[0]?.name}</h3>
            <p className="text-2xl font-bold mt-1 text-amber-400">
              {sortBy === 'revenue'
                ? formatCurrency(topThree[0]?.[sortBy] || 0)
                : sortBy === 'closeRate'
                ? `${topThree[0]?.[sortBy]}%`
                : topThree[0]?.[sortBy]}
            </p>
          </CardContent>
        </Card>

        {/* 3rd Place */}
        <Card className={cn('order-2', getRankBg(3))}>
          <CardContent className="p-4 text-center">
            <div className="flex justify-center mb-2">
              {getRankIcon(3)}
            </div>
            <Avatar className="h-12 w-12 mx-auto mb-2 border-2 border-amber-700/50">
              <AvatarFallback className="bg-amber-700/20 text-amber-600">
                {topThree[2]?.initials}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-semibold text-sm truncate">{topThree[2]?.name}</h3>
            <p className="text-lg font-bold mt-1">
              {sortBy === 'revenue'
                ? formatCurrency(topThree[2]?.[sortBy] || 0)
                : sortBy === 'closeRate'
                ? `${topThree[2]?.[sortBy]}%`
                : topThree[2]?.[sortBy]}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rest of Rankings */}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {rest.map((rep, index) => {
            const rank = index + 4
            return (
              <div
                key={rep.id}
                className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="w-8 flex justify-center">
                  {getRankIcon(rank)}
                </div>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                    {rep.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{rep.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{rep.doors} doors</span>
                    <span>{rep.leads} leads</span>
                    <span>{rep.closeRate}% close</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold">
                    {sortBy === 'revenue'
                      ? formatCurrency(rep[sortBy])
                      : sortBy === 'closeRate'
                      ? `${rep[sortBy]}%`
                      : rep[sortBy]}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Info Banner */}
      <div className="rounded-lg bg-muted/30 border border-border p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Leaderboard updates daily at midnight. Keep knocking to climb the ranks!
        </p>
      </div>
    </div>
  )
}
