'use client'

import { useCallback, useState } from 'react'
import { LogContactSheet } from '@/components/log-contact-sheet'
import type { ActivitySubject } from '@/lib/lead-activity-storage'

type Pending = {
  mode: 'call' | 'text'
  subject: ActivitySubject
  contactName: string
  repEmployeeId: string | null
}

/**
 * Shared plumbing for "hand off to the device, then prompt to log it".
 *
 * Every call/text button in the app goes through this so the behaviour is
 * identical everywhere instead of being re-implemented per page:
 *
 *   const { requestLog, logSheet } = useContactLog()
 *   ...
 *   <a href={`tel:${lead.phone}`} onClick={() => requestLog('call', { leadId: lead.id }, lead.name)}>
 *   ...
 *   {logSheet}
 *
 * The `tel:`/`sms:` navigation still happens natively; this only queues the
 * prompt so it is waiting when the user comes back to the app.
 */
export function useContactLog(onLogged?: () => void) {
  const [pending, setPending] = useState<Pending | null>(null)

  const requestLog = useCallback(
    (
      mode: 'call' | 'text',
      subject: ActivitySubject,
      contactName: string,
      repEmployeeId: string | null = null,
    ) => {
      // Without a subject there is nothing to attach the activity to, and the
      // DB would reject the row anyway. Skip the prompt rather than showing a
      // sheet that can only fail on save.
      if (!subject.leadId && !subject.customerId && !subject.jobId) return
      setPending({ mode, subject, contactName, repEmployeeId })
    },
    [],
  )

  const logSheet = pending ? (
    <LogContactSheet
      open
      onOpenChange={(next) => !next && setPending(null)}
      mode={pending.mode}
      subject={pending.subject}
      contactName={pending.contactName}
      repEmployeeId={pending.repEmployeeId}
      onLogged={() => {
        setPending(null)
        onLogged?.()
      }}
    />
  ) : null

  return { requestLog, logSheet }
}
