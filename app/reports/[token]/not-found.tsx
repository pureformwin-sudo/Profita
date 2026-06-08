export default function ReportNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 text-center">
      <div className="max-w-md rounded-xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
        <h1 className="text-xl font-bold text-neutral-900">Report not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          This completion report link is invalid or may have expired. Please contact your service
          provider for an updated link.
        </p>
      </div>
    </main>
  )
}
