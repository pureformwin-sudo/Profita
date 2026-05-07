'use server'

import { createClient } from '@/lib/supabase/server'

export interface Booking {
  id: string
  lead_id: string | null
  customer_id: string | null
  service_type: string
  scheduled_date: string
  scheduled_time: string | null
  duration_minutes: number | null
  address: string | null
  notes: string | null
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  assigned_crew_id: string | null
  created_by: string | null
  created_at: string
  // Joined fields
  lead_name?: string
  lead_phone?: string
  customer_name?: string
  crew_name?: string
}

export async function getBookings(): Promise<Booking[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      leads:lead_id (name, phone),
      customers:customer_id (name),
      team_members:assigned_crew_id (name)
    `)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching bookings:', error)
    return []
  }
  
  return (data || []).map((b: any) => ({
    ...b,
    lead_name: b.leads?.name,
    lead_phone: b.leads?.phone,
    customer_name: b.customers?.name,
    crew_name: b.team_members?.name,
  }))
}

export async function getBookingsForRep(): Promise<Booking[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      leads:lead_id (name, phone),
      customers:customer_id (name)
    `)
    .eq('created_by', user.id)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching bookings:', error)
    return []
  }
  
  return (data || []).map((b: any) => ({
    ...b,
    lead_name: b.leads?.name,
    lead_phone: b.leads?.phone,
    customer_name: b.customers?.name,
  }))
}

export async function createBooking(booking: {
  lead_id?: string
  customer_id?: string
  service_type: string
  scheduled_date: string
  scheduled_time?: string
  duration_minutes?: number
  address?: string
  notes?: string
  assigned_crew_id?: string
}): Promise<{ success: boolean; booking?: Booking; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      ...booking,
      status: 'scheduled',
      created_by: user.id,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating booking:', error)
    return { success: false, error: error.message }
  }
  
  // If linked to a lead, update lead status to 'booked'
  if (booking.lead_id) {
    await supabase
      .from('leads')
      .update({ status: 'booked' })
      .eq('id', booking.lead_id)
  }
  
  return { success: true, booking: data }
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id)
  
  if (error) {
    console.error('Error updating booking:', error)
    return false
  }
  
  return true
}

export async function deleteBooking(id: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting booking:', error)
    return false
  }
  
  return true
}

export async function getUpcomingBookings(days: number = 7): Promise<Booking[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const today = new Date().toISOString().split('T')[0]
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + days)
  const futureDateStr = futureDate.toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      leads:lead_id (name, phone, address)
    `)
    .eq('created_by', user.id)
    .gte('scheduled_date', today)
    .lte('scheduled_date', futureDateStr)
    .in('status', ['scheduled', 'confirmed'])
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching upcoming bookings:', error)
    return []
  }
  
  return (data || []).map((b: any) => ({
    ...b,
    lead_name: b.leads?.name,
    lead_phone: b.leads?.phone,
    address: b.address || b.leads?.address,
  }))
}

export async function getTodaysBookings(): Promise<Booking[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const today = new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      leads:lead_id (name, phone, address)
    `)
    .eq('created_by', user.id)
    .eq('scheduled_date', today)
    .order('scheduled_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching today bookings:', error)
    return []
  }
  
  return (data || []).map((b: any) => ({
    ...b,
    lead_name: b.leads?.name,
    lead_phone: b.leads?.phone,
    address: b.address || b.leads?.address,
  }))
}
