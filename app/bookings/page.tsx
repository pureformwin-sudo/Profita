'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Calendar, Clock, User, Phone, Mail, MapPin, MoreHorizontal, CheckCircle, XCircle, Briefcase, Search, Link2, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addJob, addCustomer, getCustomers } from '@/lib/storage'
import { toast } from 'sonner'
import type { Customer } from '@/lib/types'

interface BookingRequest {
  id: string
  customerName: string
  customerEmail?: string
  customerPhone: string
  customerAddress?: string
  serviceType: string
  preferredDate: string
  preferredTime?: string
  notes?: string
  status: 'Pending' | 'Confirmed' | 'Declined'
  createdAt: string
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingRequest[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserId(user.id)

    const { data, error } = await supabase
      .from('booking_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching bookings:', error)
      return
    }

    setBookings(data.map((b: any) => ({
      id: b.id,
      customerName: b.customer_name,
      customerEmail: b.customer_email,
      customerPhone: b.customer_phone,
      customerAddress: b.customer_address,
      serviceType: b.service_type,
      preferredDate: b.preferred_date,
      preferredTime: b.preferred_time,
      notes: b.notes,
      status: b.status,
      createdAt: b.created_at,
    })))

    const customerData = await getCustomers()
    setCustomers(customerData)
    setIsLoading(false)
  }

  async function handleConfirm(booking: BookingRequest) {
    const supabase = createClient()
    
    // Check if customer exists
    let customerId: string | undefined
    const existingCustomer = customers.find(
      c => c.phone === booking.customerPhone || c.email === booking.customerEmail
    )
    
    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      // Create new customer
      const newCustomer = await addCustomer({
        name: booking.customerName,
        email: booking.customerEmail,
        phone: booking.customerPhone,
        address: booking.customerAddress,
      })
      if (newCustomer) {
        customerId = newCustomer.id
      }
    }

    // Create job from booking
    await addJob({
      title: booking.serviceType,
      customerId,
      customerName: booking.customerName,
      date: booking.preferredDate,
      time: booking.preferredTime,
      status: 'Scheduled',
      address: booking.customerAddress,
      notes: booking.notes,
    })

    // Update booking status
    await supabase
      .from('booking_requests')
      .update({ status: 'Confirmed' })
      .eq('id', booking.id)

    toast.success('Booking confirmed and job created!')
    loadData()
  }

  async function handleDecline(booking: BookingRequest) {
    const supabase = createClient()
    
    await supabase
      .from('booking_requests')
      .update({ status: 'Declined' })
      .eq('id', booking.id)

    toast.success('Booking declined')
    loadData()
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('booking_requests').delete().eq('id', id)
    toast.success('Booking request deleted')
    loadData()
  }

  const filteredBookings = bookings.filter(booking =>
    booking.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    booking.serviceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    booking.customerPhone.includes(searchQuery)
  )

  const pendingCount = bookings.filter(b => b.status === 'Pending').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
      case 'Confirmed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Confirmed</Badge>
      case 'Declined':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Declined</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded-xl animate-pulse" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 pb-24 lg:pb-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Booking Requests</h1>
            <p className="text-muted-foreground">
              {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}` : 'No pending requests'}
            </p>
          </div>
          {userId && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const bookingUrl = `${window.location.origin}/book/${userId}`
                navigator.clipboard.writeText(bookingUrl)
                toast.success('Booking link copied!')
              }}
            >
              <Link2 className="h-4 w-4" />
              Copy Booking Link
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bookings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-1">No booking requests</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Share your booking link with customers to receive appointments.
              </p>
              {userId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const bookingUrl = `${window.location.origin}/book/${userId}`
                    navigator.clipboard.writeText(bookingUrl)
                    toast.success('Booking link copied!')
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Booking Link
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((booking) => (
              <Card key={booking.id} className={booking.status === 'Pending' ? 'border-yellow-200 bg-yellow-50/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{booking.customerName}</h3>
                        {getStatusBadge(booking.status)}
                      </div>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          {booking.serviceType}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(booking.preferredDate).toLocaleDateString()}
                        </span>
                        {booking.preferredTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {booking.preferredTime}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <a href={`tel:${booking.customerPhone}`} className="flex items-center gap-1 hover:text-primary">
                          <Phone className="h-3.5 w-3.5" />
                          {booking.customerPhone}
                        </a>
                        {booking.customerEmail && (
                          <a href={`mailto:${booking.customerEmail}`} className="flex items-center gap-1 hover:text-primary">
                            <Mail className="h-3.5 w-3.5" />
                            {booking.customerEmail}
                          </a>
                        )}
                        {booking.customerAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {booking.customerAddress}
                          </span>
                        )}
                      </div>

                      {booking.notes && (
                        <p className="text-sm text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
                          {booking.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {booking.status === 'Pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleConfirm(booking)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDecline(booking)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(booking.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
