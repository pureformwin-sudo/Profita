'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, FileText, Loader2 } from 'lucide-react'
import { createInvoicePaymentSession, handlePaymentSuccess } from '@/app/actions/stripe'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils-finance'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface InvoiceData {
  id: string
  invoiceNumber: string
  customerName: string
  total: number
  amountPaid: number
  status: string
  dueDate: string
  items: { description: string; quantity: number; unitPrice: number }[]
  businessName?: string
}

export default function PayInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.invoiceId as string
  
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
        .select('*, customers(name)')
        .eq('id', invoiceId)
        .single()

      if (error || !data) {
        setError('Invoice not found')
        setIsLoading(false)
        return
      }

      // Get business profile for the invoice owner
      const { data: settings } = await supabase
        .from('settings')
        .select('profile')
        .eq('user_id', data.user_id)
        .single()

      setInvoice({
        id: data.id,
        invoiceNumber: data.invoice_number,
        customerName: data.customers?.name || 'Customer',
        total: parseFloat(data.total),
        amountPaid: parseFloat(data.amount_paid),
        status: data.status,
        dueDate: data.due_date,
        items: data.items || [],
        businessName: settings?.profile?.businessName || 'PROFITA',
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
      const clientSecret = await createInvoicePaymentSession(invoiceId)
      if (!clientSecret) {
        throw new Error('Failed to create checkout session')
      }
      return clientSecret
    },
    [invoiceId]
  )

  const handleCheckoutComplete = async () => {
    // Poll for payment completion
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

    // Check every 2 seconds for 30 seconds
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      await checkPayment()
      if (attempts >= 15 || paymentComplete) {
        clearInterval(interval)
      }
    }, 2000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Invoice Not Found</h2>
            <p className="text-muted-foreground">This invoice may have been deleted or the link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Payment Complete!</h2>
            <p className="text-muted-foreground mb-4">
              Thank you for your payment of ${invoice.total.toFixed(2)} for invoice {invoice.invoiceNumber}.
            </p>
            <p className="text-sm text-muted-foreground">
              A receipt has been sent to your email.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const amountDue = invoice.total - invoice.amountPaid

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Image
              src="/logo.png"
              alt="Logo"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="text-xl font-semibold">{invoice.businessName}</span>
          </div>
          <p className="text-muted-foreground">Invoice Payment</p>
        </div>

        {showCheckout ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Complete Payment</span>
                <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)}>
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoice {invoice.invoiceNumber}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Due: {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <Badge variant={invoice.status === 'Overdue' ? 'destructive' : 'secondary'}>
                  {invoice.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Bill To */}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Bill To</p>
                <p className="font-medium">{invoice.customerName}</p>
              </div>

              {/* Line Items */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">Description</th>
                      <th className="text-right p-3 w-16">Qty</th>
                      <th className="text-right p-3 w-24">Price</th>
                      <th className="text-right p-3 w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right">{item.quantity}</td>
                        <td className="p-3 text-right">${item.unitPrice.toFixed(2)}</td>
                        <td className="p-3 text-right">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="space-y-2 text-right">
                <div className="flex justify-between text-sm">
                  <span>Total</span>
                  <span>${invoice.total.toFixed(2)}</span>
                </div>
                {invoice.amountPaid > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Paid</span>
                    <span>-${invoice.amountPaid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Amount Due</span>
                  <span>${amountDue.toFixed(2)}</span>
                </div>
              </div>

              {/* Pay Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={() => setShowCheckout(true)}
              >
                Pay ${amountDue.toFixed(2)} Now
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Secure payment powered by Stripe
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
