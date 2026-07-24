'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getSettings, saveSettings } from '@/lib/storage'
import { defaultPaymentSettings, type Settings as SettingsType, type JimPaymentSettings } from '@/lib/types'
import { JIM_TAP_RATE, JIM_LINK_RATE, JIM_LINK_FLAT } from '@/lib/payment-providers/jim'
import { toast } from 'sonner'
import { ArrowLeft, CreditCard, Smartphone, Link2, ExternalLink, Info } from 'lucide-react'

export default function PaymentsSettingsPage() {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [jim, setJim] = useState<JimPaymentSettings>(defaultPaymentSettings.jim)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setJim(s.paymentSettings?.jim || defaultPaymentSettings.jim)
    })
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    const next: SettingsType = {
      ...settings,
      paymentSettings: { ...(settings.paymentSettings || defaultPaymentSettings), jim },
    }
    const ok = await saveSettings(next)
    if (ok) {
      setSettings(next)
      toast.success('Payment settings saved')
    } else {
      toast.error('Failed to save payment settings')
    }
    setSaving(false)
  }

  if (!settings) return null

  const tapPct = (JIM_TAP_RATE * 100).toFixed(2)
  const linkPct = (JIM_LINK_RATE * 100).toFixed(2)

  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
            <ArrowLeft className="h-4 w-4" /> Settings
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Card Payments</h1>
              <p className="text-muted-foreground text-sm">Take card payments with JIM</p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-border bg-muted/40 p-4 mb-6 flex gap-3">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">JIM is a separate app on your phone</p>
            <p>
              Profita hands off to the JIM app to run the card, then you confirm the amount here so it&apos;s
              recorded against the job or invoice. JIM does not currently offer an automatic connection, so
              amounts are entered in JIM manually (Profita keeps the amount one tap away).
            </p>
            <a
              href="https://www.jim.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Learn about JIM <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Enable */}
        <section className="mb-6">
          <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
            <div>
              <p className="font-medium">Enable JIM payments</p>
              <p className="text-sm text-muted-foreground">Show &quot;Take Payment&quot; on jobs, invoices, and customers</p>
            </div>
            <Switch checked={jim.enabled} onCheckedChange={(v) => setJim({ ...jim, enabled: v })} />
          </div>
        </section>

        {/* Defaults */}
        <section className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Defaults</h2>
          <div className="rounded-xl border border-border bg-card p-5 space-y-6">
            {/* Default payment type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Default method</Label>
              <RadioGroup
                value={jim.defaultPaymentType}
                onValueChange={(v) => setJim({ ...jim, defaultPaymentType: v as JimPaymentSettings['defaultPaymentType'] })}
                className="grid gap-3"
              >
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="tap_to_pay" id="pt-tap" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Smartphone className="h-4 w-4" /> Tap to Pay
                    </div>
                    <p className="text-sm text-muted-foreground">Customer taps their card/phone on yours. Lower fee ({tapPct}%).</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="payment_link" id="pt-link" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Link2 className="h-4 w-4" /> Payment link
                    </div>
                    <p className="text-sm text-muted-foreground">Text or email the customer a link to pay. Fee {linkPct}% + ${JIM_LINK_FLAT.toFixed(2)}.</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Who pays the fee */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Who absorbs the processing fee?</Label>
              <RadioGroup
                value={jim.defaultFeePaidBy}
                onValueChange={(v) => setJim({ ...jim, defaultFeePaidBy: v as JimPaymentSettings['defaultFeePaidBy'] })}
                className="grid grid-cols-2 gap-3"
              >
                <label className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="business" id="fee-biz" />
                  <span className="text-sm font-medium">My business</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <RadioGroupItem value="customer" id="fee-cust" />
                  <span className="text-sm font-medium">Customer</span>
                </label>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                When your business absorbs the fee, it&apos;s recorded as a &quot;Processing Fees&quot; expense so your net
                proceeds are accurate in Finances. This is a per-payment default you can override at checkout.
              </p>
            </div>

            {/* Show estimated fee */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Show estimated fee at checkout</p>
                <p className="text-sm text-muted-foreground">Display the estimated JIM fee and net amount</p>
              </div>
              <Switch checked={jim.showEstimatedFee} onCheckedChange={(v) => setJim({ ...jim, showEstimatedFee: v })} />
            </div>

            {/* Account label */}
            <div className="space-y-2">
              <Label htmlFor="jim-label" className="text-sm font-medium">JIM account label (optional)</Label>
              <Input
                id="jim-label"
                placeholder="e.g. Business checking"
                value={jim.accountLabel || ''}
                onChange={(e) => setJim({ ...jim, accountLabel: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">A note to yourself about which JIM account receives these payments.</p>
            </div>
          </div>
        </section>

        <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </AppShell>
  )
}
