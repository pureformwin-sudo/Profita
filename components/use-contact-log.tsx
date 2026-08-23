'use client'

import { useCallback, useState } from 'react'
import { LogContactSheet } from '@/components/log-contact-sheet'
import { SendTextSheet } from '@/components/send-text-sheet'
import type { ActivitySubject } from '@/lib/lead-activity-storage'

type Pending = {
  mode: 'call' | 'text'
  subject: ActivitySubject
  contactName: string
  repEmployeeId: string | null
  phone: string | null
}

/**
 * Shared plumbing for the Call and Text buttons. Every one in the app goes
 * through this so behaviour is identical everywhere.
 *
 *   const { requestText, requestLog, contactSheets } = useContactLog()
 *   ...
 *   <Button onClick={() => requestText({ customerId: c.id }, c.name, c.phone)}>Text</Button>
 *   <a href={`tel:${c.phone}`} onClick={() => requestLog('call', { customerId: c.id }, c.name)}>Call</a>
 *   ...
 *   {contactSheets}
 *
 * The two channels behave differently on purpose:
 *
 * - **Text** sends in-app through Quo. `requestText` opens a compose box; the
 *   server sends it and writes the timeline entry itself, so there is no
 *   "did you send it?" step. Do NOT pair this with an `sms:` link.
 * - **Call** is still a device handoff — Quo has no API to place a call — so the
 *   `tel:` navigation happens natively and `requestLog('call', …)` queues the
 *   outcome prompt for when the user returns. That prompt is the only way a call
 *   dialed outside the Quo app gets recorded.
 */
export function useContactLog(onLogged?: (subject: ActivitySubject) => void) {
  const [pending, setPending] = useState<Pending | null>(null)

  /** Queue the post-call outcome prompt. Only meaningful for mode 'call'. */
  const requestLog = useCallback(
    (
      mode: 'call' | 'text',
      subject: ActivitySubject,
      contactName: string,
      repEmployeeId: string | null = null,
      phone: string | null = null,
    ) => {
      // Without a subject there is nothing to attach the activity to, and the
      // DB would reject the row anyway. Skip the prompt rather than showing a
      // sheet that can only fail on save.
      if (!subject.leadId && !subject.customerId && !subject.jobId) return
      setPending({ mode, subject, contactName, repEmployeeId, phone })
    },
    [],
  )

  /** Open the in-app compose box for a real Quo send. */
  const requestText = useCallback(
    (
      subject: ActivitySubject,
      contactName: string,
      phone: string | null = null,
      repEmployeeId: string | null = null,
    ) => {
      if (!subject.leadId && !subject.customerId && !subject.jobId) return
      setPending({ mode: 'text', subject, contactName, repEmployeeId, phone })
    },
    [],
  )

  const contactSheets = !pending ? null : pending.mode === 'text' ? (
    <SendTextSheet
      open
      onOpenChange={(next) => !next && setPending(null)}
      subject={pending.subject}
      contactName={pending.contactName}
      phone={pending.phone}
      repEmployeeId={pending.repEmployeeId}
      onSent={() => {
        const { subject } = pending
        setPending(null)
        onLogged?.(subject)
      }}
    />
  ) : (
    <LogContactSheet
      open
      onOpenChange={(next) => !next && setPending(null)}
      mode={pending.mode}
      subject={pending.subject}
      contactName={pending.contactName}
      repEmployeeId={pending.repEmployeeId}
      onLogged={() => {
        const { subject } = pending
        setPending(null)
        onLogged?.(subject)
      }}
    />
  )

  return { requestText, requestLog, contactSheets }
}
