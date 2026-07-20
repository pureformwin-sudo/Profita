// Types for the Job Photos & Completion Reports feature

export type PhotoType = 'before' | 'progress' | 'after'

export interface JobPhoto {
  id: string
  jobId: string
  customerId: string | null
  companyId: string | null
  photoUrl: string | null
  storagePath: string
  photoType: PhotoType
  caption: string
  uploadedBy: string | null
  uploadedAt: string
  sizeBytes?: number | null
  contentType?: string | null
}

export interface CompletionReport {
  id: string
  jobId: string
  customerId: string
  companyId: string
  reportToken: string
  serviceDate: string | null
  serviceName: string | null
  technicianNotes: string | null
  thankYouMessage: string | null
  reportUrl: string | null
  emailSentAt: string | null
  smsSentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PhotoComparison {
  id: string
  jobId: string
  companyId: string
  beforePhotoId: string
  afterPhotoId: string
  confidenceScore: number | null
  createdBy: string
  createdAt: string
}

// Shape returned by the public get_completion_report_by_token RPC
export interface PublicReportData {
  report: {
    id: string
    job_id: string
    report_token: string
    service_date: string | null
    service_name: string | null
    technician_notes: string | null
    thank_you_message: string | null
    created_at: string
  }
  company: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    address: string | null
    logo_url: string | null
    website: string | null
  }
  customer: {
    id: string
    name: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  job: {
    id: string
    job_type: string | null
    date: string | null
    status: string | null
    notes: string | null
  }
  photos: Array<{
    id: string
    photo_type: PhotoType
    storage_path: string
    caption: string | null
    uploaded_at: string
  }>
  comparisons: Array<{
    id: string
    before_photo_id: string
    after_photo_id: string
    confidence_score: number | null
  }>
}

// Helper: build the secure serve URL for a stored photo
export function photoSrc(storagePath: string): string {
  return `/api/job-photos/file?pathname=${encodeURIComponent(storagePath)}`
}
