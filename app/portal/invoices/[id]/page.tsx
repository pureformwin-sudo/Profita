'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { usePortal } from '../../layout'
import { getPortalInvoice, type PortalInvoice } from '@/lib/portal-storage'
import { ProfessionalDocument } from '@/components/professional-document'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

function PortalInvoiceDetailContent() {
  const params = useParams()
  const { customer, token, company } = usePortal()
  const searchParams = useSearchParams()
  const tokenParam = searchParams.get('token') || token
  const invoiceId = params.id as string
  const documentRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null)
  const [companyInfo, setCompanyInfo] = useState<{
    name: string
    logo?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
  } | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!customer) return
      
      const data = await getPortalInvoice(invoiceId, customer.id)
      setInvoice(data)
      
      // Try to get company info from the portal context or fetch it
      if (company) {
        setCompanyInfo({
          name: company.name,
          logo: company.logo_url,
          phone: company.phone,
          email: company.email,
          address: company.address,
        })
      } else if (data) {
        // Fetch company info from invoice
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
  }, [customer, company, invoiceId])

  const handlePrint = () => {
    window.print()
  }

  const handlePayNow = () => {
    window.open(`/pay/${invoiceId}`, '_blank')
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

  if (!invoice) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <h2 className="text-lg font-semibold mb-2">Invoice Not Found</h2>
          <p className="text-muted-foreground">
            This invoice may have been removed or you don&apos;t have access.
          </p>
        </CardContent>
      </Card>
    )
  }

  const isPaid = invoice.status === 'Paid' || invoice.balance <= 0

  return (
    <ProfessionalDocument
      ref={documentRef}
      type="invoice"
      documentNumber={invoice.invoiceNumber}
      issueDate={invoice.issueDate}
      dueDate={invoice.dueDate}
      status={isPaid ? 'Paid' : invoice.status as 'Pending' | 'Overdue'}
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
      items={invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      }))}
      totals={{
        subtotal: invoice.total,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        balanceDue: invoice.balance,
      }}
      notes={invoice.notes}
      terms={invoice.terms}
      onPrint={handlePrint}
      onPayNow={!isPaid && invoice.balance > 0 ? handlePayNow : undefined}
      backLink={`/portal/invoices?token=${tokenParam}`}
      backLabel="Back to Invoices"
      portalMode
    />
  )
}

export default function PortalInvoiceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PortalInvoiceDetailContent />
    </Suspense>
  )
}
