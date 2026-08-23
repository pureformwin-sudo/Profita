'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Loader2, Send, AlertTriangle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { ActivitySubject } from '@/lib/lead-activity-storage'

/** Single SMS segment. Past this the carrier splits the message and bills per part. */
const SEGMENT_LEN = 160
/** Mirrors the server-side cap in /api/quo/send. */
const MAX_LEN = 1600

/**
 * Compose and send a real SMS through Quo, in-app.
 *
 * Replaces the old `sms:` handoff. Because the send happens server-side we get a
 * definitive result back, so the timeline entry is written automatically by
 * /api/quo/send — there is no "did you send it?" confirmation step.
 *
 * The phone number is NOT sent from here when a contact id is available: the
 * server re-reads the number for that id, which keeps opt-out enforcement and
 * tenant scoping authoritative on the server. `phone` is only passed for
 * job-only sends where no lead/customer row exists.
 */
export function SendTextSheet({
  open,
  onOpenChange,
  subject,
  contactName,
  phone,
  repEmployeeId,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: ActivitySubject
  contactName: string
  /** Fallback recipient for job-only sends with no lead/customer id. */
  phone?: string | null
  repEmployeeId: string | null
  onSent?: () => void
}) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const who = contactName || 'them'
  const trimmed = body.trim()
  const segments = Math.max(1, Math.ceil(trimmed.length / SEGMENT_LEN))
  const overLimit = trimmed.length > MAX_LEN

  // Without a contact id the server needs a number to send to.
  const hasRecipient = Boolean(subject.leadId || subject.customerId || phone)

  const close = () => {
    setBody('')
    onOpenChange(false)
  }

  const handleSend = async () => {
    if (sending || !trimmed || overLimit || !hasRecipient) return
    setSending(true)

    try {
      const res = await fetch('/api/quo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: subject.leadId ?? undefined,
          customerId: subject.customerId ?? undefined,
          // Only used when there's no contact id to look the number up from.
          phone: subject.leadId || subject.customerId ? undefined : (phone ?? undefined),
          jobId: subject.jobId ?? undefined,
          repEmployeeId,
          body: trimmed,
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        // A hard send failure comes back as 502 with the provider error on
        // `result`, while validation errors use a top-level `error`.
        toast.error(
          json?.result?.error ?? json?.error ?? 'Could not send message',
        )
        setSending(false)
        return
      }

      // A 200 can still carry a skip (opted out, unusable number), so read the
      // per-recipient outcome rather than trusting the status code alone.
      const status = json?.result?.status as 'sent' | 'failed' | 'skipped' | undefined
      if (status === 'skipped') {
        const reason = json?.result?.skipReason
        toast.error(
          reason === 'opted_out'
            ? `${who} has opted out of texts`
            : reason === 'invalid_phone'
              ? 'That phone number is not valid'
              : 'Message was not sent',
        )
        setSending(false)
        return
      }
      if (status !== 'sent') {
        toast.error(json?.result?.error ?? 'Could not send message')
        setSending(false)
        return
      }

      setSending(false)
      toast.success('Text sent')
      close()
      onSent?.()
    } catch {
      setSending(false)
      toast.error('Could not send message. Check your connection.')
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setBody('')
        onOpenChange(next)
      }}
    >
      <SheetContent side="bottom" className="border-zinc-800 bg-zinc-950">
        <SheetHeader className="text-left">
          <SheetTitle>Text {who}</SheetTitle>
          <SheetDescription>
            Sent from your business line and logged automatically.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {!hasRecipient ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                No phone number on file for {who}, so there is nowhere to send this.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
              <MessageSquare
                className="mt-0.5 h-5 w-5 shrink-0 text-sky-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                This sends immediately through Quo and appears on the timeline. Replies
                come back to your Messages inbox.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="text-body">Message</Label>
              <span
                className={
                  overLimit
                    ? 'text-xs text-red-400'
                    : 'text-xs text-muted-foreground'
                }
              >
                {trimmed.length}
                {trimmed.length > SEGMENT_LEN ? ` · ${segments} segments` : ''}
              </span>
            </div>
            <Textarea
              id="text-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hi ${who.split(' ')[0] || 'there'}, `}
              rows={4}
              autoFocus
              disabled={!hasRecipient}
              className="resize-none border-zinc-700 bg-zinc-900"
            />
            {overLimit && (
              <p className="text-xs text-red-400">
                Too long by {trimmed.length - MAX_LEN} characters.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 bg-transparent"
              onClick={close}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSend}
              disabled={sending || !trimmed || overLimit || !hasRecipient}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
