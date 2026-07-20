import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Receipts can be images or PDFs.
const ACCEPTED = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
]
const MAX_BYTES = 15 * 1024 * 1024 // 15MB

// Resolve the caller's storage scope (company id if they belong to one, else
// their own user id). Files are stored under this scope so the serve route can
// authorize by path prefix without needing a saved expense row yet.
async function resolveScope(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()
  return membership?.company_id || userId
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    if ((!isImage && !isPdf) || (file.type && !ACCEPTED.includes(file.type))) {
      return NextResponse.json({ error: 'Unsupported file. Use an image (JPG, PNG, WEBP, HEIC) or PDF.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 })
    }

    const scope = await resolveScope(supabase, user.id)
    const ext = (file.name.split('.').pop() || (isPdf ? 'pdf' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const pathname = `expense-receipts/${scope}/${ts}-${rand}.${ext}`

    const blob = await put(pathname, file, { access: 'private' })

    return NextResponse.json({
      attachment: {
        url: `/api/expense-receipts/file?pathname=${encodeURIComponent(blob.pathname)}`,
        pathname: blob.pathname,
        name: file.name,
        size: file.size,
        contentType: file.type,
        uploadedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[expense-receipts] Upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
