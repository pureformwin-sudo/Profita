/**
 * Server-side outbound SMS orchestration for Quo.
 *
 * Everything here runs on the server only — the Quo API key must never reach the
 * browser. Routes are thin wrappers around these functions so single and bulk
 * sends share the exact same opt-out enforcement, logging, and personalization.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchMyMembershipCompanyId } from './membership-rpc'
import {
  normalizePhoneE164,
  sendQuoMessage,
  QUO_SEND_INTERVAL_MS,
  type QuoSendResult,
} from '@/lib/quo-api'

/** Appended to bulk sends so every mass text carries an opt-out path (TCPA). */
export const STOP_FOOTER = ' Reply STOP to opt out.'

export type SendContext = {
  userId: string
  companyId: string
  /** The company's own Quo line, used as the `from` number. */
  fromNumber: string
  /**
   * Write audit/timeline rows with the service role instead of the cookie client.
   *
   * Required for background senders (cron automations): there is no session, so
   * the cookie client has no `auth.uid()` and every logging insert is silently
   * refused by RLS. The text would still go out while leaving no audit row and
   * no timeline entry. Request paths leave this unset and stay under RLS.
   */
  useServiceRole?: boolean
}

/**
 * Client used for logging writes.
 *
 * Background callers need the service role (see `SendContext.useServiceRole`);
 * everyone else keeps the RLS-scoped cookie client.
 */
async function dbForLogging(ctx: SendContext) {
  if (ctx.useServiceRole) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return await createClient()
}

/**
 * 'adhoc' is a bare phone number with no CRM record behind it. It must stay
 * distinct from 'customer'/'lead' because customer_id and lead_id are uuid
 * columns — writing a phone string into either one fails the insert and loses
 * the audit row.
 */
export type RecipientKind = 'customer' | 'lead' | 'adhoc'

export type RecipientInput = {
  /** customer id, lead id, or the normalized phone for an ad-hoc send */
  id: string
  kind: RecipientKind
  name: string | null
  phone: string | null
}

export type SendOutcome = {
  recipientId: string
  kind: RecipientKind
  name: string | null
  phone: string | null
  normalizedPhone: string | null
  status: 'sent' | 'failed' | 'skipped'
  skipReason?: string
  error?: string
  quoMessageId?: string | null
  body?: string
  /**
   * Timeline row written for this send, when `activitySubject` was supplied.
   * Automations store it so a ledger entry can point at the visible activity.
   */
  leadActivityId?: string | null
}

/**
 * Resolve the acting user, their company, and the company's Quo sending number.
 *
 * The `from` number is read from company settings rather than hardcoded, because
 * that same value is what the inbound webhook uses to map a delivery back to a
 * tenant — keeping one source of truth for "which line is ours".
 */
export async function resolveSendContext(): Promise<
  { ok: true; ctx: SendContext } | { ok: false; error: string; status: number }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Unauthorized', status: 401 }

  // Owner first, then membership — mirrors getUserCompanyId() used elsewhere.
  let companyId: string | null = null
  const { data: owned } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (owned?.id) {
    companyId = owned.id
  } else {
    // Use the shared helper: get_my_membership RETURNS TABLE, so the raw result
    // is an array and reading .company_id directly off it is always undefined,
    // which made a legitimate non-owner member look like they had no company.
    companyId = await fetchMyMembershipCompanyId(supabase)
  }
  if (!companyId) {
    return { ok: false, error: 'No company found for this user', status: 403 }
  }

  // Read the company's settings with the service role, NOT the user client.
  // RLS on `companies` is `owner_user_id = auth.uid()`, so a sales_rep or crew
  // member cannot see the row at all — through the user client they'd get null
  // settings and a misleading "no Quo number configured" error even though the
  // company has one. The user is already authenticated and companyId came from
  // their own ownership/membership above, so this only widens the read to the
  // tenant they legitimately belong to.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data: company } = await admin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle()

  const configured = (company?.settings as any)?.quo_phone_number as string | undefined
  const fromNumber = normalizePhoneE164(configured)
  if (!fromNumber) {
    return {
      ok: false,
      error:
        'No Quo phone number configured for this company. Set settings.quo_phone_number first.',
      status: 400,
    }
  }

  return { ok: true, ctx: { userId: user.id, companyId, fromNumber } }
}

/**
 * Fill {{placeholders}} in a message template.
 *
 * Unknown placeholders are left visible on purpose: silently blanking them
 * produces texts like "Hi , your service is due" going out to 168 people.
 */
export function renderTemplate(
  template: string,
  vars: {
    name?: string | null
    company?: string | null
    /** Public review URL, used by the Review Request automation. */
    reviewLink?: string | null
  },
): string {
  const full = (vars.name ?? '').trim()
  const first = full ? full.split(/\s+/)[0] : ''

  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, full)
    .replace(/\{\{\s*company\s*\}\}/gi, (vars.company ?? '').trim())
    // Only substitute when there is an actual URL. Replacing with '' would
    // erase the token, which reads as "fully rendered" to
    // findUnrenderedTokens() and lets a review request go out with no link in
    // it. Leaving the token intact is what makes that guard able to refuse.
    .replace(/\{\{\s*review_link\s*\}\}/gi, (m) => (vars.reviewLink ?? '').trim() || m)
}

/** True when the template references a name that this recipient doesn't have. */
export function templateNeedsMissingName(template: string, name: string | null): boolean {
  const usesName = /\{\{\s*(first_)?name\s*\}\}/i.test(template)
  return usesName && !(name ?? '').trim()
}

/**
 * Any `{{token}}` left in a rendered message.
 *
 * Automated sends have no human reviewing the draft, so this is the last guard
 * before a customer receives a literal "{{review_link}}". Callers treat a
 * non-empty result as a hard stop rather than sending anyway.
 */
export function findUnrenderedTokens(rendered: string): string[] {
  const left = new Set<string>()
  for (const match of rendered.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    left.add(match[1].toLowerCase())
  }
  return [...left]
}

/**
 * Load recipients by id, along with their opt-out state.
 *
 * Scoped to the caller's company so a crafted id list cannot reach another
 * tenant's contacts.
 */
export async function loadRecipients(
  companyId: string,
  ids: { customerIds: string[]; leadIds: string[] },
): Promise<Array<RecipientInput & { optedOut: boolean }>> {
  const supabase = await createClient()
  const out: Array<RecipientInput & { optedOut: boolean }> = []

  if (ids.customerIds.length > 0) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, sms_opt_out')
      .eq('company_id', companyId)
      .in('id', ids.customerIds)
    for (const r of data ?? []) {
      out.push({
        id: r.id,
        kind: 'customer',
        name: r.name,
        phone: r.phone,
        optedOut: Boolean(r.sms_opt_out),
      })
    }
  }

  if (ids.leadIds.length > 0) {
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, sms_opt_out')
      .eq('company_id', companyId)
      .in('id', ids.leadIds)
    for (const r of data ?? []) {
      out.push({
        id: r.id,
        kind: 'lead',
        name: r.name,
        phone: r.phone,
        optedOut: Boolean(r.sms_opt_out),
      })
    }
  }

  return out
}

export type AudienceEntry = {
  id: string
  kind: RecipientKind
  name: string | null
  phone: string | null
  normalizedPhone: string
  optedOut: boolean
  /** Other contact rows that share this same normalized number. */
  duplicateOf: string[]
}

export type Audience = {
  entries: AudienceEntry[]
  stats: {
    totalRows: number
    unusablePhone: number
    optedOut: number
    duplicatesCollapsed: number
    sendable: number
  }
}

/**
 * Build the bulk audience: one entry per DISTINCT phone number.
 *
 * Deduping matters — the customer table has several rows sharing a number (one
 * appears 8 times), so a naive per-row loop would text that person 8 times.
 * The first row for a number wins and the rest are recorded as duplicates so the
 * UI can show what was collapsed.
 */
export async function loadAudience(companyId: string): Promise<Audience> {
  const supabase = await createClient()

  const [{ data: customers }, { data: leads }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, sms_opt_out')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
    supabase
      .from('leads')
      .select('id, name, phone, sms_opt_out')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
  ])

  const rows: Array<{
    id: string
    kind: RecipientKind
    name: string | null
    phone: string | null
    optedOut: boolean
  }> = [
    ...(customers ?? []).map((c) => ({
      id: c.id,
      kind: 'customer' as const,
      name: c.name,
      phone: c.phone,
      optedOut: Boolean(c.sms_opt_out),
    })),
    ...(leads ?? []).map((l) => ({
      id: l.id,
      kind: 'lead' as const,
      name: l.name,
      phone: l.phone,
      optedOut: Boolean(l.sms_opt_out),
    })),
  ]

  const byPhone = new Map<string, AudienceEntry>()
  let unusablePhone = 0
  let duplicatesCollapsed = 0

  for (const row of rows) {
    const normalized = normalizePhoneE164(row.phone)
    if (!normalized) {
      // Includes rows where a surname was typed into the phone column.
      unusablePhone += 1
      continue
    }

    const existing = byPhone.get(normalized)
    if (existing) {
      duplicatesCollapsed += 1
      existing.duplicateOf.push(row.id)
      // If any row for this number is opted out, respect that for the number.
      if (row.optedOut) existing.optedOut = true
      // Prefer a real name over a blank one.
      if (!existing.name && row.name) existing.name = row.name
      continue
    }

    byPhone.set(normalized, {
      id: row.id,
      kind: row.kind,
      name: row.name,
      phone: row.phone,
      normalizedPhone: normalized,
      optedOut: row.optedOut,
      duplicateOf: [],
    })
  }

  const entries = [...byPhone.values()].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  )
  const optedOut = entries.filter((e) => e.optedOut).length

  return {
    entries,
    stats: {
      totalRows: rows.length,
      unusablePhone,
      optedOut,
      duplicatesCollapsed,
      sendable: entries.length - optedOut,
    },
  }
}

/** Write one row to the outbound audit log. Never throws into the send path. */
async function logOutbound(
  ctx: SendContext,
  o: SendOutcome,
  batchId: string | null,
): Promise<void> {
  try {
    const supabase = await dbForLogging(ctx)
    const { error } = await supabase.from('quo_outbound_messages').insert({
      company_id: ctx.companyId,
      user_id: ctx.userId,
      // 'adhoc' leaves both null — recipientId is a phone number there, and
      // these columns are uuids.
      customer_id: o.kind === 'customer' ? o.recipientId : null,
      lead_id: o.kind === 'lead' ? o.recipientId : null,
      from_number: ctx.fromNumber,
      to_number: o.normalizedPhone ?? o.phone ?? 'unknown',
      contact_number: o.normalizedPhone ?? o.phone ?? 'unknown',
      body: o.body ?? '',
      status: o.status,
      skip_reason: o.skipReason ?? null,
      quo_message_id: o.quoMessageId ?? null,
      error: o.error ?? null,
      batch_id: batchId,
    })

    // supabase-js resolves with { error } instead of throwing, so the catch
    // below never fires for a query-level failure. Without this check an RLS
    // denial (42501) was discarded in complete silence, which is how the audit
    // log stayed empty while sends were being attempted. Log loudly: this table
    // is the compliance record of what we texted, so a dropped write matters
    // even though it must not break the send itself.
    if (error) {
      console.error(
        `[Quo send] AUDIT LOG WRITE FAILED (${error.code ?? 'unknown'}): ${error.message}` +
          ` -- status=${o.status} to=${o.normalizedPhone ?? o.phone ?? 'unknown'}`,
      )
    }
  } catch (err) {
    console.warn(
      '[Quo send] Failed to write audit row:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}

/**
 * Write the CRM timeline entry for an in-app text.
 *
 * Stamps `quo_message_id` / `quo_object_id` so the inbound `message.delivered`
 * webhook recognizes this row and enriches it instead of logging the same text a
 * second time. Never throws into the send path — the message is already gone, so
 * a timeline failure must not surface as a send failure.
 */
async function logSentTextActivity(
  ctx: SendContext,
  o: SendOutcome,
  subject: { leadId?: string | null; customerId?: string | null; jobId?: string | null },
  repEmployeeId: string | null,
): Promise<string | null> {
  if (!subject.leadId && !subject.customerId && !subject.jobId) return null

  try {
    const supabase = await dbForLogging(ctx)
    const { data, error } = await supabase.from('lead_activities').insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      lead_id: subject.leadId ?? null,
      customer_id: subject.customerId ?? null,
      job_id: subject.jobId ?? null,
      rep_employee_id: repEmployeeId,
      // Must be 'sms': the activity_type CHECK constraint has no 'text' value.
      activity_type: 'sms',
      notes: o.body ?? null,
      metadata: {
        channel: 'quo_in_app',
        direction: 'outgoing',
        to_number: o.normalizedPhone ?? o.phone ?? null,
        quo_message_id: o.quoMessageId ?? null,
        // Webhook dedupe matches on metadata->>quo_object_id.
        quo_object_id: o.quoMessageId ?? null,
      },
    })
      .select('id')
      .maybeSingle()
    if (error) {
      console.error(
        `[Quo send] TIMELINE WRITE FAILED (${error.code ?? 'unknown'}): ${error.message}`,
      )
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.warn(
      '[Quo send] Failed to write timeline activity:',
      err instanceof Error ? err.message : 'unknown',
    )
    return null
  }
}

/**
 * Send to one recipient, enforcing opt-out and logging the result.
 *
 * Returns a per-recipient outcome rather than throwing, so a bulk run keeps
 * going when a single number is bad.
 */
export async function sendToRecipient(
  ctx: SendContext,
  recipient: RecipientInput & { optedOut?: boolean },
  template: string,
  opts: {
    batchId?: string | null
    appendStopFooter?: boolean
    /**
     * When set, a successful send also writes a `lead_activities` row so the text
     * lands on the CRM timeline.
     *
     * Opt-in rather than automatic: bulk blasts would otherwise push hundreds of
     * entries onto lead timelines, and the inbound webhook already logs those.
     * Single sends from a Call/Text button pass this; the Messages page does not.
     *
     * This is also the ONLY place job context can be recorded — Quo's webhook
     * only ever sees a phone number, so it can never know which job a text
     * belonged to.
     */
    activitySubject?: {
      leadId?: string | null
      customerId?: string | null
      jobId?: string | null
    }
    repEmployeeId?: string | null
    /**
     * Extra template values beyond the recipient's name.
     *
     * Automations need this: the Review Request body contains `{{review_link}}`,
     * and without a value here it would render as literal text in the customer's
     * message. Manual sends omit it and behave exactly as before.
     */
    templateVars?: { company?: string | null; reviewLink?: string | null }
    /**
     * Refuse to send if any `{{token}}` is still unresolved after rendering.
     *
     * Automated sends have nobody proofreading the draft, so a missing value has
     * to fail loudly instead of texting a customer a raw placeholder.
     */
    requireFullyRendered?: boolean
  } = {},
): Promise<SendOutcome> {
  const base: SendOutcome = {
    recipientId: recipient.id,
    kind: recipient.kind,
    name: recipient.name,
    phone: recipient.phone,
    normalizedPhone: normalizePhoneE164(recipient.phone),
    status: 'skipped',
  }

  if (recipient.optedOut) {
    const o = { ...base, status: 'skipped' as const, skipReason: 'opted_out' }
    await logOutbound(ctx, o, opts.batchId ?? null)
    return o
  }
  if (!base.normalizedPhone) {
    const o = { ...base, status: 'skipped' as const, skipReason: 'invalid_phone' }
    await logOutbound(ctx, o, opts.batchId ?? null)
    return o
  }

  // A nameless recipient renders "Hi , thanks again..." — fine to let a human
  // notice and fix in the composer, not fine to mail out unattended.
  if (opts.requireFullyRendered && templateNeedsMissingName(template, recipient.name)) {
    const o = {
      ...base,
      status: 'skipped' as const,
      skipReason: 'missing_recipient_name',
    }
    await logOutbound(ctx, o, opts.batchId ?? null)
    return o
  }

  let body = renderTemplate(template, {
    name: recipient.name,
    company: opts.templateVars?.company ?? null,
    reviewLink: opts.templateVars?.reviewLink ?? null,
  })

  // Stop before the Quo call, not after: once the API accepts the message the
  // customer has already received the placeholder and nothing can undo it.
  if (opts.requireFullyRendered) {
    const unresolved = findUnrenderedTokens(body)
    if (unresolved.length > 0) {
      const o = {
        ...base,
        status: 'skipped' as const,
        skipReason: `unresolved_template:${unresolved.join(',')}`,
        body,
      }
      await logOutbound(ctx, o, opts.batchId ?? null)
      return o
    }
  }

  if (opts.appendStopFooter && !/\bstop\b/i.test(body)) {
    body += STOP_FOOTER
  }

  const result: QuoSendResult = await sendQuoMessage({
    to: base.normalizedPhone,
    from: ctx.fromNumber,
    body,
  })

  const outcome: SendOutcome = result.ok
    ? { ...base, status: 'sent', quoMessageId: result.messageId, body }
    : { ...base, status: 'failed', error: result.error, body }

  await logOutbound(ctx, outcome, opts.batchId ?? null)

  // Only successful sends reach the timeline. A failed send is already captured
  // in the audit table; putting it on the customer's history would read as if we
  // had contacted them.
  if (outcome.status === 'sent' && opts.activitySubject) {
    const activityId = await logSentTextActivity(
      ctx,
      outcome,
      opts.activitySubject,
      opts.repEmployeeId ?? null,
    )
    if (activityId) outcome.leadActivityId = activityId
  }

  return outcome
}

/** Small delay so bulk runs stay under Quo's 10 req/sec write limit. */
export function sendDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, QUO_SEND_INTERVAL_MS))
}
