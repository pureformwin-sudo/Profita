'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Phone, Voicemail, PhoneOff, Loader2 } from 'lucide-react'
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
import { logCall, logVoicemail } from '@/lib/lead-activity-storage'
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

export function LogCallSheet({
  open,
  onOpenChange,
  leadId,
  leadName,
  repEmployeeId,
  onLogged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  leadName: string
  repEmployeeId: string | null
  onLogged?: () => void
}) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setOutcome(null)
    setNotes('')
  }

  const handleSave = async () => {
    if (!outcome || saving) return
    setSaving(true)

    // 'voicemail' is its own activity_type in the DB, so route it separately
    // rather than flattening every attempt into a generic 'call'.
    const ok =
      outcome === 'voicemail'
        ? await logVoicemail({
            leadId,
            repEmployeeId,
            notes: notes.trim() || undefined,
          })
        : await logCall({
            leadId,
            repEmployeeId,
            outcome,
            notes: notes.trim() || undefined,
          })

    if (!ok) {
      setSaving(false)
      toast.error('Could not save call log')
      return
    }

    // Actually persist the touch instead of only reflecting it in local state:
    // last_contact_at drives follow-up tracking, and updateLead also refreshes
    // updated_at, which is what the lead cards render as "x ago".
    const touched = await updateLead(leadId, {
      last_contact_at: new Date().toISOString(),
    })

    setSaving(false)

    if (!touched) {
      // The activity row did save, so don't imply the whole thing failed.
      toast.warning('Call logged, but last-contact time did not update')
      reset()
      onOpenChange(false)
      onLogged?.()
      return
    }

    toast.success('Call logged')
    reset()
    onOpenChange(false)
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
          <SheetTitle>Log call</SheetTitle>
          <SheetDescription>
            {`How did the call with ${leadName || 'this lead'} go?`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
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

          <div className="space-y-2">
            <Label htmlFor="call-notes">Notes (optional)</Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did they say?"
              rows={3}
              className="resize-none border-zinc-700 bg-zinc-900"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 bg-transparent"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!outcome || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
