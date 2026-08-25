/**
 * Persistence for lead scoring.
 *
 * Only the AI estimate and the manual override are stored. Lifetime spend and
 * the composite score are recomputed on every read so they can never drift out
 * of sync with invoices and jobs — a cached score would go stale the moment a
 * payment landed.
 */

import { createClient } from '@/lib/supabase/server'
import {
  buildScoredLead,
  sortByScore,
  type LeadScoreRecord,
  type ScoredLead,
  type ValueBasis,
  type ValueConfidence,
} from '@/lib/lead-scoring'

/** Job statuses that represent work actually delivered. */
const EARNED_JOB_STATUSES = ['Completed', 'Invoiced', 'Paid', 'Closed'] as const

/** Postgres "relation does not exist" — migration hasn't been run. */
const MISSING_TABLE = '42P01'

export interface LoadLeadsResult {
  leads: ScoredLead[]
  /** True when `lead_scores` is absent, so the UI can show setup SQL. */
  needsSetup: boolean
}

type LeadScoreRow = {
  customer_id: string
  estimated_home_value: string | number | null
  value_low: string | number | null
  value_high: string | number | null
  value_basis: string | null
  confidence: string | null
  confidence_note: string | null
  locality_assumed: boolean | null
  locality_inferred: string | null
  locality_ambiguous: boolean | null
  address_used: string | null
  model: string | null
  estimated_at: string | null
  override_home_value: string | number | null
  override_note: string | null
  override_at: string | null
}

/** numeric columns arrive as strings over the wire. */
function num(v: string | number | null): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

function toRecord(row: LeadScoreRow): LeadScoreRecord {
  return {
    customerId: row.customer_id,
    estimatedHomeValue: num(row.estimated_home_value),
    valueLow: num(row.value_low),
    valueHigh: num(row.value_high),
    valueBasis: (row.value_basis as ValueBasis | null) ?? null,
    confidence: (row.confidence as ValueConfidence | null) ?? null,
    confidenceNote: row.confidence_note,
    localityAssumed: row.locality_assumed ?? false,
    localityInferred: row.locality_inferred ?? null,
    localityAmbiguous: row.locality_ambiguous ?? false,
    addressUsed: row.address_used,
    model: row.model,
    estimatedAt: row.estimated_at,
    overrideHomeValue: num(row.override_home_value),
    overrideNote: row.override_note,
    overrideAt: row.override_at,
  }
}

/**
 * Lifetime spend per customer: collected invoice payments plus the value of
 * delivered jobs.
 *
 * Both sources are needed. Only 77 of 205 customers have a paid invoice, while
 * 185 have job value — a lot of this company's work is recorded as a job and
 * never formally invoiced. Using invoices alone would show $0 for most of the
 * book and make the score meaningless.
 *
 * Jobs are filtered to delivered statuses so a Scheduled job (money not yet
 * earned) does not inflate the figure.
 */
async function loadLifetimeSpend(companyId: string): Promise<Map<string, number>> {
  const supabase = await createClient()
  const spend = new Map<string, number>()

  const [invoices, jobs] = await Promise.all([
    supabase
      .from('invoices')
      .select('customer_id, amount_paid')
      .eq('company_id', companyId)
      .not('customer_id', 'is', null),
    supabase
      .from('jobs')
      .select('customer_id, price, status')
      .eq('company_id', companyId)
      .in('status', EARNED_JOB_STATUSES as unknown as string[])
      .not('customer_id', 'is', null),
  ])

  for (const row of invoices.data ?? []) {
    const id = row.customer_id as string | null
    if (!id) continue
    const paid = num(row.amount_paid as string | number | null) ?? 0
    if (paid > 0) spend.set(id, (spend.get(id) ?? 0) + paid)
  }

  for (const row of jobs.data ?? []) {
    const id = row.customer_id as string | null
    if (!id) continue
    const price = num(row.price as string | number | null) ?? 0
    if (price > 0) spend.set(id, (spend.get(id) ?? 0) + price)
  }

  return spend
}

/** Load every customer with spend, estimate, and computed score, ranked. */
export async function loadScoredLeads(companyId: string): Promise<LoadLeadsResult> {
  const supabase = await createClient()

  const [customersRes, scoresRes, spend] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, address')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
    supabase.from('lead_scores').select('*').eq('company_id', companyId),
    loadLifetimeSpend(companyId),
  ])

  if (scoresRes.error?.code === MISSING_TABLE) {
    return { leads: [], needsSetup: true }
  }
  if (customersRes.error) {
    throw new Error(customersRes.error.message)
  }

  const byCustomer = new Map<string, LeadScoreRecord>()
  for (const row of (scoresRes.data ?? []) as LeadScoreRow[]) {
    byCustomer.set(row.customer_id, toRecord(row))
  }

  const leads = (customersRes.data ?? []).map((c) =>
    buildScoredLead({
      customerId: c.id as string,
      customerName: (c.name as string) ?? 'Unnamed',
      address: ((c.address as string | null) ?? null) || null,
      lifetimeSpend: spend.get(c.id as string) ?? 0,
      record: byCustomer.get(c.id as string) ?? null,
    }),
  )

  return { leads: sortByScore(leads), needsSetup: false }
}

/** Persist a fresh AI estimate, leaving any existing override untouched. */
export async function saveEstimate(
  companyId: string,
  customerId: string,
  estimate: {
    estimateUsd: number | null
    lowUsd: number | null
    highUsd: number | null
    basis: ValueBasis
    confidence: ValueConfidence
    note: string
    localityAssumed: boolean
    localityInferred: string | null
    localityAmbiguous: boolean
    model: string
    addressUsed: string
  },
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('lead_scores').upsert(
    {
      company_id: companyId,
      customer_id: customerId,
      estimated_home_value: estimate.estimateUsd,
      value_low: estimate.lowUsd,
      value_high: estimate.highUsd,
      value_basis: estimate.basis,
      confidence: estimate.confidence,
      confidence_note: estimate.note,
      locality_assumed: estimate.localityAssumed,
      locality_inferred: estimate.localityInferred,
      locality_ambiguous: estimate.localityAmbiguous,
      address_used: estimate.addressUsed,
      model: estimate.model,
      estimated_at: new Date().toISOString(),
    },
    // Conflict on customer_id only: the override columns are omitted from the
    // payload, so an existing manual value survives a re-estimate.
    { onConflict: 'customer_id' },
  )

  if (error) throw new Error(error.message)
}

/**
 * Set or clear the manual override.
 *
 * Passing null clears it, which makes the AI estimate authoritative again.
 */
export async function saveOverride(
  companyId: string,
  customerId: string,
  value: number | null,
  note: string | null,
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('lead_scores').upsert(
    {
      company_id: companyId,
      customer_id: customerId,
      override_home_value: value,
      override_note: note,
      override_at: value == null ? null : new Date().toISOString(),
    },
    { onConflict: 'customer_id' },
  )

  if (error) throw new Error(error.message)
}
