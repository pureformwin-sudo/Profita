'use client'

import { forwardRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle, 
  XCircle, 
  Printer,
  Download,
  CreditCard,
  ArrowLeft,
  Mail,
  Phone,
  MapPin
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
  serviceAddress?: string | null
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

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', label: 'Draft' },
  sent: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Pending' },
  viewed: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Viewed' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Pending' },
  Pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Pending' },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Accepted' },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Paid' },
  Paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Paid' },
  declined: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Declined' },
  expired: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', label: 'Expired' },
  overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Overdue' },
  Overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Overdue' },
  partial: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Partial' },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
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
      serviceAddress,
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
      <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
        {/* Back button - outside document */}
        {backLink && (
          <div className="max-w-4xl mx-auto px-4 pt-6 print:hidden">
            <Link href={backLink}>
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel || 'Back'}
              </Button>
            </Link>
          </div>
        )}

        {/* Document Container */}
        <div className="max-w-4xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
          <div
            ref={ref}
            className="bg-white rounded-lg shadow-xl overflow-hidden print:shadow-none print:rounded-none"
          >
            {/* Premium Header with accent bar */}
            <div className="bg-slate-900 h-2 print:bg-slate-900" />
            
            {/* Header Content */}
            <div className="px-8 sm:px-12 pt-10 pb-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
                {/* Company Block */}
                <div className="flex items-start gap-5">
                  {company.logo ? (
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <Image
                        src={company.logo}
                        alt={company.name}
                        fill
                        className="object-contain rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-2xl font-bold text-white">
                        {company.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">{company.name}</h1>
                    <div className="mt-2 space-y-1">
                      {company.phone && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {company.phone}
                        </p>
                      )}
                      {company.email && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          {company.email}
                        </p>
                      )}
                      {company.address && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {company.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Document Title Block */}
                <div className="lg:text-right">
                  <div className="inline-block">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">
                      {isInvoice ? 'Invoice' : 'Estimate'}
                    </h2>
                    <p className="text-lg font-semibold text-slate-500 mt-1">{documentNumber}</p>
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold mt-3 border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                      {statusInfo.label}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To / Dates Section */}
            <div className="px-8 sm:px-12 py-8 bg-slate-50 border-y border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Bill To */}
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        {isInvoice ? 'Bill To' : 'Prepared For'}
                      </h3>
                      <p className="text-lg font-semibold text-slate-900">{customer.name}</p>
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        {customer.email && <p>{customer.email}</p>}
                        {customer.phone && <p>{customer.phone}</p>}
                        {customer.address && <p className="whitespace-pre-line">{customer.address}</p>}
                      </div>
                    </div>
                    
                    {serviceAddress && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                          Service Address
                        </h3>
                        <p className="text-sm text-slate-600 whitespace-pre-line">{serviceAddress}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div className="md:text-right space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Issue Date
                    </h3>
                    <p className="text-base font-semibold text-slate-900">{formatDate(issueDate)}</p>
                  </div>
                  {isInvoice && dueDate && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Due Date
                      </h3>
                      <p className={`text-base font-semibold ${
                        status === 'overdue' || status === 'Overdue' 
                          ? 'text-red-600' 
                          : 'text-slate-900'
                      }`}>
                        {formatDate(dueDate)}
                      </p>
                    </div>
                  )}
                  {!isInvoice && expiryDate && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Valid Until
                      </h3>
                      <p className="text-base font-semibold text-slate-900">{formatDate(expiryDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="px-8 sm:px-12 py-8">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-center py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-20">
                        Qty
                      </th>
                      <th className="text-right py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">
                        Rate
                      </th>
                      <th className="text-right py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, index) => {
                      const lineTotal = item.total ?? item.quantity * item.unitPrice
                      return (
                        <tr key={index} className="group">
                          <td className="py-5 pr-4">
                            <p className="text-sm text-slate-900 font-medium">{item.description}</p>
                          </td>
                          <td className="py-5 text-sm text-slate-600 text-center">{item.quantity}</td>
                          <td className="py-5 text-sm text-slate-600 text-right">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-5 text-sm font-semibold text-slate-900 text-right">
                            {formatCurrency(lineTotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals Section - Right Aligned */}
              <div className="mt-8 flex justify-end">
                <div className="w-full max-w-xs">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="text-slate-900 font-medium">{formatCurrency(totals.subtotal)}</span>
                    </div>
                    
                    {totals.taxRate !== undefined && totals.taxRate > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Tax ({totals.taxRate}%)</span>
                        <span className="text-slate-900">{formatCurrency(totals.taxAmount || 0)}</span>
                      </div>
                    )}
                    
                    {totals.discount !== undefined && totals.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-600">Discount</span>
                        <span className="text-emerald-600">-{formatCurrency(totals.discount)}</span>
                      </div>
                    )}
                    
                    <div className="border-t border-slate-200 pt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-900 font-semibold">Total</span>
                        <span className="text-2xl font-bold text-slate-900">{formatCurrency(totals.total)}</span>
                      </div>
                    </div>
                    
                    {isInvoice && totals.amountPaid !== undefined && totals.amountPaid > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-600">Amount Paid</span>
                        <span className="text-emerald-600">-{formatCurrency(totals.amountPaid)}</span>
                      </div>
                    )}
                    
                    {isInvoice && totals.balanceDue !== undefined && (
                      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg px-5 py-4 mt-4 shadow-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Balance Due</span>
                          <span className="text-2xl font-bold">{formatCurrency(totals.balanceDue)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            {(notes || terms || paymentInstructions) && (
              <div className="px-8 sm:px-12 py-8 bg-slate-50 border-t border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {notes && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Notes
                        </h3>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{notes}</p>
                      </div>
                    )}
                    
                    {paymentInstructions && isInvoice && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Payment Instructions
                        </h3>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{paymentInstructions}</p>
                      </div>
                    )}
                  </div>
                  
                  {terms && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Terms & Conditions
                      </h3>
                      <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{terms}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="px-8 sm:px-12 py-8 border-t border-slate-200 print:hidden">
              {/* Invoice Actions */}
              {isInvoice && (
                <div className="space-y-5">
                  {canPay && onPayNow && (
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white h-14 text-lg font-semibold shadow-lg shadow-emerald-200 transition-all hover:shadow-xl hover:shadow-emerald-200"
                      onClick={onPayNow}
                      disabled={isActionLoading}
                    >
                      <CreditCard className="h-5 w-5 mr-3" />
                      Pay {formatCurrency(totals.balanceDue || 0)} Now
                    </Button>
                  )}
                  
                  {isPaid && (
                    <div className="text-center py-8 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="h-8 w-8 text-emerald-600" />
                      </div>
                      <p className="font-bold text-emerald-900 text-xl">Payment Complete</p>
                      <p className="text-sm text-emerald-700 mt-2">Thank you for your payment!</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    {onPrint && (
                      <Button 
                        variant="outline" 
                        className="flex-1 h-12 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium" 
                        onClick={onPrint}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </Button>
                    )}
                    {onDownload && (
                      <Button 
                        variant="outline" 
                        className="flex-1 h-12 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium" 
                        onClick={onDownload}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Estimate Actions */}
              {!isInvoice && (
                <div className="space-y-5">
                  {canRespond && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      {onAccept && (
                        <Button
                          size="lg"
                          className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white h-14 text-lg font-semibold shadow-lg shadow-emerald-200"
                          onClick={onAccept}
                          disabled={isActionLoading}
                        >
                          <CheckCircle className="h-5 w-5 mr-3" />
                          Accept Estimate
                        </Button>
                      )}
                      {onDecline && (
                        <Button
                          size="lg"
                          variant="outline"
                          className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100 h-14 text-lg font-medium"
                          onClick={onDecline}
                          disabled={isActionLoading}
                        >
                          <XCircle className="h-5 w-5 mr-3" />
                          Decline
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {isAccepted && (
                    <div className="text-center py-8 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="h-8 w-8 text-emerald-600" />
                      </div>
                      <p className="font-bold text-emerald-900 text-xl">Estimate Accepted</p>
                      <p className="text-sm text-emerald-700 mt-2">We&apos;ll be in touch to schedule your service!</p>
                    </div>
                  )}
                  
                  {isDeclined && (
                    <div className="text-center py-8 bg-slate-100 rounded-xl">
                      <div className="w-16 h-16 mx-auto bg-slate-200 rounded-full flex items-center justify-center mb-4">
                        <XCircle className="h-8 w-8 text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-600 text-xl">Estimate Declined</p>
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    {onPrint && (
                      <Button 
                        variant="outline" 
                        className="flex-1 h-12 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium" 
                        onClick={onPrint}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </Button>
                    )}
                    {onDownload && (
                      <Button 
                        variant="outline" 
                        className="flex-1 h-12 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium" 
                        onClick={onDownload}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {portalMode && canPay && (
                <p className="text-xs text-center text-slate-400 mt-6">
                  Secure payment powered by Stripe
                </p>
              )}
            </div>

            {/* Footer Bar */}
            <div className="bg-slate-900 h-1" />
          </div>
        </div>
      </div>
    )
  }
)

export default ProfessionalDocument
