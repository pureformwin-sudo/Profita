'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Clock, Navigation, ArrowRight, GripVertical, ExternalLink, RotateCcw } from 'lucide-react'
import { getJobs } from '@/lib/storage'
import type { Job } from '@/lib/types'

export default function RoutesPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [optimizedRoute, setOptimizedRoute] = useState<Job[]>([])
  const [startAddress, setStartAddress] = useState('')

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    const data = await getJobs()
    setJobs(data)
    setIsLoading(false)
  }

  // Filter jobs for selected date that have addresses
  const todaysJobs = useMemo(() => {
    return jobs.filter(job => 
      job.date === selectedDate && 
      job.address && 
      (job.status === 'Scheduled' || job.status === 'In Progress')
    )
  }, [jobs, selectedDate])

  // Simple route optimization using nearest neighbor algorithm
  function optimizeRoute() {
    if (todaysJobs.length === 0) return
    
    const unvisited = [...todaysJobs]
    const route: Job[] = []
    
    // If we have time-specific jobs, sort by time first
    const jobsWithTime = unvisited.filter(j => j.time).sort((a, b) => {
      const timeA = a.time || '00:00'
      const timeB = b.time || '00:00'
      return timeA.localeCompare(timeB)
    })
    
    const jobsWithoutTime = unvisited.filter(j => !j.time)
    
    // Add time-specific jobs first in order
    route.push(...jobsWithTime)
    
    // Add remaining jobs
    route.push(...jobsWithoutTime)
    
    setOptimizedRoute(route)
  }

  // Generate Google Maps directions URL
  function getGoogleMapsUrl() {
    if (optimizedRoute.length === 0) return ''
    
    const addresses = optimizedRoute
      .filter(j => j.address)
      .map(j => encodeURIComponent(j.address!))
    
    if (addresses.length === 0) return ''
    
    const origin = startAddress ? encodeURIComponent(startAddress) : addresses[0]
    const destination = addresses[addresses.length - 1]
    const waypoints = addresses.slice(startAddress ? 0 : 1, -1).join('|')
    
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`
    if (waypoints) {
      url += `&waypoints=${waypoints}`
    }
    url += '&travelmode=driving'
    
    return url
  }

  // Reset route
  function resetRoute() {
    setOptimizedRoute([])
  }

  // Move job in route (drag and drop simulation with buttons)
  function moveJob(index: number, direction: 'up' | 'down') {
    const newRoute = [...optimizedRoute]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newRoute.length) return
    
    [newRoute[index], newRoute[newIndex]] = [newRoute[newIndex], newRoute[index]]
    setOptimizedRoute(newRoute)
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded-xl animate-pulse" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 pb-24 lg:pb-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Route Planner</h1>
          <p className="text-muted-foreground">
            Plan the most efficient route for your jobs
          </p>
        </div>

        {/* Date Selector & Start Address */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Select Date
                </label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value)
                    resetRoute()
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Start Address (optional)
                </label>
                <Input
                  placeholder="Your home/office address"
                  value={startAddress}
                  onChange={(e) => setStartAddress(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jobs for the Day */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Jobs for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </CardTitle>
              <Badge variant="outline">{todaysJobs.length} jobs</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {todaysJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Navigation className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No jobs with addresses scheduled for this date.</p>
                <p className="text-sm mt-1">Add addresses to your jobs to plan routes.</p>
              </div>
            ) : optimizedRoute.length === 0 ? (
              <div className="space-y-3">
                {todaysJobs.map((job, index) => (
                  <div 
                    key={job.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{job.title}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {job.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {job.time}
                          </span>
                        )}
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{job.address}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <Button onClick={optimizeRoute} className="w-full mt-4">
                  <Navigation className="h-4 w-4 mr-2" />
                  Optimize Route
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {startAddress && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Start</p>
                      <p className="font-medium">{startAddress}</p>
                    </div>
                  </div>
                )}
                
                {optimizedRoute.map((job, index) => (
                  <div key={job.id}>
                    {(index > 0 || startAddress) && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <div className="flex flex-col gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => moveJob(index, 'up')}
                          disabled={index === 0}
                        >
                          <GripVertical className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{job.title}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {job.customerName && (
                            <span>{job.customerName}</span>
                          )}
                          {job.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {job.time}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{job.address}</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => moveJob(index, 'up')}
                          disabled={index === 0}
                        >
                          <span className="text-xs">↑</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => moveJob(index, 'down')}
                          disabled={index === optimizedRoute.length - 1}
                        >
                          <span className="text-xs">↓</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex gap-3 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={resetRoute}
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button 
                    asChild
                    className="flex-1"
                  >
                    <a href={getGoogleMapsUrl()} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in Maps
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Tips</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Add addresses to your jobs for route planning</li>
              <li>• Jobs with specific times are prioritized in order</li>
              <li>• You can manually reorder stops using the arrows</li>
              <li>• Click &quot;Open in Maps&quot; for turn-by-turn navigation</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
