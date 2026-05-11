import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications'
import type { NotificationType, NotificationChannel } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await req.json()
    const { 
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      type,
      channel,
      variables,
      jobId,
      invoiceId,
      repId,
      repName,
    } = body as {
      customerId: string
      customerName: string
      customerPhone?: string
      customerEmail?: string
      type: NotificationType
      channel?: NotificationChannel
      variables: Record<string, string>
      jobId?: string
      invoiceId?: string
      repId?: string
      repName?: string
    }
    
    if (!customerId || !customerName || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const result = await sendNotification({
      userId: user.id,
      customer: {
        id: customerId,
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
      },
      type,
      channel,
      variables,
      jobId,
      invoiceId,
      repId,
      repName,
    })
    
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Notification send error:', error)
    return NextResponse.json({ error: error.message || 'Failed to send notification' }, { status: 500 })
  }
}
