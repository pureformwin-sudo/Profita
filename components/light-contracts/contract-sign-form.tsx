'use client'

/**
 * The customer-facing signing control on the public contract page.
 *
 * Replaces the blank signature/date lines of the printed document with a live
 * input. Once signed it collapses to a read-only receipt showing the captured
 * signature and the server-stamped timestamp.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignaturePad, type SignatureValue } from '@/components/light-contracts/signature-pad'
import type { PublicContract } from '@/lib/contract-signing'

interface ContractSignFormProps {
  token: string
  contract: PublicContract
}

/** Full date + time, so the stamp is unambiguous after the fact. */
function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function ContractSignForm({ token, contract: initial }: ContractSignFormProps) {
  const [contract, setContract] = useState(initial)
  const [signature, setSignature] = useState<SignatureValue>({
    kind: 'typed',
    name: initial.customerName ?? '',
    image: null,
  })
  const [submitting, setSubmitting] = useState(false)

  const signed = contract.status === 'signed'

  async function handleSign() {
    if (!signature.name.trim()) {
      toast.error('Please enter your full legal name.')
      return
    }
    if (signature.kind === 'drawn' && !signature.image) {
      toast.error('Please draw your signature before signing.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signature),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json?.error ?? 'Could not record your signature.')
        return
      }

      setContract(json.contract as PublicContract)
      toast.success('Contract signed. A copy has been recorded.')
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Signed: read-only receipt -----------------------------------------
  if (signed) {
    return (
      <section className="mt-12 border-t border-[#e2e8f0] pt-8">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <div className="flex h-16 items-end border-b border-[#94a3b8] pb-1">
              {contract.signatureKind === 'drawn' && contract.signatureImage ? (
                <img
                  src={contract.signatureImage}
                  alt={`Signature of ${contract.signatureName ?? 'customer'}`}
                  className="max-h-14 w-auto"
                />
              ) : (
                <span className="font-signature text-3xl leading-none text-[#1a1a1a]">
                  {contract.signatureName}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-medium text-[#1a1a1a]">Customer</p>
            <p className="text-xs text-[#64748b]">{contract.signatureName}</p>
            <div className="mt-6 flex h-8 items-end border-b border-[#94a3b8] pb-1">
              <span className="text-xs text-[#1a1a1a]">
                {contract.signedAt ? formatStamp(contract.signedAt) : '—'}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#64748b]">Date signed</p>
          </div>

          <div>
            <div className="flex h-16 items-end border-b border-[#94a3b8] pb-1">
              <span className="font-signature text-3xl leading-none text-[#1a1a1a]">
                {contract.companySignatureName ?? contract.companyName ?? ''}
              </span>
            </div>
            <p className="mt-2 text-xs font-medium text-[#1a1a1a]">Company representative</p>
            <p className="text-xs text-[#64748b]">
              {contract.companySignatureName ?? contract.companyName ?? ''}
            </p>
            <div className="mt-6 flex h-8 items-end border-b border-[#94a3b8] pb-1">
              <span className="text-xs text-[#1a1a1a]">
                {contract.companySignedAt ? formatStamp(contract.companySignedAt) : '—'}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#64748b]">Date</p>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 print:hidden">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#15803d]" />
          <div className="text-sm">
            <p className="font-medium text-[#14532d]">This agreement has been signed.</p>
            <p className="mt-0.5 text-[#166534]">
              Signed by {contract.signatureName}
              {contract.signedAt ? ` on ${formatStamp(contract.signedAt)}` : ''}. You can print or
              save this page for your records.
            </p>
          </div>
        </div>

        <div className="mt-4 print:hidden">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>
      </section>
    )
  }

  // ---- Unsigned: capture -------------------------------------------------
  return (
    <section className="mt-12 border-t border-[#e2e8f0] pt-8">
      {/* Company side is pre-filled; only the customer needs to act. */}
      <div className="grid gap-10 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Your signature</p>
          </div>
          <div className="mt-4">
            <SignaturePad
              defaultName={contract.customerName ?? ''}
              disabled={submitting}
              onChange={setSignature}
            />
          </div>
        </div>

        <div>
          <div className="flex h-16 items-end border-b border-[#94a3b8] pb-1">
            <span className="font-signature text-3xl leading-none text-[#1a1a1a]">
              {contract.companySignatureName ?? contract.companyName ?? ''}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[#1a1a1a]">Company representative</p>
          <p className="text-xs text-[#64748b]">
            {contract.companySignatureName ?? contract.companyName ?? ''}
          </p>
          <div className="mt-6 flex h-8 items-end border-b border-[#94a3b8] pb-1">
            <span className="text-xs text-[#1a1a1a]">
              {contract.companySignedAt ? formatStamp(contract.companySignedAt) : '—'}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#64748b]">Date</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 print:hidden">
        <Button type="button" size="lg" onClick={handleSign} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing…
            </>
          ) : (
            'Sign this agreement'
          )}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          By clicking Sign, you agree to the terms above and consent to signing electronically. The
          current date and time will be recorded with your signature.
        </p>
      </div>
    </section>
  )
}
