'use client'

/**
 * Per-customer contract terms.
 *
 * Picking a customer prefills name/address/contact but leaves them editable —
 * the billing address on file often isn't the house getting lights.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, Info } from 'lucide-react'
import { validateDraft, type ContractDraft } from '@/lib/light-contracts'
import type { Customer, LightContract } from '@/lib/types'

interface ContractFormProps {
  draft: ContractDraft
  customers: Customer[]
  editing: LightContract | null
  busy: boolean
  onChange: (draft: ContractDraft) => void
  onPickCustomer: (customer: Customer) => void
  onSave: () => void
  onCancel: () => void
}

export function ContractForm({
  draft,
  customers,
  editing,
  busy,
  onChange,
  onPickCustomer,
  onSave,
  onCancel,
}: ContractFormProps) {
  const [touched, setTouched] = useState(false)
  const issues = useMemo(() => validateDraft(draft), [draft])
  const canSave = issues.errors.length === 0 && !busy

  function set<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="flex flex-col gap-5 p-4 sm:p-6">
        <div>
          <h2 className="text-sm font-medium">
            {editing ? `Edit ${editing.contractNumber}` : 'Contract terms'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            These values fill the placeholders in your wording.
          </p>
        </div>

        {/* Customer -------------------------------------------------------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="customer-picker">Pull from customer</Label>
            <Select
              value={draft.customerId ?? 'none'}
              onValueChange={(v) => {
                if (v === 'none') {
                  set('customerId', null)
                  return
                }
                const match = customers.find((c) => c.id === v)
                if (match) onPickCustomer(match)
              }}
            >
              <SelectTrigger id="customer-picker">
                <SelectValue placeholder="Select a customer (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked to a customer</SelectItem>
                {sortedCustomers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Prefills the fields below. You can still edit any of them.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="customer-name">
              Customer name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="customer-name"
              value={draft.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Jane Doe"
              aria-invalid={touched && !draft.customerName.trim()}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="service-address">Service address</Label>
            <Input
              id="service-address"
              value={draft.serviceAddress}
              onChange={(e) => set('serviceAddress', e.target.value)}
              placeholder="1420 Elm Street, Springfield, OH 45501"
            />
            <p className="text-xs text-muted-foreground">
              Where the lights go — not necessarily the billing address.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-phone">Phone</Label>
            <Input
              id="customer-phone"
              type="tel"
              value={draft.customerPhone}
              onChange={(e) => set('customerPhone', e.target.value)}
              placeholder="(555) 012-3456"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={draft.customerEmail}
              onChange={(e) => set('customerEmail', e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
        </div>

        {/* Deal ------------------------------------------------------------ */}
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="1850.00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="term-years">Term (years)</Label>
            <Input
              id="term-years"
              type="number"
              inputMode="numeric"
              min="1"
              max="25"
              step="1"
              value={draft.termYears}
              onChange={(e) => set('termYears', e.target.value)}
              placeholder="3"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="install-date">Install date</Label>
            <Input
              id="install-date"
              type="date"
              value={draft.installDate}
              onChange={(e) => set('installDate', e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="takedown-date">Takedown date</Label>
            <Input
              id="takedown-date"
              type="date"
              value={draft.takedownDate}
              onChange={(e) => set('takedownDate', e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Additional terms</Label>
            <Textarea
              id="notes"
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Roofline and two front trees. Customer supplies outdoor outlet access."
              className="min-h-24 resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Appears in its own section, and via{' '}
              <code className="font-mono text-[11px]">{'{{notes}}'}</code> if used in your wording.
            </p>
          </div>
        </div>

        {issues.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Fix before saving</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {issues.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create contract'}
          </Button>
        </div>
      </Card>

      <Card className="h-fit p-4 sm:p-5">
        <h2 className="text-sm font-medium">Before you send</h2>
        {issues.warnings.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2.5">
            {issues.warnings.map((w) => (
              <li key={w} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-pretty">{w}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground text-pretty">
            All the usual fields are filled in. Save, then review the document before finalizing.
          </p>
        )}

        <div className="mt-5 rounded-md border border-dashed bg-muted/40 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
            Saving creates a <strong className="font-medium text-foreground">draft</strong>. Terms
            stay editable until you finalize, which freezes the wording onto the document.
          </p>
        </div>
      </Card>
    </div>
  )
}
