'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Receipt, Loader2, CheckCircle, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePortal } from '../../layout'
import { getPortalInvoice, type PortalInvoice } from '@/lib/portal-storage'

export default function PortalInvoiceDetailPage() {
  const params = useParams()
  const { customer, token } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token
  const invoiceId = params.id as string

  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalInvoice(invoiceId, customer.id)
      setInvoice(data)
      setLoading(false)
    }
    loadData()
  }, [customer, invoiceId])

  if (!customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Link href={`/portal/invoices?token=${tokenParam}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Invoices
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Invoice Not Found</h2>
            <p className="text-muted-foreground">
              This invoice may have been removed or you don&apos;t have access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isPaid = invoice.status === 'Paid' || invoice.balance <= 0
  const isOverdue = invoice.status === 'Overdue'

  return (
    <div className="space-y-6">
      <Link href={`/portal/invoices?token=${tokenParam}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Invoices
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{invoice.invoiceNumber}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Issued {new Date(invoice.issueDate).toLocaleDateString()}
                {' '}&middot;{' '}
                Due {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            </div>
            <Badge 
              variant="outline" 
              className={
                isPaid 
                  ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                  : isOverdue
                  ? 'text-red-600 border-red-200 bg-red-50'
                  : 'text-amber-600 border-amber-200 bg-amber-50'
              }
            >
              {isPaid && <CheckCircle className="h-3 w-3 mr-1" />}
              {invoice.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
                    <td className="p-3 text-right">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${invoice.total.toFixed(2)}</span>
              </div>
              {invoice.amountPaid > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span>-${invoice.amountPaid.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Balance Due</span>
                <span>${invoice.balance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pay button */}
          {!isPaid && invoice.balance > 0 && (
            <div className="pt-4 border-t">
              <Link href={`/pay/${invoice.id}`} target="_blank">
                <Button size="lg" className="w-full">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay ${invoice.balance.toFixed(2)} Now
                </Button>
              </Link>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Secure payment powered by Stripe
              </p>
            </div>
          )}

          {/* Paid confirmation */}
          {isPaid && (
            <div className="text-center py-4 border-t">
              <p className="text-emerald-600">
                <CheckCircle className="h-5 w-5 inline mr-2" />
                This invoice has been paid. Thank you!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
