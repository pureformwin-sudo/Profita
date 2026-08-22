'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Phone,
  MessageSquare,
  FileText,
  CalendarPlus,
  Search,
  Filter,
  AlertCircle,
  MapPin,
  Plus,
  Loader2,
  ChevronRight,
  Star,
  Clock,
  Check,
  X,
  RotateCcw,
  Calendar,
  Users,
  Navigation,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  getLeadsForCurrentRep,
  updateLeadStatus,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadStatus,
} from '@/lib/leads-storage'
import { cn } from '@/lib/utils'
import { LogContactSheet } from '@/components/log-contact-sheet'
import { STATUS_CONFIG } from '../map/page'
import { convertLeadToCustomer, checkLeadConversionStatus } from '@/lib/workflow-conversions'
import { UserPlus, ExternalLink } from 'lucide-react'

function formatRelative(iso: string | null) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function SalesLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  // Lead + channel we're prompting the rep to log, after the tel:/sms: handoff.
  const [contactLog, setContactLog] = useState<{
    lead: Lead
    mode: 'call' | 'text'
  } | null>(null)

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!q) return true
      return (
        l.name?.toLowerCase().includes(q) ||
        l.address?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q)
      )
    })
  }, [leads, search, statusFilter])

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length }
    leads.forEach((l) => {
      counts[l.status] = (counts[l.status] || 0) + 1
    })
    return counts
  }, [leads])

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    const ok = await updateLeadStatus(id, status)
    if (!ok) {
      toast.error('Failed to update status')
      return
    }
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, status, updated_at: new Date().toISOString() } : l
      )
    )
    toast.success(`Updated to ${LEAD_STATUS_LABELS[status]}`)
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4 max-w-4xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-zinc-500">Your full pipeline at a glance</p>
        </div>
        <Button asChild className="bg-emerald-500 hover:bg-emerald-600 gap-2">
          <Link href="/sales/map">
            <Plus className="h-4 w-4" />
            Add Lead
          </Link>
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="pl-9 h-11 bg-zinc-800 border-zinc-700 rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilterSheet(true)}
          className="h-11 gap-2 border-zinc-700 rounded-xl"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
          {statusFilter !== 'all' && (
            <span className="h-5 w-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">
              1
            </span>
          )}
        </Button>
      </div>

      {/* Status Pills (horizontal scroll on mobile) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        <button
          onClick={() => setStatusFilter('all')}
          className={cn(
            'shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all',
            statusFilter === 'all'
              ? 'bg-emerald-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          )}
        >
          All ({statusCounts.all || 0})
        </button>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status as LeadStatus)}
            className={cn(
              'shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
              statusFilter === status
                ? `${config.bg} text-white`
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', config.bg)} />
            {config.label} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Setup banner */}
      {tablesMissing && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-200">Database setup required</div>
            <div className="text-xs text-amber-200/80 mt-1">
              Run the migrations in the scripts folder.
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !tablesMissing && filtered.length === 0 && (
        <div className="rounded-2xl border border-zinc-800 border-dashed p-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-zinc-500" />
          </div>
          <p className="text-lg font-semibold text-white">No leads yet</p>
          <p className="text-sm text-zinc-500 mt-1 mb-4">
            {search || statusFilter !== 'all' 
              ? 'Try adjusting your filters'
              : 'Add your first lead from the map'
            }
          </p>
          <Button asChild className="bg-emerald-500 hover:bg-emerald-600">
            <Link href="/sales/map">
              <Plus className="h-4 w-4 mr-2" />
              Open Map
            </Link>
          </Button>
        </div>
      )}

      {/* Lead cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.knocked
            const Icon = config.icon
            return (
              <div
                key={lead.id}
                className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-4 space-y-4 hover:border-zinc-700 transition-colors"
              >
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', config.bg)}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-white truncate">{lead.name || 'Unknown Lead'}</h3>
                      <span className="text-xs text-zinc-500 tabular-nums shrink-0">
                        {formatRelative(lead.updated_at || lead.created_at)}
                      </span>
                    </div>
                    {lead.address && (
                      <div className="flex items-center gap-1 text-sm text-zinc-400 mt-0.5 truncate">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.address}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-1 text-sm text-zinc-500 mt-0.5">
                        <Phone className="h-3.5 w-3.5" />
                        {lead.phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes preview */}
                {lead.notes && (
                  <p className="text-sm text-zinc-500 line-clamp-2 pl-15">
                    {lead.notes}
                  </p>
                )}

                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className={cn('px-3 py-1 rounded-full text-xs font-semibold', config.bg, 'text-white')}>
                    {config.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedLead(lead)}
                    className="text-zinc-400 hover:text-white gap-1"
                  >
                    View Details
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-4 gap-2">
                  <a
                    href={lead.phone ? `tel:${lead.phone}` : undefined}
                    onClick={() => {
                      // The tel: navigation still happens natively and hands off
                      // to the device dialer; we just queue the log prompt so it
                      // is waiting when the rep returns to the app.
                      if (lead.phone) setContactLog({ lead, mode: 'call' })
                    }}
                    className={cn(
                      'rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col items-center gap-1.5 text-xs font-medium transition-all',
                      lead.phone
                        ? 'hover:bg-zinc-700 hover:border-emerald-500/50 active:scale-95'
                        : 'opacity-40 pointer-events-none'
                    )}
                  >
                    <Phone className="h-4 w-4 text-emerald-400" />
                    Call
                  </a>
                  <a
                    href={lead.phone ? `sms:${lead.phone}` : undefined}
                    onClick={() => {
                      if (lead.phone) setContactLog({ lead, mode: 'text' })
                    }}
                    className={cn(
                      'rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col items-center gap-1.5 text-xs font-medium transition-all',
                      lead.phone
                        ? 'hover:bg-zinc-700 hover:border-blue-500/50 active:scale-95'
                        : 'opacity-40 pointer-events-none'
                    )}
                  >
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                    Text
                  </a>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(lead.id, 'quoted')}
                    className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col items-center gap-1.5 text-xs font-medium hover:bg-zinc-700 hover:border-cyan-500/50 active:scale-95 transition-all"
                  >
                    <FileText className="h-4 w-4 text-cyan-400" />
                    Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(lead.id, 'booked')}
                    className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex flex-col items-center gap-1.5 text-xs font-medium hover:bg-zinc-700 hover:border-purple-500/50 active:scale-95 transition-all"
                  >
                    <CalendarPlus className="h-4 w-4 text-purple-400" />
                    Book
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filter Sheet */}
      <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <SheetContent side="right" className="w-80 border-zinc-800">
          <SheetHeader>
            <SheetTitle>Filter Leads</SheetTitle>
          </SheetHeader>
          <div className="py-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-400 mb-3">By Status</p>
              <div className="space-y-2">
                <button
                  onClick={() => { setStatusFilter('all'); setShowFilterSheet(false) }}
                  className={cn(
                    'w-full px-4 py-3 text-left rounded-xl text-sm font-medium transition-colors flex items-center justify-between',
                    statusFilter === 'all' ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-300'
                  )}
                >
                  All Leads
                  <span className="text-zinc-500">{statusCounts.all || 0}</span>
                </button>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <button
                    key={status}
                    onClick={() => { setStatusFilter(status as LeadStatus); setShowFilterSheet(false) }}
                    className={cn(
                      'w-full px-4 py-3 text-left rounded-xl text-sm font-medium transition-colors flex items-center justify-between',
                      statusFilter === status ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-300'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn('h-3 w-3 rounded-full', config.bg)} />
                      {config.label}
                    </span>
                    <span className="text-zinc-500">{statusCounts[status] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            {statusFilter !== 'all' && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setStatusFilter('all'); setShowFilterSheet(false) }}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Lead Detail Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-0 bg-zinc-900 border-zinc-800">
          {selectedLead && (
            <LeadDetailSheet
              lead={selectedLead}
              onStatusChange={(status) => {
                handleStatusChange(selectedLead.id, status)
                setSelectedLead((prev) => prev ? { ...prev, status } : null)
              }}
              onClose={() => setSelectedLead(null)}
              onLeadUpdated={(updatedLead) => {
                setLeads((prev) => prev.map((l) => l.id === updatedLead.id ? updatedLead : l))
                setSelectedLead(updatedLead)
              }}
              onRequestContactLog={(mode) =>
                setContactLog({ lead: selectedLead, mode })
              }
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Log prompt, shown after handing off to the device dialer / messages app */}
      {contactLog && (
        <LogContactSheet
          open={!!contactLog}
          onOpenChange={(open) => !open && setContactLog(null)}
          mode={contactLog.mode}
          subject={{ leadId: contactLog.lead.id }}
          contactName={contactLog.lead.name || 'this lead'}
          repEmployeeId={contactLog.lead.rep_employee_id}
          onLogged={() => {
            // Mirror the write the sheet just persisted (last_contact_at, and
            // updated_at via updateLead) so the card's "x ago" refreshes without
            // a full reload.
            const now = new Date().toISOString()
            setLeads((prev) =>
              prev.map((l) =>
                l.id === contactLog.lead.id
                  ? { ...l, last_contact_at: now, updated_at: now }
                  : l,
              ),
            )
            setContactLog(null)
          }}
        />
      )}
    </div>
  )
}

// Lead Detail Sheet
function LeadDetailSheet({
  lead,
  onStatusChange,
  onClose,
  onLeadUpdated,
  onRequestContactLog,
}: {
  lead: Lead
  onStatusChange: (status: LeadStatus) => void
  onClose: () => void
  onLeadUpdated: (lead: Lead) => void
  onRequestContactLog: (mode: 'call' | 'text') => void
}) {
  const [converting, setConverting] = useState(false)
  const [conversionStatus, setConversionStatus] = useState<{ converted: boolean; customerId?: string } | null>(null)
  
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.knocked
  const Icon = config.icon
  
  // Check conversion status on mount
  useEffect(() => {
    checkLeadConversionStatus(lead.id).then(setConversionStatus)
  }, [lead.id])
  
  const handleConvertToCustomer = async () => {
    setConverting(true)
    const result = await convertLeadToCustomer(lead.id)
    setConverting(false)
    
    if (result.success) {
      toast.success(result.alreadyConverted 
        ? 'Lead was already converted to a customer' 
        : 'Lead converted to customer successfully!')
      setConversionStatus({ converted: true, customerId: result.customerId })
      // Update lead status locally
      onStatusChange('converted')
      onLeadUpdated({ ...lead, status: 'converted', converted_customer_id: result.customerId || null })
    } else {
      toast.error(result.error || 'Failed to convert lead')
    }
  }

  const QUICK_STATUSES: { status: LeadStatus; label: string; color: string; icon: typeof Star }[] = [
    { status: 'interested',     label: 'Lead',      color: 'bg-blue-500',      icon: Star },
    { status: 'knocked',        label: 'Attempt',   color: 'bg-orange-500',    icon: MapPin },
    { status: 'not_home',       label: 'Return',    color: 'bg-teal-500',      icon: RotateCcw },
    { status: 'booked',         label: 'Appt',      color: 'bg-purple-500',    icon: Calendar },
    { status: 'quoted',         label: 'Quote',     color: 'bg-cyan-500',      icon: FileText },
    { status: 'converted',      label: 'Customer',  color: 'bg-emerald-500',   icon: Check },
    { status: 'not_interested', label: 'No Int.',   color: 'bg-red-500',       icon: X },
    { status: 'lost',           label: 'Pending',   color: 'bg-yellow-500',    icon: Clock },
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-2">
        <div className="w-12 h-1.5 rounded-full bg-zinc-700" />
      </div>

      {/* Header */}
      <div className="px-4 pb-4 border-b border-zinc-800">
        <div className="flex items-start gap-3">
          <div className={cn('h-14 w-14 rounded-2xl flex items-center justify-center shrink-0', config.bg)}>
            <Icon className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{lead.name || 'Unknown'}</h2>
            <p className="text-sm text-zinc-400 truncate">{lead.address || 'No address'}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-400">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3 border-b border-zinc-800 flex gap-2">
        {lead.phone && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 border-zinc-700"
            onClick={() => {
              window.open(`tel:${lead.phone}`)
              onRequestContactLog('call')
            }}
          >
            <Phone className="h-4 w-4 text-emerald-400" />
            Call
          </Button>
        )}
        {lead.phone && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 border-zinc-700"
            onClick={() => {
              window.open(`sms:${lead.phone}`)
              onRequestContactLog('text')
            }}
          >
            <MessageSquare className="h-4 w-4 text-blue-400" />
            Text
          </Button>
        )}
        {lead.address && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 border-zinc-700"
            onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`)}
          >
            <Navigation className="h-4 w-4 text-cyan-400" />
            Directions
          </Button>
        )}
      </div>

      {/* Status Grid */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Change Status</p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_STATUSES.map(({ status, label, color, icon: StatusIcon }) => (
            <button
              key={status}
              onClick={() => onStatusChange(status)}
              className={cn(
                'flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl transition-all text-white',
                color, 'hover:opacity-90',
                lead.status === status && 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
              )}
            >
              <StatusIcon className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {lead.phone && (
            <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
              <p className="text-xs text-zinc-500 mb-1">Phone</p>
              <p className="text-sm text-white font-medium">{lead.phone}</p>
            </div>
          )}
          {lead.email && (
            <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
              <p className="text-xs text-zinc-500 mb-1">Email</p>
              <p className="text-sm text-white font-medium truncate">{lead.email}</p>
            </div>
          )}
          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-xs text-zinc-500 mb-1">Status</p>
            <p className={cn('text-sm font-semibold', config.color)}>{config.label}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-xs text-zinc-500 mb-1">Created</p>
            <p className="text-sm text-white font-medium">
              {new Date(lead.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {lead.notes && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
              {lead.notes}
            </p>
          </div>
        )}
        
        {/* Convert to Customer Section */}
        <div className="pt-4 border-t border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Convert Lead</p>
          {conversionStatus?.converted || lead.converted_customer_id ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Converted to Customer</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 hover:text-emerald-300 gap-1"
                  onClick={() => {
                    const customerId = conversionStatus?.customerId || lead.converted_customer_id
                    if (customerId) {
                      window.location.href = `/customers?id=${customerId}`
                    }
                  }}
                >
                  View Customer
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleConvertToCustomer}
              disabled={converting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2"
            >
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Convert to Customer
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
