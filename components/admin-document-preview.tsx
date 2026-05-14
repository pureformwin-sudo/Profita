'use client'

import { Button } from '@/components/ui/button'
import { 
  FileText,
  Printer, ExternalLink, Send, Link2, CreditCard, CheckCircle,
  XCircle, Briefcase, Receipt, AlertCircle, Mail, Phone, MapPin
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
    month: 'short',
    day: 'numeric'
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  sent: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  draft: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  declined: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  expired: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
}

function getStatusStyle(status: string): { bg: string; text: string; border: string } {
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
    if (isInvoice) {
      window.open(`/pay/${documentId}`, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      {/* Admin Toolbar */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-slate-200 print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint} className="border-slate-300 text-slate-600 hover:bg-slate-100">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        {isInvoice && (
          <Button variant="outline" size="sm" onClick={handleViewCustomerVersion} className="border-slate-300 text-slate-600 hover:bg-slate-100">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Customer Version
          </Button>
        )}
        {onCopyLink && (
          <Button variant="outline" size="sm" onClick={onCopyLink} className="border-slate-300 text-slate-600 hover:bg-slate-100">
            <Link2 className="h-4 w-4 mr-2" />
            Copy Payment Link
          </Button>
        )}
      </div>

      {/* Document Preview Container */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border-0 print:shadow-none">
        {/* Premium Header Bar */}
        <div className="bg-slate-900 h-2" />
        
        {/* Header Content */}
        <div className="px-8 pt-8 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Company Block */}
            <div className="flex items-start gap-4">
              {company?.logo_url ? (
                <div className="relative w-14 h-14 flex-shrink-0">
                  <Image
                    src={company.logo_url}
                    alt={company.name}
                    fill
                    className="object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-bold text-white">
                    {(company?.name || 'C').charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-900">{company?.name || 'Your Company'}</h2>
                <div className="mt-2 space-y-1">
                  {company?.phone && (
                    <p className="text-sm text-slate-600 flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {company.phone}
                    </p>
                  )}
                  {company?.email && (
                    <p className="text-sm text-slate-600 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {company.email}
                    </p>
                  )}
                  {company?.address && (
                    <p className="text-sm text-slate-600 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {company.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Document Title */}
            <div className="lg:text-right">
              <h1 className="text-2xl font-extrabold text-slate-900 uppercase tracking-tight">
                {isInvoice ? 'Invoice' : 'Estimate'}
              </h1>
              <p className="text-base font-semibold text-slate-500 mt-1">{documentNumber}</p>
              <div className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold mt-2 border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                {status}
              </div>
            </div>
          </div>
        </div>

        {/* Customer and Dates Section */}
        <div className="px-8 py-6 bg-slate-50 border-y border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bill To */}
            <div className="md:col-span-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                {isInvoice ? 'Bill To' : 'Prepared For'}
              </h3>
              <p className="text-base font-semibold text-slate-900">{customer.name}</p>
              <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
                {customer.address && <p className="whitespace-pre-line">{customer.address}</p>}
              </div>
            </div>
            
            {/* Dates */}
            <div className="md:text-right space-y-3">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Issue Date</h3>
                <p className="text-sm font-semibold text-slate-900">{formatDate(issueDate)}</p>
              </div>
              {isInvoice && dueDate && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Due Date</h3>
                  <p className={`text-sm font-semibold ${statusLower === 'overdue' ? 'text-red-600' : 'text-slate-900'}`}>
                    {formatDate(dueDate)}
                  </p>
                </div>
              )}
              {!isInvoice && expiryDate && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valid Until</h3>
                  <p className="text-sm font-semibold text-slate-900">{formatDate(expiryDate)}</p>
                </div>
              )}
              
              {/* Linked records */}
              {(linkedEstimateNumber || linkedJobId) && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-left print:hidden">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Linked Records
                  </p>
                  <div className="space-y-0.5 text-xs text-blue-800">
                    {linkedEstimateNumber && <p>From Estimate: {linkedEstimateNumber}</p>}
                    {linkedJobId && <p>Job ID: {linkedJobId.slice(0, 8)}...</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="px-8 py-6">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-center py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Rate</th>
                <th className="text-right py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="py-4 pr-4 text-sm text-slate-900 font-medium">{item.description}</td>
                  <td className="py-4 text-sm text-slate-600 text-center">{item.quantity}</td>
                  <td className="py-4 text-sm text-slate-600 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-4 text-sm font-semibold text-slate-900 text-right">
                    {formatCurrency(item.total || item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-slate-900 font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax ({taxRate}%)</span>
                  <span className="text-slate-900">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Discount</span>
                  <span className="text-emerald-600">-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-900 font-semibold">Total</span>
                  <span className="text-xl font-bold text-slate-900">{formatCurrency(total)}</span>
                </div>
              </div>
              {isInvoice && amountPaid > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">Amount Paid</span>
                  <span className="text-emerald-600">-{formatCurrency(amountPaid)}</span>
                </div>
              )}
              {isInvoice && (
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg px-4 py-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Balance Due</span>
                    <span className="text-xl font-bold">{formatCurrency(balance)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer Notes */}
        {(notes || terms) && (
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notes && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    Customer Notes
                    <span className="text-[10px] font-normal text-emerald-600 normal-case">(Visible to customer)</span>
                  </h3>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{notes}</p>
                </div>
              )}
              {terms && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Terms & Conditions</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{terms}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Internal Notes - Admin Only */}
        {internalNotes && (
          <div className="px-8 py-5 bg-amber-50 border-t border-amber-200 print:hidden">
            <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              Internal Notes
              <span className="text-[10px] font-normal text-amber-600 normal-case">(Not visible to customer)</span>
            </h3>
            <p className="text-sm text-amber-800 whitespace-pre-line">{internalNotes}</p>
          </div>
        )}

        {/* Action Footer */}
        <div className="px-8 py-5 bg-white border-t border-slate-200 print:hidden">
          <div className="flex flex-wrap items-center gap-3 justify-end">
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
                  <div className="text-emerald-700 font-semibold flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
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
                  <div className="text-emerald-700 font-semibold flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                    <CheckCircle className="h-5 w-5" />
                    Estimate Accepted
                  </div>
                )}
                {statusLower === 'declined' && (
                  <div className="text-red-700 font-semibold flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg border border-red-100">
                    <XCircle className="h-5 w-5" />
                    Estimate Declined
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Footer Bar */}
        <div className="bg-slate-900 h-1" />
      </div>
    </div>
  )
}
