'use client'

import { useEffect, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles, Send, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { answerAskAI, type AskAIContext } from '@/lib/ai/insights'
import {
  getCustomers,
  getJobs,
  getInvoices,
  getIncome,
  getExpenses,
  getEmployees,
} from '@/lib/storage'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'How is my business doing this week?',
  'Which customers should I follow up with?',
  'Where am I losing money?',
  'What should I focus on next?',
  'Show me customers due for repeat service',
  'Which customers are upsell ready?',
]

export function AskAIDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi, I'm Profita AI. Ask me about your revenue, customers, invoices, or what to focus on next.",
    },
  ])
  const [context, setContext] = useState<AskAIContext | null>(null)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || context) return
    let cancelled = false
    ;(async () => {
      const [customers, jobs, invoices, income, expenses, employees] = await Promise.all([
        getCustomers(),
        getJobs(),
        getInvoices(),
        getIncome(),
        getExpenses(),
        getEmployees(),
      ])
      if (cancelled) return
      setContext({ customers, jobs, invoices, income, expenses, employees })
    })()
    return () => {
      cancelled = true
    }
  }, [open, context])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(question?: string) {
    const q = (question ?? input).trim()
    if (!q) return
    setInput('')
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: q }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    // Use loaded context; if not yet, load fast
    const ctx =
      context ||
      ({
        customers: await getCustomers(),
        jobs: await getJobs(),
        invoices: await getInvoices(),
        income: await getIncome(),
        expenses: await getExpenses(),
        employees: await getEmployees(),
      } satisfies AskAIContext)

    // Small artificial delay for natural feel
    await new Promise((r) => setTimeout(r, 350))
    const answer = answerAskAI(q, ctx)
    const botMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: answer }
    setMessages((m) => [...m, botMsg])
    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="rounded-md bg-primary/15 p-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            Profita AI
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask anything about your business — answers use your live data.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground',
                )}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-secondary rounded-xl px-3 py-2">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          {messages.length === 1 && !loading && (
            <div className="pt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider px-0.5">
                Try asking
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Profita AI..."
              className="flex-1 h-10"
              disabled={loading}
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
