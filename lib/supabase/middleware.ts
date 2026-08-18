import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Public routes - no auth required
  const isPublicRoute = ['/login', '/signup', '/rep/login', '/auth/callback', '/pending-approval'].includes(pathname) 
    || pathname.startsWith('/worker')
    || pathname.startsWith('/invite')
    || pathname.startsWith('/pay')
    || pathname.startsWith('/reports')
    || pathname.startsWith('/api/job-photos/public-file')
    // Inbound webhooks are machine-to-machine: third parties (Stripe, Quo) send no
    // session cookie, so without this they get 307'd to /login and every delivery
    // fails. Each route authenticates itself by verifying the provider's signature.
    || pathname.startsWith('/api/webhooks/')

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Public routes - allow all
  if (isPublicRoute) {
    // Redirect logged-in users away from login pages
    if (user && (pathname === '/login' || pathname === '/signup')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Not logged in - redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.startsWith('/rep') ? '/rep/login' : '/login'
    return NextResponse.redirect(url)
  }

  // Check if sales rep
  const { data: salesRep } = await supabase
    .from('sales_rep_users')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const isSalesRep = !!salesRep

  // Sales rep on owner routes -> redirect to /rep
  if (isSalesRep && !pathname.startsWith('/rep')) {
    const url = request.nextUrl.clone()
    url.pathname = '/rep'
    return NextResponse.redirect(url)
  }

  // Owner on rep routes -> redirect to /
  if (!isSalesRep && pathname.startsWith('/rep') && pathname !== '/rep/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
