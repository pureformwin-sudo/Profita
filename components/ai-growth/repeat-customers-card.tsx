'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { RefreshCw, Send, Copy, CalendarClock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Customer, Job } from '@/lib/types'

type DueWindow = 90 | 180 | 365

interface RepeatCustomersCardProps {
  customers: Customer[]
  jobs: Job[]
}

export function RepeatCustomersCard({ customers, jobs }: RepeatCustomersCardProps) {
  const [window, setWindow] = useState<DueWindow>(90)
  const [selectedCustomer, setSelectedCustomer] = useState<{ name: string; lastDate: string; amount: number } | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)

  const dueCustomers = useMemo(() => {
    const now = new Date()
    const cutoff = new Date(now.getTime() - window * 24 * 60 * 60 * 1000)

    // Build a map of last completed job per customer
    const lastJobMap = new Map<string, { date: Date; amount: number }>()
    for (const job of jobs) {
      if (job.status !== 'Completed' && job.status !== 'Paid') continue
      const existing = lastJobMap.get(job.customerId)
      const jobDate = new Date(job.date)
      if (!existing || jobDate > existing.date) {
        lastJobMap.set(job.customerId, { date: jobDate, amount: job.price })
      }
    }

    const list: Array<{ id: string; name: string; lastDate: Date; amount: number; daysAgo: number }> = []
    for (const customer of customers) {
      const info = lastJobMap.get(customer.id)
      if (!info) continue
      if (info.date < cutoff) {
        const daysAgo = Math.floor((now.getTime() - info.date.getTime()) / (1000 * 60 * 60 * 24))
        list.push({
          id: customer.id,
          name: customer.name,
          lastDate: info.date,
          amount: info.amount,
          daysAgo,
        })
      }
    }

    return list.sort((a, b) => b.daysAgo - a.daysAgo).slice(0, 5)
  }, [customers, jobs, window])

  const openMessage = (name: string, lastDate: Date, amount: number) => {
    setSelectedCustomer({ name, lastDate: lastDate.toLocaleDateString(), amount })
    setMessageOpen(true)
    setMessage('')
    setGenerating(true)

    // Simulate AI generation
    setTimeout(() => {
      const firstName = name.split(' ')[0]
      const templates = [
        `Hey ${firstName}, hope you've been well! It's been a few months since your last service. We have openings next week if you'd like to get scheduled again — I can hold a spot for you.`,
        `Hi ${firstName}, just a quick check-in. Your windows are probably due for another cleaning. Want me to pencil you in for later this week?`,
        `Hey ${firstName}! Long time no chat. We're running our spring availability right now — would love to take care of you again. Reply YES and I'll send a few times.`,
      ]
      setMessage(templates[Math.floor(Math.random() * templates.length)])
      setGenerating(false)
    }, 700)
  }

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message)
    toast.success('Message copied to clipboard')
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CalendarClock className="h-4 w-4 text-green-500" />
              </div>
              <h3 className="font-semibold">Repeat Customers Due</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 ml-10">
              {dueCustomers.length} customers haven't booked in {window}+ days
            </p>
          </div>
        </div>

        {/* Window selector */}
        <div className="flex gap-1 mb-4 p-1 rounded-lg bg-secondary/50 w-fit">
          {([90, 180, 365] as DueWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                window === w ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>

        <div className="space-y-2 flex-1">
          {dueCustomers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/50" />
              All customers up to date
            </div>
          ) : (
            dueCustomers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.daysAgo}d ago · ${c.amount.toFixed(0)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => openMessage(c.name, c.lastDate, c.amount)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Follow-up
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Follow-Up Message</DialogTitle>
            <DialogDescription>
              AI-generated message for {selectedCustomer?.name} · Last service {selectedCustomer?.lastDate}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-secondary/30 p-4 min-h-[120px]">
            {generating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating personalized message...
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGenerating(true)
                setMessage('')
                setTimeout(() => {
                  if (!selectedCustomer) return
                  const firstName = selectedCustomer.name.split(' ')[0]
                  const templates = [
                    `Hey ${firstName}, hope you've been well! It's been a while — we have openings this week if you'd like to get back on the schedule.`,
                    `Hi ${firstName}, your windows are probably ready for another cleaning. Want me to grab you a spot next week?`,
                    `Hey ${firstName}! Quick check-in. Spring availability is filling up — reply YES and I'll text over a couple times.`,
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
