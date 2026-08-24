/**
 * Sweeps due message automations and sends them.
 *
 * Runs on a schedule (see vercel.json). Each pass finds jobs whose completion
 * delay has elapsed, claims them so overlapping runs can't double-send, and
 * sends through the same Quo path the manual Messages composer uses.
 */

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  getAutomationType,
  resolveAutomationConfig,
  type AutomationTypeId,
} from '@/lib/message-automations'
import { sendToRecipient, type SendContext } from '@/lib/quo-send'

/**
 * Never send for work finished longer ago than this.
 *
 * If the cron is paused or broken for a week, the backlog of "due" jobs must not
 * all fire at once — a customer would get a review request for work they've
 * forgotten about.
 */
const MAX_AGE_HOURS = 48

/** Jobs processed per run, so one pass can't hang on a huge backlog. */
const BATCH_LIMIT = 50

type JobRow = {
  id: string
  company_id: string
  customer_id: string | null
  completed_at: string
  title: string | null
}

/** Local hour (0-23) in the given IANA zone. */
function localHour(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(at)
    const hour = parts.find((p) => p.type === 'hour')?.value
    return hour ? Number(hour) % 24 : at.getUTCHours()
  } catch {
    // Bad zone string saved in config — fall back to UTC rather than throwing
    // and stalling every automation for the company.
    return at.getUTCHours()
  }
}

function withinQuietHours(at: Date, config: {
  quietHoursStart: number
  quietHoursEnd: number
  timezone: string
}): boolean {
  const hour = localHour(at, config.timezone)
  return hour >= config.quietHoursStart && hour < config.quietHoursEnd
}

export async function GET(request: Request) {
  // Fail closed. This endpoint texts customers, so an unauthenticated caller
  // must never be able to trigger a sweep — unlike read-only crons, "no secret
  // configured" is a misconfiguration, not a reason to run openly.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Automations cron] CRON_SECRET is not set; refusing to run.')
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const now = new Date()
  const summary = { considered: 0, sent: 0, skipped: 0, failed: 0, deferred: 0 }

  // Only enabled automations matter; a disabled one shouldn't cost a job query.
  const { data: automations, error: autoErr } = await supabase
    .from('message_automations')
    .select('*')
    .eq('enabled', true)

  if (autoErr) {
    console.error('[Automations cron] Failed to load automations:', autoErr.message)
    return NextResponse.json({ error: autoErr.message }, { status: 500 })
  }

  for (const row of automations ?? []) {
    const automationType = row.automation_type as AutomationTypeId
    const def = getAutomationType(automationType)
    if (!def) {
      // A row for a type this build doesn't know about (rolled-back deploy).
      console.warn(`[Automations cron] Unknown automation type: ${automationType}`)
      continue
    }

    // Same defaults-merge the UI uses, so what's displayed is what runs.
    const config = resolveAutomationConfig(def, row)
    const companyId = row.company_id as string

    // Outside the window, leave everything untouched. The delay condition still
    // holds next run, so these jobs are deferred rather than dropped.
    if (!withinQuietHours(now, config)) {
      summary.deferred += 1
      continue
    }

    const dueBefore = new Date(now.getTime() - config.delayMinutes * 60_000)
    const notOlderThan = new Date(now.getTime() - MAX_AGE_HOURS * 3_600_000)

    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, company_id, customer_id, completed_at, title')
      .eq('company_id', companyId)
      .in('status', def.triggerStatuses)
      .not('completed_at', 'is', null)
      .lte('completed_at', dueBefore.toISOString())
      .gte('completed_at', notOlderThan.toISOString())
      .order('completed_at', { ascending: true })
      .limit(BATCH_LIMIT)

    if (jobsErr) {
      console.error('[Automations cron] Job query failed:', jobsErr.message)
      continue
    }

    // The company's own Quo line and owner, needed to build a send context.
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, owner_user_id, settings')
      .eq('id', companyId)
      .maybeSingle()

    const settings = (company?.settings ?? {}) as Record<string, unknown>
    const fromNumber = (settings.quo_phone_number as string) ?? ''
    const reviewLink = (settings.google_review_link as string) ?? ''
    const ownerId = company?.owner_user_id as string | undefined

    for (const job of (jobs ?? []) as JobRow[]) {
      summary.considered += 1

      // Claim the job first. The unique index on
      // (company_id, automation_type, job_id) turns this into the concurrency
      // guard: if another run already claimed it, the insert conflicts and we
      // move on instead of sending a second text.
      const { data: claim, error: claimErr } = await supabase
        .from('automation_sends')
        .insert({
          company_id: companyId,
          automation_type: automationType,
          job_id: job.id,
          customer_id: job.customer_id,
          outcome: 'skipped',
          detail: 'claimed',
        })
        .select('id')
        .maybeSingle()

      if (claimErr || !claim) {
        // Duplicate key = already handled. Anything else is logged and skipped.
        if (claimErr && claimErr.code !== '23505') {
          console.error('[Automations cron] Claim failed:', claimErr.message)
        }
        continue
      }

      const finish = async (
        outcome: 'sent' | 'skipped' | 'failed',
        detail: string,
        leadActivityId?: string | null,
      ) => {
        await supabase
          .from('automation_sends')
          .update({ outcome, detail, lead_activity_id: leadActivityId ?? null })
          .eq('id', claim.id)
      }

      if (!ownerId || !fromNumber) {
        await finish('skipped', !fromNumber ? 'no_quo_line' : 'no_owner')
        summary.skipped += 1
        continue
      }
      if (!job.customer_id) {
        await finish('skipped', 'job_has_no_customer')
        summary.skipped += 1
        continue
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, name, phone, sms_opt_out')
        .eq('id', job.customer_id)
        .maybeSingle()

      if (!customer?.phone) {
        await finish('skipped', 'customer_has_no_phone')
        summary.skipped += 1
        continue
      }

      // Cooldown: a monthly customer shouldn't be asked for a review every
      // visit. Counts only real sends, so skips don't start a cooldown.
      if (config.cooldownDays > 0) {
        const since = new Date(
          now.getTime() - config.cooldownDays * 86_400_000,
        ).toISOString()
        const { data: recent } = await supabase
          .from('automation_sends')
          .select('id')
          .eq('company_id', companyId)
          .eq('automation_type', automationType)
          .eq('customer_id', job.customer_id)
          .eq('outcome', 'sent')
          .gte('created_at', since)
          .limit(1)

        if (recent && recent.length > 0) {
          await finish('skipped', `cooldown_${config.cooldownDays}d`)
          summary.skipped += 1
          continue
        }
      }

      const ctx: SendContext = {
        userId: ownerId,
        companyId,
        fromNumber,
        // No session here, so timeline and audit writes must bypass RLS or they
        // are silently dropped and the send leaves no trace.
        useServiceRole: true,
      }

      try {
        const outcome = await sendToRecipient(
          ctx,
          {
            id: customer.id as string,
            kind: 'customer',
            name: (customer.name as string) ?? null,
            phone: customer.phone as string,
            optedOut: Boolean(customer.sms_opt_out),
          },
          config.messageBody,
          {
            activitySubject: {
              customerId: job.customer_id,
              jobId: job.id,
              leadId: null,
            },
            templateVars: {
              company: (company?.name as string) ?? null,
              reviewLink,
            },
            // Without this a missing review link would text the customer a
            // literal "{{review_link}}".
            requireFullyRendered: true,
          },
        )

        if (outcome.status === 'sent') {
          await finish('sent', 'sent', outcome.leadActivityId ?? null)
          summary.sent += 1
        } else if (outcome.status === 'failed') {
          await finish('failed', outcome.error ?? 'send_failed')
          summary.failed += 1
        } else {
          await finish('skipped', outcome.skipReason ?? 'skipped')
          summary.skipped += 1
        }
      } catch (err) {
        await finish(
          'failed',
          err instanceof Error ? err.message : 'unknown_error',
        )
        summary.failed += 1
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
