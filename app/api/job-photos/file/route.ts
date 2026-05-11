import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

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

    // Authorize: caller must own the photo, or be an assigned crew member,
    // or share the same owner_user_id (RLS verifies all of this).
    const { data: photo } = await supabase
      .from('job_photos')
      .select('id')
      .eq('pathname', pathname)
      .maybeSingle()

    if (!photo) {
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
    console.error('[job-photos] Serve failed:', err)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
