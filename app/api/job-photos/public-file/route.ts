import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@supabase/supabase-js'

// Public, token-scoped photo serving for the customer completion report page.
// A caller must supply BOTH a valid report token AND a storage_path that
// belongs to that report's job. This avoids exposing the private blob store
// while letting customers view their own report photos without logging in.
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!token || !pathname) {
      return NextResponse.json({ error: 'Missing token or pathname' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    // Resolve the report -> job, then confirm the requested photo belongs to it.
    const { data: report } = await supabase
      .from('job_completion_reports')
      .select('job_id')
      .eq('report_token', token)
      .maybeSingle()

    if (!report) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 404 })
    }

    const { data: photo } = await supabase
      .from('job_photos')
      .select('id')
      .eq('storage_path', pathname)
      .eq('job_id', report.job_id)
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
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        ETag: result.blob.etag,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[job-photos] Public serve failed:', err)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
