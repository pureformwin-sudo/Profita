'use server'

import { createClient } from '@/lib/supabase/server'

export interface FollowUp {
  id: string
  lead_id: string
  reason: string | null
  due_date: string
  due_time: string | null
  notes: string | null
  status: 'pending' | 'completed' | 'skipped'
  completed_at: string | null
  created_by: string | null
  created_at: string
  // Joined fields
  lead_name?: string
  lead_phone?: string
  lead_address?: string
  lead_status?: string
}

export async function getFollowUps(): Promise<FollowUp[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const { data, error } = await supabase
    .from('follow_ups')
    .select(`
      *,
      leads:lead_id (name, phone, address, status)
    `)
    .eq('created_by', user.id)
    .order('due_date', { ascending: true })
    .order('due_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching follow-ups:', error)
    return []
  }
  
  return (data || []).map((f: any) => ({
    ...f,
    lead_name: f.leads?.name,
    lead_phone: f.leads?.phone,
    lead_address: f.leads?.address,
    lead_status: f.leads?.status,
  }))
}

export async function getFollowUpsGrouped(): Promise<{
  overdue: FollowUp[]
  today: FollowUp[]
  upcoming: FollowUp[]
  completed: FollowUp[]
}> {
  const followUps = await getFollowUps()
  const today = new Date().toISOString().split('T')[0]
  
  const overdue: FollowUp[] = []
  const todayList: FollowUp[] = []
  const upcoming: FollowUp[] = []
  const completed: FollowUp[] = []
  
  for (const fu of followUps) {
    if (fu.status === 'completed' || fu.status === 'skipped') {
      completed.push(fu)
    } else if (fu.due_date < today) {
      overdue.push(fu)
    } else if (fu.due_date === today) {
      todayList.push(fu)
    } else {
      upcoming.push(fu)
    }
  }
  
  return { overdue, today: todayList, upcoming, completed }
}

export async function createFollowUp(followUp: {
  lead_id: string
  reason?: string
  due_date: string
  due_time?: string
  notes?: string
}): Promise<{ success: boolean; followUp?: FollowUp; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  
  const { data, error } = await supabase
    .from('follow_ups')
    .insert({
      ...followUp,
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating follow-up:', error)
    return { success: false, error: error.message }
  }
  
  // Update lead status to follow_up if not already more advanced
  await supabase
    .from('leads')
    .update({ status: 'follow_up' })
    .eq('id', followUp.lead_id)
    .in('status', ['knocked', 'not_home'])
  
  return { success: true, followUp: data }
}

export async function completeFollowUp(id: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('follow_ups')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
  
  if (error) {
    console.error('Error completing follow-up:', error)
    return false
  }
  
  return true
}

export async function skipFollowUp(id: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('follow_ups')
    .update({ status: 'skipped' })
    .eq('id', id)
  
  if (error) {
    console.error('Error skipping follow-up:', error)
    return false
  }
  
  return true
}

export async function rescheduleFollowUp(
  id: string,
  newDate: string,
  newTime?: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('follow_ups')
    .update({
      due_date: newDate,
      due_time: newTime || null,
      status: 'pending',
    })
    .eq('id', id)
  
  if (error) {
    console.error('Error rescheduling follow-up:', error)
    return false
  }
  
  return true
}

export async function deleteFollowUp(id: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('follow_ups')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting follow-up:', error)
    return false
  }
  
  return true
}

export async function getOverdueCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  
  const today = new Date().toISOString().split('T')[0]
  
  const { count, error } = await supabase
    .from('follow_ups')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .eq('status', 'pending')
    .lt('due_date', today)
  
  if (error) {
    console.error('Error getting overdue count:', error)
    return 0
  }
  
  return count || 0
}

export async function getTodayFollowUps(): Promise<FollowUp[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  
  const today = new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('follow_ups')
    .select(`
      *,
      leads:lead_id (name, phone, address, status)
    `)
    .eq('created_by', user.id)
    .eq('status', 'pending')
    .lte('due_date', today)
    .order('due_date', { ascending: true })
    .order('due_time', { ascending: true })
  
  if (error) {
    console.error('Error fetching today follow-ups:', error)
    return []
  }
  
  return (data || []).map((f: any) => ({
    ...f,
    lead_name: f.leads?.name,
    lead_phone: f.leads?.phone,
    lead_address: f.leads?.address,
    lead_status: f.leads?.status,
  }))
}
