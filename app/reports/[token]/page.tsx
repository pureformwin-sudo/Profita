import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { ReportActions } from './report-actions'

export const dynamic = 'force-dynamic'

interface ReportPhoto {
  id: string
  photo_type: 'before' | 'progress' | 'after'
  storage_path: string
  caption: string | null
  uploaded_at: string
}

interface ReportData {
  report: {
    id: string
    report_token: string
    technician_notes: string | null
    thank_you_message: string | null
    created_at: string
  }
  company: {
    name: string | null
    phone: string | null
    email: string | null
    address: string | null
    logo_url: string | null
    website: string | null
  }
  customer: {
    name: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  job: {
    job_type: string | null
    date: string | null
    status: string | null
    notes: string | null
  }
  photos: ReportPhoto[]
}

function formatDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function publicPhotoUrl(token: string, storagePath: string) {
  return `/api/job-photos/public-file?token=${encodeURIComponent(token)}&pathname=${encodeURIComponent(storagePath)}`
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase.rpc('get_completion_report_by_token', { p_token: token })

  if (error || !data) {
    notFound()
  }

  const report = data as ReportData
  const before = report.photos.filter((p) => p.photo_type === 'before')
  const after = report.photos.filter((p) => p.photo_type === 'after')
  const pairCount = Math.max(before.length, after.length)

  return (
    <main className="min-h-screen bg-neutral-100 py-6 px-4 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <span className="text-sm font-medium text-neutral-500">Service Completion Report</span>
          <ReportActions />
        </div>

        <article className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 print:rounded-none print:shadow-none print:ring-0">
          {/* Header */}
          <header className="flex flex-col gap-4 border-b border-neutral-200 bg-emerald-700 px-8 py-7 text-white sm:flex-row sm:items-center sm:justify-between print:bg-emerald-700">
            <div className="flex items-center gap-4">
              {report.company.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.company.logo_url || '/placeholder.svg'}
                  alt={`${report.company.name} logo`}
                  className="h-12 w-12 rounded-lg bg-white/10 object-contain p-1"
                />
              ) : null}
              <div>
                <h1 className="text-xl font-bold leading-tight text-balance">
                  {report.company.name || 'Service Report'}
                </h1>
                {report.company.phone && (
                  <p className="text-sm text-emerald-100">{report.company.phone}</p>
                )}
              </div>
            </div>
            <div className="text-sm text-emerald-100 sm:text-right">
              <p className="font-semibold text-white">Job Complete</p>
              <p>{formatDate(report.report.created_at)}</p>
            </div>
          </header>

          <div className="space-y-8 px-8 py-8">
            {/* Greeting */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900">
                {report.customer.name ? `Hi ${report.customer.name.split(' ')[0]},` : 'Hello,'}
              </h2>
              <p className="mt-2 leading-relaxed text-neutral-600">
                {report.report.thank_you_message ||
                  `Thank you for choosing ${report.company.name || 'us'}. Your ${report.job.job_type || 'service'} has been completed. Below is a summary along with before and after photos of the work.`}
              </p>
            </section>

            {/* Job details */}
            <section className="grid grid-cols-1 gap-4 rounded-lg bg-neutral-50 p-5 sm:grid-cols-2">
              <DetailRow label="Service" value={report.job.job_type} />
              <DetailRow label="Date completed" value={formatDate(report.report.created_at)} />
              <DetailRow label="Service address" value={report.customer.address} />
              <DetailRow label="Status" value="Completed" />
            </section>

            {/* Technician notes */}
            {report.report.technician_notes && (
              <section>
                <SectionTitle>Notes from your technician</SectionTitle>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-neutral-600">
                  {report.report.technician_notes}
                </p>
              </section>
            )}

            {/* Before & After comparisons */}
            {pairCount > 0 && (
              <section>
                <SectionTitle>Before &amp; After</SectionTitle>
                <div className="mt-4 space-y-6">
                  {Array.from({ length: pairCount }).map((_, i) => (
                    <div key={i} className="grid grid-cols-2 gap-3">
                      <ComparePhoto
                        token={token}
                        photo={before[i]}
                        label="Before"
                      />
                      <ComparePhoto
                        token={token}
                        photo={after[i]}
                        label="After"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.photos.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-400">
                No photos were attached to this report.
              </p>
            )}

            {/* Footer */}
            <footer className="border-t border-neutral-200 pt-6 text-center">
              <p className="text-sm text-neutral-500">
                Questions? Contact {report.company.name || 'us'}
                {report.company.phone ? ` at ${report.company.phone}` : ''}
                {report.company.email ? ` or ${report.company.email}` : ''}.
              </p>
              {report.company.website && (
                <p className="mt-1 text-sm text-emerald-700">{report.company.website}</p>
              )}
            </footer>
          </div>
        </article>

        <p className="mt-4 text-center text-xs text-neutral-400 print:hidden">
          Powered by Profita
        </p>
      </div>
    </main>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{children}</h3>
  )
}

function ComparePhoto({
  token,
  photo,
  label,
}: {
  token: string
  photo: ReportPhoto | undefined
  label: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      {photo ? (
        <div className="overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicPhotoUrl(token, photo.storage_path) || '/placeholder.svg'}
            alt={photo.caption || `${label} photo`}
            className="aspect-square w-full object-cover"
          />
          {photo.caption && (
            <p className="px-2 py-1.5 text-xs text-neutral-500">{photo.caption}</p>
          )}
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-50 text-xs text-neutral-300 ring-1 ring-neutral-200">
          No {label.toLowerCase()} photo
        </div>
      )}
    </div>
  )
}
