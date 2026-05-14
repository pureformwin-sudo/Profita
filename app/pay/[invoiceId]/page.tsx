'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle, 
  FileText, 
  Loader2, 
  ArrowLeft,
  Printer,
  CreditCard,
  Clock,
  AlertCircle
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
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">
              {error === 'Invoice not found' ? 'Invoice Not Found' : 'Payment Error'}
            </h2>
            <p className="text-muted-foreground">
              {error || 'This invoice may have been deleted or the link is invalid.'}
            </p>
            {error && error !== 'Invoice not found' && (
              <Button 
                variant="outline" 
                className="mt-4"
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
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Payment Complete!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for your payment of {formatCurrency(invoice.total - invoice.amountPaid)} for invoice {invoice.invoiceNumber}.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-medium">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className="bg-emerald-100 text-emerald-700">Paid</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-6">
              A receipt has been sent to your email.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const amountDue = invoice.total - invoice.amountPaid
  const isOverdue = invoice.status === 'Overdue'
  const StatusIcon = isOverdue ? AlertCircle : Clock

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-8 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto">
        {showCheckout ? (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Complete Payment</span>
                <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Invoice
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
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
            className="bg-white border rounded-lg shadow-sm overflow-hidden print:shadow-none print:border-0"
          >
            {/* Header */}
            <div className="p-6 sm:p-8 border-b bg-gray-50/50 print:bg-white">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                {/* Company info */}
                <div className="flex items-start gap-4">
                  {invoice.company.logo ? (
                    <Image
                      src={invoice.company.logo}
                      alt={invoice.company.name}
                      width={64}
                      height={64}
                      className="rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                      <span className="text-2xl font-bold text-primary">
                        {invoice.company.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{invoice.company.name}</h1>
                    {invoice.company.phone && (
                      <p className="text-sm text-gray-600">{invoice.company.phone}</p>
                    )}
                    {invoice.company.email && (
                      <p className="text-sm text-gray-600">{invoice.company.email}</p>
                    )}
                    {invoice.company.address && (
                      <p className="text-sm text-gray-600">{invoice.company.address}</p>
                    )}
                  </div>
                </div>

                {/* Invoice title and status */}
                <div className="text-left sm:text-right">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-wide">
                    Invoice
                  </h2>
                  <p className="text-lg font-mono text-gray-700 mt-1">{invoice.invoiceNumber}</p>
                  <Badge
                    variant="outline"
                    className={`mt-2 ${
                      isOverdue 
                        ? 'bg-red-50 text-red-700 border-red-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {invoice.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Dates and customer info */}
            <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b">
              {/* Bill To */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Bill To
                </h3>
                <p className="font-semibold text-gray-900">{invoice.customerName}</p>
                {invoice.customerEmail && (
                  <p className="text-sm text-gray-600">{invoice.customerEmail}</p>
                )}
                {invoice.customerPhone && (
                  <p className="text-sm text-gray-600">{invoice.customerPhone}</p>
                )}
                {invoice.customerAddress && (
                  <p className="text-sm text-gray-600">{invoice.customerAddress}</p>
                )}
              </div>

              {/* Dates */}
              <div className="sm:text-right">
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Issue Date
                    </span>
                    <p className="font-medium text-gray-900">{formatDate(invoice.issueDate)}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due Date
                    </span>
                    <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Line items */}
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
                    {invoice.items.map((item, index) => (
                      <tr key={index} className={index % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="py-4 px-2 text-gray-900">{item.description}</td>
                        <td className="py-4 px-2 text-right text-gray-700">{item.quantity}</td>
                        <td className="py-4 px-2 text-right text-gray-700">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-4 px-2 text-right font-medium text-gray-900">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="w-full sm:w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">{formatCurrency(invoice.total)}</span>
                  </div>
                  
                  {invoice.amountPaid > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Amount Paid</span>
                      <span>-{formatCurrency(invoice.amountPaid)}</span>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="flex justify-between text-lg font-bold pt-2 border-t-2 border-gray-900">
                    <span className="text-gray-900">Balance Due</span>
                    <span className="text-gray-900">{formatCurrency(amountDue)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {(invoice.notes || invoice.terms) && (
              <div className="p-6 sm:p-8 border-t bg-gray-50/30 space-y-4 print:bg-white">
                {invoice.notes && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Notes
                    </h3>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Terms & Conditions
                    </h3>
                    <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.terms}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="p-6 sm:p-8 border-t bg-white print:hidden">
              <div className="space-y-4">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setShowCheckout(true)}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay {formatCurrency(amountDue)} Now
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  Secure payment powered by Stripe
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
