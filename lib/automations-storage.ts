/**
 * Persistence for message automations.
 *
 * Automation *types* are defined in code (see `lib/message-automations.ts`);
 * this module stores each company's per-type configuration and reads the ledger
 * of what has already been sent.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  listAutomationTypes,
  resolveAutomationConfig,
  type AutomationConfig,
  type AutomationTypeId,
} from '@/lib/message-automations'

/** Postgres code for "relation does not exist" — migration not yet applied. */
const UNDEFINED_TABLE = '42P01'

export type LoadAutomationsResult = {
  configs: AutomationConfig[]
  /** True when the automations tables are missing, so the UI can show setup SQL. */
  needsSetup: boolean
}

/**
 * Every known automation type for a company, saved or not.
 *
 * Types with no DB row yet resolve to their code defaults (disabled), so the UI
 * can render a complete list without pre-seeding rows for companies that have
 * never opened the automations tab.
 */
export async function loadAutomations(
  companyId: string,
): Promise<LoadAutomationsResult> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('message_automations')
    .select('*')
    .eq('company_id', companyId)

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { configs: [], needsSetup: true }
    }
    throw new Error(`Failed to load automations: ${error.message}`)
  }

  const byType = new Map<string, Record<string, unknown>>()
  for (const row of data ?? []) {
    byType.set(row.automation_type as string, row)
  }

  const configs = listAutomationTypes().map((type) =>
    resolveAutomationConfig(type, byType.get(type.id) ?? null),
  )

  return { configs, needsSetup: false }
}

/**
 * Upsert one automation's configuration.
 *
 * Keyed on (company_id, automation_type) so saving is idempotent whether or not
 * a row already exists.
 */
export async function saveAutomation(
  companyId: string,
  userId: string,
  automationType: AutomationTypeId,
  config: Omit<AutomationConfig, 'automationType'>,
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('message_automations').upsert(
    {
      company_id: companyId,
      user_id: userId,
      automation_type: automationType,
      enabled: config.enabled,
      message_body: config.messageBody,
      delay_minutes: config.delayMinutes,
      quiet_hours_start: config.quietHoursStart,
      quiet_hours_end: config.quietHoursEnd,
      cooldown_days: config.cooldownDays,
      timezone: config.timezone,
    },
    { onConflict: 'company_id,automation_type' },
  )

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      throw new Error(
        'The automations tables are missing. Run migration 019-message-automations.sql.',
      )
    }
    throw new Error(`Failed to save automation: ${error.message}`)
  }
}

/** Key inside `companies.settings` holding the public review URL. */
const REVIEW_LINK_KEY = 'google_review_link'

/**
 * Service-role client for `companies.settings` access.
 *
 * RLS on `companies` is `owner_user_id = auth.uid()`, so a sales_rep or crew
 * member cannot read the row at all — through the user client they would see an
 * empty review link and be told to fill in a field that is already set. Callers
 * pass a `companyId` they have already proven membership of via
 * `resolveSendContext()`, so this only widens the read to their own tenant.
 * This mirrors what `resolveSendContext()` does for the Quo number.
 */
function companySettingsClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * The company's public review URL.
 *
 * Stored on `companies.settings` rather than the user-scoped `settings` table
 * because the cron sender has no session — it resolves everything by company.
 */
export async function getReviewLink(companyId: string): Promise<string> {
  const { data, error } = await companySettingsClient()
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load review link: ${error.message}`)

  const settings = (data?.settings ?? {}) as Record<string, unknown>
  return typeof settings[REVIEW_LINK_KEY] === 'string'
    ? (settings[REVIEW_LINK_KEY] as string)
    : ''
}

/**
 * Save the review URL, preserving every other key in `settings`.
 *
 * Read-modify-write is required here: `settings` also carries the company's Quo
 * line, and writing a fresh object would silently disable all texting.
 */
export async function saveReviewLink(
  companyId: string,
  link: string,
): Promise<void> {
  const admin = companySettingsClient()

  const { data, error: readErr } = await admin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle()

  if (readErr) throw new Error(`Failed to read settings: ${readErr.message}`)

  const settings = { ...((data?.settings ?? {}) as Record<string, unknown>) }
  const trimmed = link.trim()
  if (trimmed) settings[REVIEW_LINK_KEY] = trimmed
  else delete settings[REVIEW_LINK_KEY]

  const { error } = await admin
    .from('companies')
    .update({ settings })
    .eq('id', companyId)

  if (error) throw new Error(`Failed to save review link: ${error.message}`)
}

export type AutomationSendRow = {
  id: string
  automationType: string
  jobId: string | null
  customerId: string | null
  customerName: string | null
  outcome: 'sent' | 'skipped' | 'failed'
  detail: string | null
  createdAt: string
}

/**
 * Recent ledger entries, newest first.
 *
 * Skipped and failed rows are included on purpose: "why didn't this send?" is
 * the question this list exists to answer.
 */
export async function loadRecentAutomationSends(
  companyId: string,
  limit = 25,
): Promise<AutomationSendRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('automation_sends')
    .select(
      'id, automation_type, job_id, customer_id, outcome, detail, created_at, customers(name)',
    )
    .eq('company_id', companyId)
    .neq('detail', 'claimed')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === UNDEFINED_TABLE) return []
    throw new Error(`Failed to load automation history: ${error.message}`)
  }

  return (data ?? []).map((row) => {
    const customer = row.customers as { name?: string | null } | null
    return {
      id: row.id as string,
      automationType: row.automation_type as string,
      jobId: (row.job_id as string) ?? null,
      customerId: (row.customer_id as string) ?? null,
      customerName: customer?.name ?? null,
      outcome: row.outcome as 'sent' | 'skipped' | 'failed',
      detail: (row.detail as string) ?? null,
      createdAt: row.created_at as string,
    }
  })
}
