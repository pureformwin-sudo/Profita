/**
 * Server-side outbound SMS orchestration for Quo.
 *
 * Everything here runs on the server only — the Quo API key must never reach the
 * browser. Routes are thin wrappers around these functions so single and bulk
 * sends share the exact same opt-out enforcement, logging, and personalization.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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
    // get_my_membership is RETURNS TABLE, so supabase-js hands back an ARRAY of
    // rows, not a single object. Reading .company_id straight off the result is
    // always undefined — which made a legitimate non-owner member look like they
    // had no company at all. Handle both shapes so this survives the function
    // later being changed to RETURNS a single row.
    const { data: membership } = await supabase.rpc('get_my_membership')
    const row = Array.isArray(membership) ? membership[0] : membership
    companyId = (row as any)?.company_id ?? null
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

  console.log('[v0] resolveSendContext companyId=', companyId, 'settingsKeys=', company?.settings ? Object.keys(company.settings as any) : null, 'quo=', (company?.settings as any)?.quo_phone_number)

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
  vars: { name?: string | null; company?: string | null },
): string {
  const full = (vars.name ?? '').trim()
  const first = full ? full.split(/\s+/)[0] : ''

  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, full)
    .replace(/\{\{\s*company\s*\}\}/gi, (vars.company ?? '').trim())
}

/** True when the template references a name that this recipient doesn't have. */
export function templateNeedsMissingName(template: string, name: string | null): boolean {
  const usesName = /\{\{\s*(first_)?name\s*\}\}/i.test(template)
  return usesName && !(name ?? '').trim()
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
    const supabase = await createClient()
    await supabase.from('quo_outbound_messages').insert({
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
  } catch (err) {
    console.warn(
      '[Quo send] Failed to write audit row:',
      err instanceof Error ? err.message : 'unknown',
    )
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
  opts: { batchId?: string | null; appendStopFooter?: boolean } = {},
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

  let body = renderTemplate(template, { name: recipient.name })
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
  return outcome
}

/** Small delay so bulk runs stay under Quo's 10 req/sec write limit. */
export function sendDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, QUO_SEND_INTERVAL_MS))
}
