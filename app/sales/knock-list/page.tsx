'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DoorOpen,
  MapPin,
  Navigation,
  Phone,
  Clock,
  Filter,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Sparkles,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  type Lead,
  type LeadStatus,
} from '@/lib/leads-storage'
import { cn } from '@/lib/utils'
import { useContactLog } from '@/components/use-contact-log'

const KNOCK_STATUSES: LeadStatus[] = ['knocked', 'not_home', 'not_interested']

function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const x =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(x))
}

function formatDistance(km: number): string {
  if (km < 0.1) return '< 100m'
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

function formatLastKnock(iso: string | null): string {
  if (!iso) return 'Never knocked'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Knocked today'
  if (days === 1) return 'Knocked yesterday'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

export default function SalesKnockListPage() {
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [sortBy, setSortBy] = useState<'distance' | 'recent' | 'oldest'>('distance')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const { requestLog, requestText, contactSheets } = useContactLog(() => loadData())

  const loadData = async () => {
    setLoading(true)
    const { data, tablesMissing } = await getLeadsForCurrentRep()
    setAllLeads(data)
    setTablesMissing(tablesMissing)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // Try to get location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      )
    }
  }, [])

  // Filter to only knockable leads
  const knockableLeads = useMemo(() => {
    return allLeads.filter((l) => {
      // Only show early-stage leads that need knocking
      if (!KNOCK_STATUSES.includes(l.status)) return false
      // Filter by specific status if selected
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      // Only leads with coordinates for distance sorting
      if (sortBy === 'distance' && (l.lat == null || l.lng == null)) return false
      return true
    })
  }, [allLeads, statusFilter, sortBy])

  // Sort leads
  const sortedLeads = useMemo(() => {
    const leads = [...knockableLeads]
    
    if (sortBy === 'distance' && userLocation) {
      return leads
        .map((l) => ({
          lead: l,
          distance: l.lat && l.lng ? distanceKm(userLocation, [l.lat, l.lng]) : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance)
        .map((x) => x.lead)
    }
    
    if (sortBy === 'recent') {
      return leads.sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return bTime - aTime
      })
    }
    
    if (sortBy === 'oldest') {
      return leads.sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : Infinity
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : Infinity
        return aTime - bTime
      })
    }
    
    return leads
  }, [knockableLeads, sortBy, userLocation])

  const handleQuickStatus = async (lead: Lead, newStatus: LeadStatus) => {
    const ok = await updateLeadStatus(lead.id, newStatus)
    if (ok) {
      toast.success(`Marked as ${LEAD_STATUS_LABELS[newStatus]}`)
      // Update local state
      setAllLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus, updated_at: new Date().toISOString() } : l))
      )
    } else {
      toast.error('Failed to update status')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tablesMissing) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-2">Database Setup Required</h2>
          <p className="text-sm text-muted-foreground">
            Run the migration script to create the leads table.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DoorOpen className="h-6 w-6 text-primary" />
            Knock List
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sortedLeads.length} leads to knock
            {userLocation && sortBy === 'distance' && ' (sorted by distance)'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="distance">Nearest</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="recent">Recent first</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {KNOCK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty State */}
      {sortedLeads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold mb-1">No leads to knock</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            {statusFilter !== 'all'
              ? `No leads with status "${LEAD_STATUS_LABELS[statusFilter as LeadStatus]}"`
              : 'All your leads have progressed past the knocking stage!'}
          </p>
        </div>
      )}

      {/* Lead Cards */}
      <div className="space-y-3">
        {sortedLeads.map((lead) => {
          const statusColor = LEAD_STATUS_COLORS[lead.status]
          const distance =
            userLocation && lead.lat && lead.lng
              ? distanceKm(userLocation, [lead.lat, lead.lng])
              : null

          return (
            <Card
              key={lead.id}
              className="group relative overflow-hidden hover:border-primary/30 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider shrink-0"
                        style={{
                          backgroundColor: statusColor?.bg,
                          color: statusColor?.text,
                          borderColor: 'transparent',
                        }}
                      >
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Badge>
                      {distance !== null && (
                        <span className="text-xs text-muted-foreground">
                          {formatDistance(distance)}
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-foreground truncate">
                      {lead.name || 'Unknown'}
                    </h3>

                    {lead.address && (
                      <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {lead.address}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatLastKnock(lead.updated_at)}
                    </p>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {lead.lat && lead.lng && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                        asChild
                      >
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${lead.lat},${lead.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {lead.phone && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                          asChild
                        >
                          <a
                            href={`tel:${lead.phone}`}
                            aria-label={`Call ${lead.name || 'lead'}`}
                            onClick={() => requestLog('call', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-sky-500/10 text-sky-500 hover:bg-sky-500/20"
                          aria-label={`Text ${lead.name || 'lead'}`}
                          onClick={() =>
                            requestText({ leadId: lead.id }, lead.name || '', lead.phone, lead.rep_employee_id)
                          }
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick Status Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                    onClick={() => handleQuickStatus(lead, 'not_interested')}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Not Interested
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                    onClick={() => handleQuickStatus(lead, 'interested')}
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Interested
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {contactSheets}
    </div>
  )
}
