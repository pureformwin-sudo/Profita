'use client'

import { useEffect, useMemo, memo, useState } from 'react'
import { type Lead, type LeadStatus } from '@/lib/leads-storage'

// Default to Fresno, CA
export const FRESNO_CA: [number, number] = [36.7378, -119.7871]

// Map tile providers - using Google Maps for satellite (supports high zoom)
const TILES = {
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    maxZoom: 21,
  },
  hybrid: {
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    maxZoom: 21,
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  },
} as const

// D2D style status colors (using existing LeadStatus types)
const D2D_COLORS: Record<LeadStatus, string> = {
  knocked: '#94a3b8',
  not_home: '#71717a',
  not_interested: '#f43f5e',
  interested: '#f59e0b',
  quoted: '#0ea5e9',
  booked: '#8b5cf6',
  converted: '#10b981',
  lost: '#6b7280',
}

// Status icon SVGs (SalesRabbit-style)
const STATUS_ICONS: Record<LeadStatus, string> = {
  knocked: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
  not_home: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke="white" stroke-width="2" fill="none"/>',
  not_interested: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
  interested: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  quoted: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>',
  booked: '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>',
  converted: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  lost: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
}

export interface D2DMapProps {
  leads: Lead[]
  initialCenter?: [number, number]
  initialZoom?: number
  panTo?: [number, number] | null
  panZoom?: number
  selectedLeadId?: string | null
  userLocation?: [number, number] | null
  mapStyle?: 'satellite' | 'hybrid' | 'street' | 'dark'
  onLeadClick?: (lead: Lead) => void
  onMapClick?: (coords: [number, number]) => void
}

// Inner component that actually uses react-leaflet
function D2DMapInner({
  leads,
  initialCenter = FRESNO_CA,
  initialZoom = 14,
  panTo = null,
  panZoom = 18,
  selectedLeadId = null,
  userLocation = null,
  mapStyle = 'satellite',
  onLeadClick,
  onMapClick,
}: D2DMapProps) {
  // Import leaflet modules dynamically on client
  const [leafletModules, setLeafletModules] = useState<{
    MapContainer: any
    TileLayer: any
    Marker: any
    useMap: any
    useMapEvents: any
    L: any
  } | null>(null)

  useEffect(() => {
    // Dynamic import of leaflet modules
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([reactLeaflet, leaflet]) => {
      setLeafletModules({
        MapContainer: reactLeaflet.MapContainer,
        TileLayer: reactLeaflet.TileLayer,
        Marker: reactLeaflet.Marker,
        useMap: reactLeaflet.useMap,
        useMapEvents: reactLeaflet.useMapEvents,
        L: leaflet.default,
      })
    })
  }, [])

  const tiles = TILES[mapStyle]
  const pinned = useMemo(
    () => leads.filter((l) => l.lat != null && l.lng != null),
    [leads]
  )

  // Show loading while leaflet loads
  if (!leafletModules) {
    return (
      <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">Loading map...</p>
        </div>
      </div>
    )
  }

  const { MapContainer, TileLayer, Marker, useMap, useMapEvents, L } = leafletModules

  // Create status icon
  function makeStatusIcon(status: LeadStatus, isSelected = false) {
    const color = D2D_COLORS[status] || '#6b7280'
    const size = isSelected ? 44 : 36
    const iconSize = size * 0.5
    const iconPath = STATUS_ICONS[status]
    
    return L.divIcon({
      className: 'd2d-pin',
      html: `
        <div style="
          position: relative;
          width: ${size}px;
          height: ${size}px;
          cursor: pointer;
        ">
          ${isSelected ? `
            <div style="
              position: absolute;
              inset: -10px;
              border-radius: 50%;
              background: ${color};
              opacity: 0.25;
              animation: d2d-pulse 1.5s ease-out infinite;
            "></div>
          ` : ''}
          <div style="
            position: absolute;
            inset: 0;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            ${isSelected ? 'transform: scale(1.1);' : ''}
          ">
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white">
              ${iconPath}
            </svg>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }

  // User location icon
  const userLocationIcon = L.divIcon({
    className: 'user-location',
    html: `
      <div style="position: relative; width: 24px; height: 24px;">
        <div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(59,130,246,0.3);
          animation: d2d-pulse 2s ease-out infinite;
        "></div>
        <div style="
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          background: #3b82f6;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

  // Map controller component
  function MapController() {
    const map = useMap()
    useEffect(() => {
      if (panTo) {
        map.setView(panTo, panZoom, { animate: true, duration: 0.3 })
      }
    }, [map])
    return null
  }

  // Map click handler component
  function MapClickHandler() {
    useMapEvents({
      click: (e: any) => {
        if (onMapClick) {
          onMapClick([e.latlng.lat, e.latlng.lng])
        }
      },
    })
    return null
  }

  return (
    <div className="h-full w-full">
      <style jsx global>{`
        @keyframes d2d-pulse {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2); opacity: 0; }
        }
        .leaflet-container {
          background: #1a1a1a;
          font-family: inherit;
        }
        .leaflet-control-zoom {
          border: none !important;
        }
        .leaflet-control-zoom a {
          background: rgba(39, 39, 42, 0.9) !important;
          color: white !important;
          border: 1px solid rgba(63, 63, 70, 0.8) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(63, 63, 70, 0.9) !important;
        }
      `}</style>
      
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={true}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        doubleClickZoom
        touchZoom
        preferCanvas={true}
        zoomAnimation={true}
        markerZoomAnimation={true}
      >
        <TileLayer 
          url={tiles.url} 
          attribution={tiles.attribution}
          maxZoom={tiles.maxZoom}
        />
        
        <MapController />
        <MapClickHandler />

        {/* Lead markers */}
        {pinned.map((lead) => (
          <Marker
            key={lead.id}
            position={[lead.lat!, lead.lng!]}
            icon={makeStatusIcon(lead.status, lead.id === selectedLeadId)}
            eventHandlers={{
              click: () => onLeadClick?.(lead),
            }}
          />
        ))}

        {/* User location marker */}
        {userLocation && (
          <Marker 
            position={userLocation} 
            icon={userLocationIcon}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>
    </div>
  )
}

// Export memoized version
export const D2DMap = memo(D2DMapInner)
