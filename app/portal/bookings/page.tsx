'use client'

import { useState, useEffect } from 'react'
import { Calendar, Loader2, Clock, CheckCircle, MapPin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePortal } from '../layout'
import { getPortalBookings, type PortalBooking } from '@/lib/portal-storage'

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  confirmed: { color: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: CheckCircle },
  pending: { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  completed: { color: 'text-blue-600 border-blue-200 bg-blue-50', icon: CheckCircle },
  cancelled: { color: 'text-red-600 border-red-200 bg-red-50', icon: Clock },
}

export default function PortalBookingsPage() {
  const { customer } = usePortal()

  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<PortalBooking[]>([])

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalBookings(customer.id)
      setBookings(data)
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

  const upcoming = bookings.filter((b) => 
    (b.status === 'confirmed' || b.status === 'pending') && 
    new Date(b.scheduledDate) >= new Date()
  )
  const past = bookings.filter((b) => 
    b.status === 'completed' || 
    b.status === 'cancelled' || 
    new Date(b.scheduledDate) < new Date()
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">
          View your scheduled appointments
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Bookings</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any bookings at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Upcoming ({upcoming.length})
              </h2>
              {upcoming.map((booking) => {
                const config = statusConfig[booking.status] || statusConfig.pending
                const StatusIcon = config.icon

                return (
                  <Card key={booking.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2 rounded-lg bg-blue-100">
                            <Calendar className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{booking.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(booking.scheduledDate).toLocaleDateString(undefined, {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                              })}
                              {booking.scheduledTime && ` at ${booking.scheduledTime}`}
                            </p>
                            {booking.address && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {booking.address}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className={config.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Past ({past.length})
              </h2>
              {past.map((booking) => (
                <Card key={booking.id} className="opacity-75">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-muted">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{booking.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(booking.scheduledDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-muted-foreground">
                        {booking.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
