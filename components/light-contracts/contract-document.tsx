'use client'

/**
 * The printable contract document.
 *
 * Rendered on a fixed white page regardless of app theme so that
 * print-to-PDF output is predictable. The global `@media print` block resets
 * theme variables and hides nav/buttons.
 */

import { Fragment } from 'react'
import {
  buildContractValues,
  formatContractDate,
  formatPrice,
  formatSignedStamp,
  renderContractBody,
  toParagraphs,
  type CompanyInfo,
} from '@/lib/light-contracts'
import type { LightContract } from '@/lib/types'

interface ContractDocumentProps {
  contract: LightContract
  /** Template wording. Ignored when the contract has a frozen snapshot. */
  templateBody: string
  company: CompanyInfo
}

export function ContractDocument({ contract, templateBody, company }: ContractDocumentProps) {
  // A finalized contract always shows its frozen wording, never the current
  // template — that's the whole point of the snapshot.
  const body = contract.bodySnapshot ?? renderContractBody(
    templateBody,
    buildContractValues(contract, company),
  )
  const paragraphs = toParagraphs(body)

  const terms: { label: string; value: string }[] = [
    { label: 'Price', value: formatPrice(contract.price) || '—' },
    {
      label: 'Term',
      value:
        contract.termYears == null
          ? '—'
          : `${contract.termYears} ${contract.termYears === 1 ? 'year' : 'years'}`,
    },
    { label: 'Install', value: formatContractDate(contract.installDate) || '—' },
    { label: 'Takedown', value: formatContractDate(contract.takedownDate) || '—' },
  ]

  return (
    <div
      id="contract-document"
      className="mx-auto w-full max-w-[8.5in] bg-white px-8 py-10 text-[#1a1a1a] sm:px-12 print:max-w-none print:px-0 print:py-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e2e8f0] pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">
            Christmas Lights Lease Agreement
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
            {company.name || 'Your Business'}
          </h1>
          {(company.phone || company.email) && (
            <p className="mt-1 text-xs text-[#64748b]">
              {[company.phone, company.email].filter(Boolean).join('  ·  ')}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold">{contract.contractNumber}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            {contract.status === 'final' && contract.finalizedAt
              ? `Issued ${new Date(contract.finalizedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}`
              : 'Draft — not yet issued'}
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
            <p className="mt-1 text-sm leading-relaxed text-[#475569]">{contract.serviceAddress}</p>
          )}
          {(contract.customerPhone || contract.customerEmail) && (
            <p className="mt-1 text-sm text-[#64748b]">
              {[contract.customerPhone, contract.customerEmail].filter(Boolean).join('  ·  ')}
            </p>
          )}
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#64748b]">Terms</p>
          <dl className="mt-2 space-y-1.5">
            {terms.map((t) => (
              <div key={t.label} className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-[#64748b]">{t.label}</dt>
                <dd className="font-medium tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-8 border-t border-[#e2e8f0] pt-8">
        {paragraphs.length > 0 ? (
          <div className="space-y-4 text-sm leading-relaxed">
            {paragraphs.map((p, i) => (
              <Fragment key={i}>
                {/* Preserve single newlines inside a paragraph (numbered lists,
                    addresses) without needing a markdown parser. */}
                <p className="whitespace-pre-line text-pretty">{p}</p>
              </Fragment>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
            No contract wording yet. Paste your agreement text into the Wording tab.
          </p>
        )}
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

      <section className="mt-12 grid gap-10 border-t border-[#e2e8f0] pt-8 sm:grid-cols-2">
        {/* Customer: shows the captured signature once signed, blank line before. */}
        <div>
          <div className="flex h-10 items-end border-b border-[#94a3b8] pb-0.5">
            {contract.status === 'signed' &&
              (contract.signatureKind === 'drawn' && contract.signatureImage ? (
                <img
                  src={contract.signatureImage || '/placeholder.svg'}
                  alt={`Signature of ${contract.signatureName ?? contract.customerName}`}
                  className="max-h-9 w-auto"
                />
              ) : (
                <span className="font-signature text-2xl leading-none">
                  {contract.signatureName}
                </span>
              ))}
          </div>
          <p className="mt-2 text-xs font-medium">Customer</p>
          <p className="text-xs text-[#64748b]">
            {contract.signatureName ?? contract.customerName}
          </p>
          <div className="mt-6 flex h-8 w-52 items-end border-b border-[#94a3b8] pb-0.5">
            {contract.signedAt && (
              <span className="text-[11px]">{formatSignedStamp(contract.signedAt)}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-[#64748b]">Date</p>
        </div>

        {/* Company: auto-stamped at send time. */}
        <div>
          <div className="flex h-10 items-end border-b border-[#94a3b8] pb-0.5">
            {contract.companySignatureName && (
              <span className="font-signature text-2xl leading-none">
                {contract.companySignatureName}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-medium">Company representative</p>
          {(contract.companySignatureName || company.name) && (
            <p className="text-xs text-[#64748b]">
              {contract.companySignatureName ?? company.name}
            </p>
          )}
          <div className="mt-6 flex h-8 w-52 items-end border-b border-[#94a3b8] pb-0.5">
            {contract.companySignedAt && (
              <span className="text-[11px]">{formatSignedStamp(contract.companySignedAt)}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-[#64748b]">Date</p>
        </div>
      </section>
    </div>
  )
}
