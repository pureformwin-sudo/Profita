'use client'

/**
 * Ranked lead table.
 *
 * Design intent: this is a work queue, not a dashboard. The score is the only
 * loud element on the page; every other column stays quiet so the eye lands on
 * the ranking first. Rows that cannot be scored are dimmed rather than hidden,
 * because a missing estimate is usually a fixable address.
 */

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Check, Info, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import {
  basisLabel,
  formatMoneyCompact,
  formatMoneyExact,
  type ScoredLead,
} from '@/lib/lead-scoring'

interface Props {
  leads: ScoredLead[]
  busyCustomerId: string | null
  onEstimate: (customerId: string) => void
  onSaveOverride: (customerId: string, value: string, note: string) => Promise<void>
}

/** Score chip. Colour is a coarse band, not a gradient, to stay readable. */
function ScoreCell({ lead }: { lead: ScoredLead }) {
  if (lead.score == null) {
    return <span className="text-sm text-muted-foreground">Unscored</span>
  }

  const tone =
    lead.score >= 70
      ? 'bg-primary text-primary-foreground'
      : lead.score >= 40
        ? 'bg-secondary text-secondary-foreground'
        : 'bg-muted text-muted-foreground'

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 font-mono text-base font-semibold tabular-nums ${tone}`}
      >
        {lead.score}
      </span>
      {lead.limitation === 'insufficient_address' && lead.spendComponent > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            Spend only — no home value could be established, so this score uses
            lifetime spend alone.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Home value cell: figure plus the provenance that makes it trustworthy. */
function HomeValueCell({ lead }: { lead: ScoredLead }) {
  const est = lead.estimate

  if (lead.isOverridden) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-sm tabular-nums">
          {formatMoneyExact(lead.effectiveHomeValue)}
        </span>
        <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
          Manual
        </Badge>
      </div>
    )
  }

  if (lead.limitation === 'insufficient_address') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-help font-normal text-muted-foreground">
            Insufficient address
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          This address has no city, state, or ZIP, so it cannot identify a property or
          even a neighbourhood. Add the missing detail on the customer record, or set a
          manual value.
        </TooltipContent>
      </Tooltip>
    )
  }

  if (lead.limitation === 'not_estimated') {
    return <span className="text-sm text-muted-foreground">Not estimated</span>
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-sm tabular-nums">
        {formatMoneyExact(lead.effectiveHomeValue)}
      </span>
      <div className="flex items-center gap-1.5">
        <Badge
          variant={est?.valueBasis === 'property' ? 'secondary' : 'outline'}
          className="w-fit text-[10px] font-normal uppercase tracking-wide"
        >
          {basisLabel(est?.valueBasis ?? null)}
        </Badge>
        {est?.confidenceNote && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-80">
              <p className="text-xs leading-relaxed">{est.confidenceNote}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Confidence: {est.confidence ?? 'unknown'}
                {est.valueLow != null && est.valueHigh != null
                  ? ` · range ${formatMoneyCompact(est.valueLow)}–${formatMoneyCompact(est.valueHigh)}`
                  : ''}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** Inline override editor. Empty input clears the override. */
function OverrideCell({
  lead,
  onSave,
}: {
  lead: ScoredLead
  onSave: (customerId: string, value: string, note: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function open() {
    setValue(lead.estimate?.overrideHomeValue?.toString() ?? '')
    setNote(lead.estimate?.overrideNote ?? '')
    setEditing(true)
  }

  async function commit() {
    setSaving(true)
    try {
      await onSave(lead.customerId, value, note)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={open}
        className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        {lead.isOverridden ? 'Edit' : 'Set'}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 640000"
        aria-label="Manual home value"
        className="h-8 w-32 font-mono text-sm"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') void commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why? (optional)"
        aria-label="Override note"
        className="h-8 w-40 text-xs"
      />
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={() => void commit()} disabled={saving} className="h-7 gap-1 px-2">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="h-7 px-2"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <p className="w-40 text-[11px] leading-snug text-muted-foreground">
        Leave the amount blank to clear the override and fall back to the estimate.
      </p>
    </div>
  )
}

export function LeadScoreTable({ leads, busyCustomerId, onEstimate, onSaveOverride }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12 text-right font-mono text-xs">#</TableHead>
              <TableHead className="min-w-48">Customer</TableHead>
              <TableHead className="w-40">Home value</TableHead>
              <TableHead className="w-32 text-right">Lifetime spend</TableHead>
              <TableHead className="w-28">Lead score</TableHead>
              <TableHead className="w-44">Manual override</TableHead>
              <TableHead className="w-24 text-right">Estimate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead, i) => (
              <TableRow
                key={lead.customerId}
                className={lead.score == null ? 'opacity-60' : undefined}
              >
                <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium leading-tight">{lead.customerName}</span>
                    <span className="text-xs leading-tight text-muted-foreground">
                      {lead.address || 'No address on file'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <HomeValueCell lead={lead} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {lead.lifetimeSpend > 0 ? formatMoneyExact(lead.lifetimeSpend) : '—'}
                </TableCell>
                <TableCell>
                  <ScoreCell lead={lead} />
                </TableCell>
                <TableCell>
                  <OverrideCell lead={lead} onSave={onSaveOverride} />
                </TableCell>
                <TableCell className="text-right">
                  {lead.limitation === 'insufficient_address' && !lead.isOverridden ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground">n/a</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Address is too incomplete to estimate. Fix the address or set a
                        manual value.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={busyCustomerId === lead.customerId}
                      onClick={() => onEstimate(lead.customerId)}
                      aria-label={`Estimate home value for ${lead.customerName}`}
                    >
                      {busyCustomerId === lead.customerId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
