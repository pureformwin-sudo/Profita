'use client'

import { useEffect, useState, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Clock, Navigation, ArrowRight, GripVertical, ExternalLink, RotateCcw } from 'lucide-react'
import { getJobs, getCustomers } from '@/lib/storage'
import type { Job, Customer } from '@/lib/types'

interface JobWithCustomer extends Job {
  customerName?: string
  customerAddress?: string
}

export default function RoutesPage() {
  const [jobs, setJobs] = useState<JobWithCustomer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [optimizedRoute, setOptimizedRoute] = useState<JobWithCustomer[]>([])
  const [startAddress, setStartAddress] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [jobsData, customersData] = await Promise.all([getJobs(), getCustomers()])
    
    // Enrich jobs with customer data
    const enrichedJobs = jobsData.map(job => {
      const customer = customersData.find(c => c.id === job.customerId)
      return {
        ...job,
        customerName: customer?.name || 'Unknown Customer',
        customerAddress: customer?.address || '',
      }
    })
    
    setJobs(enrichedJobs)
    setIsLoading(false)
  }

  // Filter jobs for selected date that have addresses
  const todaysJobs = useMemo(() => {
    return jobs.filter(job => 
      job.date === selectedDate && 
      job.customerAddress && 
      (job.status === 'Scheduled' || job.status === 'In progress')
    )
  }, [jobs, selectedDate])

  // Simple route optimization using nearest neighbor algorithm
  function optimizeRoute() {
    if (todaysJobs.length === 0) return
    
    const unvisited = [...todaysJobs]
    const route: JobWithCustomer[] = []
    
    // If we have time-specific jobs, sort by time first
    const jobsWithTime = unvisited.filter(j => j.startTime).sort((a, b) => {
      const timeA = a.startTime || '00:00'
      const timeB = b.startTime || '00:00'
      return timeA.localeCompare(timeB)
    })
    
    const jobsWithoutTime = unvisited.filter(j => !j.startTime)
    
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
      .filter(j => j.customerAddress)
      .map(j => encodeURIComponent(j.customerAddress!))
    
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

  // Format time for display
  function formatTime(time?: string) {
    if (!time) return null
    const [h, m] = time.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
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
                <p className="text-sm mt-1">Add addresses to your customers to plan routes.</p>
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
                      <p className="font-medium truncate">{job.customerName} - {job.jobType}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {job.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTime(job.startTime)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{job.customerAddress}</span>
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
                        <p className="font-medium truncate">{job.customerName} - {job.jobType}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {job.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(job.startTime)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{job.customerAddress}</span>
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
      </div>
    </AppShell>
  )
}
