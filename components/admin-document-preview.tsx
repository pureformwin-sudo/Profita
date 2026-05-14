'use client'

import { Button } from '@/components/ui/button'
import { 
  FileText, User,
  Printer, ExternalLink, Send, Link2, CreditCard, CheckCircle,
  XCircle, Briefcase, Receipt, AlertCircle
} from 'lucide-react'
import Image from 'next/image'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total?: number
}

interface CompanyInfo {
  id?: string
  name: string
  logo_url?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

interface CustomerInfo {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

interface AdminDocumentPreviewProps {
  type: 'invoice' | 'estimate'
  documentNumber: string
  status: string
  issueDate: string
  dueDate?: string
  expiryDate?: string
  company?: CompanyInfo | null
  customer: CustomerInfo
  items: LineItem[]
  subtotal: number
  taxRate?: number
  taxAmount?: number
  discount?: number
  total: number
  amountPaid?: number
  notes?: string | null
  internalNotes?: string | null
  terms?: string | null
  linkedEstimateNumber?: string | null
  linkedJobId?: string | null
  documentId: string
  onSend?: () => void
  onCopyLink?: () => void
  onRecordPayment?: () => void
  onMarkAccepted?: () => void
  onMarkDeclined?: () => void
  onConvertToJob?: () => void
  onConvertToInvoice?: () => void
  onClose?: () => void
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-800' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800' },
  draft: { bg: 'bg-slate-100', text: 'text-slate-700' },
  accepted: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  declined: { bg: 'bg-red-100', text: 'text-red-800' },
  expired: { bg: 'bg-orange-100', text: 'text-orange-800' },
}

function getStatusStyle(status: string): { bg: string; text: string } {
  return statusStyles[status.toLowerCase()] || statusStyles.draft
}

export function AdminDocumentPreview({
  type,
  documentNumber,
  status,
  issueDate,
  dueDate,
  expiryDate,
  company,
  customer,
  items,
  subtotal,
  taxRate = 0,
  taxAmount = 0,
  discount = 0,
  total,
  amountPaid = 0,
  notes,
  internalNotes,
  terms,
  linkedEstimateNumber,
  linkedJobId,
  documentId,
  onSend,
  onCopyLink,
  onRecordPayment,
  onMarkAccepted,
  onMarkDeclined,
  onConvertToJob,
  onConvertToInvoice,
}: AdminDocumentPreviewProps) {
  const balance = total - amountPaid
  const isInvoice = type === 'invoice'
  const statusLower = status.toLowerCase()
  const statusStyle = getStatusStyle(status)
  
  const handlePrint = () => {
    window.print()
  }
  
  const handleViewCustomerVersion = () => {
    window.open(`/pay/${documentId}`, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Admin Action Bar */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200 print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint} className="border-slate-300 text-slate-700">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={handleViewCustomerVersion} className="border-slate-300 text-slate-700">
          <ExternalLink className="h-4 w-4 mr-2" />
          View Customer Version
        </Button>
        {onCopyLink && (
          <Button variant="outline" size="sm" onClick={onCopyLink} className="border-slate-300 text-slate-700">
            <Link2 className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
        )}
      </div>

      {/* Document Preview */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-0 print:shadow-none">
        {/* Header */}
        <div className="px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Company */}
            <div className="flex items-start gap-4">
              {company?.logo_url ? (
                <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={company.logo_url}
                    alt={company.name}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-bold text-white">
                    {(company?.name || 'C').charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{company?.name || 'Your Company'}</h2>
                <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                  {company?.phone && <p>{company.phone}</p>}
                  {company?.email && <p>{company.email}</p>}
                  {company?.address && <p>{company.address}</p>}
                </div>
              </div>
            </div>
            
            {/* Document title */}
            <div className="text-left sm:text-right">
              <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">
                {isInvoice ? 'Invoice' : 'Estimate'}
              </h1>
              <p className="text-base font-medium text-slate-600 mt-1">{documentNumber}</p>
              <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mt-2 ${statusStyle.bg} ${statusStyle.text}`}>
                {status}
              </div>
            </div>
          </div>
        </div>

        {/* Customer and dates */}
        <div className="px-8 py-6 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Bill To */}
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {isInvoice ? 'Bill To' : 'Prepared For'}
              </p>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{customer.name}</p>
                  <div className="mt-0.5 space-y-0.5 text-sm text-slate-600">
                    {customer.email && <p>{customer.email}</p>}
                    {customer.phone && <p>{customer.phone}</p>}
                    {customer.address && <p className="whitespace-pre-line">{customer.address}</p>}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Dates and linked records */}
            <div className="space-y-4">
              <div className="sm:text-right space-y-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Issue Date</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(issueDate)}</p>
                </div>
                {isInvoice && dueDate && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</p>
                    <p className={`text-sm font-medium mt-0.5 ${statusLower === 'overdue' ? 'text-red-600' : 'text-slate-900'}`}>
                      {formatDate(dueDate)}
                    </p>
                  </div>
                )}
                {!isInvoice && expiryDate && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Valid Until</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(expiryDate)}</p>
                  </div>
                )}
              </div>
              
              {/* Linked records */}
              {(linkedEstimateNumber || linkedJobId) && (
                <div className="bg-blue-50 rounded-lg p-3 print:hidden">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Linked Records
                  </p>
                  <div className="space-y-0.5 text-sm text-blue-800">
                    {linkedEstimateNumber && <p>From Estimate: {linkedEstimateNumber}</p>}
                    {linkedJobId && <p>Job: {linkedJobId.slice(0, 8)}...</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-8 py-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-center py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Rate</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-4 text-sm text-slate-900">{item.description}</td>
                  <td className="py-4 text-sm text-slate-600 text-center">{item.quantity}</td>
                  <td className="py-4 text-sm text-slate-600 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-4 text-sm font-medium text-slate-900 text-right">
                    {formatCurrency(item.total || item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="text-slate-900 font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax ({taxRate}%)</span>
                  <span className="text-slate-900">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Discount</span>
                  <span className="text-emerald-600">-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-slate-900 font-semibold">Total</span>
                  <span className="text-slate-900 font-semibold text-lg">{formatCurrency(total)}</span>
                </div>
              </div>
              {isInvoice && amountPaid > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Paid</span>
                  <span className="text-emerald-600">-{formatCurrency(amountPaid)}</span>
                </div>
              )}
              {isInvoice && (
                <div className="bg-slate-900 text-white rounded-lg px-4 py-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Balance Due</span>
                    <span className="text-xl font-bold">{formatCurrency(balance)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer Notes */}
        {(notes || terms) && (
          <div className="px-8 py-6 border-t border-slate-100 space-y-4">
            {notes && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                  Customer Notes
                  <span className="text-emerald-600 text-[10px] font-normal normal-case">(Visible to customer)</span>
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{notes}</p>
              </div>
            )}
            {terms && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Terms & Conditions</p>
                <p className="text-sm text-slate-600 whitespace-pre-line">{terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Internal Notes - Admin Only */}
        {internalNotes && (
          <div className="px-8 py-5 bg-amber-50 border-t border-amber-100 print:hidden">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              Internal Notes
              <span className="text-amber-600 text-[10px] font-normal normal-case">(Not visible to customer)</span>
            </p>
            <p className="text-sm text-amber-800 whitespace-pre-line">{internalNotes}</p>
          </div>
        )}

        {/* Action Footer */}
        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 print:hidden">
          <div className="flex flex-wrap gap-2 justify-end">
            {/* Invoice Actions */}
            {isInvoice && (
              <>
                {statusLower === 'draft' && onSend && (
                  <Button onClick={onSend} className="bg-slate-900 hover:bg-slate-800">
                    <Send className="h-4 w-4 mr-2" /> Send Invoice
                  </Button>
                )}
                {(statusLower === 'sent' || statusLower === 'overdue') && onRecordPayment && (
                  <Button onClick={onRecordPayment} className="bg-emerald-600 hover:bg-emerald-700">
                    <CreditCard className="h-4 w-4 mr-2" /> Record Payment
                  </Button>
                )}
                {statusLower === 'paid' && (
                  <div className="text-emerald-700 font-semibold flex items-center gap-2 px-4">
                    <CheckCircle className="h-5 w-5" />
                    Invoice Fully Paid
                  </div>
                )}
              </>
            )}

            {/* Estimate Actions */}
            {!isInvoice && (
              <>
                {statusLower === 'draft' && onSend && (
                  <Button variant="outline" onClick={onSend} className="border-slate-300">
                    <Send className="h-4 w-4 mr-2" /> Mark as Sent
                  </Button>
                )}
                {statusLower === 'sent' && (
                  <>
                    {onMarkDeclined && (
                      <Button variant="outline" onClick={onMarkDeclined} className="border-red-200 text-red-700 hover:bg-red-50">
                        <XCircle className="h-4 w-4 mr-2" /> Declined
                      </Button>
                    )}
                    {onMarkAccepted && (
                      <Button variant="outline" onClick={onMarkAccepted} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                        <CheckCircle className="h-4 w-4 mr-2" /> Accepted
                      </Button>
                    )}
                  </>
                )}
                {(statusLower === 'draft' || statusLower === 'sent' || statusLower === 'accepted') && (
                  <>
                    {onConvertToJob && (
                      <Button variant="outline" onClick={onConvertToJob} className="border-slate-300">
                        <Briefcase className="h-4 w-4 mr-2" /> Convert to Job
                      </Button>
                    )}
                    {onConvertToInvoice && (
                      <Button onClick={onConvertToInvoice} className="bg-slate-900 hover:bg-slate-800">
                        <Receipt className="h-4 w-4 mr-2" /> Convert to Invoice
                      </Button>
                    )}
                  </>
                )}
                {statusLower === 'accepted' && (
                  <div className="text-emerald-700 font-semibold flex items-center gap-2 px-4">
                    <CheckCircle className="h-5 w-5" />
                    Estimate Accepted
                  </div>
                )}
                {statusLower === 'declined' && (
                  <div className="text-red-700 font-semibold flex items-center gap-2 px-4">
                    <XCircle className="h-5 w-5" />
                    Estimate Declined
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
