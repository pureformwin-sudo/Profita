/**
 * Persistence for message automations.
 *
 * Automation *types* are defined in code (see `lib/message-automations.ts`);
 * this module stores each company's per-type configuration and reads the ledger
 * of what has already been sent.
 */

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
