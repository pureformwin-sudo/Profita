'use client'

import { useState, useEffect } from 'react'
import { History, Loader2, CheckCircle, Clock, Briefcase } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePortal } from '../layout'
import { getPortalJobs, type PortalJob } from '@/lib/portal-storage'

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  Scheduled: { color: 'text-blue-600 border-blue-200 bg-blue-50', icon: Clock },
  'In Progress': { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  Completed: { color: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: CheckCircle },
  Paid: { color: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: CheckCircle },
}

export default function PortalServiceHistoryPage() {
  const { customer } = usePortal()

  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<PortalJob[]>([])

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalJobs(customer.id)
      setJobs(data)
      setLoading(false)
    }
    loadData()
  }, [customer])

  if (!customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Group jobs by year/month
  const jobsByMonth = jobs.reduce((acc, job) => {
    const date = new Date(job.date)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    if (!acc[key]) {
      acc[key] = { label, jobs: [] }
    }
    acc[key].jobs.push(job)
    return acc
  }, {} as Record<string, { label: string; jobs: PortalJob[] }>)

  const sortedMonths = Object.entries(jobsByMonth).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service History</h1>
        <p className="text-muted-foreground">
          View your past and upcoming services
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Service History</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any service records yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedMonths.map(([key, { label, jobs: monthJobs }]) => (
            <div key={key} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
              </h2>
              {monthJobs.map((job) => {
                const config = statusConfig[job.status] || statusConfig.Scheduled
                const StatusIcon = config.icon

                return (
                  <Card key={job.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${
                            job.status === 'Completed' || job.status === 'Paid'
                              ? 'bg-emerald-100'
                              : 'bg-muted'
                          }`}>
                            <Briefcase className={`h-5 w-5 ${
                              job.status === 'Completed' || job.status === 'Paid'
                                ? 'text-emerald-600'
                                : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium">{job.jobType}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(job.date).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${job.price.toFixed(2)}</p>
                          <Badge variant="outline" className={config.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                      {job.notes && (
                        <p className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                          {job.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
