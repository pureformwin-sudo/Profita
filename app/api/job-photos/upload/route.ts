import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_BYTES = 10 * 1024 * 1024

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
    // Backwards-compat: accept either photoType (new) or phase (legacy crew app)
    const photoType = ((formData.get('photoType') || formData.get('phase')) as string | null) || 'before'
    let customerId = (formData.get('customerId') as string | null) || null
    const caption = (formData.get('caption') as string | null) || ''

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!jobId) return NextResponse.json({ error: 'No jobId provided' }, { status: 400 })
    if (!['before', 'progress', 'after'].includes(photoType)) {
      return NextResponse.json({ error: 'Invalid photo type' }, { status: 400 })
    }
    if (!file.type.startsWith('image/') || (file.type && !ACCEPTED.includes(file.type))) {
      return NextResponse.json({ error: 'Unsupported file type. Use JPG, PNG, WEBP, or HEIC.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    // Resolve job -> company_id + customer_id (also confirms the user can see the job via RLS)
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, company_id, customer_id, user_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 })
    }
    if (!customerId) customerId = job.customer_id

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    // Storage path: company_id/job_id/photo_type/timestamp-random.ext
    const scope = job.company_id || user.id
    const pathname = `job-photos/${scope}/${jobId}/${photoType}/${ts}-${rand}.${ext}`

    const blob = await put(pathname, file, { access: 'private' })

    const { data, error } = await supabase
      .from('job_photos')
      .insert({
        user_id: user.id,
        uploaded_by: user.id,
        job_id: jobId,
        customer_id: customerId,
        company_id: job.company_id,
        photo_type: photoType,
        storage_path: blob.pathname,
        size_bytes: file.size,
        content_type: file.type,
        caption,
      })
      .select()
      .single()

    if (error) {
      console.error('[job-photos] DB insert failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ photo: data })
  } catch (err) {
    console.error('[job-photos] Upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
