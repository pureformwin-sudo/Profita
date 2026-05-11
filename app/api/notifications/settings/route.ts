import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNotificationSettings, saveNotificationSettings, DEFAULT_TEMPLATES } from '@/lib/notifications'
import type { NotificationSettings } from '@/lib/types'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const settings = await getNotificationSettings(user.id)
    
    return NextResponse.json(settings || {
      smsEnabled: false,
      emailEnabled: false,
      defaultChannel: 'email',
      templates: DEFAULT_TEMPLATES,
    })
  } catch (error: any) {
    console.error('Get notification settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const settings = await req.json() as NotificationSettings
    const success = await saveNotificationSettings(user.id, settings)
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Save notification settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
