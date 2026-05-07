import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Check if profile exists, if not create with pending status
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()

      if (!existingProfile) {
        // Create profile with pending status for new users
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || null,
          status: 'pending',
          is_admin: false,
        })
        // Redirect to pending approval page
        return NextResponse.redirect(`${origin}/pending-approval`)
      }

      // Check approval status
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', data.user.id)
        .single()

      if (profile?.status !== 'approved') {
        return NextResponse.redirect(`${origin}/pending-approval`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
