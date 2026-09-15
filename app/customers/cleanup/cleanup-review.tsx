'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ChevronDown,
  Sparkles,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  REASON_LABELS,
  type CleanupFlagReason,
  type CleanupSuggestion,
} from '@/lib/customer-cleanup'
import {
  applyCustomerCleanup,
  runCustomerAudit,
  type AuditResult,
  type CleanupDecision,
} from './actions'

interface RowState {
  included: boolean
  name: string
  /** null => clear the phone on apply. */
  phone: string | null
}

function initialRowState(s: CleanupSuggestion): RowState {
  return {
    included: true,
    name: s.suggestedName,
    phone: s.suggestedPhone,
  }
}

function phoneDisplay(phone: string | null): string {
  return phone ?? ''
}

export function CleanupReview({
  initialSuggestions,
  initialCounts,
}: {
  initialSuggestions: CleanupSuggestion[]
  initialCounts: AuditResult['counts']
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [counts, setCounts] = useState(initialCounts)
  const [isPending, startTransition] = useTransition()

  // Per-customer editable decision state, keyed by id.
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const map: Record<string, RowState> = {}
    for (const s of initialSuggestions) {
      if (s.autoFixed || s.needsReview) map[s.customerId] = initialRowState(s)
    }
    return map
  })

  const autoFixSuggestions = useMemo(
    () => suggestions.filter((s) => s.autoFixed),
    [suggestions],
  )
  const reviewSuggestions = useMemo(
    () => suggestions.filter((s) => s.needsReview),
    [suggestions],
  )

  // Review rows split so a 100+ "no last name" pile doesn't bury real errors.
  const missingLastNameOnly = useMemo(
    () =>
      reviewSuggestions.filter(
        (s) => s.reasons.length === 1 && s.reasons[0] === 'missing_last_name',
      ),
    [reviewSuggestions],
  )
  const otherReview = useMemo(
    () =>
      reviewSuggestions.filter(
        (s) => !(s.reasons.length === 1 && s.reasons[0] === 'missing_last_name'),
      ),
    [reviewSuggestions],
  )

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const selectedCount = useMemo(
    () => Object.values(rows).filter((r) => r.included).length,
    [rows],
  )

  const handleApply = () => {
    const decisions: CleanupDecision[] = []
    for (const s of suggestions) {
      const row = rows[s.customerId]
      if (!row || !row.included) continue

      const decision: CleanupDecision = { customerId: s.customerId }
      const trimmedName = row.name.trim()
      if (trimmedName && trimmedName !== s.currentName) decision.name = trimmedName
      // phone === null means clear; compare against current to avoid no-op writes.
      const nextPhone = row.phone ?? ''
      if (nextPhone !== s.currentPhone) decision.phone = nextPhone

      if (decision.name !== undefined || decision.phone !== undefined) {
        decisions.push(decision)
      }
    }

    if (decisions.length === 0) {
      toast.error('Nothing to apply — no changes selected.')
      return
    }

    startTransition(async () => {
      const { appliedCount, failures } = await applyCustomerCleanup(decisions)

      if (appliedCount > 0) {
        toast.success(`Updated ${appliedCount} customer${appliedCount === 1 ? '' : 's'}.`)
      }
      if (failures.length > 0) {
        toast.error(
          `${failures.length} failed: ${failures
            .slice(0, 3)
            .map((f) => f.name)
            .join(', ')}${failures.length > 3 ? '…' : ''}`,
        )
      }

      // Re-audit so the screen reflects exactly what landed.
      const fresh = await runCustomerAudit()
      setSuggestions(fresh.suggestions)
      setCounts(fresh.counts)
      setRows(() => {
        const map: Record<string, RowState> = {}
        for (const s of fresh.suggestions) {
          if (s.autoFixed || s.needsReview) map[s.customerId] = initialRowState(s)
        }
        return map
      })
    })
  }

  const nothingToDo = autoFixSuggestions.length === 0 && reviewSuggestions.length === 0

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Clean up customer data</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Audit names and phone numbers, auto-fix the safe stuff, and review the rest
            before anything is saved.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-2 shrink-0">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={counts.total} tone="muted" />
        <SummaryCard label="Auto-fixable" value={counts.autoFixable} tone="primary" />
        <SummaryCard label="Need review" value={counts.needsReview} tone="warning" />
        <SummaryCard label="Look clean" value={counts.clean} tone="success" />
      </div>

      {nothingToDo && (
        <div className="border border-border rounded-lg bg-card py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="font-medium mb-1">Everything looks clean</p>
          <p className="text-sm text-muted-foreground">
            No name or phone issues found across {counts.total} customers.
          </p>
        </div>
      )}

      {/* Auto-fix section */}
      {autoFixSuggestions.length > 0 && (
        <Collapsible defaultOpen>
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors [&[data-state=open]>svg:last-child]:rotate-180">
              <div className="flex items-center gap-2 min-w-0">
                <Wand2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">Safe auto-fixes</span>
                <Badge variant="secondary" className="shrink-0">
                  {autoFixSuggestions.length}
                </Badge>
                <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                  casing, spacing &amp; phone formatting
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform shrink-0" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border divide-y divide-border">
                {autoFixSuggestions.map((s) => {
                  const row = rows[s.customerId]
                  if (!row) return null
                  return (
                    <label
                      key={s.customerId}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20"
                    >
                      <Checkbox
                        checked={row.included}
                        onCheckedChange={(v) =>
                          updateRow(s.customerId, { included: v === true })
                        }
                      />
                      <div className="min-w-0 flex-1 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                        <Diff label="Name" from={s.currentName} to={s.suggestedName} />
                        <Diff
                          label="Phone"
                          from={s.currentPhone}
                          to={phoneDisplay(s.suggestedPhone)}
                        />
                      </div>
                    </label>
                  )
                })}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Errors that need review */}
      {otherReview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="font-medium">Needs your review</h2>
            <Badge variant="secondary">{otherReview.length}</Badge>
          </div>
          <div className="border border-border rounded-lg bg-card divide-y divide-border">
            {otherReview.map((s) => (
              <ReviewRow
                key={s.customerId}
                suggestion={s}
                row={rows[s.customerId]}
                onChange={(patch) => updateRow(s.customerId, patch)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Missing last name — separate, collapsible so it doesn't drown the list */}
      {missingLastNameOnly.length > 0 && (
        <Collapsible>
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors [&[data-state=open]>svg:last-child]:rotate-180">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium">Single-word names (no last name)</span>
                <Badge variant="secondary" className="shrink-0">
                  {missingLastNameOnly.length}
                </Badge>
                <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                  add a last name, or leave as-is
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform shrink-0" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border divide-y divide-border">
                {missingLastNameOnly.map((s) => (
                  <ReviewRow
                    key={s.customerId}
                    suggestion={s}
                    row={rows[s.customerId]}
                    onChange={(patch) => updateRow(s.customerId, patch)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Sticky apply bar */}
      {!nothingToDo && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card/95 backdrop-blur px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">
              {selectedCount} selected
            </span>
            <Button onClick={handleApply} disabled={isPending || selectedCount === 0} className="gap-2">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Apply {selectedCount} change{selectedCount === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'muted' | 'primary' | 'warning' | 'success'
}) {
  const toneClass = {
    muted: 'text-foreground',
    primary: 'text-primary',
    warning: 'text-amber-500',
    success: 'text-emerald-500',
  }[tone]
  return (
    <div className="border border-border rounded-lg bg-card px-4 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

function Diff({ label, from, to }: { label: string; from: string; to: string }) {
  if (from === to) {
    return (
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-muted-foreground w-12 shrink-0">{label}</span>
        <span className="truncate text-muted-foreground">{from || '—'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs text-muted-foreground w-12 shrink-0">{label}</span>
      <span className="truncate line-through text-muted-foreground/70">{from || '—'}</span>
      <span className="text-muted-foreground">→</span>
      <span className="truncate font-medium">{to || '—'}</span>
    </div>
  )
}

function ReasonChips({ reasons }: { reasons: CleanupFlagReason[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <Badge key={r} variant="outline" className="text-[10px] font-normal">
          {REASON_LABELS[r]}
        </Badge>
      ))}
    </div>
  )
}

function ReviewRow({
  suggestion,
  row,
  onChange,
}: {
  suggestion: CleanupSuggestion
  row: RowState | undefined
  onChange: (patch: Partial<RowState>) => void
}) {
  if (!row) return null
  const clearsPhone = suggestion.suggestedPhone === null && suggestion.currentPhone !== ''

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        className="mt-1"
        checked={row.included}
        onCheckedChange={(v) => onChange({ included: v === true })}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Current: <span className="text-foreground">{suggestion.currentName || '—'}</span>
            {suggestion.currentPhone && (
              <>
                {' '}
                <span className="text-muted-foreground/60">·</span> {suggestion.currentPhone}
              </>
            )}
          </span>
          <ReasonChips reasons={suggestion.reasons} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Full name"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Phone{clearsPhone ? ' (will be cleared)' : ''}
            </label>
            <Input
              value={row.phone ?? ''}
              onChange={(e) => onChange({ phone: e.target.value === '' ? null : e.target.value })}
              placeholder="No phone"
              className="h-9"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
