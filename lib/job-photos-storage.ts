'use client'

import { createClient } from '@/lib/supabase/client'
import type { JobPhoto, PhotoComparison, PhotoType } from '@/lib/job-photos-types'

function rowToPhoto(row: any): JobPhoto {
  return {
    id: row.id,
    jobId: row.job_id,
    customerId: row.customer_id,
    companyId: row.company_id,
    photoUrl: row.photo_url,
    storagePath: row.storage_path,
    photoType: row.photo_type,
    caption: row.caption || '',
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at || row.created_at,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
  }
}

function rowToComparison(row: any): PhotoComparison {
  return {
    id: row.id,
    jobId: row.job_id,
    companyId: row.company_id,
    beforePhotoId: row.before_photo_id,
    afterPhotoId: row.after_photo_id,
    confidenceScore: row.confidence_score,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_BYTES = 10 * 1024 * 1024

export function validatePhotoFile(file: File): string | null {
  const typeOk = file.type.startsWith('image/') &&
    (ACCEPTED_TYPES.includes(file.type) || file.type === '')
  if (!typeOk) return 'Unsupported file type. Use JPG, PNG, WEBP, or HEIC.'
  if (file.size > MAX_BYTES) return 'File too large (max 10MB).'
  return null
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function getJobPhotos(jobId: string): Promise<JobPhoto[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_photos')
    .select('*')
    .eq('job_id', jobId)
    .order('uploaded_at', { ascending: true })

  if (error) {
    console.error('[job-photos] getJobPhotos failed:', error)
    return []
  }
  return (data || []).map(rowToPhoto)
}

export async function getCustomerPhotoHistory(customerId: string): Promise<JobPhoto[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_photos')
    .select('*')
    .eq('customer_id', customerId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    console.error('[job-photos] getCustomerPhotoHistory failed:', error)
    return []
  }
  return (data || []).map(rowToPhoto)
}

// Upload via the API route (handles Blob + DB insert + auth).
// Returns the created photo or throws with a useful message.
export async function uploadJobPhoto(params: {
  jobId: string
  customerId: string
  photoType: PhotoType
  file: File
  caption?: string
  onProgress?: (pct: number) => void
}): Promise<JobPhoto> {
  const { jobId, customerId, photoType, file, caption, onProgress } = params

  const validationError = validatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  const fd = new FormData()
  fd.append('file', file)
  fd.append('jobId', jobId)
  fd.append('customerId', customerId)
  fd.append('photoType', photoType)
  if (caption) fd.append('caption', caption)

  // Use XHR for upload progress
  const photo = await new Promise<JobPhoto>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/job-photos/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}')
        if (xhr.status >= 200 && xhr.status < 300 && json.photo) {
          resolve(rowToPhoto(json.photo))
        } else {
          reject(new Error(json.error || 'Upload failed'))
        }
      } catch {
        reject(new Error('Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(fd)
  })

  return photo
}

export async function deleteJobPhoto(photoId: string): Promise<void> {
  const res = await fetch('/api/job-photos/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || 'Failed to delete photo')
  }
}

export async function updateJobPhotoCaption(photoId: string, caption: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('job_photos')
    .update({ caption })
    .eq('id', photoId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Smart Comparisons
// ---------------------------------------------------------------------------

export async function getPhotoComparisons(jobId: string): Promise<PhotoComparison[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_photo_comparisons')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[job-photos] getPhotoComparisons failed:', error)
    return []
  }
  return (data || []).map(rowToComparison)
}

// Placeholder "AI" pairing: matches before/after photos by upload order.
// Structured so a real vision model can later replace the pairing logic.
export async function generateSmartPhotoComparisons(jobId: string): Promise<PhotoComparison[]> {
  const supabase = createClient()
  const photos = await getJobPhotos(jobId)
  const before = photos.filter(p => p.photoType === 'before')
  const after = photos.filter(p => p.photoType === 'after')

  if (before.length === 0 || after.length === 0) {
    throw new Error('Need at least one before and one after photo to generate comparisons.')
  }

  // Resolve company_id from the photos (all share the same company)
  const companyId = photos.find(p => p.companyId)?.companyId
  if (!companyId) throw new Error('Could not resolve company for this job.')

  // Existing pairs to avoid duplicates
  const existing = await getPhotoComparisons(jobId)
  const existingPairs = new Set(existing.map(c => `${c.beforePhotoId}:${c.afterPhotoId}`))

  const pairCount = Math.min(before.length, after.length)
  const rows: any[] = []
  for (let i = 0; i < pairCount; i++) {
    const key = `${before[i].id}:${after[i].id}`
    if (existingPairs.has(key)) continue
    rows.push({
      job_id: jobId,
      company_id: companyId,
      before_photo_id: before[i].id,
      after_photo_id: after[i].id,
      // Heuristic placeholder score — by upload order, descending confidence
      confidence_score: Number((0.9 - i * 0.05).toFixed(2)),
      created_by: 'auto',
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('job_photo_comparisons').insert(rows)
    if (error) throw new Error(error.message)
  }

  return getPhotoComparisons(jobId)
}

export async function createManualPhotoComparison(
  jobId: string,
  beforePhotoId: string,
  afterPhotoId: string,
): Promise<PhotoComparison[]> {
  const supabase = createClient()
  const photos = await getJobPhotos(jobId)
  const companyId = photos.find(p => p.companyId)?.companyId
  if (!companyId) throw new Error('Could not resolve company for this job.')

  const { error } = await supabase.from('job_photo_comparisons').insert({
    job_id: jobId,
    company_id: companyId,
    before_photo_id: beforePhotoId,
    after_photo_id: afterPhotoId,
    created_by: 'manual',
  })
  if (error) throw new Error(error.message)
  return getPhotoComparisons(jobId)
}

export async function deletePhotoComparison(comparisonId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('job_photo_comparisons')
    .delete()
    .eq('id', comparisonId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Completion Reports
// ---------------------------------------------------------------------------

export interface GenerateReportResult {
  reportUrl: string
  report: any
  sent: {
    email: { success: boolean; error?: string } | null
    sms: { success: boolean; error?: string } | null
  }
}

export async function generateCompletionReport(params: {
  jobId: string
  technicianNotes?: string
  thankYouMessage?: string
  send?: boolean
  channel?: 'email' | 'sms' | 'both'
}): Promise<GenerateReportResult> {
  const res = await fetch('/api/job-photos/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to generate report')
  return json as GenerateReportResult
}

export async function getCompletionReport(jobId: string): Promise<any | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('job_completion_reports')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') {
    console.error('[job-photos] getCompletionReport failed:', error)
    return null
  }
  return data
}
