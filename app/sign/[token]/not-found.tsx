import { FileX2 } from 'lucide-react'

/**
 * One generic state for every failure mode (bad token, reverted to draft,
 * deleted) so the page can't be used to probe which tokens exist.
 */
export default function SignNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-card px-6 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileX2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          This link isn&apos;t available
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The agreement may have been withdrawn, replaced, or the link may be incorrect. Please
          contact the company that sent it for an updated link.
        </p>
      </div>
    </main>
  )
}
