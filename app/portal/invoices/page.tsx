'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Receipt, Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePortal } from '../layout'
import { getPortalInvoices, type PortalInvoice } from '@/lib/portal-storage'

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  Paid: { color: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: CheckCircle },
  Sent: { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  sent: { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  Pending: { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  Overdue: { color: 'text-red-600 border-red-200 bg-red-50', icon: AlertCircle },
  Draft: { color: 'text-gray-600 border-gray-200 bg-gray-50', icon: Receipt },
}

function PortalInvoicesContent() {
  const { customer, token } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token

  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<PortalInvoice[]>([])

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalInvoices(customer.id)
      setInvoices(data)
      setLoading(false)
    }
    loadData()
  }, [customer])

  if (!customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid' && i.balance > 0)
  const paidInvoices = invoices.filter((i) => i.status === 'Paid' || i.balance <= 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-muted-foreground">
          View and pay your invoices
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Invoices</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any invoices at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Unpaid invoices */}
          {unpaidInvoices.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Outstanding ({unpaidInvoices.length})
              </h2>
              {unpaidInvoices.map((inv) => {
                const config = statusConfig[inv.status] || statusConfig.Sent
                const StatusIcon = config.icon

                return (
                  <Link
                    key={inv.id}
                    href={`/portal/invoices/${inv.id}?token=${tokenParam}`}
                  >
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-amber-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-amber-100">
                              <Receipt className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                              <p className="font-medium">{inv.invoiceNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                Due {new Date(inv.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold">${inv.balance.toFixed(2)}</p>
                            <Badge variant="outline" className={config.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {inv.status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Paid invoices */}
          {paidInvoices.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Paid ({paidInvoices.length})
              </h2>
              {paidInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/portal/invoices/${inv.id}?token=${tokenParam}`}
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer opacity-75">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-emerald-100">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium">{inv.invoiceNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              Paid {new Date(inv.issueDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold">${inv.total.toFixed(2)}</p>
                          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Paid
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function PortalInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PortalInvoicesContent />
    </Suspense>
  )
}
