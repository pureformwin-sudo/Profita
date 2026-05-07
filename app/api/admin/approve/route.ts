import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, action, isAdmin } = body // action: 'approve' | 'reject' | 'toggleAdmin'

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Check if requester is admin
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const { data: { user: requester }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requester) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Check if requester is admin
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', requester.id)
      .single()

    if (!requesterProfile?.is_admin) {
      return NextResponse.json({ error: 'Not admin' }, { status: 403 })
    }

    // Handle toggleAdmin action
    if (action === 'toggleAdmin') {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_admin: isAdmin })
        .eq('id', userId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, isAdmin })
    }

    // Update user status (approve/reject)
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', userId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
