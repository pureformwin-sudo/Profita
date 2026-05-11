'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePortal } from '../../layout'
import { 
  getPortalEstimate, 
  acceptEstimate, 
  declineEstimate,
  type PortalEstimate 
} from '@/lib/portal-storage'
import { toast } from 'sonner'

function PortalEstimateDetailContent() {
  const params = useParams()
  const router = useRouter()
  const { customer, token } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token
  const estimateId = params.id as string

  const [loading, setLoading] = useState(true)
  const [estimate, setEstimate] = useState<PortalEstimate | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [showDeclineReason, setShowDeclineReason] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      const data = await getPortalEstimate(estimateId, customer.id)
      setEstimate(data)
      setLoading(false)
    }
    loadData()
  }, [customer, estimateId])

  const handleAccept = async () => {
    if (!customer || !estimate) return
    setBusy('accept')
    const result = await acceptEstimate(estimate.id, customer.id)
    setBusy(null)

    if (result.success) {
      toast.success('Estimate accepted! We will be in touch soon.')
      setEstimate({ ...estimate, status: 'accepted' })
    } else {
      toast.error(result.error || 'Failed to accept estimate')
    }
  }

  const handleDecline = async () => {
    if (!customer || !estimate) return
    setBusy('decline')
    const result = await declineEstimate(estimate.id, customer.id, declineReason)
    setBusy(null)

    if (result.success) {
      toast.success('Estimate declined.')
      setEstimate({ ...estimate, status: 'declined' })
      setShowDeclineReason(false)
    } else {
      toast.error(result.error || 'Failed to decline estimate')
    }
  }

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

  if (!estimate) {
    return (
      <div className="space-y-6">
        <Link href={`/portal/estimates?token=${tokenParam}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Estimates
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Estimate Not Found</h2>
            <p className="text-muted-foreground">
              This estimate may have been removed or you don&apos;t have access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canRespond = estimate.status === 'sent'
  const statusColors: Record<string, string> = {
    sent: 'text-amber-600 border-amber-200 bg-amber-50',
    accepted: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    declined: 'text-red-600 border-red-200 bg-red-50',
  }

  return (
    <div className="space-y-6">
      <Link href={`/portal/estimates?token=${tokenParam}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Estimates
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{estimate.estimateNumber}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Issued {new Date(estimate.issueDate).toLocaleDateString()}
                {estimate.expiryDate && (
                  <> &middot; Expires {new Date(estimate.expiryDate).toLocaleDateString()}</>
                )}
              </p>
            </div>
            <Badge variant="outline" className={statusColors[estimate.status] || ''}>
              {estimate.status === 'sent' && <Clock className="h-3 w-3 mr-1" />}
              {estimate.status === 'accepted' && <CheckCircle className="h-3 w-3 mr-1" />}
              {estimate.status === 'declined' && <XCircle className="h-3 w-3 mr-1" />}
              {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
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
                {estimate.items.map((item, i) => (
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

          {/* Total */}
          <div className="flex justify-end">
            <div className="text-right">
              <div className="flex justify-between gap-8 text-lg font-bold">
                <span>Total</span>
                <span>${estimate.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {canRespond && !showDeclineReason && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleAccept}
                disabled={busy !== null}
              >
                {busy === 'accept' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle className="h-4 w-4 mr-2" />
                Accept Estimate
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeclineReason(true)}
                disabled={busy !== null}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </div>
          )}

          {/* Decline reason form */}
          {showDeclineReason && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Reason for declining (optional)
                </label>
                <Textarea
                  placeholder="Let us know why this estimate doesn't work for you..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  disabled={busy !== null}
                >
                  {busy === 'decline' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Decline
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeclineReason(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Already responded */}
          {!canRespond && (
            <div className="text-center py-4 border-t">
              {estimate.status === 'accepted' && (
                <p className="text-emerald-600">
                  <CheckCircle className="h-5 w-5 inline mr-2" />
                  You accepted this estimate. We&apos;ll be in touch!
                </p>
              )}
              {estimate.status === 'declined' && (
                <p className="text-muted-foreground">
                  <XCircle className="h-5 w-5 inline mr-2" />
                  This estimate was declined.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function PortalEstimateDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PortalEstimateDetailContent />
    </Suspense>
  )
}
