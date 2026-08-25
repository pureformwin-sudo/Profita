'use client'

/**
 * Lead Scoring.
 *
 * Ranks customers by a composite of estimated home value and real lifetime
 * spend, so the sales team knows who to knock on next.
 *
 * Estimates are never run automatically: each web-searched valuation costs money
 * and takes 10-30 seconds, so they fire only from an explicit button.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadScoreTable } from '@/components/lead-scoring/lead-score-table'
import { formatMoneyCompact, type ScoredLead } from '@/lib/lead-scoring'
import { AlertTriangle, Search, Sparkles, TrendingUp } from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const json = await r.json()
    if (!r.ok) throw new Error(json?.error ?? 'Request failed')
    return json
  })

/** How many customers one "Estimate next" click processes. */
const BATCH_SIZE = 5

export default function LeadScoringPage() {
  const { data, error, isLoading, mutate } = useSWR<{
    leads: ScoredLead[]
    needsSetup: boolean
  }>('/api/lead-scoring', fetcher)

  const [query, setQuery] = useState('')
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)

  const leads = data?.leads ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leads
    return leads.filter(
      (l) =>
        l.customerName.toLowerCase().includes(q) ||
        (l.address ?? '').toLowerCase().includes(q),
    )
  }, [leads, query])

  const stats = useMemo(() => {
    const scored = leads.filter((l) => l.score != null)
    const estimated = leads.filter(
      (l) => l.estimate?.estimatedAt != null || l.isOverridden,
    )
    const blocked = leads.filter(
      (l) => l.limitation === 'insufficient_address' && !l.isOverridden,
    )
    const pending = leads.filter((l) => l.limitation === 'not_estimated')
    return {
      total: leads.length,
      scored: scored.length,
      estimated: estimated.length,
      blocked: blocked.length,
      pending: pending.length,
      topScore: scored.length ? Math.max(...scored.map((l) => l.score as number)) : null,
    }
  }, [leads])

  const runEstimate = useCallback(
    async (customerId: string) => {
      setBusyCustomerId(customerId)
      try {
        const res = await fetch('/api/lead-scoring/estimate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ customerId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Estimate failed')

        const result = json.results?.[0]
        if (result?.status === 'estimated') {
          toast.success(
            `Estimated ${formatMoneyCompact(result.estimateUsd)} (${result.basis}, ${result.searchCount} searches)`,
          )
        } else if (result?.status === 'skipped') {
          toast.warning(result.reason ?? 'Skipped')
        } else {
          toast.error(result?.reason ?? 'Estimate failed')
        }
        await mutate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Estimate failed')
      } finally {
        setBusyCustomerId(null)
      }
    },
    [mutate],
  )

  const runBatch = useCallback(async () => {
    setBatchRunning(true)
    try {
      const res = await fetch('/api/lead-scoring/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batch: true, limit: BATCH_SIZE }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Batch failed')

      if (json.estimated === 0 && json.skipped === 0 && json.failed === 0) {
        toast.info('Nothing left to estimate.')
      } else {
        const parts = [`${json.estimated} estimated`]
        if (json.skipped) parts.push(`${json.skipped} skipped`)
        if (json.failed) parts.push(`${json.failed} failed`)
        toast.success(parts.join(' · '))
      }
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Batch failed')
    } finally {
      setBatchRunning(false)
    }
  }, [mutate])

  const saveOverride = useCallback(
    async (customerId: string, value: string, note: string) => {
      try {
        const res = await fetch('/api/lead-scoring', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            customerId,
            overrideHomeValue: value.trim() === '' ? null : value,
            overrideNote: note,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Save failed')
        toast.success(json.cleared ? 'Override cleared' : 'Override saved')
        await mutate()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Save failed')
        throw err
      }
    },
    [mutate],
  )

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Lead Scoring</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Customers ranked by estimated home value and what they have actually spent.
            </p>
          </div>
          <Button
            onClick={() => void runBatch()}
            disabled={batchRunning || (data?.needsSetup ?? false)}
            className="gap-2 shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            {batchRunning ? 'Estimating…' : `Estimate next ${BATCH_SIZE}`}
          </Button>
        </header>

        {data?.needsSetup && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database setup required</AlertTitle>
            <AlertDescription>
              The <code className="font-mono text-xs">lead_scores</code> table does not
              exist yet. Run{' '}
              <code className="font-mono text-xs">
                scripts/migrations/020-lead-scoring.sql
              </code>{' '}
              against your Supabase project, then reload.
            </AlertDescription>
          </Alert>
        )}

        {error && !data?.needsSetup && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load leads</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold tabular-nums">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Valued
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {stats.estimated}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stats.pending} awaiting estimate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Blocked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {stats.blocked}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">address too vague</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-baseline gap-1.5 font-mono text-2xl font-semibold tabular-nums">
                {stats.topScore ?? '—'}
                {stats.topScore != null && (
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>How to read these numbers</AlertTitle>
          <AlertDescription className="leading-relaxed">
            Home values come from Claude searching public listing and assessor data, so
            treat them as estimates and not appraisals. A{' '}
            <strong className="font-medium">Property match</strong> was resolved to a
            specific address; an <strong className="font-medium">Area estimate</strong> is
            a neighbourhood median because the street address could not be pinned down.
            Lifetime spend is your own data — collected invoice payments plus delivered
            job value. Where an estimate looks wrong, set a manual override and it wins.
          </AlertDescription>
        </Alert>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or address…"
            aria-label="Search leads"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {leads.length === 0
                  ? 'No customers yet. Add customers to start scoring leads.'
                  : 'No customers match that search.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <LeadScoreTable
            leads={filtered}
            busyCustomerId={busyCustomerId}
            onEstimate={runEstimate}
            onSaveOverride={saveOverride}
          />
        )}
      </div>
    </AppShell>
  )
}
