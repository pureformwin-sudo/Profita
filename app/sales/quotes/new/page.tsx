'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Trash2,
  DollarSign,
  User,
  MapPin,
  Phone,
  Mail,
  FileText,
  Send,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMode } from '@/lib/mode-context'
import { getLeadsForCurrentRep, type Lead } from '@/lib/leads-storage'
import { createQuote, type QuoteItem } from '@/lib/quotes-storage'
import { cn } from '@/lib/utils'

// Common service types for a service business
const SERVICE_TYPES = [
  { value: 'window_cleaning', label: 'Window Cleaning', defaultPrice: 15000 },
  { value: 'pressure_washing', label: 'Pressure Washing', defaultPrice: 25000 },
  { value: 'gutter_cleaning', label: 'Gutter Cleaning', defaultPrice: 12000 },
  { value: 'solar_panel', label: 'Solar Panel Cleaning', defaultPrice: 20000 },
  { value: 'roof_cleaning', label: 'Roof Cleaning', defaultPrice: 35000 },
  { value: 'house_wash', label: 'House Wash', defaultPrice: 30000 },
  { value: 'driveway', label: 'Driveway Cleaning', defaultPrice: 18000 },
  { value: 'deck_patio', label: 'Deck/Patio Cleaning', defaultPrice: 22000 },
  { value: 'custom', label: 'Custom Service', defaultPrice: 0 },
]

interface LineItem {
  id: string
  serviceType: string
  description: string
  quantity: number
  unitPriceCents: number
}

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export default function NewQuotePage() {
  const router = useRouter()
  const { ownerUserId, employeeId } = useMode()
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: generateId(), serviceType: '', description: '', quantity: 1, unitPriceCents: 0 },
  ])
  const [notes, setNotes] = useState('')
  const [validDays, setValidDays] = useState('30')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await getLeadsForCurrentRep()
      // Only show leads that aren't already converted
      setLeads(data.filter((l) => l.status !== 'converted' && l.status !== 'lost'))
    })()
  }, [])

  const selectedLead = leads.find((l) => l.id === selectedLeadId)

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: generateId(), serviceType: '', description: '', quantity: 1, unitPriceCents: 0 },
    ])
  }

  const removeLineItem = (id: string) => {
    if (lineItems.length === 1) return
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, ...updates }
        // Auto-fill price when service type changes
        if (updates.serviceType) {
          const service = SERVICE_TYPES.find((s) => s.value === updates.serviceType)
          if (service && item.unitPriceCents === 0) {
            updated.unitPriceCents = service.defaultPrice
            updated.description = service.label
          }
        }
        return updated
      })
    )
  }

  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  )

  const handleSave = async (send = false) => {
    if (!selectedLeadId) {
      toast.error('Please select a lead')
      return
    }
    if (!ownerUserId) {
      toast.error('Authentication error')
      return
    }
    const validItems = lineItems.filter((item) => item.description.trim() && item.unitPriceCents > 0)
    if (validItems.length === 0) {
      toast.error('Add at least one line item with a price')
      return
    }

    setSubmitting(true)

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + parseInt(validDays, 10))

    const items: QuoteItem[] = validItems.map((item, index) => ({
      id: '',
      quote_id: '',
      sort_order: index,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPriceCents,
      total: item.quantity * item.unitPriceCents,
    }))

    const { data, error } = await createQuote({
      ownerUserId,
      repEmployeeId: employeeId,
      leadId: selectedLeadId || undefined,
      items: validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPriceCents,
      })),
      notes: notes.trim() || undefined,
      validUntil: validUntil.toISOString(),
    })

    setSubmitting(false)

    if (error) {
      toast.error(error)
      return
    }

    toast.success(send ? 'Quote sent!' : 'Quote saved as draft')
    router.push('/sales/quotes')
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">New Quote</h1>
          <p className="text-sm text-muted-foreground">Create a quote for a lead</p>
        </div>
      </div>

      {/* Lead Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a lead..." />
            </SelectTrigger>
            <SelectContent>
              {leads.map((lead) => (
                <SelectItem key={lead.id} value={lead.id}>
                  <div className="flex flex-col">
                    <span>{lead.name || 'Unnamed'}</span>
                    {lead.address && (
                      <span className="text-xs text-muted-foreground">{lead.address}</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedLead && (
            <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
              {selectedLead.address && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {selectedLead.address}
                </p>
              )}
              {selectedLead.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedLead.phone}
                </p>
              )}
              {selectedLead.email && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {selectedLead.email}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Services
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.map((item, index) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-2 items-start p-3 rounded-lg bg-muted/30"
            >
              <div className="col-span-12 sm:col-span-4">
                <label className="text-xs text-muted-foreground mb-1 block">Service</label>
                <Select
                  value={item.serviceType}
                  onValueChange={(v) => updateLineItem(item.id, { serviceType: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 sm:col-span-4">
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <Input
                  value={item.description}
                  onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                  placeholder="Description"
                  className="h-9"
                />
              </div>

              <div className="col-span-4 sm:col-span-1">
                <label className="text-xs text-muted-foreground mb-1 block">Qty</label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateLineItem(item.id, { quantity: parseInt(e.target.value, 10) || 1 })
                  }
                  className="h-9"
                />
              </div>

              <div className="col-span-6 sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={(item.unitPriceCents / 100).toFixed(2)}
                    onChange={(e) =>
                      updateLineItem(item.id, {
                        unitPriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="h-9 pl-7"
                  />
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 flex items-end justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-rose-500"
                  onClick={() => removeLineItem(item.id)}
                  disabled={lineItems.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Line Item
          </Button>
        </CardContent>
      </Card>

      {/* Notes & Validity */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional terms or notes..."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Valid for</label>
            <Select value={validDays} onValueChange={setValidDays}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Total & Actions */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-2xl font-bold">{formatCurrency(subtotalCents)}</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleSave(false)}
              disabled={submitting}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleSave(true)}
              disabled={submitting}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Quote
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
