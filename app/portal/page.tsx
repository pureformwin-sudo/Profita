'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  FileText, 
  Receipt, 
  Calendar, 
  History,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePortal } from './layout'
import {
  getPortalEstimates,
  getPortalInvoices,
  getPortalJobs,
  getPortalBookings,
  type PortalEstimate,
  type PortalInvoice,
  type PortalJob,
  type PortalBooking,
} from '@/lib/portal-storage'

function PortalDashboardContent() {
  const { customer, token } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token

  const [loading, setLoading] = useState(true)
  const [estimates, setEstimates] = useState<PortalEstimate[]>([])
  const [invoices, setInvoices] = useState<PortalInvoice[]>([])
  const [jobs, setJobs] = useState<PortalJob[]>([])
  const [bookings, setBookings] = useState<PortalBooking[]>([])

  useEffect(() => {
    async function loadData() {
      if (!customer) return

      const [est, inv, j, b] = await Promise.all([
        getPortalEstimates(customer.id),
        getPortalInvoices(customer.id),
        getPortalJobs(customer.id),
        getPortalBookings(customer.id),
      ])

      setEstimates(est)
      setInvoices(inv)
      setJobs(j)
      setBookings(b)
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

  const pendingEstimates = estimates.filter((e) => e.status === 'sent')
  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid' && i.balance > 0)
  const upcomingBookings = bookings.filter((b) => 
    b.status === 'confirmed' || b.status === 'pending'
  )
  const totalOwed = unpaidInvoices.reduce((sum, inv) => sum + inv.balance, 0)

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {customer.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">
          View your estimates, invoices, and service history
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingEstimates.length}</p>
                <p className="text-xs text-muted-foreground">Pending Estimates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <Receipt className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unpaidInvoices.length}</p>
                <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingBookings.length}</p>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalOwed.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Balance Due</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending estimates */}
      {pendingEstimates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Estimates Awaiting Your Response
              </CardTitle>
              <Link href={`/portal/estimates?token=${tokenParam}`}>
                <Button variant="ghost" size="sm">
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {pendingEstimates.slice(0, 3).map((est) => (
                <Link
                  key={est.id}
                  href={`/portal/estimates/${est.id}?token=${tokenParam}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{est.estimateNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Issued {new Date(est.issueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${est.total.toFixed(2)}</p>
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                      Awaiting Response
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unpaid invoices */}
      {unpaidInvoices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Invoices Due
              </CardTitle>
              <Link href={`/portal/invoices?token=${tokenParam}`}>
                <Button variant="ghost" size="sm">
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {unpaidInvoices.slice(0, 3).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}?token=${tokenParam}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Due {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${inv.balance.toFixed(2)}</p>
                    <Badge 
                      variant="outline" 
                      className={inv.status === 'Overdue' 
                        ? 'text-red-600 border-red-200 bg-red-50'
                        : 'text-amber-600 border-amber-200 bg-amber-50'
                      }
                    >
                      {inv.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent service history */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Recent Service
              </CardTitle>
              <Link href={`/portal/service-history?token=${tokenParam}`}>
                <Button variant="ghost" size="sm">
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {jobs.slice(0, 3).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{job.jobType}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(job.date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge 
                    variant="outline"
                    className={
                      job.status === 'Completed' || job.status === 'Paid'
                        ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                        : 'text-blue-600 border-blue-200 bg-blue-50'
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        estimates.length === 0 && invoices.length === 0 && jobs.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
              <h2 className="text-lg font-semibold mb-2">You&apos;re all caught up!</h2>
              <p className="text-muted-foreground mb-4">
                No pending estimates or invoices at this time.
              </p>
              <Link href={`/portal/request-service?token=${tokenParam}`}>
                <Button>Request New Service</Button>
              </Link>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

export default function PortalDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PortalDashboardContent />
    </Suspense>
  )
}
