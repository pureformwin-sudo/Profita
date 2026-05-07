'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, Sparkles, FileText, Plus, Mail, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { Customer, Job } from '@/lib/types'

interface UpsellTargetsCardProps {
  customers: Customer[]
  jobs: Job[]
  onCreateEstimate?: (customerId: string, service: string, amount: number) => void
}

const UPSELL_SERVICES = [
  { name: 'Solar Panel Cleaning', keyword: 'solar', uplift: 120 },
  { name: 'Gutter Cleaning', keyword: 'gutter', uplift: 90 },
  { name: 'Screen Cleaning', keyword: 'screen', uplift: 60 },
  { name: 'Hard Water Removal', keyword: 'hard water', uplift: 80 },
]

interface UpsellTarget {
  id: string
  customerId: string
  name: string
  email?: string
  phone?: string
  suggestion: string
  uplift: number
}

export function UpsellTargetsCard({ customers, jobs, onCreateEstimate }: UpsellTargetsCardProps) {
  const [selectedTarget, setSelectedTarget] = useState<UpsellTarget | null>(null)
  const [showSendOffer, setShowSendOffer] = useState(false)
  const [offerMessage, setOfferMessage] = useState('')

  const targets = useMemo(() => {
    const customerMap = new Map(customers.map((c) => [c.id, c]))

    // Build a map of services each customer has used
    const customerServices = new Map<string, { text: string; jobCount: number }>()
    for (const job of jobs) {
      if (job.status !== 'Completed' && job.status !== 'Paid') continue
      const existing = customerServices.get(job.customerId) || { text: '', jobCount: 0 }
      const noteText = ((job as unknown as { notes?: string }).notes || '').toLowerCase()
      customerServices.set(job.customerId, {
        text: existing.text + ' ' + noteText,
        jobCount: existing.jobCount + 1,
      })
    }

    // Find customers who have bought service but not upsells
    const targetsList: UpsellTarget[] = []

    for (const [customerId, info] of customerServices) {
      const customer = customerMap.get(customerId)
      if (!customer) continue

      const hasService = (keyword: string) => info.text.includes(keyword)

      for (const upsell of UPSELL_SERVICES) {
        if (!hasService(upsell.keyword)) {
          targetsList.push({
            id: `${customerId}-${upsell.keyword}`,
            customerId,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            suggestion: upsell.name,
            uplift: upsell.uplift,
          })
          break
        }
      }
    }

    return targetsList.slice(0, 5)
  }, [customers, jobs])

  const totalOpportunity = targets.reduce((sum, t) => sum + t.uplift, 0)

  const handleCreateEstimate = (target: UpsellTarget) => {
    if (onCreateEstimate) {
      onCreateEstimate(target.customerId, target.suggestion, target.uplift)
      toast.success(`Creating estimate for ${target.name}`)
    } else {
      // Fallback: navigate to invoices page with pre-filled data
      const params = new URLSearchParams({
        customerId: target.customerId,
        action: 'estimate',
        service: target.suggestion,
        amount: target.uplift.toString(),
      })
      window.location.href = `/invoices?${params.toString()}`
    }
  }

  const handleSendOffer = (target: UpsellTarget) => {
    setSelectedTarget(target)
    setOfferMessage(
      `Hi ${target.name.split(' ')[0]},\n\nI wanted to reach out about adding ${target.suggestion.toLowerCase()} to your service. This would be an additional $${target.uplift} and can really help maintain your property.\n\nLet me know if you're interested!\n\nBest regards`
    )
    setShowSendOffer(true)
  }

  const handleSendOfferSubmit = () => {
    if (!selectedTarget) return
    
    // Copy to clipboard as a quick action
    navigator.clipboard.writeText(offerMessage)
    toast.success('Offer message copied to clipboard!')
    
    // Open email/SMS if available
    if (selectedTarget.email) {
      const subject = encodeURIComponent(`Special Offer: ${selectedTarget.suggestion}`)
      const body = encodeURIComponent(offerMessage)
      window.open(`mailto:${selectedTarget.email}?subject=${subject}&body=${body}`, '_blank')
    } else if (selectedTarget.phone) {
      const body = encodeURIComponent(offerMessage)
      window.open(`sms:${selectedTarget.phone}?body=${body}`, '_blank')
    }
    
    setShowSendOffer(false)
    setSelectedTarget(null)
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold">Upsell Targets</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 ml-10">
              +${totalOpportunity.toLocaleString()} potential revenue
            </p>
          </div>
        </div>

        <div className="space-y-2 flex-1">
          {targets.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary/50" />
              No upsell targets yet
            </div>
          ) : (
            targets.map((t) => (
              <DropdownMenu key={t.id}>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors cursor-pointer group"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Add {t.suggestion}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-sm font-semibold text-green-500">+${t.uplift}</p>
                        <p className="text-[10px] text-muted-foreground">per visit</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => handleCreateEstimate(t)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Create Estimate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const params = new URLSearchParams({
                      customerId: t.customerId,
                      action: 'new',
                      service: t.suggestion,
                    })
                    window.location.href = `/jobs?${params.toString()}`
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service to Job
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSendOffer(t)}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Offer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))
          )}
        </div>
      </div>

      {/* Send Offer Dialog */}
      <Dialog open={showSendOffer} onOpenChange={setShowSendOffer}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Upsell Offer</DialogTitle>
            <DialogDescription>
              Send a personalized offer to {selectedTarget?.name} for {selectedTarget?.suggestion}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
            {selectedTarget?.email && (
              <p className="text-xs text-muted-foreground">
                Will open email to: {selectedTarget.email}
              </p>
            )}
            {!selectedTarget?.email && selectedTarget?.phone && (
              <p className="text-xs text-muted-foreground">
                Will open SMS to: {selectedTarget.phone}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendOffer(false)}>Cancel</Button>
            <Button onClick={handleSendOfferSubmit}>
              <Mail className="h-4 w-4 mr-2" />
              Send Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
