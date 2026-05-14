'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  CheckCircle, 
  FileText, 
  Loader2, 
  ArrowLeft,
  Printer,
  CreditCard,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  MapPin
} from 'lucide-react'
import { createInvoicePaymentSession } from '@/app/actions/stripe'
import { createClient } from '@/lib/supabase/client'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface InvoiceData {
  id: string
  invoiceNumber: string
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  total: number
  amountPaid: number
  status: string
  issueDate: string
  dueDate: string
  items: { description: string; quantity: number; unitPrice: number }[]
  notes?: string
  terms?: string
  company: {
    name: string
    logo?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
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

export default function PayInvoicePage() {
  const params = useParams()
  const invoiceId = params.invoiceId as string
  const documentRef = useRef<HTMLDivElement>(null)
  
  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadInvoice() {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(name, email, phone, address), companies(name, logo_url, email, phone, address)')
        .eq('id', invoiceId)
        .single()

      if (error || !data) {
        setError('Invoice not found')
        setIsLoading(false)
        return
      }

      setInvoice({
        id: data.id,
        invoiceNumber: data.invoice_number,
        customerName: data.customers?.name || 'Customer',
        customerEmail: data.customers?.email,
        customerPhone: data.customers?.phone,
        customerAddress: data.customers?.address,
        total: parseFloat(data.total),
        amountPaid: parseFloat(data.amount_paid || 0),
        status: data.status,
        issueDate: data.issue_date,
        dueDate: data.due_date,
        items: data.items || [],
        notes: data.notes,
        terms: data.terms,
        company: {
          name: data.companies?.name || 'Company',
          logo: data.companies?.logo_url,
          email: data.companies?.email,
          phone: data.companies?.phone,
          address: data.companies?.address,
        },
      })
      
      if (data.status === 'Paid') {
        setPaymentComplete(true)
      }
      
      setIsLoading(false)
    }

    loadInvoice()
  }, [invoiceId])

  const startCheckout = useCallback(
    async () => {
      try {
        const clientSecret = await createInvoicePaymentSession(invoiceId)
        if (!clientSecret) {
          throw new Error('Failed to create checkout session')
        }
        return clientSecret
      } catch (err) {
        const error = err as Error
        console.error('[v0] Checkout error:', error.message)
        setError(error.message || 'Unable to start payment. Please try again.')
        setShowCheckout(false)
        throw error
      }
    },
    [invoiceId]
  )

  const handleCheckoutComplete = async () => {
    const checkPayment = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('invoices')
          .select('status')
          .eq('id', invoiceId)
          .single()

        if (data?.status === 'Paid') {
          setPaymentComplete(true)
          setShowCheckout(false)
        }
      } catch (e) {
        console.error('Error checking payment:', e)
      }
    }

    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      await checkPayment()
      if (attempts >= 15 || paymentComplete) {
        clearInterval(interval)
      }
    }, 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              {error === 'Invoice not found' ? 'Invoice Not Found' : 'Payment Error'}
            </h2>
            <p className="text-slate-600">
              {error || 'This invoice may have been deleted or the link is invalid.'}
            </p>
            {error && error !== 'Invoice not found' && (
              <Button 
                variant="outline" 
                className="mt-6"
                onClick={() => {
                  setError(null)
                  setShowCheckout(false)
                }}
              >
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-lg w-full shadow-xl">
          <CardContent className="p-10 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Complete!</h2>
            <p className="text-slate-600 mb-8">
              Thank you for your payment of {formatCurrency(invoice.total - invoice.amountPaid)} for invoice {invoice.invoiceNumber}.
            </p>
            <div className="bg-slate-50 rounded-xl p-5 text-sm text-left space-y-3 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice</span>
                <span className="font-semibold text-slate-900">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-900">{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Paid
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6">
              A receipt has been sent to your email.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const amountDue = invoice.total - invoice.amountPaid
  const isOverdue = invoice.status === 'Overdue'

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
      <div className="max-w-4xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
        {showCheckout ? (
          <Card className="print:hidden shadow-xl">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <span>Complete Payment</span>
                <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Invoice
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ 
                  fetchClientSecret: startCheckout,
                  onComplete: handleCheckoutComplete,
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </CardContent>
          </Card>
        ) : (
          <div
            ref={documentRef}
            className="bg-white rounded-lg shadow-xl overflow-hidden print:shadow-none print:rounded-none"
          >
            {/* Premium Header Bar */}
            <div className="bg-slate-900 h-2 print:bg-slate-900" />
            
            {/* Header Content */}
            <div className="px-8 sm:px-12 pt-10 pb-8">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
                {/* Company Block */}
                <div className="flex items-start gap-5">
                  {invoice.company.logo ? (
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <Image
                        src={invoice.company.logo}
                        alt={invoice.company.name}
                        fill
                        className="object-contain rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-2xl font-bold text-white">
                        {invoice.company.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">{invoice.company.name}</h1>
                    <div className="mt-2 space-y-1">
                      {invoice.company.phone && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {invoice.company.phone}
                        </p>
                      )}
                      {invoice.company.email && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          {invoice.company.email}
                        </p>
                      )}
                      {invoice.company.address && (
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {invoice.company.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Document Title Block */}
                <div className="lg:text-right">
                  <div className="inline-block">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">
                      Invoice
                    </h2>
                    <p className="text-lg font-semibold text-slate-500 mt-1">{invoice.invoiceNumber}</p>
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold mt-3 border ${
                      isOverdue 
                        ? 'bg-red-50 text-red-700 border-red-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {isOverdue ? (
                        <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {invoice.status}
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
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Bill To
                  </h3>
                  <p className="text-lg font-semibold text-slate-900">{invoice.customerName}</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {invoice.customerEmail && <p>{invoice.customerEmail}</p>}
                    {invoice.customerPhone && <p>{invoice.customerPhone}</p>}
                    {invoice.customerAddress && <p className="whitespace-pre-line">{invoice.customerAddress}</p>}
                  </div>
                </div>

                {/* Dates */}
                <div className="md:text-right space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Issue Date
                    </h3>
                    <p className="text-base font-semibold text-slate-900">{formatDate(invoice.issueDate)}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Due Date
                    </h3>
                    <p className={`text-base font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
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
                    {invoice.items.map((item, index) => (
                      <tr key={index}>
                        <td className="py-5 pr-4">
                          <p className="text-sm text-slate-900 font-medium">{item.description}</p>
                        </td>
                        <td className="py-5 text-sm text-slate-600 text-center">{item.quantity}</td>
                        <td className="py-5 text-sm text-slate-600 text-right">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-5 text-sm font-semibold text-slate-900 text-right">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="mt-8 flex justify-end">
                <div className="w-full max-w-xs">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="text-slate-900 font-medium">{formatCurrency(invoice.total)}</span>
                    </div>
                    
                    {invoice.amountPaid > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-600">Amount Paid</span>
                        <span className="text-emerald-600">-{formatCurrency(invoice.amountPaid)}</span>
                      </div>
                    )}
                    
                    <div className="border-t border-slate-200 pt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-900 font-semibold">Total</span>
                        <span className="text-2xl font-bold text-slate-900">{formatCurrency(invoice.total)}</span>
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg px-5 py-4 mt-4 shadow-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Balance Due</span>
                        <span className="text-2xl font-bold">{formatCurrency(amountDue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            {(invoice.notes || invoice.terms) && (
              <div className="px-8 sm:px-12 py-8 bg-slate-50 border-t border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {invoice.notes && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Notes
                      </h3>
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
                    </div>
                  )}
                  
                  {invoice.terms && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Terms & Conditions
                      </h3>
                      <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="px-8 sm:px-12 py-8 border-t border-slate-200 print:hidden">
              <div className="space-y-5">
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white h-14 text-lg font-semibold shadow-lg shadow-emerald-200 transition-all hover:shadow-xl hover:shadow-emerald-200"
                  onClick={() => setShowCheckout(true)}
                >
                  <CreditCard className="h-5 w-5 mr-3" />
                  Pay {formatCurrency(amountDue)} Now
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full h-12 border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
                </Button>
                
                <p className="text-xs text-center text-slate-400">
                  Secure payment powered by Stripe
                </p>
              </div>
            </div>

            {/* Footer Bar */}
            <div className="bg-slate-900 h-1" />
          </div>
        )}
      </div>
    </div>
  )
}
