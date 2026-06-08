import { del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { photoId } = await request.json()
    if (!photoId) {
      return NextResponse.json({ error: 'Missing photoId' }, { status: 400 })
    }

    // RLS ensures the user can only read photos they own/manage
    const { data: photo, error: fetchErr } = await supabase
      .from('job_photos')
      .select('id, storage_path')
      .eq('id', photoId)
      .maybeSingle()

    if (fetchErr || !photo) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 })
    }

    // Delete the DB row first (RLS enforces permission). If denied, we stop.
    const { error: delErr } = await supabase
      .from('job_photos')
      .delete()
      .eq('id', photoId)

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 403 })
    }

    // Best-effort remove from Blob storage
    try {
      await del(photo.storage_path)
    } catch (e) {
      console.error('[job-photos] Blob delete failed (row already removed):', e)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[job-photos] Delete failed:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
