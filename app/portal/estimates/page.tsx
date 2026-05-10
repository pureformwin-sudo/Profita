'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileText, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePortal } from '../layout'
import { getPortalEstimates, type PortalEstimate } from '@/lib/portal-storage'

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  sent: { color: 'text-amber-600 border-amber-200 bg-amber-50', icon: Clock },
  accepted: { color: 'text-emerald-600 border-emerald-200 bg-emerald-50', icon: CheckCircle },
  declined: { color: 'text-red-600 border-red-200 bg-red-50', icon: XCircle },
  draft: { color: 'text-gray-600 border-gray-200 bg-gray-50', icon: FileText },
  expired: { color: 'text-gray-600 border-gray-200 bg-gray-50', icon: XCircle },
}

export default function PortalEstimatesPage() {
  const { customer, token } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token

  const [loading, setLoading] = useState(true)
  const [estimates, setEstimates] = useState<PortalEstimate[]>([])

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalEstimates(customer.id)
      setEstimates(data)
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estimates</h1>
        <p className="text-muted-foreground">
          View and respond to your service estimates
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : estimates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Estimates</h2>
            <p className="text-muted-foreground">
              You don&apos;t have any estimates at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => {
            const config = statusConfig[est.status] || statusConfig.draft
            const StatusIcon = config.icon

            return (
              <Link
                key={est.id}
                href={`/portal/estimates/${est.id}?token=${tokenParam}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-muted">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{est.estimateNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Issued {new Date(est.issueDate).toLocaleDateString()}
                            {est.expiryDate && (
                              <> &middot; Expires {new Date(est.expiryDate).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">${est.total.toFixed(2)}</p>
                        <Badge variant="outline" className={config.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {est.status.charAt(0).toUpperCase() + est.status.slice(1)}
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
    </div>
  )
}
