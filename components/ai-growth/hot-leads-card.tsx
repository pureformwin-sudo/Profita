'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Flame, Send, Copy, RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Customer } from '@/lib/types'

interface HotLeadsCardProps {
  customers: Customer[]
  invoices: any[]
}

export function HotLeadsCard({ customers, invoices }: HotLeadsCardProps) {
  const [selected, setSelected] = useState<{ name: string; daysWaiting: number; value: number } | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)

  const hotLeads = useMemo(() => {
    const now = new Date()
    const customerMap = new Map(customers.map((c) => [c.id, c]))

    return invoices
      .filter((i) => i.status === 'draft' || i.status === 'sent')
      .map((i) => {
        const customer = customerMap.get(i.customerId)
        const issueDate = new Date(i.issueDate || i.created_at || now)
        const daysWaiting = Math.max(0, Math.floor((now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)))
        return {
          id: i.id,
          name: customer?.name || 'Unknown',
          daysWaiting,
          value: i.total || 0,
        }
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting)
      .slice(0, 5)
  }, [customers, invoices])

  const openMessage = (name: string, daysWaiting: number, value: number) => {
    setSelected({ name, daysWaiting, value })
    setMessageOpen(true)
    setGenerating(true)
    setMessage('')

    setTimeout(() => {
      const firstName = name.split(' ')[0]
      const templates = [
        `Hey ${firstName}, just following up on the quote I sent — happy to answer any questions. I can lock in next week's schedule if you want to move forward.`,
        `Hi ${firstName}, checking in on your estimate. If pricing or timing is the hold-up, let me know and we can work something out. Otherwise I can get you on the calendar.`,
        `Hey ${firstName}! Just want to make sure you got the quote. I have one opening left this week at a good time — want me to save it for you?`,
      ]
      setMessage(templates[Math.floor(Math.random() * templates.length)])
      setGenerating(false)
    }, 700)
  }

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message)
    toast.success('Message copied')
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Flame className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="font-semibold">Hot Leads</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 ml-10">
              Unconverted estimates waiting for response
            </p>
          </div>
        </div>

        <div className="space-y-2 flex-1">
          {hotLeads.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/50" />
              No open leads
            </div>
          ) : (
            hotLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {lead.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{lead.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.daysWaiting}d waiting · Est ${lead.value.toFixed(0)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => openMessage(lead.name, lead.daysWaiting, lead.value)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Close
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Closing Message</DialogTitle>
            <DialogDescription>
              {selected?.name} · {selected?.daysWaiting}d waiting · Est ${selected?.value.toFixed(0)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-secondary/30 p-4 min-h-[120px]">
            {generating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating closing message...
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!selected) return
                setGenerating(true)
                setMessage('')
                setTimeout(() => {
                  const firstName = selected.name.split(' ')[0]
                  const templates = [
                    `Hey ${firstName}, quick bump on the quote. I've got space opening up next week — want to lock it in?`,
                    `Hi ${firstName}, circling back on your estimate. Any questions I can answer?`,
                    `Hey ${firstName}! I'll hold pricing through this week. Ready to get on the schedule?`,
                  ]
                  setMessage(templates[Math.floor(Math.random() * templates.length)])
                  setGenerating(false)
                }, 600)
              }}
              disabled={generating}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
            <Button onClick={copyMessage} disabled={generating || !message}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
