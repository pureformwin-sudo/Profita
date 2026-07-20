'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Wand2 } from 'lucide-react'
import {
  addInterval,
  effectiveFrequency,
  updateCustomerPlanScheduleById,
  type CustomerPlan,
  type ServicePlan,
} from '@/lib/plans-storage'

const FREQ_OPTIONS = [
  { value: 'inherit', label: 'Use plan default' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'biannual', label: 'Every 6 months' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom (days)' },
]

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.split('T')[0]
}

interface EditScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerPlan: CustomerPlan | null
  plan: ServicePlan | null
  customerName: string
  onSaved: () => void
}

export function EditScheduleDialog({
  open,
  onOpenChange,
  customerPlan,
  plan,
  customerName,
  onSaved,
}: EditScheduleDialogProps) {
  const [lastService, setLastService] = useState('')
  const [nextService, setNextService] = useState('')
  const [serviceStart, setServiceStart] = useState('')
  const [autoRenew, setAutoRenew] = useState(true)
  const [freq, setFreq] = useState('inherit')
  const [customDays, setCustomDays] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customerPlan) return
    setLastService(toDateInput(customerPlan.last_service_date))
    setNextService(toDateInput(customerPlan.next_service_date))
    setServiceStart(toDateInput(customerPlan.service_start_date || customerPlan.start_date))
    setAutoRenew(customerPlan.auto_renew ?? plan?.auto_renew ?? true)
    setFreq(customerPlan.frequency_override || 'inherit')
    setCustomDays(customerPlan.custom_days_override?.toString() || '')
  }, [customerPlan, plan])

  const planFreqLabel = plan
    ? plan.frequency === 'custom'
      ? `every ${plan.custom_days || '?'} days`
      : plan.frequency
    : 'unknown'

  const handleCalcNext = () => {
    const base = lastService || serviceStart
    if (!base) {
      toast.error('Enter a last service or start date first')
      return
    }
    const resolvedFreq =
      freq === 'inherit'
        ? effectiveFrequency({ frequency_override: null, custom_days_override: null }, plan)
        : { frequency: freq, customDays: freq === 'custom' ? parseInt(customDays) || null : null }

    if (!resolvedFreq.frequency) {
      toast.error('No frequency available to calculate from')
      return
    }
    const next = addInterval(base, resolvedFreq.frequency, resolvedFreq.customDays)
    if (!next) {
      toast.error('Could not calculate next date — check the custom day count')
      return
    }
    setNextService(next)
    toast.success('Next service date calculated')
  }

  const handleSave = async () => {
    if (!customerPlan) return
    if (freq === 'custom' && (!parseInt(customDays) || parseInt(customDays) <= 0)) {
      toast.error('Custom frequency needs a day count greater than 0')
      return
    }
    setSaving(true)
    const { ok, error } = await updateCustomerPlanScheduleById(customerPlan.id, {
      last_service_date: lastService || null,
      next_service_date: nextService || null,
      service_start_date: serviceStart || null,
      auto_renew: autoRenew,
      frequency_override: freq === 'inherit' ? null : freq,
      custom_days_override: freq === 'custom' ? parseInt(customDays) || null : null,
    })
    setSaving(false)
    if (!ok) {
      toast.error(error || 'Failed to save schedule')
      return
    }
    toast.success(`Schedule updated for ${customerName}`)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Service Schedule</DialogTitle>
          <DialogDescription>
            {customerName}
            {plan ? ` · ${plan.name} (${planFreqLabel})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="last-service">Last service date</Label>
              <Input
                id="last-service"
                type="date"
                value={lastService}
                onChange={(e) => setLastService(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next-service">Next service due</Label>
              <Input
                id="next-service"
                type="date"
                value={nextService}
                onChange={(e) => setNextService(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="service-start">Service start date</Label>
            <Input
              id="service-start"
              type="date"
              value={serviceStart}
              onChange={(e) => setServiceStart(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recurring frequency</Label>
            <Select value={freq} onValueChange={setFreq}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQ_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {freq === 'custom' && (
              <Input
                type="number"
                min={1}
                placeholder="Days between services"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          <Button variant="outline" size="sm" onClick={handleCalcNext} className="w-full">
            <Wand2 className="h-4 w-4 mr-2" />
            Calculate next date from frequency
          </Button>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Auto-renew</p>
              <p className="text-xs text-muted-foreground">Keep this membership recurring</p>
            </div>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
