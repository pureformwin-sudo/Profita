"use client"

import { useState, useEffect, useMemo } from "react"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import {
  Smartphone,
  Link2,
  Banknote,
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  Mail,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react"
import { recordPayment } from "@/lib/payments-storage"
import { getSettings } from "@/lib/storage"
import { getProviderAdapter, methodForProvider } from "@/lib/payment-providers"
import {
  openJim,
  copyAmount,
  copyText,
  buildPaymentLinkSms,
  buildPaymentLinkEmail,
} from "@/lib/payment-providers/jim-launcher"
import type { PaymentProvider, PaymentType, FeePaidBy } from "@/lib/payments-types"
import type { JimPaymentSettings } from "@/lib/types"
import { defaultPaymentSettings } from "@/lib/types"

export interface TakePaymentContext {
  customerId: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  invoiceId?: string | null
  jobId?: string | null
  /** Suggested amount (e.g. invoice/job balance). Editable. */
  amount?: number
  businessName?: string
}

interface TakePaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: TakePaymentContext
  onRecorded?: () => void
}

type Step = "method" | "jim_tap" | "jim_link" | "cash_check" | "success"

const METHODS: { value: PaymentProvider; label: string; icon: typeof Smartphone; hint: string }[] = [
  { value: "jim", label: "JIM (card)", icon: Smartphone, hint: "Tap to Pay or payment link" },
  { value: "cash", label: "Cash", icon: Banknote, hint: "Record a cash payment" },
  { value: "check", label: "Check", icon: Check, hint: "Record a check payment" },
  { value: "other", label: "Other", icon: Link2, hint: "Zelle, Venmo, bank, etc." },
]

export function TakePaymentSheet({ open, onOpenChange, context, onRecorded }: TakePaymentSheetProps) {
  const [step, setStep] = useState<Step>("method")
  const [provider, setProvider] = useState<PaymentProvider>("jim")
  const [amount, setAmount] = useState<string>("")
  const [reference, setReference] = useState("")
  const [paymentLink, setPaymentLink] = useState("")
  const [feePaidBy, setFeePaidBy] = useState<FeePaidBy>("business")
  const [jimSettings, setJimSettings] = useState<JimPaymentSettings>(defaultPaymentSettings.jim)
  const [amountCopied, setAmountCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load JIM settings + reset local state whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    setStep("method")
    setProvider("jim")
    setAmount(context.amount != null && context.amount > 0 ? context.amount.toFixed(2) : "")
    setReference("")
    setPaymentLink("")
    setAmountCopied(false)
    getSettings()
      .then((s) => {
        const jim = s.paymentSettings?.jim || defaultPaymentSettings.jim
        setJimSettings(jim)
        setFeePaidBy(jim.defaultFeePaidBy)
      })
      .catch(() => setJimSettings(defaultPaymentSettings.jim))
  }, [open, context.amount])

  const numericAmount = useMemo(() => {
    const n = Number.parseFloat(amount)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
  }, [amount])

  // Effective JIM payment type drives the fee estimate (tap 1.99% vs link 4.99%+$0.30).
  const jimPaymentType: PaymentType = jimSettings.defaultPaymentType === "payment_link" ? "payment_link" : "tap_to_pay"

  const feeInfo = useMemo(() => {
    if (provider !== "jim" || numericAmount <= 0) return null
    const est = getProviderAdapter("jim").calculateEstimatedFee({ amount: numericAmount, paymentType: jimPaymentType })
    return { fee: est.fee, net: est.net, label: est.rateLabel }
  }, [provider, numericAmount, jimPaymentType])

  const canProceed = numericAmount > 0

  function goToProviderStep() {
    if (!canProceed) {
      toast.error("Enter a valid amount first")
      return
    }
    if (provider === "jim") {
      setStep(jimSettings.defaultPaymentType === "payment_link" ? "jim_link" : "jim_tap")
    } else {
      setStep("cash_check")
    }
  }

  async function handleCopyAmount() {
    const ok = await copyAmount(numericAmount)
    if (ok) {
      setAmountCopied(true)
      toast.success(`Copied $${numericAmount.toFixed(2)}`)
      setTimeout(() => setAmountCopied(false), 2500)
    } else {
      toast.error("Couldn't copy — enter it manually in JIM")
    }
  }

  async function persist(
    paymentType: PaymentType,
    extra?: { paymentLink?: string; reference?: string },
  ) {
    setSaving(true)
    try {
      const result = await recordPayment({
        customerId: context.customerId,
        invoiceId: context.invoiceId ?? null,
        jobId: context.jobId ?? null,
        amount: numericAmount,
        paymentMethod: methodForProvider(provider),
        provider,
        paymentType,
        processingFee: provider === "jim" && feePaidBy === "business" ? feeInfo?.fee ?? 0 : 0,
        feePaidBy: provider === "jim" ? feePaidBy : null,
        paymentLink: extra?.paymentLink || null,
        referenceNumber: extra?.reference || reference || null,
        status: "completed",
      })
      if (!result.success) {
        toast.error(result.error || "Failed to record payment")
        return
      }
      toast.success("Payment recorded")
      setStep("success")
      onRecorded?.()
    } catch (e) {
      console.error("[v0] recordPayment failed:", e)
      toast.error("Failed to record payment")
    } finally {
      setSaving(false)
    }
  }

  function sharePaymentLink(channel: "sms" | "email" | "copy") {
    if (!paymentLink.trim()) {
      toast.error("Paste the JIM payment link first")
      return
    }
    const opts = { businessName: context.businessName, amount: numericAmount }
    if (channel === "copy") {
      copyText(paymentLink).then((ok) => toast[ok ? "success" : "error"](ok ? "Link copied" : "Copy failed"))
      return
    }
    const href =
      channel === "sms"
        ? buildPaymentLinkSms(context.customerPhone, paymentLink, opts)
        : buildPaymentLinkEmail(context.customerEmail, paymentLink, opts)
    window.location.href = href
  }

  const title =
    step === "success"
      ? "Payment recorded"
      : step === "method"
        ? "Take a payment"
        : provider === "jim"
          ? "JIM payment"
          : "Record payment"

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <div className="mx-auto w-full max-w-md overflow-y-auto">
          <DrawerHeader className="text-left">
            <div className="flex items-center gap-2">
              {step !== "method" && step !== "success" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-8 w-8"
                  onClick={() => setStep("method")}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DrawerTitle>{title}</DrawerTitle>
            </div>
            {context.customerName && step !== "success" && (
              <DrawerDescription>
                {context.customerName}
                {context.invoiceId ? " · Invoice" : context.jobId ? " · Job" : ""}
              </DrawerDescription>
            )}
          </DrawerHeader>

          <div className="px-4 pb-2 space-y-5">
            {step === "method" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tp-amount">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="tp-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="pl-7 text-lg h-12"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {METHODS.map((m) => {
                      const Icon = m.icon
                      const active = provider === m.value
                      const disabled = m.value === "jim" && !jimSettings.enabled
                      return (
                        <button
                          key={m.value}
                          type="button"
                          disabled={disabled}
                          onClick={() => setProvider(m.value)}
                          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-40 ${
                            active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium">{m.label}</span>
                          <span className="text-xs text-muted-foreground leading-tight">{m.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {provider === "jim" && jimSettings.showEstimatedFee && feeInfo && (
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estimated JIM fee</span>
                      <span className="font-medium">${feeInfo.fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Net to you</span>
                      <span className="font-medium">${feeInfo.net.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">{feeInfo.label}</p>
                  </div>
                )}

                {provider === "jim" && (
                  <div className="space-y-2">
                    <Label>Who pays the processing fee?</Label>
                    <RadioGroup
                      value={feePaidBy}
                      onValueChange={(v) => setFeePaidBy(v as FeePaidBy)}
                      className="grid grid-cols-2 gap-2"
                    >
                      <Label
                        htmlFor="fee-business"
                        className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${feePaidBy === "business" ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <RadioGroupItem value="business" id="fee-business" />
                        <span className="text-sm">I absorb it</span>
                      </Label>
                      <Label
                        htmlFor="fee-customer"
                        className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${feePaidBy === "customer" ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <RadioGroupItem value="customer" id="fee-customer" />
                        <span className="text-sm">Customer pays</span>
                      </Label>
                    </RadioGroup>
                  </div>
                )}
              </>
            )}

            {step === "jim_tap" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Charge this amount in JIM</p>
                  <p className="text-3xl font-bold tabular-nums">${numericAmount.toFixed(2)}</p>
                </div>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
                    <div className="flex-1">
                      <p className="font-medium">Open JIM &amp; enter the amount</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={() => openJim()}>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open JIM
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={handleCopyAmount}>
                          {amountCopied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                          {amountCopied ? "Copied" : "Copy amount"}
                        </Button>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                    <p className="flex-1 pt-0.5">Tap the customer&apos;s card / phone in JIM to complete the charge.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">3</span>
                    <p className="flex-1 pt-0.5">Come back here and confirm to record it in Profita.</p>
                  </li>
                </ol>
                <div className="space-y-2">
                  <Label htmlFor="tap-ref">Reference (optional)</Label>
                  <Input id="tap-ref" placeholder="JIM confirmation #" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
            )}

            {step === "jim_link" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-sm text-muted-foreground">Payment link amount</p>
                  <p className="text-3xl font-bold tabular-nums">${numericAmount.toFixed(2)}</p>
                </div>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
                    <div className="flex-1">
                      <p className="font-medium">Create a payment link in JIM</p>
                      <Button size="sm" variant="outline" className="mt-2 w-full bg-transparent" onClick={() => openJim()}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open JIM
                      </Button>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                    <div className="flex-1 space-y-2">
                      <p className="font-medium">Paste the link, then send it</p>
                      <Input placeholder="https://..." value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={() => sharePaymentLink("sms")} disabled={!context.customerPhone}>
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Text
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={() => sharePaymentLink("email")} disabled={!context.customerEmail}>
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={() => sharePaymentLink("copy")}>
                          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                        </Button>
                      </div>
                    </div>
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  Recording marks this as a pending link payment. Update it to completed once JIM confirms the customer paid.
                </p>
              </div>
            )}

            {step === "cash_check" && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground capitalize">{provider} payment</p>
                  <p className="text-3xl font-bold tabular-nums">${numericAmount.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-ref">{provider === "check" ? "Check number" : "Reference"} (optional)</Label>
                  <Input id="cc-ref" placeholder={provider === "check" ? "Check #" : "Note"} value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
            )}

            {step === "success" && (
              <div className="py-6 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                <div>
                  <p className="text-2xl font-bold tabular-nums">${numericAmount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">
                    recorded via {provider === "jim" ? "JIM" : provider}
                    {context.customerName ? ` for ${context.customerName}` : ""}
                  </p>
                </div>
                {provider === "jim" && feePaidBy === "business" && feeInfo && feeInfo.fee > 0 && (
                  <Badge variant="secondary">Fee ${feeInfo.fee.toFixed(2)} logged to Finances · net ${feeInfo.net.toFixed(2)}</Badge>
                )}
              </div>
            )}
          </div>

          <DrawerFooter>
            {step === "method" && (
              <Button size="lg" className="w-full" disabled={!canProceed} onClick={goToProviderStep}>
                Continue
              </Button>
            )}
            {step === "jim_tap" && (
              <Button size="lg" className="w-full" disabled={saving} onClick={() => persist("tap_to_pay", { reference })}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Confirm payment received
              </Button>
            )}
            {step === "jim_link" && (
              <Button size="lg" className="w-full" disabled={saving} onClick={() => persist("payment_link", { paymentLink, reference })}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Record link payment
              </Button>
            )}
            {step === "cash_check" && (
              <Button size="lg" className="w-full" disabled={saving} onClick={() => persist("manual", { reference })}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Record {provider} payment
              </Button>
            )}
            {step === "success" && (
              <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
