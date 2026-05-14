'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { usePortal } from '../../layout'
import { 
  getPortalEstimate, 
  acceptEstimate, 
  declineEstimate,
  type PortalEstimate 
} from '@/lib/portal-storage'
import { ProfessionalDocument } from '@/components/professional-document'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function PortalEstimateDetailContent() {
  const params = useParams()
  const { customer, token, company } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token
  const estimateId = params.id as string
  const documentRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [estimate, setEstimate] = useState<PortalEstimate | null>(null)
  const [companyInfo, setCompanyInfo] = useState<{
    name: string
    logo?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
  } | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      
      const data = await getPortalEstimate(estimateId, customer.id)
      setEstimate(data)
      
      // Get company info
      if (company) {
        setCompanyInfo({
          name: company.name,
          logo: company.logo_url,
          phone: company.phone,
          email: company.email,
          address: company.address,
        })
      } else if (data) {
        const supabase = createClient()
        const { data: companyData } = await supabase
          .from('companies')
          .select('name, logo_url, phone, email, address')
          .eq('id', data.companyId)
          .single()
        
        if (companyData) {
          setCompanyInfo({
            name: companyData.name,
            logo: companyData.logo_url,
            phone: companyData.phone,
            email: companyData.email,
            address: companyData.address,
          })
        }
      }
      
      setLoading(false)
    }
    loadData()
  }, [customer, company, estimateId])

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
      setShowDeclineDialog(false)
    } else {
      toast.error(result.error || 'Failed to decline estimate')
    }
  }

  const handlePrint = () => {
    window.print()
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
      <Card>
        <CardContent className="py-12 text-center">
          <h2 className="text-lg font-semibold mb-2">Estimate Not Found</h2>
          <p className="text-muted-foreground">
            This estimate may have been removed or you don&apos;t have access.
          </p>
        </CardContent>
      </Card>
    )
  }

  const canRespond = estimate.status === 'sent'

  return (
    <>
      <ProfessionalDocument
        ref={documentRef}
        type="estimate"
        documentNumber={estimate.estimateNumber}
        issueDate={estimate.issueDate}
        expiryDate={estimate.expiryDate}
        status={estimate.status as 'sent' | 'accepted' | 'declined'}
        company={{
          name: companyInfo?.name || 'Company',
          logo: companyInfo?.logo,
          phone: companyInfo?.phone,
          email: companyInfo?.email,
          address: companyInfo?.address,
        }}
        customer={{
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
        }}
        items={estimate.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        }))}
        totals={{
          subtotal: estimate.total,
          total: estimate.total,
        }}
        notes={estimate.notes}
        terms={estimate.terms}
        onPrint={handlePrint}
        onAccept={canRespond ? handleAccept : undefined}
        onDecline={canRespond ? () => setShowDeclineDialog(true) : undefined}
        isActionLoading={busy !== null}
        actionLoadingType={busy || undefined}
        backLink={`/portal/estimates?token=${tokenParam}`}
        backLabel="Back to Estimates"
        portalMode
      />

      {/* Decline reason dialog */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Estimate</DialogTitle>
            <DialogDescription>
              Let us know why this estimate doesn&apos;t work for you. This helps us improve our service.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for declining (optional)..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeclineDialog(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={busy !== null}
            >
              {busy === 'decline' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
