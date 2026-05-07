'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Lead, LeadStatus } from '@/lib/leads-storage'

// Set Mapbox token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

// Status config - modern app-style design
const STATUS_CONFIG: Record<LeadStatus, { color: string; iconPath: string; label: string }> = {
  knocked: { 
    color: '#f59e0b', 
    iconPath: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
    label: 'Lead' 
  },
  not_home: { 
    color: '#6b7280', 
    iconPath: 'M12 8v4l2 2M12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14z',
    label: 'Not Home' 
  },
  callback: { 
    color: '#8b5cf6', 
    iconPath: 'M3 12a9 9 0 1 0 9-9M3 12h9M12 3v9',
    label: 'Callback' 
  },
  interested: { 
    color: '#3b82f6', 
    iconPath: 'M12 4l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8z',
    label: 'Interested' 
  },
  quoted: { 
    color: '#f97316', 
    iconPath: 'M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 8h6M9 12h4',
    label: 'Quoted' 
  },
  booked: { 
    color: '#06b6d4', 
    iconPath: 'M4 8h16M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M8 4v4M16 4v4',
    label: 'Booked' 
  },
  follow_up: { 
    color: '#a855f7', 
    iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2',
    label: 'Follow Up' 
  },
  converted: { 
    color: '#10b981', 
    iconPath: 'M5 12l5 5L20 7',
    label: 'Customer' 
  },
  not_interested: { 
    color: '#ef4444', 
    iconPath: 'M18 6L6 18M6 6l12 12',
    label: 'Not Interested' 
  },
  lost: { 
    color: '#dc2626', 
    iconPath: 'M18 6L6 18M6 6l12 12',
    label: 'Lost' 
  },
  pending: { 
    color: '#eab308', 
    iconPath: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M7 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M17 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
    label: 'Pending' 
  },
}

export type MapStyle = 'satellite' | 'street' | 'standard'

interface SalesMapProps {
  leads: Lead[]
  center: [number, number]
  userLocation: [number, number] | null
  mapStyle: MapStyle
  onLeadClick: (lead: Lead) => void
  onMapClick: (coords: [number, number], address?: string) => void
  selectedLeadId?: string
  is3D?: boolean
  onBearingChange?: (bearing: number) => void
  mapRef?: React.MutableRefObject<mapboxgl.Map | null>
  disableMapClick?: boolean
}

// Mapbox styles - Apple Maps-like clean styling
// satellite-streets-v12 is cleanest satellite hybrid with good road labels
// navigation-night-v1 gives iOS dark mode feel
// outdoors-v12 has cleaner labels than streets-v12
const MAPBOX_STYLES: Record<MapStyle, string> = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  street: 'mapbox://styles/mapbox/navigation-night-v1', // iOS-like dark mode
  standard: 'mapbox://styles/mapbox/outdoors-v12', // Cleaner than streets, Apple-like
}

// FIXED: Marker element with FIXED SIZE container - inner elements animate, root stays static
// This prevents position shifting when selection state changes
const MARKER_SIZE = 48 // Fixed container size - never changes

function createMarkerElement(status: LeadStatus, isSelected: boolean = false): HTMLDivElement {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.knocked
  const pinSize = 36 // Actual visual pin size
  const iconSize = 14
  
  const el = document.createElement('div')
  el.className = 'sales-marker'
  // CRITICAL: Fixed size container that NEVER changes - prevents anchor shift
  el.style.cssText = `
    width: ${MARKER_SIZE}px;
    height: ${MARKER_SIZE}px;
    cursor: pointer;
    pointer-events: auto;
  `
  
  // All visual elements are inside - only animate the inner .marker-pin
  el.innerHTML = `
    <div class="marker-inner" style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: ${pinSize}px;
      height: ${pinSize}px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div class="marker-pulse" style="
        position: absolute;
        width: ${pinSize + 24}px;
        height: ${pinSize + 24}px;
        border-radius: 50%;
        background: ${config.color};
        opacity: ${isSelected ? '0.3' : '0'};
        animation: ${isSelected ? 'markerPulse 1.5s ease-in-out infinite' : 'none'};
        pointer-events: none;
      "></div>
      <div class="marker-pin" style="
        width: ${pinSize}px;
        height: ${pinSize}px;
        border-radius: 50%;
        background: ${config.color};
        box-shadow: 0 4px 14px ${config.color}80, 0 2px 6px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        transform: scale(${isSelected ? '1.15' : '1'});
        transition: transform 0.15s ease-out;
      ">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="${config.iconPath}"/>
        </svg>
      </div>
    </div>
  `
  
  // Hover effects - only scale inner pin, NOT the root element
  const pin = el.querySelector('.marker-pin') as HTMLElement
  const pulse = el.querySelector('.marker-pulse') as HTMLElement
  
  el.addEventListener('mouseenter', () => {
    if (pin) pin.style.transform = 'scale(1.2)'
    el.style.zIndex = '100'
  })
  el.addEventListener('mouseleave', () => {
    if (pin) pin.style.transform = isSelected ? 'scale(1.15)' : 'scale(1)'
    el.style.zIndex = isSelected ? '50' : '1'
  })
  
  return el
}

// Create user location element
function createUserElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'user-location-marker'
  el.innerHTML = `
    <div style="
      position: relative;
      width: 32px;
      height: 32px;
    ">
      <div style="
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: #3b82f6;
        animation: userPulse 2s ease-in-out infinite;
      "></div>
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #3b82f6;
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(59, 130, 246, 0.6);
      "></div>
    </div>
  `
  return el
}

// Reverse geocode coordinates to address
async function reverseGeocode(lng: number, lat: number): Promise<string | undefined> {
  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return undefined
    
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&access_token=${token}`
    )
    const data = await response.json()
    
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name
    }
  } catch (error) {
    console.error('Reverse geocoding failed:', error)
  }
  return undefined
}

export function SalesMap({
  leads,
  center,
  userLocation,
  mapStyle,
  onLeadClick,
  onMapClick,
  selectedLeadId,
  is3D = false,
  onBearingChange,
  mapRef: externalMapRef,
  disableMapClick = false,
}: SalesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const userMarker = useRef<mapboxgl.Marker | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const disableMapClickRef = useRef(disableMapClick)
  
  // Keep ref in sync with prop
  useEffect(() => {
    disableMapClickRef.current = disableMapClick
  }, [disableMapClick])
  
  // Expose map ref externally
  useEffect(() => {
    if (externalMapRef) {
      externalMapRef.current = map.current
    }
  }, [externalMapRef, mapLoaded])
  
  // Handle 3D toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    map.current.easeTo({
      pitch: is3D ? 60 : 0,
      duration: 500,
    })
  }, [is3D, mapLoaded])
  
  // Track bearing changes
  useEffect(() => {
    if (!map.current || !onBearingChange) return
    const handleRotate = () => {
      onBearingChange(map.current?.getBearing() || 0)
    }
    map.current.on('rotate', handleRotate)
    return () => {
      map.current?.off('rotate', handleRotate)
    }
  }, [onBearingChange, mapLoaded])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return
    
    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLES[mapStyle],
      center: [center[1], center[0]], // Mapbox uses [lng, lat]
      zoom: 18,
      pitch: 0, // Flat top-down by default
      bearing: 0,
      antialias: true,
      attributionControl: false,
    })

    // Enable 3D buildings on satellite/street view
    mapInstance.on('load', () => {
      setMapLoaded(true)
      
      // Add 3D buildings layer for street/standard styles
      if (mapStyle !== 'satellite') {
        const layers = mapInstance.getStyle()?.layers
        if (layers) {
          const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
          )?.id

          mapInstance.addLayer(
            {
              id: '3d-buildings',
              source: 'composite',
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 15,
              paint: {
                'fill-extrusion-color': '#1a1a2e',
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'min_height'],
                'fill-extrusion-opacity': 0.7,
              },
            },
            labelLayerId
          )
        }
      }
    })

    // Handle map click - with reverse geocoding
    // Note: disableMapClick is checked via ref to avoid recreating handler
    mapInstance.on('click', async (e) => {
      if (disableMapClickRef.current) return
      const { lng, lat } = e.lngLat
      const address = await reverseGeocode(lng, lat)
      onMapClick([lat, lng], address)
    })

    // Enable touch rotation for mobile
    mapInstance.touchZoomRotate.enableRotation()
    
    // Add navigation controls
    mapInstance.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: false,
      }),
      'bottom-right'
    )

    map.current = mapInstance

    return () => {
      mapInstance.remove()
      map.current = null
    }
  }, [])

  // Update map style
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    map.current.setStyle(MAPBOX_STYLES[mapStyle])
  }, [mapStyle, mapLoaded])

  // Update center with smooth animation (preserves current pitch/bearing)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    map.current.easeTo({
      center: [center[1], center[0]],
      zoom: Math.max(map.current.getZoom(), 17),
      duration: 800,
      essential: true,
    })
  }, [center, mapLoaded])

  // Update user location marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    if (userMarker.current) {
      userMarker.current.remove()
      userMarker.current = null
    }

    if (userLocation) {
      userMarker.current = new mapboxgl.Marker({
        element: createUserElement(),
        anchor: 'center',
      })
        .setLngLat([userLocation[1], userLocation[0]])
        .addTo(map.current)
    }
  }, [userLocation, mapLoaded])

  // Update lead markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const currentMarkers = markers.current
    const newMarkerIds = new Set<string>()

    // Add or update markers
    leads.forEach((lead) => {
      if (!lead.lat || !lead.lng) return

      newMarkerIds.add(lead.id)
      const isSelected = lead.id === selectedLeadId
      const existingMarker = currentMarkers.get(lead.id)

      if (existingMarker) {
        // FIXED: Update visual state WITHOUT replacing element (prevents position shift)
        existingMarker.setLngLat([lead.lng, lead.lat])
        const el = existingMarker.getElement()
        const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.knocked
        
        // Update inner elements only - never touch the root container size
        const pin = el.querySelector('.marker-pin') as HTMLElement
        const pulse = el.querySelector('.marker-pulse') as HTMLElement
        
        if (pin) {
          pin.style.background = config.color
          pin.style.boxShadow = `0 4px 14px ${config.color}80, 0 2px 6px rgba(0,0,0,0.4)`
          pin.style.transform = isSelected ? 'scale(1.15)' : 'scale(1)'
          // Update icon
          const svg = pin.querySelector('svg path') as SVGPathElement
          if (svg) svg.setAttribute('d', config.iconPath)
        }
        if (pulse) {
          pulse.style.background = config.color
          pulse.style.opacity = isSelected ? '0.3' : '0'
          pulse.style.animation = isSelected ? 'markerPulse 1.5s ease-in-out infinite' : 'none'
        }
        el.style.zIndex = isSelected ? '50' : '1'
      } else {
        // Create new marker
        const el = createMarkerElement(lead.status, isSelected)
        el.addEventListener('click', () => onLeadClick(lead))

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([lead.lng, lead.lat])
          .addTo(map.current!)

        currentMarkers.set(lead.id, marker)
      }
    })

    // Remove old markers
    currentMarkers.forEach((marker, id) => {
      if (!newMarkerIds.has(id)) {
        marker.remove()
        currentMarkers.delete(id)
      }
    })
  }, [leads, selectedLeadId, mapLoaded, onLeadClick])

  // Pan to selected lead - use padding to keep marker visible above bottom sheet
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedLeadId) return

    const lead = leads.find((l) => l.id === selectedLeadId)
    if (lead?.lat && lead?.lng) {
      // Check if marker is already reasonably in view
      const bounds = map.current.getBounds()
      const inView = bounds.contains([lead.lng, lead.lat])
      
      // Use easeTo with padding for natural feel
      // Bottom padding accounts for bottom sheet (~280px on mobile)
      // Right padding for desktop drawer (~400px when open)
      const isMobile = window.innerWidth < 1024
      
      map.current.easeTo({
        center: [lead.lng, lead.lat],
        zoom: inView ? map.current.getZoom() : Math.max(map.current.getZoom(), 18),
        duration: 500,
        padding: isMobile 
          ? { top: 80, bottom: 300, left: 20, right: 20 } // Mobile: account for bottom sheet
          : { top: 20, bottom: 20, left: 20, right: 400 }, // Desktop: account for right drawer
        essential: true,
      })
    }
  }, [selectedLeadId, leads, mapLoaded])

  return (
    <>
      <style jsx global>{`
        @keyframes markerPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.4); opacity: 0.1; }
        }
        @keyframes userPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2); opacity: 0; }
        }
        .mapboxgl-ctrl-compass {
          display: none !important;
        }
        .mapboxgl-ctrl-group {
          background: rgba(24, 24, 27, 0.9) !important;
          border: 1px solid rgba(63, 63, 70, 0.5) !important;
          border-radius: 12px !important;
          backdrop-filter: blur(8px);
          overflow: hidden;
        }
        .mapboxgl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
          background: transparent !important;
        }
        .mapboxgl-ctrl-group button:hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }
        .mapboxgl-ctrl-group button span {
          filter: invert(1);
        }
        .mapboxgl-ctrl-attrib {
          display: none !important;
        }
        .mapboxgl-ctrl-logo {
          display: none !important;
        }
        .mapboxgl-canvas {
          outline: none !important;
        }
      `}</style>
      <div 
        ref={mapContainer} 
        className="h-full w-full"
        style={{ background: '#0a0a0a' }}
      />
    </>
  )
}

export default SalesMap
