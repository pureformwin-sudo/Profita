import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

// Resolve the caller's storage scope (company id if any, else user id).
async function resolveScope(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()
  return membership?.company_id || userId
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pathname = request.nextUrl.searchParams.get('pathname')
    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Authorize by scope prefix: the file must live under this caller's
    // company/user scope. Receipts are uploaded before the expense row exists,
    // so we authorize on the path rather than a DB lookup.
    const scope = await resolveScope(supabase, user.id)
    const allowedPrefix = `expense-receipts/${scope}/`
    if (!pathname.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    console.error('[expense-receipts] Serve failed:', err)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
