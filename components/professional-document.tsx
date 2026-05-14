'use client'

import { forwardRef } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
  // Document type
  type: 'invoice' | 'estimate'
  
  // Document info
  documentNumber: string
  issueDate: string
  dueDate?: string
  expiryDate?: string
  status: DocumentStatus
  
  // Parties
  company: CompanyInfo
  customer: CustomerInfo
  
  // Line items and totals
  items: LineItem[]
  totals: DocumentTotals
  
  // Notes (customer-safe only)
  notes?: string | null
  terms?: string | null
  paymentInstructions?: string | null
  
  // Actions
  onPrint?: () => void
  onDownload?: () => void
  onPayNow?: () => void
  onAccept?: () => void
  onDecline?: () => void
  backLink?: string
  backLabel?: string
  
  // State
  isActionLoading?: boolean
  actionLoadingType?: 'pay' | 'accept' | 'decline'
  
  // Customer portal mode (hides certain elements)
  portalMode?: boolean
}

const statusConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock, label: 'Draft' },
  sent: { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, label: 'Pending' },
  viewed: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock, label: 'Viewed' },
  pending: { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, label: 'Pending' },
  Pending: { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, label: 'Pending' },
  accepted: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Accepted' },
  paid: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Paid' },
  Paid: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle, label: 'Paid' },
  declined: { color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, label: 'Declined' },
  expired: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: AlertCircle, label: 'Expired' },
  overdue: { color: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle, label: 'Overdue' },
  Overdue: { color: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle, label: 'Overdue' },
  partial: { color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock, label: 'Partial' },
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
      actionLoadingType,
      portalMode = false,
    } = props

    const statusInfo = statusConfig[status] || statusConfig.pending
    const StatusIcon = statusInfo.icon
    const isInvoice = type === 'invoice'
    const isPaid = status === 'paid' || status === 'Paid'
    const isAccepted = status === 'accepted'
    const isDeclined = status === 'declined'
    const canPay = isInvoice && !isPaid && totals.balanceDue && totals.balanceDue > 0
    const canRespond = !isInvoice && status === 'sent'

    return (
      <div className="space-y-4">
        {/* Back button - hidden in print */}
        {backLink && (
          <div className="print:hidden">
            <Link href={backLink}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel || 'Back'}
              </Button>
            </Link>
          </div>
        )}

        {/* Document container */}
        <div
          ref={ref}
          className="bg-white border rounded-lg shadow-sm overflow-hidden print:shadow-none print:border-0"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 border-b bg-gray-50/50 print:bg-white">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              {/* Company info */}
              <div className="flex items-start gap-4">
                {company.logo ? (
                  <Image
                    src={company.logo}
                    alt={company.name}
                    width={64}
                    height={64}
                    className="rounded-lg object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">
                      {company.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
                  {company.phone && (
                    <p className="text-sm text-gray-600">{company.phone}</p>
                  )}
                  {company.email && (
                    <p className="text-sm text-gray-600">{company.email}</p>
                  )}
                  {company.address && (
                    <p className="text-sm text-gray-600">{company.address}</p>
                  )}
                  {company.licenseNumber && (
                    <p className="text-xs text-gray-500 mt-1">
                      License: {company.licenseNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* Document title and status */}
              <div className="text-left sm:text-right">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide">
                  {isInvoice ? 'Invoice' : 'Estimate'}
                </h2>
                <p className="text-lg font-mono text-gray-700 mt-1">{documentNumber}</p>
                <Badge
                  variant="outline"
                  className={`mt-2 ${statusInfo.color}`}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusInfo.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Dates and customer info */}
          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b">
            {/* Bill To */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {isInvoice ? 'Bill To' : 'Prepared For'}
              </h3>
              <p className="font-semibold text-gray-900">{customer.name}</p>
              {customer.email && (
                <p className="text-sm text-gray-600">{customer.email}</p>
              )}
              {customer.phone && (
                <p className="text-sm text-gray-600">{customer.phone}</p>
              )}
              {customer.address && (
                <p className="text-sm text-gray-600 whitespace-pre-line">{customer.address}</p>
              )}
            </div>

            {/* Dates */}
            <div className="sm:text-right">
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Issue Date
                  </span>
                  <p className="font-medium text-gray-900">{formatDate(issueDate)}</p>
                </div>
                {isInvoice && dueDate && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due Date
                    </span>
                    <p className="font-medium text-gray-900">{formatDate(dueDate)}</p>
                  </div>
                )}
                {!isInvoice && expiryDate && (
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Valid Until
                    </span>
                    <p className="font-medium text-gray-900">{formatDate(expiryDate)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line items table */}
          <div className="p-6 sm:p-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Description
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">
                      Qty
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                      Unit Price
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, index) => {
                    const lineTotal = item.total ?? item.quantity * item.unitPrice
                    return (
                      <tr key={index} className={index % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="py-4 px-2 text-gray-900">{item.description}</td>
                        <td className="py-4 px-2 text-right text-gray-700">{item.quantity}</td>
                        <td className="py-4 px-2 text-right text-gray-700">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-4 px-2 text-right font-medium text-gray-900">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6 flex justify-end">
              <div className="w-full sm:w-72 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{formatCurrency(totals.subtotal)}</span>
                </div>
                
                {totals.taxRate !== undefined && totals.taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax ({totals.taxRate}%)</span>
                    <span className="text-gray-900">
                      {formatCurrency(totals.taxAmount || 0)}
                    </span>
                  </div>
                )}
                
                {totals.discount !== undefined && totals.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(totals.discount)}</span>
                  </div>
                )}
                
                <Separator />
                
                <div className="flex justify-between font-semibold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{formatCurrency(totals.total)}</span>
                </div>
                
                {isInvoice && totals.amountPaid !== undefined && totals.amountPaid > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Amount Paid</span>
                    <span>-{formatCurrency(totals.amountPaid)}</span>
                  </div>
                )}
                
                {isInvoice && totals.balanceDue !== undefined && (
                  <div className="flex justify-between text-lg font-bold pt-2 border-t-2 border-gray-900">
                    <span className="text-gray-900">Balance Due</span>
                    <span className="text-gray-900">{formatCurrency(totals.balanceDue)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes and terms */}
          {(notes || terms || paymentInstructions) && (
            <div className="p-6 sm:p-8 border-t bg-gray-50/30 space-y-4 print:bg-white">
              {notes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Notes
                  </h3>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                </div>
              )}
              
              {paymentInstructions && isInvoice && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Payment Instructions
                  </h3>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{paymentInstructions}</p>
                </div>
              )}
              
              {terms && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {isInvoice ? 'Terms & Conditions' : 'Terms'}
                  </h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{terms}</p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons - hidden in print */}
          <div className="p-6 sm:p-8 border-t bg-white print:hidden">
            {/* Invoice actions */}
            {isInvoice && (
              <div className="space-y-4">
                {canPay && onPayNow && (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={onPayNow}
                    disabled={isActionLoading}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay {formatCurrency(totals.balanceDue || 0)} Now
                  </Button>
                )}
                
                {isPaid && (
                  <div className="text-center py-4 bg-emerald-50 rounded-lg">
                    <CheckCircle className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                    <p className="font-semibold text-emerald-800">Payment Complete</p>
                    <p className="text-sm text-emerald-600">Thank you for your payment!</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  {onPrint && (
                    <Button variant="outline" className="flex-1" onClick={onPrint}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  )}
                  {onDownload && (
                    <Button variant="outline" className="flex-1" onClick={onDownload}>
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
                        className="flex-1"
                        onClick={onAccept}
                        disabled={isActionLoading}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Accept Estimate
                      </Button>
                    )}
                    {onDecline && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1"
                        onClick={onDecline}
                        disabled={isActionLoading}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    )}
                  </div>
                )}
                
                {isAccepted && (
                  <div className="text-center py-4 bg-emerald-50 rounded-lg">
                    <CheckCircle className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                    <p className="font-semibold text-emerald-800">Estimate Accepted</p>
                    <p className="text-sm text-emerald-600">We&apos;ll be in touch to schedule your service!</p>
                  </div>
                )}
                
                {isDeclined && (
                  <div className="text-center py-4 bg-gray-50 rounded-lg">
                    <XCircle className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="font-medium text-gray-600">Estimate Declined</p>
                  </div>
                )}
                
                <div className="flex gap-3">
                  {onPrint && (
                    <Button variant="outline" className="flex-1" onClick={onPrint}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                  )}
                  {onDownload && (
                    <Button variant="outline" className="flex-1" onClick={onDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Secure payment note for portal */}
            {portalMode && canPay && (
              <p className="text-xs text-center text-gray-500 mt-4">
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
