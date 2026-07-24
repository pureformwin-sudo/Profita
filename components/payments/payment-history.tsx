"use client"

import { useEffect, useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Smartphone, Banknote, Check, Link2, Loader2 } from "lucide-react"
import { getPaymentsForInvoice, getPaymentsForCustomer } from "@/lib/payments-storage"
import { paymentTypeLabel } from "@/lib/payment-providers"
import type { Payment } from "@/lib/payments-types"

interface PaymentHistoryProps {
  invoiceId?: string
  customerId?: string
  /** Bump this to force a refresh after recording a payment. */
  refreshKey?: number
  emptyLabel?: string
}

const PROVIDER_ICON = {
  jim: Smartphone,
  cash: Banknote,
  check: Check,
  other: Link2,
  stripe: Link2,
} as const

export function PaymentHistory({ invoiceId, customerId, refreshKey = 0, emptyLabel = "No payments yet" }: PaymentHistoryProps) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = invoiceId
        ? await getPaymentsForInvoice(invoiceId)
        : customerId
          ? await getPaymentsForCustomer(customerId)
          : []
      setPayments(data)
    } catch (e) {
      console.error("[v0] PaymentHistory load failed:", e)
    } finally {
      setLoading(false)
    }
  }, [invoiceId, customerId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (payments.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2">
      {payments.map((p) => {
        const Icon = PROVIDER_ICON[p.provider] || Link2
        const typeLabel = paymentTypeLabel(p.paymentType)
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">${p.amount.toFixed(2)}</span>
                {p.provider === "jim" && <Badge variant="secondary" className="text-[10px]">JIM</Badge>}
                {p.status !== "completed" && (
                  <Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(p.paymentDate).toLocaleDateString()}
                {typeLabel ? ` · ${typeLabel}` : ""}
                {p.processingFee > 0 ? ` · fee $${p.processingFee.toFixed(2)}` : ""}
                {p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
              </p>
            </div>
            {p.processingFee > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">net</p>
                <p className="text-sm font-medium tabular-nums">${p.netAmount.toFixed(2)}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
