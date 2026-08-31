/**
 * Public contract signing page. No login: the share token in the URL is the
 * credential, resolved server-side by lib/contract-signing.ts.
 *
 * Deliberately does NOT use <AppShell> — the customer is not an app user and
 * must not see the business's navigation.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadContractByToken } from '@/lib/contract-signing'
import { formatFieldValue, toParagraphs } from '@/lib/light-contracts'
import { ContractSignForm } from '@/components/light-contracts/contract-sign-form'

// A signature changes this page's content; never serve it from cache.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Review & Sign Agreement',
  robots: { index: false, follow: false },
}

export default async function SignContractPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const contract = await loadContractByToken(token)

  if (!contract) notFound()

  const paragraphs = toParagraphs(contract.body)

  // Built from the field definitions frozen onto this contract, so the customer
  // sees exactly the terms it was executed with even if the type changed since.
  const terms = contract.fieldDefs.map((field) => ({
    label: field.label,
    value: formatFieldValue(field, contract.fieldValues[field.key]) || '—',
  }))

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[8.5in]">
        {contract.status === 'final' && (
          <div className="mb-6 rounded-xl border border-border bg-card px-5 py-4 print:hidden">
            <h1 className="text-lg font-semibold tracking-tight text-foreground text-balance">
              Please review and sign your agreement
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Read the terms below, then add your signature at the bottom of the page.
            </p>
          </div>
        )}

        {/* Fixed white page so print output is predictable regardless of theme. */}
        <article className="rounded-xl bg-white px-8 py-10 text-[#1a1a1a] shadow-sm sm:px-12 print:rounded-none print:px-0 print:py-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e2e8f0] pb-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">
                {contract.documentTitle}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
                {contract.companyName || 'Service Agreement'}
              </h2>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold">{contract.contractNumber}</p>
              <p className="mt-1 text-xs text-[#64748b]">
                {contract.status === 'signed' ? 'Signed' : 'Awaiting signature'}
              </p>
            </div>
          </header>

          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">
                Customer
              </p>
              <p className="mt-2 font-medium">{contract.customerName || '—'}</p>
              {contract.serviceAddress && (
                <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                  {contract.serviceAddress}
                </p>
              )}
            </div>

            {/* A wording-only contract type collects no structured fields. */}
            {terms.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">
                  Terms
                </p>
                <dl className="mt-2 space-y-1.5">
                  {terms.map((t) => (
                    <div
                      key={t.label}
                      className="flex items-baseline justify-between gap-4 text-sm"
                    >
                      <dt className="text-[#64748b]">{t.label}</dt>
                      <dd className="font-medium tabular-nums">{t.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          <div className="mt-8 border-t border-[#e2e8f0] pt-8">
            <div className="space-y-4 text-sm leading-relaxed">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line text-pretty">
                  {p}
                </p>
              ))}
            </div>
          </div>

          {contract.notes && (
            <div className="mt-8 border-t border-[#e2e8f0] pt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">
                Additional terms
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pretty">
                {contract.notes}
              </p>
            </div>
          )}

          <ContractSignForm token={token} contract={contract} />
        </article>

        <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
          Questions about this agreement? Contact{' '}
          {contract.companyName || 'the company'} directly.
        </p>
      </div>
    </main>
  )
}
