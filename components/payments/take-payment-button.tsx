"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CreditCard } from "lucide-react"
import { TakePaymentSheet, type TakePaymentContext } from "./take-payment-sheet"

type BaseButtonProps = React.ComponentProps<typeof Button>

interface TakePaymentButtonProps extends Omit<BaseButtonProps, "onClick"> {
  context: TakePaymentContext
  label?: string
  onRecorded?: () => void
  showIcon?: boolean
}

/**
 * Drop-in "Take Payment" button + sheet. Self-contained: manages its own open
 * state so it can be placed anywhere (jobs, invoices, customer balance) without
 * threading state through the parent.
 */
export function TakePaymentButton({
  context,
  label = "Take Payment",
  onRecorded,
  showIcon = true,
  ...buttonProps
}: TakePaymentButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {showIcon && <CreditCard className="h-4 w-4" />}
        {label}
      </Button>
      <TakePaymentSheet open={open} onOpenChange={setOpen} context={context} onRecorded={onRecorded} />
    </>
  )
}
