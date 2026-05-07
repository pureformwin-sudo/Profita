'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, User, Phone, Mail, MapPin, CheckCircle, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const SERVICE_TYPES = [
  'Window Cleaning',
  'Pressure Washing', 
  'Gutter Cleaning',
  'House Washing',
  'Roof Cleaning',
  'Solar Panel Cleaning',
  'Commercial Cleaning',
  'Other'
]

const TIME_SLOTS = [
  '8:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 2:00 PM',
  '2:00 PM - 4:00 PM',
  '4:00 PM - 6:00 PM',
]

export default function PublicBookingPage() {
  const params = useParams()
  const userId = params.userId as string
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    serviceType: '',
    preferredDate: '',
    preferredTime: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.phone || !formData.serviceType || !formData.preferredDate) {
      return
    }

    setIsSubmitting(true)
    
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('booking_requests')
        .insert({
          user_id: userId,
          customer_name: formData.name,
          customer_email: formData.email || null,
          customer_phone: formData.phone,
          customer_address: formData.address || null,
          service_type: formData.serviceType,
          preferred_date: formData.preferredDate,
          preferred_time: formData.preferredTime || null,
          notes: formData.notes || null,
          status: 'Pending',
        })

      if (error) throw error
      
      setIsSubmitted(true)
    } catch (error) {
      console.error('Error submitting booking:', error)
      alert('Failed to submit booking. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Booking Request Sent!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for your request. We&apos;ll contact you shortly to confirm your appointment.
            </p>
            <Button onClick={() => {
              setIsSubmitted(false)
              setFormData({
                name: '',
                email: '',
                phone: '',
                address: '',
                serviceType: '',
                preferredDate: '',
                preferredTime: '',
                notes: '',
              })
            }}>
              Book Another Service
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wrench className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Book a Service</h1>
          <p className="text-muted-foreground">
            Fill out the form below and we&apos;ll get back to you to confirm your appointment.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Request an Appointment</CardTitle>
            <CardDescription>
              All fields marked with * are required
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" /> Name *
                    </Label>
                    <Input
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> Phone *
                    </Label>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </Label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> Service Address
                    </Label>
                    <Input
                      placeholder="123 Main St, City"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Service Details
                </h3>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Wrench className="h-3.5 w-3.5" /> Service Type *
                  </Label>
                  <Select
                    value={formData.serviceType}
                    onValueChange={(value) => setFormData({ ...formData, serviceType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((service) => (
                        <SelectItem key={service} value={service}>
                          {service}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> Preferred Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.preferredDate}
                      onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Preferred Time
                    </Label>
                    <Select
                      value={formData.preferredTime}
                      onValueChange={(value) => setFormData({ ...formData, preferredTime: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a time slot" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    placeholder="Any special requests or details about the job..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Request Appointment'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          We typically respond within 24 hours.
        </p>
      </div>
    </div>
  )
}
