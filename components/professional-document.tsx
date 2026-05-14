'use client'

import { forwardRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  Printer,
  Download,
  CreditCard,
  ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

// Types
interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total?: number
}

interface CompanyInfo {
  name: string
  logo?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  website?: string | null
  licenseNumber?: string | null
}

interface CustomerInfo {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

interface DocumentTotals {
  subtotal: number
  taxRate?: number
  taxAmount?: number
  discount?: number
  amountPaid?: number
  total: number
  balanceDue?: number
}

type DocumentStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 
                       'pending' | 'Pending' | 'paid' | 'Paid' | 'overdue' | 'Overdue' | 'partial'

interface ProfessionalDocumentProps {
  type: 'invoice' | 'estimate'
  documentNumber: string
  issueDate: string
  dueDate?: string
  expiryDate?: string
  status: DocumentStatus
  company: CompanyInfo
  customer: CustomerInfo
  items: LineItem[]
  totals: DocumentTotals
  notes?: string | null
  terms?: string | null
  paymentInstructions?: string | null
  onPrint?: () => void
  onDownload?: () => void
  onPayNow?: () => void
  onAccept?: () => void
  onDecline?: () => void
  backLink?: string
  backLabel?: string
  isActionLoading?: boolean
  actionLoadingType?: 'pay' | 'accept' | 'decline'
  portalMode?: boolean
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Draft' },
  sent: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' },
  viewed: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Viewed' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' },
  Pending: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' },
  accepted: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Accepted' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Paid' },
  Paid: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Paid' },
  declined: { bg: 'bg-red-100', text: 'text-red-800', label: 'Declined' },
  expired: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Expired' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue' },
  Overdue: { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue' },
  partial: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Partial' },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const ProfessionalDocument = forwardRef<HTMLDivElement, ProfessionalDocumentProps>(
  function ProfessionalDocument(props, ref) {
    const {
      type,
      documentNumber,
      issueDate,
      dueDate,
      expiryDate,
      status,
      company,
      customer,
      items,
      totals,
      notes,
      terms,
      paymentInstructions,
      onPrint,
      onDownload,
      onPayNow,
      onAccept,
      onDecline,
      backLink,
      backLabel,
      isActionLoading,
      portalMode = false,
    } = props

    const statusInfo = statusConfig[status] || statusConfig.pending
    const isInvoice = type === 'invoice'
    const isPaid = status === 'paid' || status === 'Paid'
    const isAccepted = status === 'accepted'
    const isDeclined = status === 'declined'
    const canPay = isInvoice && !isPaid && totals.balanceDue && totals.balanceDue > 0
    const canRespond = !isInvoice && status === 'sent'

    return (
      <div className="space-y-4">
        {/* Back button */}
        {backLink && (
          <div className="print:hidden">
            <Link href={backLink}>
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel || 'Back'}
              </Button>
            </Link>
          </div>
        )}

        {/* Document */}
        <div
          ref={ref}
          className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0 print:rounded-none"
        >
          {/* Header */}
          <div className="px-8 py-6 sm:px-10 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              {/* Company */}
              <div className="flex items-start gap-4">
                {company.logo ? (
                  <Image
                    src={company.logo}
                    alt={company.name}
                    width={56}
                    height={56}
                    className="rounded-lg object-contain"
                  />
                ) : (
                  <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-white">
                      {company.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{company.name}</h1>
                  <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                    {company.phone && <p>{company.phone}</p>}
                    {company.email && <p>{company.email}</p>}
                    {company.address && <p>{company.address}</p>}
                  </div>
                </div>
              </div>

              {/* Document title */}
              <div className="text-left sm:text-right">
                <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">
                  {isInvoice ? 'Invoice' : 'Estimate'}
                </h2>
                <p className="text-base font-medium text-slate-600 mt-1">{documentNumber}</p>
                <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mt-2 ${statusInfo.bg} ${statusInfo.text}`}>
                  {statusInfo.label}
                </div>
              </div>
            </div>
          </div>

          {/* Customer and dates */}
          <div className="px-8 sm:px-10 py-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Bill To */}
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {isInvoice ? 'Bill To' : 'Prepared For'}
              </p>
              <p className="text-base font-semibold text-slate-900">{customer.name}</p>
              <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
                {customer.address && <p className="whitespace-pre-line">{customer.address}</p>}
              </div>
            </div>

            {/* Dates */}
            <div className="sm:text-right space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Issue Date
                </p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(issueDate)}</p>
              </div>
              {isInvoice && dueDate && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Due Date
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(dueDate)}</p>
                </div>
              )}
              {!isInvoice && expiryDate && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Valid Until
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(expiryDate)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="px-8 sm:px-10 py-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="text-center py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">
                    Qty
                  </th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                    Rate
                  </th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = item.total ?? item.quantity * item.unitPrice
                  return (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-4 text-sm text-slate-900">{item.description}</td>
                      <td className="py-4 text-sm text-slate-600 text-center">{item.quantity}</td>
                      <td className="py-4 text-sm text-slate-600 text-right">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-4 text-sm font-medium text-slate-900 text-right">
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="text-slate-900 font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                
                {totals.taxRate !== undefined && totals.taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax ({totals.taxRate}%)</span>
                    <span className="text-slate-900">{formatCurrency(totals.taxAmount || 0)}</span>
                  </div>
                )}
                
                {totals.discount !== undefined && totals.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600">Discount</span>
                    <span className="text-emerald-600">-{formatCurrency(totals.discount)}</span>
                  </div>
                )}
                
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-900 font-semibold">Total</span>
                    <span className="text-slate-900 font-semibold text-lg">{formatCurrency(totals.total)}</span>
                  </div>
                </div>
                
                {isInvoice && totals.amountPaid !== undefined && totals.amountPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600">Paid</span>
                    <span className="text-emerald-600">-{formatCurrency(totals.amountPaid)}</span>
                  </div>
                )}
                
                {isInvoice && totals.balanceDue !== undefined && (
                  <div className="bg-slate-900 text-white rounded-lg px-4 py-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Balance Due</span>
                      <span className="text-xl font-bold">{formatCurrency(totals.balanceDue)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {(notes || terms || paymentInstructions) && (
            <div className="px-8 sm:px-10 py-6 border-t border-slate-100 space-y-4">
              {notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Notes
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{notes}</p>
                </div>
              )}
              
              {paymentInstructions && isInvoice && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Payment Instructions
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{paymentInstructions}</p>
                </div>
              )}
              
              {terms && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Terms & Conditions
                  </p>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{terms}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="px-8 sm:px-10 py-6 bg-slate-50 border-t border-slate-100 print:hidden">
            {/* Invoice actions */}
            {isInvoice && (
              <div className="space-y-4">
                {canPay && onPayNow && (
                  <Button
                    size="lg"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white h-12 text-base font-semibold"
                    onClick={onPayNow}
                    disabled={isActionLoading}
                  >
                    <CreditCard className="h-5 w-5 mr-2" />
                    Pay {formatCurrency(totals.balanceDue || 0)} Now
                  </Button>
                )}
                
                {isPaid && (
                  <div className="text-center py-5 bg-emerald-50 rounded-xl border border-emerald-100">
                    <CheckCircle className="h-10 w-10 mx-auto text-emerald-600 mb-2" />
                    <p className="font-semibold text-emerald-900 text-lg">Payment Complete</p>
                    <p className="text-sm text-emerald-700 mt-1">Thank you for your payment!</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  {onPrint && (
                    <Button variant="outline" className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100" onClick={onPrint}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  )}
                  {onDownload && (
                    <Button variant="outline" className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100" onClick={onDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Estimate actions */}
            {!isInvoice && (
              <div className="space-y-4">
                {canRespond && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {onAccept && (
                      <Button
                        size="lg"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base font-semibold"
                        onClick={onAccept}
                        disabled={isActionLoading}
                      >
                        <CheckCircle className="h-5 w-5 mr-2" />
                        Accept Estimate
                      </Button>
                    )}
                    {onDecline && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100 h-12 text-base"
                        onClick={onDecline}
                        disabled={isActionLoading}
                      >
                        <XCircle className="h-5 w-5 mr-2" />
                        Decline
                      </Button>
                    )}
                  </div>
                )}
                
                {isAccepted && (
                  <div className="text-center py-5 bg-emerald-50 rounded-xl border border-emerald-100">
                    <CheckCircle className="h-10 w-10 mx-auto text-emerald-600 mb-2" />
                    <p className="font-semibold text-emerald-900 text-lg">Estimate Accepted</p>
                    <p className="text-sm text-emerald-700 mt-1">We&apos;ll be in touch to schedule your service!</p>
                  </div>
                )}
                
                {isDeclined && (
                  <div className="text-center py-5 bg-slate-100 rounded-xl">
                    <XCircle className="h-10 w-10 mx-auto text-slate-400 mb-2" />
                    <p className="font-medium text-slate-600 text-lg">Estimate Declined</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  {onPrint && (
                    <Button variant="outline" className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100" onClick={onPrint}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  )}
                  {onDownload && (
                    <Button variant="outline" className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100" onClick={onDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            )}

            {portalMode && canPay && (
              <p className="text-xs text-center text-slate-500 mt-4">
                Secure payment powered by Stripe
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }
)

export default ProfessionalDocument
