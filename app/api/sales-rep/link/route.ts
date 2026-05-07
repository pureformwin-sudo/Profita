import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  console.log('[v0] /api/sales-rep/link called')
  
  try {
    const body = await request.json()
    const { userId, employeeId, ownerUserId } = body

    console.log('[v0] Request body:', { userId, employeeId, ownerUserId })

    if (!userId || !employeeId || !ownerUserId) {
      console.log('[v0] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check env vars exist
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[v0] Missing Supabase env vars - URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL, 'SERVICE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    console.log('[v0] Supabase env vars present, creating admin client')

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Check if link already exists for this user
    console.log('[v0] Checking for existing link for user:', userId)
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('sales_rep_users')
      .select('id')
      .eq('user_id', userId)
      .single()

    console.log('[v0] Existing check result:', { existing, error: existingError?.message })

    if (existing) {
      console.log('[v0] Link already exists, returning success')
      return NextResponse.json({ success: true, existing: true })
    }

    // Create the link
    console.log('[v0] Inserting new sales_rep_users row')
    const { data: insertData, error } = await supabaseAdmin
      .from('sales_rep_users')
      .insert({
        user_id: userId,
        employee_id: employeeId,
        owner_user_id: ownerUserId,
      })
      .select()

    console.log('[v0] Insert result:', { insertData, error: error?.message, errorCode: error?.code, errorDetails: error?.details })

    if (error) {
      console.error('[v0] Error creating sales rep link:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[v0] Successfully created sales_rep_users row!')
    return NextResponse.json({ success: true, data: insertData })
  } catch (error) {
    console.error('[v0] Sales rep link error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
