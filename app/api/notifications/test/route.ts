import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTestNotification } from '@/lib/notifications'
import type { NotificationType } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { channel, to, type } = await req.json() as {
      channel: 'sms' | 'email'
      to: string
      type: NotificationType
    }
    
    if (!channel || !to || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const result = await sendTestNotification(user.id, channel, to, type)
    
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Test notification error:', error)
    return NextResponse.json({ error: error.message || 'Failed to send test' }, { status: 500 })
  }
}
