'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { 
  FileText, Building2, User, Calendar, Mail, Phone, MapPin,
  Printer, ExternalLink, Send, Link2, CreditCard, CheckCircle,
  XCircle, Briefcase, Receipt, AlertCircle, Clock, Copy
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

// Line item type
interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total?: number
}

// Company info
interface CompanyInfo {
  id?: string
  name: string
  logo_url?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

// Customer info
interface CustomerInfo {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

// Base document props
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
  // Admin actions
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
  }).format(amount)
}

function getStatusStyles(status: string, type: 'invoice' | 'estimate'): string {
  const statusLower = status.toLowerCase()
  if (type === 'invoice') {
    switch (statusLower) {
      case 'paid': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  } else {
    switch (statusLower) {
      case 'accepted': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'declined': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'expired': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
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
  
  const handlePrint = () => {
    window.print()
  }
  
  const handleViewCustomerVersion = () => {
    if (isInvoice) {
      window.open(`/pay/${documentId}`, '_blank')
    } else {
      // For estimates, we'd need a portal link - for now just copy the concept
      window.open(`/pay/${documentId}`, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      {/* Admin Action Bar - Not visible in print */}
      <div className="flex flex-wrap gap-2 pb-4 border-b print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={handleViewCustomerVersion}>
          <ExternalLink className="h-4 w-4 mr-2" />
          View Customer Version
        </Button>
        {onCopyLink && (
          <Button variant="outline" size="sm" onClick={onCopyLink}>
            <Link2 className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
        )}
      </div>

      {/* Professional Document Preview */}
      <div className="bg-white dark:bg-zinc-950 rounded-lg border print:border-0 print:shadow-none">
        {/* Header */}
        <div className="p-6 border-b print:border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            {/* Company Info */}
            <div className="flex items-start gap-4">
              {company?.logo_url ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  <Image
                    src={company.logo_url}
                    alt={company.name}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-foreground">{company?.name || 'Your Company'}</h2>
                {company?.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" /> {company.phone}
                  </p>
                )}
                {company?.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {company.email}
                  </p>
                )}
                {company?.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {company.address}
                  </p>
                )}
              </div>
            </div>
            
            {/* Document Info */}
            <div className="text-left sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground">
                  {isInvoice ? 'Invoice' : 'Estimate'}
                </h1>
                <Badge className={cn("text-xs", getStatusStyles(status, type))}>
                  {status}
                </Badge>
              </div>
              <p className="text-lg font-semibold text-muted-foreground mt-1">{documentNumber}</p>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-1 sm:justify-end">
                  <Calendar className="h-3 w-3" />
                  Issued: {formatDate(issueDate)}
                </p>
                {isInvoice && dueDate && (
                  <p className={cn(
                    "flex items-center gap-1 sm:justify-end",
                    statusLower === 'overdue' && "text-red-600 font-medium"
                  )}>
                    {statusLower === 'overdue' && <AlertCircle className="h-3 w-3" />}
                    Due: {formatDate(dueDate)}
                  </p>
                )}
                {!isInvoice && expiryDate && (
                  <p className="flex items-center gap-1 sm:justify-end">
                    <Clock className="h-3 w-3" />
                    Valid Until: {formatDate(expiryDate)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bill To Section */}
        <div className="p-6 border-b print:border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {isInvoice ? 'Bill To' : 'Prepared For'}
              </p>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">{customer.name}</p>
                  {customer.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3" /> {customer.email}
                    </p>
                  )}
                  {customer.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {customer.phone}
                    </p>
                  )}
                  {customer.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {customer.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Linked Records - Admin Only */}
            {(linkedEstimateNumber || linkedJobId) && (
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 print:hidden">
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Linked Records
                </p>
                <div className="space-y-1 text-sm">
                  {linkedEstimateNumber && (
                    <p className="text-blue-700 dark:text-blue-300">From Estimate: {linkedEstimateNumber}</p>
                  )}
                  {linkedJobId && (
                    <p className="text-blue-700 dark:text-blue-300">Job: {linkedJobId.slice(0, 8)}...</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <div className="p-6 border-b print:border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b print:border-gray-200">
                <th className="text-left pb-3 font-semibold text-foreground">Description</th>
                <th className="text-center pb-3 w-20 font-semibold text-foreground">Qty</th>
                <th className="text-right pb-3 w-24 font-semibold text-foreground">Price</th>
                <th className="text-right pb-3 w-24 font-semibold text-foreground">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y print:divide-gray-200">
              {items.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-muted/30 print:bg-gray-50' : ''}>
                  <td className="py-3 px-2 text-foreground">{item.description}</td>
                  <td className="py-3 px-2 text-center text-muted-foreground">{item.quantity}</td>
                  <td className="py-3 px-2 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-3 px-2 text-right font-medium text-foreground">
                    {formatCurrency(item.total || item.quantity * item.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-6 border-b print:border-gray-200">
          <div className="flex justify-end">
            <div className="w-full sm:w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">{formatCurrency(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                  <span className="text-foreground">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              {isInvoice && amountPaid > 0 && (
                <>
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Amount Paid</span>
                    <span>-{formatCurrency(amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground">
                    <span>Balance Due</span>
                    <span className={balance > 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {(notes || terms) && (
          <div className="p-6 border-b print:border-gray-200 space-y-4">
            {notes && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> 
                  {isInvoice ? 'Notes' : 'Scope of Work'}
                  <span className="text-emerald-600 text-[10px] ml-1">(Customer Visible)</span>
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{notes}</p>
              </div>
            )}
            {terms && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Terms & Conditions</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Internal Notes - Admin Only, Not Printed */}
        {internalNotes && (
          <div className="p-6 border-b bg-amber-50 dark:bg-amber-950/20 print:hidden">
            <p className="text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> 
              Internal Notes
              <span className="text-[10px] ml-1">(Not visible to customer)</span>
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">{internalNotes}</p>
          </div>
        )}

        {/* Action Footer - Admin Only */}
        <div className="p-6 bg-muted/30 print:hidden">
          <div className="flex flex-wrap gap-2 justify-end">
            {/* Invoice Actions */}
            {isInvoice && (
              <>
                {statusLower === 'draft' && onSend && (
                  <Button onClick={onSend} className="gap-2">
                    <Send className="h-4 w-4" /> Send Invoice
                  </Button>
                )}
                {(statusLower === 'sent' || statusLower === 'overdue') && (
                  <>
                    {onRecordPayment && (
                      <Button onClick={onRecordPayment} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <CreditCard className="h-4 w-4" /> Record Payment
                      </Button>
                    )}
                  </>
                )}
                {statusLower === 'paid' && (
                  <div className="text-emerald-600 font-medium flex items-center gap-2">
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
                  <Button variant="outline" onClick={onSend} className="gap-2">
                    <Send className="h-4 w-4" /> Mark as Sent
                  </Button>
                )}
                {statusLower === 'sent' && (
                  <>
                    {onMarkDeclined && (
                      <Button variant="outline" onClick={onMarkDeclined} className="gap-2 text-red-600 hover:text-red-700">
                        <XCircle className="h-4 w-4" /> Declined
                      </Button>
                    )}
                    {onMarkAccepted && (
                      <Button variant="outline" onClick={onMarkAccepted} className="gap-2 text-emerald-600 hover:text-emerald-700">
                        <CheckCircle className="h-4 w-4" /> Accepted
                      </Button>
                    )}
                  </>
                )}
                {(statusLower === 'draft' || statusLower === 'sent' || statusLower === 'accepted') && (
                  <>
                    {onConvertToJob && (
                      <Button variant="outline" onClick={onConvertToJob} className="gap-2">
                        <Briefcase className="h-4 w-4" /> Convert to Job
                      </Button>
                    )}
                    {onConvertToInvoice && (
                      <Button onClick={onConvertToInvoice} className="gap-2">
                        <Receipt className="h-4 w-4" /> Convert to Invoice
                      </Button>
                    )}
                  </>
                )}
                {statusLower === 'accepted' && (
                  <div className="text-emerald-600 font-medium flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Estimate Accepted
                  </div>
                )}
                {statusLower === 'declined' && (
                  <div className="text-red-600 font-medium flex items-center gap-2">
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
