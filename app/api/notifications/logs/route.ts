import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNotificationLogs } from '@/lib/notifications'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const logs = await getNotificationLogs(user.id, 100)
    
    return NextResponse.json(logs)
  } catch (error: any) {
    console.error('Get notification logs error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
