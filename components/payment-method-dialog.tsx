'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Banknote, CreditCard, FileCheck, Smartphone, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentMethodType = 'Cash' | 'Card' | 'Check' | 'Zelle' | 'Venmo' | 'Other'

interface PaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (paymentMethod: PaymentMethodType) => void
  invoiceNumber?: string
  amount?: number
}

const paymentMethods: { value: PaymentMethodType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'Cash', label: 'Cash', icon: <Banknote className="h-5 w-5" />, description: 'Physical cash payment' },
  { value: 'Card', label: 'Card/Stripe', icon: <CreditCard className="h-5 w-5" />, description: 'Credit/debit card' },
  { value: 'Check', label: 'Check', icon: <FileCheck className="h-5 w-5" />, description: 'Personal or business check' },
  { value: 'Zelle', label: 'Zelle', icon: <Smartphone className="h-5 w-5" />, description: 'Bank transfer via Zelle' },
  { value: 'Venmo', label: 'Venmo', icon: <Smartphone className="h-5 w-5" />, description: 'Venmo payment' },
  { value: 'Other', label: 'Other', icon: <DollarSign className="h-5 w-5" />, description: 'Other payment method' },
]

export function PaymentMethodDialog({
  open,
  onOpenChange,
  onConfirm,
  invoiceNumber,
  amount,
}: PaymentMethodDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('Cash')

  const handleConfirm = () => {
    onConfirm(selectedMethod)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
          <DialogDescription>
            {invoiceNumber && amount ? (
              <>Recording payment of <span className="font-semibold text-foreground">${amount.toLocaleString()}</span> for {invoiceNumber}</>
            ) : (
              'Select the payment method used'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">Payment Method</Label>
          <RadioGroup
            value={selectedMethod}
            onValueChange={(value) => setSelectedMethod(value as PaymentMethodType)}
            className="grid grid-cols-2 gap-2"
          >
            {paymentMethods.map((method) => (
              <Label
                key={method.value}
                htmlFor={method.value}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  selectedMethod === method.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <RadioGroupItem value={method.value} id={method.value} className="sr-only" />
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                  selectedMethod === method.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {method.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{method.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{method.description}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <DollarSign className="h-4 w-4 mr-2" />
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
