import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const jobId = (formData.get('jobId') as string | null) || ''
    const phase = (formData.get('phase') as string | null) || 'before' // 'before' | 'after'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!jobId) {
      return NextResponse.json({ error: 'No jobId provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }
    // 10 MB cap
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ts = Date.now()
    const pathname = `job-photos/${user.id}/${jobId}/${phase}-${ts}.${ext}`

    const blob = await put(pathname, file, { access: 'private' })

    // Persist metadata in Supabase
    const { data, error } = await supabase
      .from('job_photos')
      .insert({
        user_id: user.id,
        job_id: jobId,
        phase,
        pathname: blob.pathname,
        size_bytes: file.size,
        content_type: file.type,
      })
      .select()
      .single()

    if (error) {
      console.error('[job-photos] DB insert failed:', error)
      // Best-effort cleanup is not critical here; return error
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ photo: data })
  } catch (err) {
    console.error('[job-photos] Upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
