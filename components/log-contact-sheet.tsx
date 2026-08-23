'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Phone, Voicemail, PhoneOff, MessageSquare, Loader2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  logCall,
  logText,
  logVoicemail,
  type ActivitySubject,
} from '@/lib/lead-activity-storage'
import { updateLead } from '@/lib/leads-storage'

export type CallOutcome = 'connected' | 'voicemail' | 'no_answer'

const OUTCOMES: Array<{
  value: CallOutcome
  label: string
  hint: string
  icon: typeof Phone
  accent: string
}> = [
  {
    value: 'connected',
    label: 'Connected',
    hint: 'Spoke with them',
    icon: Phone,
    accent: 'data-[active=true]:border-emerald-500/60 data-[active=true]:bg-emerald-500/10',
  },
  {
    value: 'voicemail',
    label: 'Voicemail',
    hint: 'Left a message',
    icon: Voicemail,
    accent: 'data-[active=true]:border-amber-500/60 data-[active=true]:bg-amber-500/10',
  },
  {
    value: 'no_answer',
    label: 'No answer',
    hint: 'Nobody picked up',
    icon: PhoneOff,
    accent: 'data-[active=true]:border-zinc-400/60 data-[active=true]:bg-zinc-500/10',
  },
]

/**
 * Prompt shown after a `tel:` / `sms:` handoff to the device, so the
 * communication actually gets recorded.
 *
 * Works for leads, customers and jobs — pass whichever ids apply. A call placed
 * from a job should pass BOTH jobId and customerId so it shows on the job and in
 * the customer's history from a single row.
 *
 * For texts there is no delivery signal back from the device, so this asks the
 * user to confirm and only writes a row if they say yes. Nothing is ever logged
 * on tap alone.
 */
export function LogContactSheet({
  open,
  onOpenChange,
  mode,
  subject,
  contactName,
  repEmployeeId,
  onLogged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'call' | 'text'
  subject: ActivitySubject
  contactName: string
  repEmployeeId: string | null
  onLogged?: () => void
}) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const isCall = mode === 'call'
  const who = contactName || 'them'

  const reset = () => {
    setOutcome(null)
    setNotes('')
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const handleSave = async () => {
    if (saving) return
    if (isCall && !outcome) return
    setSaving(true)

    const trimmed = notes.trim() || undefined

    let ok: boolean
    if (!isCall) {
      ok = await logText({ ...subject, repEmployeeId, notes: trimmed })
    } else if (outcome === 'voicemail') {
      // 'voicemail' is its own activity_type, so route it separately instead of
      // flattening every attempt into a generic 'call'.
      ok = await logVoicemail({ ...subject, repEmployeeId, notes: trimmed })
    } else {
      ok = await logCall({ ...subject, repEmployeeId, outcome: outcome!, notes: trimmed })
    }

    if (!ok) {
      setSaving(false)
      toast.error(isCall ? 'Could not save call log' : 'Could not save text log')
      return
    }

    // last_contact_at only exists on leads. For customers and jobs the activity
    // row itself is the record, so there is nothing extra to touch.
    if (subject.leadId) {
      const touched = await updateLead(subject.leadId, {
        last_contact_at: new Date().toISOString(),
      })
      if (!touched) {
        // The activity row did save, so don't imply the whole thing failed.
        setSaving(false)
        toast.warning(
          isCall
            ? 'Call logged, but last-contact time did not update'
            : 'Text logged, but last-contact time did not update',
        )
        close()
        onLogged?.()
        return
      }
    }

    setSaving(false)
    toast.success(isCall ? 'Call logged' : 'Text logged')
    close()
    onLogged?.()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <SheetContent side="bottom" className="border-zinc-800 bg-zinc-950">
        <SheetHeader className="text-left">
          <SheetTitle>{isCall ? 'Log call' : 'Log text'}</SheetTitle>
          <SheetDescription>
            {isCall
              ? `How did the call with ${who} go?`
              : `Did you send a text to ${who}?`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {isCall ? (
            <div className="grid grid-cols-3 gap-2">
              {OUTCOMES.map((o) => {
                const Icon = o.icon
                const active = outcome === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => setOutcome(o.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-center transition-all active:scale-95',
                      'hover:border-zinc-600',
                      o.accent,
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-xs font-medium leading-tight">{o.label}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {o.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
              <MessageSquare
                className="mt-0.5 h-5 w-5 shrink-0 text-sky-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {`We can't tell whether the message actually left your phone, so only confirm if you sent it. Nothing is recorded otherwise.`}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="contact-notes">Notes (optional)</Label>
            <Textarea
              id="contact-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isCall ? 'What did they say?' : 'What did you send?'}
              rows={3}
              className="resize-none border-zinc-700 bg-zinc-900"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 bg-transparent"
              onClick={close}
              disabled={saving}
            >
              {isCall ? 'Cancel' : "Didn't send"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || (isCall && !outcome)}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving
                </>
              ) : isCall ? (
                'Save'
              ) : (
                'Yes, I sent it'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
