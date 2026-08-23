'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Phone,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  MapPin,
  UserCheck,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getLeadsForCurrentRep,
  updateLeadStatus,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  type Lead,
  type LeadStatus,
} from '@/lib/leads-storage'
import { cn } from '@/lib/utils'
import { useContactLog } from '@/components/use-contact-log'

// Active swimlanes left → right
const ACTIVE_COLUMNS: LeadStatus[] = [
  'knocked',
  'interested',
  'quoted',
  'booked',
  'converted',
]

// Tailwind classes per column accent
const COLUMN_TONE: Record<LeadStatus, { ring: string; dot: string; chip: string }> = {
  knocked: { ring: 'ring-slate-500/20', dot: 'bg-slate-400', chip: 'bg-slate-500/15 text-slate-300' },
  not_home: { ring: 'ring-zinc-500/20', dot: 'bg-zinc-400', chip: 'bg-zinc-500/15 text-zinc-300' },
  not_interested: { ring: 'ring-rose-500/20', dot: 'bg-rose-400', chip: 'bg-rose-500/15 text-rose-300' },
  interested: { ring: 'ring-amber-500/20', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300' },
  quoted: { ring: 'ring-sky-500/20', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300' },
  booked: { ring: 'ring-violet-500/20', dot: 'bg-violet-400', chip: 'bg-violet-500/15 text-violet-300' },
  converted: { ring: 'ring-emerald-500/20', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300' },
  lost: { ring: 'ring-gray-500/20', dot: 'bg-gray-400', chip: 'bg-gray-500/15 text-gray-300' },
}

export default function SalesPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, tablesMissing } = await getLeadsForCurrentRep()
      if (cancelled) return
      setLeads(data)
      setTablesMissing(tablesMissing)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {} as Record<LeadStatus, Lead[]>
    ACTIVE_COLUMNS.forEach((s) => (map[s] = []))
    leads.forEach((l) => {
      if (ACTIVE_COLUMNS.includes(l.status)) {
        map[l.status].push(l)
      }
    })
    return map
  }, [leads])

  const totals = useMemo(
    () => ACTIVE_COLUMNS.map((s) => grouped[s]?.length ?? 0),
    [grouped]
  )

  const handleMove = async (lead: Lead, status: LeadStatus) => {
    const ok = await updateLeadStatus(lead.id, status)
    if (!ok) {
      toast.error('Failed to move lead')
      return
    }
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id ? { ...l, status, updated_at: new Date().toISOString() } : l
      )
    )
    toast.success(`Moved to ${LEAD_STATUS_LABELS[status]}`)
  }

  const handleAdvance = (lead: Lead) => {
    const idx = ACTIVE_COLUMNS.indexOf(lead.status)
    const next = ACTIVE_COLUMNS[idx + 1]
    if (next) handleMove(lead, next)
  }

  const handleRetreat = (lead: Lead) => {
    const idx = ACTIVE_COLUMNS.indexOf(lead.status)
    const prev = ACTIVE_COLUMNS[idx - 1]
    if (prev) handleMove(lead, prev)
  }

  // Track which column is active on mobile via scroll snap
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const handler = () => {
      const w = el.clientWidth
      if (w === 0) return
      const idx = Math.round(el.scrollLeft / w)
      if (idx !== activeIndex) setActiveIndex(idx)
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [activeIndex])

  const goToColumn = (idx: number) => {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(ACTIVE_COLUMNS.length - 1, idx))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    setActiveIndex(clamped)
  }

  return (
    <div className="px-4 pt-4 pb-6 space-y-4 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Move leads through your sales stages</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="text-2xl font-bold tabular-nums">
            {totals.reduce((a, b) => a + b, 0)}
          </div>
        </div>
      </div>

      {/* Setup banner */}
      {tablesMissing && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-200">Database setup required</div>
            <div className="text-xs text-amber-200/80 mt-1">
              Run script <code className="font-mono">09-multi-mode-foundation.sql</code> in
              Supabase, then refresh.
            </div>
          </div>
        </div>
      )}

      {/* Mobile column nav (md hidden) */}
      <div className="md:hidden flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToColumn(activeIndex - 1)}
          disabled={activeIndex === 0}
          className="h-9 w-9 rounded-full shrink-0"
          aria-label="Previous stage"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 grid grid-cols-5 gap-1.5">
          {ACTIVE_COLUMNS.map((s, i) => {
            const tone = COLUMN_TONE[s]
            const active = i === activeIndex
            return (
              <button
                key={s}
                type="button"
                onClick={() => goToColumn(i)}
                className={cn(
                  'rounded-full text-[10px] font-semibold py-1.5 px-2 transition-all flex items-center justify-center gap-1 truncate',
                  active
                    ? `${tone.chip} ring-1 ${tone.ring} shadow`
                    : 'bg-card text-muted-foreground border border-border'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', tone.dot)} />
                <span className="truncate">{LEAD_STATUS_LABELS[s]}</span>
                <span className="tabular-nums opacity-70">{totals[i]}</span>
              </button>
            )
          })}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToColumn(activeIndex + 1)}
          disabled={activeIndex === ACTIVE_COLUMNS.length - 1}
          className="h-9 w-9 rounded-full shrink-0"
          aria-label="Next stage"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-card/40 border border-border animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Kanban: mobile = swipeable, md+ = grid */}
      {!loading && (
        <>
          {/* Mobile swipe scroller */}
          <div
            ref={scrollerRef}
            className="md:hidden flex snap-x snap-mandatory overflow-x-auto scrollbar-hide -mx-4 px-4 scroll-smooth-ios"
            style={{ scrollPaddingLeft: '1rem', scrollPaddingRight: '1rem' }}
          >
            {ACTIVE_COLUMNS.map((status) => (
              <div
                key={status}
                className="snap-center shrink-0 w-full pr-3 last:pr-0"
              >
                <PipelineColumn
                  status={status}
                  list={grouped[status] || []}
                  onAdvance={handleAdvance}
                  onRetreat={handleRetreat}
                  onMove={handleMove}
                />
              </div>
            ))}
          </div>

          {/* Desktop grid */}
          <div className="hidden md:grid md:grid-cols-5 gap-3">
            {ACTIVE_COLUMNS.map((status) => (
              <PipelineColumn
                key={status}
                status={status}
                list={grouped[status] || []}
                onAdvance={handleAdvance}
                onRetreat={handleRetreat}
                onMove={handleMove}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PipelineColumn({
  status,
  list,
  onAdvance,
  onRetreat,
  onMove,
}: {
  status: LeadStatus
  list: Lead[]
  onAdvance: (lead: Lead) => void
  onRetreat: (lead: Lead) => void
  onMove: (lead: Lead, status: LeadStatus) => void
}) {
  const tone = COLUMN_TONE[status]
  const idx = ACTIVE_COLUMNS.indexOf(status)
  const canAdvance = idx < ACTIVE_COLUMNS.length - 1
  const canRetreat = idx > 0
  const { requestLog, requestText, contactSheets } = useContactLog()

  return (
    <div className={cn('rounded-2xl bg-card/60 border border-border ring-1 p-3 flex flex-col', tone.ring)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
          <h3 className="font-semibold text-sm">{LEAD_STATUS_LABELS[status]}</h3>
        </div>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums', tone.chip)}>
          {list.length}
        </span>
      </div>

      <div className="space-y-2 min-h-[120px]">
        {list.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
            No leads here
          </div>
        )}

        {list.map((lead) => {
          const colors = LEAD_STATUS_COLORS[lead.status]
          const initials = (lead.name || lead.address || '?').slice(0, 2).toUpperCase()
          return (
            <div
              key={lead.id}
              className="rounded-xl bg-background border border-border p-3 space-y-2 hover:border-emerald-500/30 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div
                  className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center font-bold text-white text-xs shadow"
                  style={{ background: colors.pin }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">
                    {lead.name || 'Unnamed'}
                  </div>
                  {lead.address && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{lead.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Phone links */}
              {lead.phone && (
                <div className="flex items-center gap-3">
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={() =>
                      requestLog('call', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)
                    }
                    className="text-xs text-emerald-400 inline-flex items-center gap-1 hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </a>
                  <button
                    type="button"
                    aria-label={`Text ${lead.name || 'lead'}`}
                    onClick={(e) => {
                      // Card itself is clickable; don't also open the lead detail.
                      e.stopPropagation()
                      requestText({ leadId: lead.id }, lead.name || '', lead.phone, lead.rep_employee_id)
                    }}
                    className="text-xs text-sky-400 inline-flex items-center gap-1 hover:underline"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Text
                  </button>
                </div>
              )}

              {/* Conversion indicator - show when lead has been converted to customer */}
              {lead.converted_customer_id && (
                <a
                  href={`/customers?id=${lead.converted_customer_id}`}
                  className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 hover:bg-emerald-500/20 transition-colors"
                >
                  <UserCheck className="h-3 w-3" />
                  <span>Customer Created</span>
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </a>
              )}

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetreat(lead)}
                  disabled={!canRetreat}
                  className="h-7 px-2 text-[11px]"
                  aria-label="Move back"
                >
                  <ArrowLeft className="h-3 w-3" />
                </Button>
                <Select
                  value={lead.status}
                  onValueChange={(v) => onMove(lead, v as LeadStatus)}
                >
                  <SelectTrigger className="h-7 text-[11px] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: LEAD_STATUS_COLORS[s].pin }}
                          />
                          {LEAD_STATUS_LABELS[s]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => onAdvance(lead)}
                  disabled={!canAdvance}
                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-500"
                  aria-label="Advance stage"
                >
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {contactSheets}
    </div>
  )
}
