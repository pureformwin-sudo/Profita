import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { 
        auth: { 
          persistSession: false 
        } 
      }
    )

    // Get all users
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (usersError || !users || users.length === 0) {
      return NextResponse.json({ error: 'No users found' }, { status: 404 })
    }

    // Get first user
    const firstUser = users[0]

    // Update their profile to be admin and approved
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'approved',
        is_admin: true
      })
      .eq('id', firstUser.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      admin: firstUser.email,
      message: `${firstUser.email} is now admin and approved`
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
