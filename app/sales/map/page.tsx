'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useContactLog } from '@/components/use-contact-log'
import {
  Search,
  Plus,
  Navigation,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  ChevronRight,
  X,
  Star,
  Calendar,
  FileText,
  Check,
  Crosshair,
  Filter,
  User,
  DollarSign,
  ArrowRight,
  RotateCcw,
  Copy,
  AlertCircle,
  Loader2,
  Clock,
  Compass,
  Box,
} from 'lucide-react'
import {
  getLeadsForCurrentRep,
  createLead,
  updateLead,
  deleteLead,
  type Lead,
  type LeadStatus,
} from '@/lib/leads-storage'
import { NotificationActionsDialog } from '@/components/notification-actions'

// Dynamic import for the map (client-only)
const SalesMap = dynamic(() => import('@/components/sales/sales-map').then(m => m.SalesMap), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <span className="text-sm text-zinc-400">Loading map...</span>
      </div>
    </div>
  ),
})

// Status configuration with premium colors
export const STATUS_CONFIG: Record<string, { icon: typeof Star; color: string; bg: string; label: string; markerColor: string }> = {
  interested:     { icon: Star,        color: 'text-blue-400',    bg: 'bg-blue-500',    label: 'Lead',       markerColor: '#3b82f6' },
  knocked:        { icon: MapPin,      color: 'text-orange-400',  bg: 'bg-orange-500',  label: 'Attempted',  markerColor: '#f97316' },
  not_home:       { icon: RotateCcw,   color: 'text-teal-400',    bg: 'bg-teal-500',    label: 'Return',     markerColor: '#14b8a6' },
  booked:         { icon: Calendar,    color: 'text-purple-400',  bg: 'bg-purple-500',  label: 'Appointment',markerColor: '#a855f7' },
  quoted:         { icon: FileText,    color: 'text-cyan-400',    bg: 'bg-cyan-500',    label: 'Quote',      markerColor: '#06b6d4' },
  lost:           { icon: Clock,       color: 'text-yellow-400',  bg: 'bg-yellow-500',  label: 'Pending',    markerColor: '#eab308' },
  converted:      { icon: Check,       color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Customer',   markerColor: '#10b981' },
  not_interested: { icon: X,           color: 'text-red-400',     bg: 'bg-red-500',     label: 'Not Int.',   markerColor: '#ef4444' },
}

// Quick status buttons for the lead drawer
const QUICK_STATUSES: { status: LeadStatus; label: string; color: string; icon: typeof Star }[] = [
  { status: 'interested',     label: 'Lead',      color: 'bg-blue-500 hover:bg-blue-600',      icon: Star },
  { status: 'knocked',        label: 'Attempt',   color: 'bg-orange-500 hover:bg-orange-600',  icon: MapPin },
  { status: 'not_home',       label: 'Return',    color: 'bg-teal-500 hover:bg-teal-600',      icon: RotateCcw },
  { status: 'booked',         label: 'Appt',      color: 'bg-purple-500 hover:bg-purple-600',  icon: Calendar },
  { status: 'quoted',         label: 'Quote',     color: 'bg-cyan-500 hover:bg-cyan-600',      icon: FileText },
  { status: 'converted',      label: 'Customer',  color: 'bg-emerald-500 hover:bg-emerald-600',icon: Check },
  { status: 'not_interested', label: 'No Int.',   color: 'bg-red-500 hover:bg-red-600',        icon: X },
  { status: 'lost',           label: 'Pending',   color: 'bg-yellow-500 hover:bg-yellow-600',  icon: Clock },
]

// Default center (Fresno, CA)
const DEFAULT_CENTER: [number, number] = [36.7378, -119.7871]

// Setup SQL for leads table
const SETUP_SQL = `-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  owner_employee_id UUID,
  name TEXT DEFAULT '',
  address TEXT,
  phone TEXT,
  email TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'knocked',
  notes TEXT,
  source TEXT DEFAULT 'd2d',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all" ON leads;
CREATE POLICY "leads_all" ON leads FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);`

type ViewMode = 'map' | 'street' | 'leads'
type MapStyle = 'satellite' | 'street' | 'standard'

export default function SalesHubPage() {
  // State
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [mapReady, setMapReady] = useState(false)
  const [newLeadCoords, setNewLeadCoords] = useState<[number, number] | null>(null)
  const [prefilledAddress, setPrefilledAddress] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [saving, setSaving] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [is3D, setIs3D] = useState(false)
  const [notificationLead, setNotificationLead] = useState<Lead | null>(null)
  const [bearing, setBearing] = useState(0)
  const mapRef = useRef<any>(null)

  // Get user location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setUserLocation(coords)
          setMapCenter(coords)
          setMapReady(true)
        },
        () => {
          setMapCenter(DEFAULT_CENTER)
          setMapReady(true)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setMapReady(true)
    }
  }, [])

  // Load leads
  useEffect(() => {
    if (!mapReady) return
    async function loadLeads() {
      const { data, tablesMissing: missing } = await getLeadsForCurrentRep()
      setLeads(data)
      setTablesMissing(missing)
      setLoading(false)
    }
    loadLeads()
  }, [mapReady])

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          lead.name?.toLowerCase().includes(q) ||
          lead.address?.toLowerCase().includes(q) ||
          lead.phone?.includes(q)
        )
      }
      return true
    })
  }, [leads, statusFilter, searchQuery])

  // Handle map click (add new lead) - with reverse geocoded address
  const handleMapClick = useCallback((coords: [number, number], address?: string) => {
    setNewLeadCoords(coords)
    setPrefilledAddress(address || '')
    setShowAddSheet(true)
  }, [])

  // Handle lead marker click
  const handleLeadClick = useCallback((lead: Lead) => {
    setSelectedLead(lead)
  }, [])

  // Center on user location
  const handleCenterOnUser = useCallback(() => {
    if (userLocation) {
      setMapCenter([...userLocation])
    } else {
      toast.error('Location not available')
    }
  }, [userLocation])

  // Add new lead
  const handleAddLead = async (data: { 
    name: string
    address: string
    phone: string
    email: string
    notes: string
    status: LeadStatus
    service: string
  }) => {
    setSaving(true)
    
    const lat = newLeadCoords?.[0] ?? userLocation?.[0] ?? null
    const lng = newLeadCoords?.[1] ?? userLocation?.[1] ?? null
    
    const result = await createLead({
      name: data.name || '',
      address: data.address,
      phone: data.phone,
      email: data.email,
      notes: data.service ? `Service: ${data.service}\n${data.notes}` : data.notes,
      status: data.status,
      lat,
      lng,
    })
    setSaving(false)
    
    if (result.tablesMissing) {
      toast.error('Database setup required')
      setShowAddSheet(false)
      setShowSetupDialog(true)
      return
    }
    
    if (result.data && !result.error) {
      setLeads((prev) => [result.data!, ...prev])
      toast.success('Lead added!')
      setShowAddSheet(false)
      setNewLeadCoords(null)
      // Show notification dialog if lead has phone or email
      if (result.data.phone || result.data.email) {
        setNotificationLead(result.data)
      } else {
        setSelectedLead(result.data)
      }
    } else {
      toast.error(result.error || 'Failed to add lead')
    }
  }

  // Update lead status
  const handleUpdateStatus = async (status: LeadStatus) => {
    if (!selectedLead) return
    setSaving(true)
    const success = await updateLead(selectedLead.id, { status })
    setSaving(false)
    
    if (success) {
      setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, status } : l))
      setSelectedLead((prev) => prev ? { ...prev, status } : null)
      toast.success(`Updated to ${STATUS_CONFIG[status]?.label || status}`)
    } else {
      toast.error('Failed to update status')
    }
  }

  // Update lead notes
  const handleUpdateNotes = async (notes: string) => {
    if (!selectedLead) return
    const success = await updateLead(selectedLead.id, { notes })
    if (success) {
      setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, notes } : l))
      setSelectedLead((prev) => prev ? { ...prev, notes } : null)
    }
  }
  
  // Delete lead
  const handleDeleteLead = async () => {
    if (!selectedLead) return
    setSaving(true)
    const success = await deleteLead(selectedLead.id)
    setSaving(false)
    
    if (success) {
      setLeads((prev) => prev.filter((l) => l.id !== selectedLead.id))
      setSelectedLead(null)
      toast.success('Lead deleted')
    } else {
      toast.error('Failed to delete lead')
    }
  }

  // Mobile: header=48px, bottom nav=64px, map top bar=52px
  // Desktop: sidebar handles its own height, content fills remaining
  return (
    <div className="h-full flex flex-col bg-zinc-950 relative overflow-hidden">
      {/* Top Bar - z-50 to stay above map */}
      <div className="shrink-0 bg-zinc-900/95 backdrop-blur-xl border-b border-zinc-800 px-3 py-2 flex items-center gap-2 z-50 relative">
        {/* Filter Button - iOS style */}
        <button
          onClick={() => setShowFilterSheet(true)}
          className="h-9 w-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
        >
          <Filter className="h-5 w-5" />
        </button>

        {/* iOS-style View Mode Segmented Control */}
        <div className="flex-1 flex items-center justify-center">
          <div className="inline-flex bg-zinc-800/80 backdrop-blur-sm rounded-full p-1 border border-zinc-700/30">
            {([
              { key: 'map', label: 'Map' },
              { key: 'street', label: 'Street' },
              { key: 'leads', label: 'Leads' },
            ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={cn(
                  'px-5 py-1.5 text-sm font-semibold rounded-full transition-all',
                  viewMode === key
                    ? 'bg-emerald-500 text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* iOS-style Add Button */}
        <button
          onClick={() => {
            setNewLeadCoords(null)
            setShowAddSheet(true)
          }}
          className="h-9 w-9 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Setup Banner */}
      {tablesMissing && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-500">Database setup required. Run the migration in scripts/</p>
          </div>
        </div>
      )}

      {/* Map View - z-0 to stay below UI */}
      {viewMode === 'map' && (
        <div className="flex-1 relative min-h-0 z-0">
          {mapReady ? (
<SalesMap
  leads={filteredLeads}
  center={mapCenter}
  userLocation={userLocation}
  mapStyle={mapStyle}
  onLeadClick={handleLeadClick}
  onMapClick={handleMapClick}
  selectedLeadId={selectedLead?.id}
  is3D={is3D}
  onBearingChange={setBearing}
  mapRef={mapRef}
  disableMapClick={showAddSheet || !!selectedLead}
  />
          ) : (
            <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                <span className="text-sm text-zinc-400">Getting your location...</span>
              </div>
            </div>
          )}

          {/* iOS-style Map Controls - top right */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-3 z-30 pointer-events-auto">
            {/* Apple Maps-style Segmented Control */}
            <div className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl rounded-lg p-1 flex gap-0.5 shadow-lg border border-black/5 dark:border-white/10">
              {([
                { key: 'satellite', label: 'Map', icon: '🗺️' },
                { key: 'street', label: 'Street', icon: '🛣️' },
                { key: 'standard', label: 'Explore', icon: '🧭' },
              ] as { key: MapStyle; label: string; icon: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMapStyle(key)}
                  className={cn(
                    'px-4 py-2 text-sm font-semibold rounded-md transition-all',
                    mapStyle === key
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            
            {/* iOS-style Control Buttons */}
            <div className="flex flex-col gap-2">
              {/* 3D Toggle - iOS style pill button */}
              <button
                onClick={() => setIs3D(!is3D)}
                className={cn(
                  'h-11 px-4 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-xl transition-all font-semibold text-sm',
                  is3D
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/95 dark:bg-zinc-800/95 text-zinc-700 dark:text-zinc-200 border border-black/5 dark:border-white/10'
                )}
              >
                <Box className="h-4 w-4" />
                <span>{is3D ? '3D' : '2D'}</span>
              </button>
              
              {/* Compass - Apple Maps style (circular, only when rotated) */}
              {Math.abs(bearing) > 1 && (
                <button
                  onClick={() => {
                    mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })
                  }}
                  className="h-11 w-11 rounded-full flex items-center justify-center bg-white/95 dark:bg-zinc-800/95 shadow-lg backdrop-blur-xl border border-black/5 dark:border-white/10 transition-all"
                  title="Reset compass"
                >
                  <div style={{ transform: `rotate(${-bearing}deg)` }} className="transition-transform">
                    <Compass className="h-5 w-5 text-red-500" />
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* iOS-style Location Button - bottom right, above mobile nav */}
          <button
            onClick={handleCenterOnUser}
            className="absolute bottom-20 lg:bottom-6 right-4 h-12 w-12 rounded-full bg-white/95 dark:bg-zinc-800/95 shadow-lg backdrop-blur-xl border border-black/5 dark:border-white/10 z-30 pointer-events-auto flex items-center justify-center transition-all active:scale-95"
          >
            <Crosshair className="h-5 w-5 text-emerald-500" />
          </button>
        </div>
      )}

      {/* Street View (Placeholder) */}
      {viewMode === 'street' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-20 w-20 rounded-3xl bg-zinc-800 flex items-center justify-center mb-4">
              <MapPin className="h-10 w-10 text-zinc-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Street Mode</h3>
            <p className="text-zinc-400 max-w-sm">
              Walk streets and quickly log each house. Coming in the next update.
            </p>
          </div>
        </div>
      )}

      {/* Leads List View */}
      {viewMode === 'leads' && (
        <div className="flex-1 overflow-auto">
          {/* Search */}
          <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-xl p-3 border-b border-zinc-800 z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-800 border-zinc-700 h-11"
              />
            </div>
          </div>

          {/* Lead List */}
          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="h-16 w-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-zinc-500" />
                </div>
                <p className="text-lg font-semibold text-white mb-1">No leads found</p>
                <p className="text-sm text-zinc-400">Tap + to add your first lead</p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.knocked
                const Icon = config.icon
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left active:bg-zinc-800"
                  >
                    <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center shrink-0', config.bg)}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{lead.name || 'Unknown'}</p>
                      <p className="text-sm text-zinc-400 truncate">{lead.address || 'No address'}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-600 shrink-0" />
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Lead Detail Panel - z-[70] above map controls */}
      {selectedLead && (
        <>
          {/* Desktop: Floating right panel */}
          <div className="hidden lg:block fixed top-4 right-4 bottom-4 w-[380px] z-[70] pointer-events-auto">
            <div className="h-full bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-2xl overflow-hidden flex flex-col">
<LeadDrawer
  lead={selectedLead}
  onUpdateStatus={handleUpdateStatus}
  onUpdateNotes={handleUpdateNotes}
  onDelete={handleDeleteLead}
  onClose={() => setSelectedLead(null)}
  saving={saving}
  />
  </div>
  </div>
  
  {/* Mobile: Bottom sheet */}
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-[70]">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[69]"
              onClick={() => setSelectedLead(null)}
            />
            {/* Sheet */}
            <div className="relative bg-zinc-900 rounded-t-3xl border-t border-zinc-700/50 max-h-[80vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300 z-[70]">
<LeadDrawer
  lead={selectedLead}
  onUpdateStatus={handleUpdateStatus}
  onUpdateNotes={handleUpdateNotes}
  onDelete={handleDeleteLead}
  onClose={() => setSelectedLead(null)}
  saving={saving}
  />
  </div>
  </div>
  </>
  )}

      {/* Add Lead Sheet - Bottom sheet on mobile, right drawer on desktop */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] rounded-t-3xl border-zinc-800 bg-zinc-900 p-0 lg:hidden"
        >
          <div className="h-full flex flex-col">
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>
            <SheetHeader className="px-4 pb-2">
              <SheetTitle className="text-white text-lg">Quick Add Lead</SheetTitle>
            </SheetHeader>
            <AddLeadForm
              onSubmit={handleAddLead}
              onCancel={() => {
                setShowAddSheet(false)
                setNewLeadCoords(null)
                setPrefilledAddress('')
              }}
              saving={saving}
              hasCoords={!!newLeadCoords}
              prefilledAddress={prefilledAddress}
            />
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Desktop Add Lead Drawer */}
      {showAddSheet && (
        <div className="hidden lg:block fixed inset-y-0 right-0 w-[420px] z-[80] pointer-events-auto">
          <div 
            className="absolute inset-0 bg-black/30 -left-[100vw] w-[100vw]" 
            onClick={() => {
              setShowAddSheet(false)
              setNewLeadCoords(null)
              setPrefilledAddress('')
            }}
          />
          <div 
            className="relative h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Quick Add Lead</h2>
              <button
                onClick={() => {
                  setShowAddSheet(false)
                  setNewLeadCoords(null)
                  setPrefilledAddress('')
                }}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <AddLeadForm
              onSubmit={handleAddLead}
              onCancel={() => {
                setShowAddSheet(false)
                setNewLeadCoords(null)
                setPrefilledAddress('')
              }}
              saving={saving}
              hasCoords={!!newLeadCoords}
              prefilledAddress={prefilledAddress}
            />
          </div>
        </div>
      )}

      {/* Filter Sheet */}
      <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <SheetContent side="left" className="w-80 border-zinc-800">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-400 mb-3">Status</p>
              <div className="space-y-1">
                <button
                  onClick={() => { setStatusFilter('all'); setShowFilterSheet(false) }}
                  className={cn(
                    'w-full px-3 py-2.5 text-left rounded-xl text-sm font-medium transition-colors',
                    statusFilter === 'all' ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-300'
                  )}
                >
                  All Statuses
                </button>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <button
                    key={status}
                    onClick={() => { setStatusFilter(status as LeadStatus); setShowFilterSheet(false) }}
                    className={cn(
                      'w-full px-3 py-2.5 text-left rounded-xl text-sm font-medium transition-colors flex items-center gap-3',
                      statusFilter === status ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-300'
                    )}
                  >
                    <div className={cn('h-3 w-3 rounded-full', config.bg)} />
                    {config.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Database Setup Dialog */}
      <Dialog open={showSetupDialog || tablesMissing} onOpenChange={setShowSetupDialog}>
        <DialogContent className="max-w-xl bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Database Setup Required
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              The leads table needs to be created in your Supabase database.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-zinc-800 rounded-lg p-4 max-h-64 overflow-auto">
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">{SETUP_SQL}</pre>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(SETUP_SQL)
                    toast.success('SQL copied to clipboard!')
                  } catch {
                    toast.error('Failed to copy')
                  }
                }}
                className="flex-1 gap-2 bg-emerald-500 hover:bg-emerald-600"
              >
                <Copy className="h-4 w-4" />
                Copy SQL
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSetupDialog(false)
                  setTablesMissing(false)
                  window.location.reload()
                }}
                className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
              >
                I Ran It - Refresh
              </Button>
            </div>
            
            <p className="text-xs text-zinc-500 text-center">
              Go to Supabase Dashboard → SQL Editor → New Query → Paste → Run
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notification Actions Dialog - shown after lead creation */}
      <NotificationActionsDialog
        open={!!notificationLead}
        onOpenChange={(open) => !open && setNotificationLead(null)}
        customer={{
          id: notificationLead?.id || '',
          name: notificationLead?.name || 'New Lead',
          phone: notificationLead?.phone,
          email: notificationLead?.email,
          address: notificationLead?.address,
        }}
        type="lead_created"
        onComplete={() => {
          if (notificationLead) {
            setSelectedLead(notificationLead)
          }
          setNotificationLead(null)
        }}
      />
    </div>
  )
}

// Lead Drawer Component - Premium floating panel design
function LeadDrawer({
  lead,
  onUpdateStatus,
  onUpdateNotes,
  onDelete,
  onClose,
  saving,
}: {
  lead: Lead
  onUpdateStatus: (status: LeadStatus) => void
  onUpdateNotes: (notes: string) => void
  onDelete: () => void
  onClose: () => void
  saving: boolean
}) {
  const [notes, setNotes] = useState(lead.notes || '')
  const [showNotes, setShowNotes] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.knocked
  const { requestLog, logSheet } = useContactLog()

  useEffect(() => {
    setNotes(lead.notes || '')
  }, [lead.id, lead.notes])

  const handleNotesBlur = () => {
    if (notes !== lead.notes) {
      onUpdateNotes(notes)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mobile drag handle */}
      <div className="lg:hidden flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-zinc-600" />
      </div>

      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-700/50">
        <div className="flex items-start gap-4">
          <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', config.bg)}>
            <config.icon className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate leading-tight">
              {lead.name || 'Unknown Lead'}
            </h2>
            <p className="text-sm text-zinc-400 truncate mt-0.5">{lead.address || 'No address'}</p>
            <div className={cn('inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold', config.bg)}>
              <config.icon className="h-3 w-3" />
              {config.label}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="px-5 py-3 border-b border-zinc-700/50">
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => {
              if (!lead.phone) return
              window.open(`tel:${lead.phone}`)
              requestLog('call', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)
            }}
            disabled={!lead.phone}
            className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors disabled:opacity-30"
          >
            <Phone className="h-5 w-5 text-emerald-400" />
            <span className="text-[11px] font-medium text-zinc-300">Call</span>
          </button>
          <button
            onClick={() => {
              if (!lead.phone) return
              window.open(`sms:${lead.phone}`)
              requestLog('text', { leadId: lead.id }, lead.name || '', lead.rep_employee_id)
            }}
            disabled={!lead.phone}
            className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors disabled:opacity-30"
          >
            <MessageSquare className="h-5 w-5 text-blue-400" />
            <span className="text-[11px] font-medium text-zinc-300">Text</span>
          </button>
          <button
            onClick={() => lead.address && window.open(`https://maps.google.com/?daddr=${encodeURIComponent(lead.address)}`)}
            disabled={!lead.address}
            className="flex flex-col items-center gap-1 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors disabled:opacity-30"
          >
            <Navigation className="h-5 w-5 text-cyan-400" />
            <span className="text-[11px] font-medium text-zinc-300">Directions</span>
          </button>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={cn(
              'flex flex-col items-center gap-1 py-2 rounded-lg transition-colors',
              showNotes ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800/50 hover:bg-zinc-700/50'
            )}
          >
            <FileText className="h-5 w-5 text-amber-400" />
            <span className="text-[11px] font-medium text-zinc-300">Notes</span>
          </button>
        </div>
      </div>

      {/* Status Grid */}
      <div className="px-5 py-4 border-b border-zinc-700/50">
        <div className="grid grid-cols-4 gap-2">
          {QUICK_STATUSES.map(({ status, label, color, icon: StatusIcon }) => (
            <button
              key={status}
              onClick={() => onUpdateStatus(status)}
              disabled={saving}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all text-white relative',
                color,
                lead.status === status && 'ring-2 ring-white/80 ring-offset-1 ring-offset-zinc-900 scale-[1.02]',
                saving && 'opacity-50 cursor-not-allowed'
              )}
            >
              <StatusIcon className="h-4 w-4" />
              <span className="text-[10px] font-bold">{label}</span>
              {lead.status === status && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-white rounded-full flex items-center justify-center">
                  <Check className="h-2 w-2 text-zinc-900" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Section (collapsible) */}
      {showNotes && (
        <div className="px-5 py-4 border-b border-zinc-700/50">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Add notes..."
            className="bg-zinc-800/50 border-zinc-700 min-h-[80px] resize-none text-sm"
          />
        </div>
      )}

      {/* Scrollable Details */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
        {/* Contact Info */}
        {(lead.phone || lead.email) && (
          <div className="space-y-2">
            {lead.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="text-white font-medium">{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="text-white font-medium truncate">{lead.email}</span>
              </div>
            )}
          </div>
        )}

        {/* Meta Info */}
        <div className="flex items-center gap-4 text-xs text-zinc-500 pt-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Added {new Date(lead.created_at).toLocaleDateString()}</span>
          </div>
          {lead.source && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span className="capitalize">{lead.source}</span>
            </div>
          )}
        </div>

        {/* Estimated Value */}
        {lead.estimated_value && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3 mt-3">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-[10px] text-emerald-400/70 uppercase tracking-wide font-semibold">Est. Value</p>
              <p className="text-lg font-bold text-emerald-400">${lead.estimated_value.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 p-4 border-t border-zinc-700/50 bg-zinc-900/50 space-y-2">
        {!showDeleteConfirm ? (
          <>
            <Button className="w-full bg-emerald-500 hover:bg-emerald-600 h-11 font-semibold gap-2">
              <Calendar className="h-4 w-4" />
              Schedule Follow Up
              <ArrowRight className="h-4 w-4 ml-auto opacity-60" />
            </Button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full h-10 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors font-medium"
            >
              Delete Lead
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-400 text-center">Delete this lead permanently?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-10 border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                onClick={onDelete}
                disabled={saving}
                className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {logSheet}
    </div>
  )
}

// Quick status buttons for Add Lead form
const ADD_LEAD_STATUSES: { status: LeadStatus; label: string; color: string }[] = [
  { status: 'knocked', label: 'Lead', color: 'bg-amber-500' },
  { status: 'not_home', label: 'Not Home', color: 'bg-zinc-500' },
  { status: 'interested', label: 'Interested', color: 'bg-violet-500' },
  { status: 'booked', label: 'Appt', color: 'bg-cyan-500' },
  { status: 'quoted', label: 'Quote', color: 'bg-orange-500' },
  { status: 'converted', label: 'Customer', color: 'bg-emerald-500' },
  { status: 'not_interested', label: 'No Interest', color: 'bg-red-500' },
  { status: 'lost', label: 'Lost', color: 'bg-zinc-600' },
]

// Service options
const SERVICES = [
  'Window Cleaning',
  'Solar Cleaning', 
  'Pressure Washing',
  'Gutter Cleaning',
  'Screen Cleaning',
  'Other',
]

// Add Lead Form Component - SalesRabbit-style
function AddLeadForm({
  onSubmit,
  onCancel,
  saving,
  hasCoords,
  prefilledAddress = '',
}: {
  onSubmit: (data: { 
    name: string
    address: string
    phone: string
    email: string
    notes: string
    status: LeadStatus
    service: string
  }) => void
  onCancel: () => void
  saving: boolean
  hasCoords: boolean
  prefilledAddress?: string
}) {
  const [status, setStatus] = useState<LeadStatus>('knocked')
  const [name, setName] = useState('')
  const [address, setAddress] = useState(prefilledAddress)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [service, setService] = useState('')
  const [notes, setNotes] = useState('')
  const [showMoreFields, setShowMoreFields] = useState(false)
  
  // Update address when prefilled changes
  useEffect(() => {
    if (prefilledAddress) {
      setAddress(prefilledAddress)
    }
  }, [prefilledAddress])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, address, phone, email, notes, status, service })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      {/* Address Card */}
      {hasCoords && prefilledAddress && (
        <div className="mx-4 mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">Address Detected</p>
              <p className="text-sm text-white font-medium truncate">{prefilledAddress}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Status Selection - THE MAIN ACTION */}
      <div className="p-4">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Status</p>
        <div className="grid grid-cols-4 gap-2">
          {ADD_LEAD_STATUSES.map(({ status: s, label, color }) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'py-2.5 px-2 rounded-xl text-[11px] font-bold text-white transition-all',
                color,
                status === s 
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-[1.02]' 
                  : 'opacity-60 hover:opacity-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable form fields */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-4">
        {/* Name - Optional */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Name <span className="text-zinc-600 font-normal">(optional)</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Homeowner name"
            className="bg-zinc-800/50 border-zinc-700 h-11 text-white placeholder:text-zinc-500"
          />
        </div>

        {/* Phone - Optional */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Phone <span className="text-zinc-600 font-normal">(optional)</span>
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            type="tel"
            className="bg-zinc-800/50 border-zinc-700 h-11 text-white placeholder:text-zinc-500"
          />
        </div>

        {/* Service Interest */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Service Interest</label>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="bg-zinc-800/50 border-zinc-700 h-11 text-white">
              <SelectValue placeholder="Select service..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {SERVICES.map((s) => (
                <SelectItem key={s} value={s} className="text-white hover:bg-zinc-800">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Show More Toggle */}
        <button
          type="button"
          onClick={() => setShowMoreFields(!showMoreFields)}
          className="text-xs text-emerald-400 font-semibold hover:text-emerald-300 transition-colors"
        >
          {showMoreFields ? 'Show Less' : 'More Fields +'}
        </button>

        {/* Additional Fields (collapsed by default) */}
        {showMoreFields && (
          <>
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                type="email"
                className="bg-zinc-800/50 border-zinc-700 h-11 text-white placeholder:text-zinc-500"
              />
            </div>

            {/* Address (editable) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
                className="bg-zinc-800/50 border-zinc-700 h-11 text-white placeholder:text-zinc-500"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="bg-zinc-800/50 border-zinc-700 min-h-[80px] text-white placeholder:text-zinc-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="shrink-0 p-4 border-t border-zinc-800 bg-zinc-900/50 flex gap-3">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel} 
          className="flex-1 h-12 border-zinc-700 text-white hover:bg-zinc-800"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={saving} 
          className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 font-semibold text-base"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Lead'}
        </Button>
      </div>
    </form>
  )
}
