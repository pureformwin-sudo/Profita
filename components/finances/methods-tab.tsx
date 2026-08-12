'use client'

/**
 * Payment method analytics.
 *
 * Totals come pre-aggregated from SQL (scripts/39), so this component renders
 * numbers rather than computing them over a full income array in the browser.
 *
 * The headline number is deliberately the same figure the Overview tab's Income
 * card shows, so the two tabs can never disagree about collected revenue.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils-finance'
import {
  getPaymentAnalytics,
  pivotMonthly,
  type PaymentAnalytics,
} from '@/lib/payment-analytics-storage'
import { cn } from '@/lib/utils'
import { Wallet, TrendingUp, Receipt, AlertCircle } from 'lucide-react'

type RangeKey = 'all' | 'ytd' | '90d' | '30d'

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'ytd', label: 'This year' },
  { key: 'all', label: 'All time' },
]

/** Local-date ISO string; avoids the UTC shift that toISOString() introduces. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangeToDates(range: RangeKey): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null }
  const now = new Date()
  if (range === 'ytd') return { from: `${now.getFullYear()}-01-01`, to: isoDate(now) }
  const days = range === '90d' ? 90 : 30
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  return { from: isoDate(start), to: isoDate(now) }
}

/** Stable palette so a method keeps its colour between the bars and the chart. */
const PALETTE = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function MethodsTab() {
  const [range, setRange] = useState<RangeKey>('all')
  const [data, setData] = useState<PaymentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true)
    const { from, to } = rangeToDates(r)
    const result = await getPaymentAnalytics(from, to)
    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    load(range)
  }, [load, range])

  // Colour assignment follows the totals order (largest first) so the dominant
  // method is always chart-1 and stays visually consistent across the tab.
  const colorFor = useMemo(() => {
    const map = new Map<string, string>()
    data?.totals.forEach((t, i) => map.set(t.method, PALETTE[i % PALETTE.length]))
    return (method: string) => map.get(method) ?? 'var(--color-muted)'
  }, [data])

  const chartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {}
    data?.totals.forEach((t) => {
      cfg[t.method] = { label: t.label, color: colorFor(t.method) }
    })
    return cfg
  }, [data, colorFor])

  const monthlyRows = useMemo(() => (data ? pivotMonthly(data.monthly) : []), [data])
  const hasFees = (data?.fees.length ?? 0) > 0

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (data?.needsSetup) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="font-medium">Analytics setup required</p>
            <p className="text-sm text-muted-foreground">
              Run{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                scripts/39-payment-method-analytics.sql
              </code>{' '}
              to enable payment method reporting.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isEmpty = !data || data.totals.length === 0

  return (
    <div className="space-y-6">
      {/* Range filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={range === r.key ? 'default' : 'outline'}
            className="h-8"
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
          >
            {r.label}
          </Button>
        ))}
        {loading && <span className="ml-1 text-xs text-muted-foreground">Updating...</span>}
      </div>

      {isEmpty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No payments recorded in this period.
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Collected
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.grandTotal)}</p>
                <p className="text-xs text-muted-foreground">{data.transactionCount} payments</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Top method
                </div>
                <p className="mt-1 text-2xl font-bold">{data.totals[0].label}</p>
                <p className="text-xs text-muted-foreground">
                  {data.totals[0].share.toFixed(1)}% of revenue
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5" />
                  Avg payment
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(data.transactionCount > 0 ? data.grandTotal / data.transactionCount : 0)}
                </p>
                <p className="text-xs text-muted-foreground">{data.totals.length} methods used</p>
              </CardContent>
            </Card>
          </div>

          {/* Share breakdown - bars read faster than a pie for ranked comparison */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <h2 className="text-sm font-semibold">Revenue by method</h2>
              <div className="space-y-3">
                {data.totals.map((t) => (
                  <div key={t.method} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorFor(t.method) }}
                        />
                        {t.label}
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                          {t.transactionCount}
                        </Badge>
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{formatCurrency(t.grossAmount)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{t.share.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${t.label}: ${t.share.toFixed(1)} percent of collected revenue`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.max(t.share, 0.5)}%`, backgroundColor: colorFor(t.method) }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Avg {formatCurrency(t.avgAmount)}
                      {t.lastPayment && ` · last ${t.lastPayment}`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly trend */}
          {monthlyRows.length > 1 && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <h2 className="text-sm font-semibold">Monthly trend</h2>
                <ChartContainer config={chartConfig} className="h-[280px] w-full">
                  <BarChart data={monthlyRows} margin={{ left: 4, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={monthLabel}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : v}`}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      fontSize={11}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(l) => monthLabel(String(l))}
                          formatter={(value, name) => (
                            <span className="flex w-full justify-between gap-3">
                              <span className="text-muted-foreground">{chartConfig[name as string]?.label ?? name}</span>
                              <span className="font-medium tabular-nums">{formatCurrency(Number(value))}</span>
                            </span>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {data.totals.map((t) => (
                      <Bar key={t.method} dataKey={t.method} stackId="a" fill={colorFor(t.method)} radius={0} />
                    ))}
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Processing fees - rendered only when real fee data exists, so this
              does not become a wall of $0.00 rows before fees are recorded. */}
          {hasFees && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Processing fees</h2>
                  <p className="text-xs text-muted-foreground">
                    Gross versus net on payments that carry a processing fee.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Method</th>
                        <th className="pb-2 pr-3 text-right font-medium">Gross</th>
                        <th className="pb-2 pr-3 text-right font-medium">Fees</th>
                        <th className="pb-2 pr-3 text-right font-medium">Net</th>
                        <th className="pb-2 text-right font-medium">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fees.map((f) => (
                        <tr key={f.method} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3 font-medium">{f.label}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(f.grossAmount)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-destructive">
                            -{formatCurrency(f.totalFees)}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                            {formatCurrency(f.netAmount)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {f.feeRate.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly detail table */}
          {monthlyRows.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Month by method</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Month</th>
                        {data.totals.map((t) => (
                          <th key={t.method} className="pb-2 pr-3 text-right font-medium">
                            {t.label}
                          </th>
                        ))}
                        <th className="pb-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthlyRows].reverse().map((row) => (
                        <tr key={row.month} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3 font-medium whitespace-nowrap">{monthLabel(row.month)}</td>
                          {data.totals.map((t) => {
                            const v = (row[t.method] as number) ?? 0
                            return (
                              <td
                                key={t.method}
                                className={cn(
                                  'py-2 pr-3 text-right tabular-nums',
                                  v === 0 && 'text-muted-foreground/40',
                                )}
                              >
                                {v === 0 ? '--' : formatCurrency(v)}
                              </td>
                            )
                          })}
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
