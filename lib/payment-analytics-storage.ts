/**
 * Payment method analytics.
 *
 * Reads pre-aggregated totals from the SQL functions in
 * `scripts/39-payment-method-analytics.sql` rather than pulling every income
 * row into the browser and summing it there.
 *
 * Source of truth is the `income` table, because recordPayment() mirrors every
 * payment into income. Aggregating `payments` instead would under-report
 * collected revenue and would not reconcile with the Finances "Income" card.
 */

import { createClient } from '@/lib/supabase/client'

function getSupabase() {
  return createClient()
}

/** Postgres numerics arrive as strings over the wire; coerce defensively. */
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? 0))
  return Number.isFinite(n) ? n : 0
}

export interface PaymentMethodTotal {
  method: string
  label: string
  transactionCount: number
  grossAmount: number
  avgAmount: number
  firstPayment: string | null
  lastPayment: string | null
  /** Share of the period's collected revenue, 0-100. */
  share: number
}

export interface PaymentMethodMonthly {
  month: string
  method: string
  label: string
  transactionCount: number
  grossAmount: number
}

export interface PaymentMethodFee {
  method: string
  label: string
  paymentCount: number
  grossAmount: number
  totalFees: number
  netAmount: number
  /** Effective fee percentage of gross. */
  feeRate: number
}

export interface PaymentAnalytics {
  totals: PaymentMethodTotal[]
  monthly: PaymentMethodMonthly[]
  fees: PaymentMethodFee[]
  grandTotal: number
  transactionCount: number
  /** True when the analytics functions are missing (migration not yet run). */
  needsSetup: boolean
}

const EMPTY: PaymentAnalytics = {
  totals: [],
  monthly: [],
  fees: [],
  grandTotal: 0,
  transactionCount: 0,
  needsSetup: false,
}

/**
 * Human labels for the normalised keys the RPC returns. The RPC lowercases
 * methods so 'Venmo' and 'venmo' aggregate together; this maps back to display
 * casing. Unknown methods fall back to title case so a new method added later
 * still renders sensibly instead of showing a raw lowercase key.
 */
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Card',
  zelle: 'Zelle',
  venmo: 'Venmo',
  paypal: 'PayPal',
  ach: 'ACH',
  'bank transfer': 'Bank Transfer',
  other: 'Other',
  unspecified: 'Unspecified',
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** 42883 = undefined_function -> migration 39 has not been applied yet. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42883' || /function .*payment_method/i.test(error.message ?? '')
}

/**
 * Loads every analytics slice for an optional inclusive date window.
 * Dates are `YYYY-MM-DD`; pass null for an unbounded end of the range.
 */
export async function getPaymentAnalytics(
  from: string | null = null,
  to: string | null = null,
): Promise<PaymentAnalytics> {
  const supabase = getSupabase()
  const args = { p_from: from, p_to: to }

  const [totalsRes, monthlyRes, feesRes] = await Promise.all([
    supabase.rpc('payment_method_totals', args),
    supabase.rpc('payment_method_monthly', args),
    supabase.rpc('payment_method_fees', args),
  ])

  if (isMissingFunction(totalsRes.error)) {
    console.warn('[PaymentAnalytics] Run scripts/39-payment-method-analytics.sql')
    return { ...EMPTY, needsSetup: true }
  }

  if (totalsRes.error) {
    console.error('[PaymentAnalytics] totals failed:', totalsRes.error.message)
    return EMPTY
  }

  const rawTotals = (totalsRes.data ?? []) as Array<Record<string, unknown>>
  const grandTotal = rawTotals.reduce((sum, r) => sum + num(r.gross_amount), 0)
  const transactionCount = rawTotals.reduce((sum, r) => sum + num(r.transaction_count), 0)

  const totals: PaymentMethodTotal[] = rawTotals.map((r) => {
    const gross = num(r.gross_amount)
    return {
      method: String(r.method),
      label: methodLabel(String(r.method)),
      transactionCount: num(r.transaction_count),
      grossAmount: gross,
      avgAmount: num(r.avg_amount),
      firstPayment: (r.first_payment as string) ?? null,
      lastPayment: (r.last_payment as string) ?? null,
      // Guard against divide-by-zero on an empty period.
      share: grandTotal > 0 ? (gross / grandTotal) * 100 : 0,
    }
  })

  const monthly: PaymentMethodMonthly[] = monthlyRes.error
    ? []
    : ((monthlyRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        month: String(r.month),
        method: String(r.method),
        label: methodLabel(String(r.method)),
        transactionCount: num(r.transaction_count),
        grossAmount: num(r.gross_amount),
      }))

  // Fees legitimately return zero rows until real processing fees are recorded;
  // that is not an error, it just means the UI hides the panel.
  const fees: PaymentMethodFee[] = feesRes.error
    ? []
    : ((feesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        method: String(r.method),
        label: methodLabel(String(r.method)),
        paymentCount: num(r.payment_count),
        grossAmount: num(r.gross_amount),
        totalFees: num(r.total_fees),
        netAmount: num(r.net_amount),
        feeRate: num(r.fee_rate),
      }))

  return { totals, monthly, fees, grandTotal, transactionCount, needsSetup: false }
}

/** Pivots the flat monthly rows into one record per month keyed by method. */
export function pivotMonthly(
  monthly: PaymentMethodMonthly[],
): Array<{ month: string; total: number } & Record<string, number | string>> {
  const byMonth = new Map<string, { month: string; total: number } & Record<string, number | string>>()

  for (const row of monthly) {
    let entry = byMonth.get(row.month)
    if (!entry) {
      entry = { month: row.month, total: 0 }
      byMonth.set(row.month, entry)
    }
    entry[row.method] = ((entry[row.method] as number) ?? 0) + row.grossAmount
    entry.total += row.grossAmount
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
}
