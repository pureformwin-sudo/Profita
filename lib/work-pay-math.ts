/**
 * Work & Pay money math.
 *
 * Pure functions only - no Supabase, no Date.now(), no I/O. Everything here is
 * deterministic so it can be unit tested and so the same numbers are produced
 * on the server, in the UI preview, and in the backfill script.
 *
 * Rounding rule: compute in full precision and round ONCE at the very end of a
 * single earning. Rounding intermediate values (e.g. rounding an hourly subtotal
 * before adding a bonus) drifts by a cent or two per entry, which compounds into
 * a payroll total that doesn't reconcile.
 */

export type CompType = "hourly" | "full_day" | "per_job" | "hourly_plus_bonus" | "flat"
export type EntryMethod = "manual" | "clock"
export type PerJobAmountKind = "standard" | "custom" | "bonus"

/** Payment methods from the spec. `method` is free text in the DB so this stays extensible. */
export const PAYMENT_METHODS = ["Cash", "Check", "Bank Transfer", "Zelle", "Payroll Provider", "Other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const COMP_TYPE_LABELS: Record<CompType, string> = {
  hourly: "Hourly",
  full_day: "Full Day",
  per_job: "Per Job",
  hourly_plus_bonus: "Hourly + Per Job Bonus",
  flat: "Flat / Custom",
}

/** True when this comp type's pay depends on the rate on the work date. */
export function compTypeUsesRate(compType: CompType): boolean {
  return compType === "hourly" || compType === "full_day" || compType === "hourly_plus_bonus" || compType === "per_job"
}

/** True when the amount comes from per-job rows rather than hours x rate. */
export function compTypeUsesJobs(compType: CompType): boolean {
  return compType === "per_job" || compType === "hourly_plus_bonus"
}

/**
 * Round to cents, half away from zero.
 *
 * The epsilon matters: 0.145 * 100 is 14.499999999999998 in float64, so a plain
 * Math.round would give 0.14 instead of 0.15 and quietly lose a cent.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const sign = n < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100
}

/** Cents helper for exact comparisons and sums. */
export function toCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  const sign = n < 0 ? -1 : 1
  return sign * Math.round(Math.abs(n) * 100 + 1e-9)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export interface HoursInput {
  startTime?: string | Date | null
  endTime?: string | Date | null
  breakMinutes?: number | null
  /** When set, this wins over start/end. Used for "I just know it was 6 hours". */
  hoursOverride?: number | null
}

export interface HoursResult {
  /** Decimal hours actually paid, after subtracting the break. Never negative. */
  hours: number
  /** Hours before the break was subtracted, for display. */
  grossHours: number
  breakHours: number
  /** Populated when the inputs are unusable, so callers can surface it. */
  warning?: string
}

/**
 * Decimal hours worked. 7h15m with no break is 7.25.
 *
 * Overnight shifts are supported: when end is at or before start, a day is added,
 * so 9:00 PM -> 5:00 AM is 8 hours rather than a negative number.
 */
export function computeHours(input: HoursInput): HoursResult {
  const breakMinutes = Math.max(0, input.breakMinutes ?? 0)
  const breakHours = breakMinutes / 60

  if (input.hoursOverride != null && Number.isFinite(input.hoursOverride)) {
    const gross = Math.max(0, input.hoursOverride)
    // An override is the paid figure; subtracting a break again would double count.
    return { hours: gross, grossHours: gross, breakHours: 0 }
  }

  if (!input.startTime || !input.endTime) {
    return { hours: 0, grossHours: 0, breakHours, warning: "Start and end time are required to compute hours." }
  }

  const start = new Date(input.startTime)
  let end = new Date(input.endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { hours: 0, grossHours: 0, breakHours, warning: "Could not read the start or end time." }
  }

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  const grossHours = (end.getTime() - start.getTime()) / 3_600_000
  const paid = grossHours - breakHours

  if (paid < 0) {
    return {
      hours: 0,
      grossHours,
      breakHours,
      warning: `Break (${breakMinutes}m) is longer than the shift (${grossHours.toFixed(2)}h).`,
    }
  }

  return { hours: paid, grossHours, breakHours }
}

export interface PerJobLine {
  jobId: string
  amountKind: PerJobAmountKind
  /** Required for custom and bonus; ignored for standard. */
  amount?: number | null
}

export interface EarningInput {
  compType: CompType
  /** Rate on the work date: $/hour, $/day, or $/job depending on comp type. */
  rate?: number | null
  /** Flat total for comp_type 'flat'. */
  flatAmount?: number | null
  hours?: HoursInput
  jobs?: PerJobLine[]
}

export interface EarningBreakdownLine {
  label: string
  amount: number
}

export interface EarningResult {
  amount: number
  hours: number
  grossHours: number
  breakHours: number
  lines: EarningBreakdownLine[]
  warnings: string[]
}

/**
 * The single source of truth for "what did this work entry earn".
 *
 * Hours are always returned even when they don't drive pay (full_day, per_job,
 * flat) because the spec wants them recorded for performance analysis.
 */
export function computeEarning(input: EarningInput): EarningResult {
  const warnings: string[] = []
  const lines: EarningBreakdownLine[] = []

  const hoursResult = computeHours(input.hours ?? {})
  if (hoursResult.warning) warnings.push(hoursResult.warning)
  const { hours, grossHours, breakHours } = hoursResult

  const rate = input.rate ?? 0
  const jobs = input.jobs ?? []

  // Accumulate in full precision; round once at the end.
  let total = 0

  switch (input.compType) {
    case "hourly": {
      if (rate <= 0) warnings.push("No hourly rate set for this employee on this date.")
      total = hours * rate
      lines.push({ label: `${formatHours(hours)} x ${formatMoney(rate)}/hr`, amount: round2(hours * rate) })
      break
    }

    case "full_day": {
      if (rate <= 0) warnings.push("No full-day rate set for this employee on this date.")
      total = rate
      lines.push({ label: "Full day rate", amount: round2(rate) })
      if (hours > 0) {
        // Recorded for analysis, explicitly not part of the math.
        lines.push({ label: `${formatHours(hours)} recorded (not paid hourly)`, amount: 0 })
      }
      break
    }

    case "per_job": {
      if (jobs.length === 0) warnings.push("Per-job pay needs at least one job selected.")
      for (const job of jobs) {
        if (job.amountKind === "bonus") {
          warnings.push("Bonus lines require the Hourly + Per Job Bonus type.")
          continue
        }
        const amount = job.amountKind === "custom" ? (job.amount ?? 0) : rate
        if (job.amountKind === "standard" && rate <= 0) {
          warnings.push("No per-job rate set for this employee on this date.")
        }
        total += amount
        lines.push({
          label: job.amountKind === "custom" ? "Job (custom amount)" : "Job (standard rate)",
          amount: round2(amount),
        })
      }
      break
    }

    case "hourly_plus_bonus": {
      if (rate <= 0) warnings.push("No hourly rate set for this employee on this date.")
      total = hours * rate
      lines.push({ label: `${formatHours(hours)} x ${formatMoney(rate)}/hr`, amount: round2(hours * rate) })
      for (const job of jobs) {
        // Only explicit bonus lines add money here. A 'standard' job carries no
        // extra pay in this mode - the hours already covered it - so treating it
        // as a per-job payout would double pay the same work.
        if (job.amountKind !== "bonus") continue
        const bonus = job.amount ?? 0
        total += bonus
        lines.push({ label: "Job bonus", amount: round2(bonus) })
      }
      break
    }

    case "flat": {
      const flat = input.flatAmount ?? 0
      if (flat <= 0) warnings.push("Enter the flat amount for this work entry.")
      total = flat
      lines.push({ label: "Flat amount", amount: round2(flat) })
      if (hours > 0) lines.push({ label: `${formatHours(hours)} recorded (not paid hourly)`, amount: 0 })
      break
    }
  }

  return { amount: round2(total), hours, grossHours, breakHours, lines, warnings }
}

export interface OpenEarning {
  id: string
  amount: number
  allocated: number
  earnedOn: string
}

export interface AllocationLine {
  earningId: string
  amount: number
}

export interface AllocationPlan {
  lines: AllocationLine[]
  applied: number
  /** Money left over after every open earning is covered - becomes a credit. */
  leftoverCredit: number
}

/**
 * Plan how a payment covers open earnings, oldest first.
 *
 * This mirrors the SQL function that actually writes allocations, so the UI can
 * preview the split before the owner commits. Integer cents throughout - float
 * subtraction would leave 0.009999 residue and invent phantom credits.
 */
export function planAllocation(paymentAmount: number, openEarnings: OpenEarning[]): AllocationPlan {
  let remaining = toCents(paymentAmount)
  const lines: AllocationLine[] = []

  const sorted = [...openEarnings].sort((a, b) => {
    if (a.earnedOn !== b.earnedOn) return a.earnedOn < b.earnedOn ? -1 : 1
    return a.id < b.id ? -1 : 1 // stable tiebreak so the plan matches SQL exactly
  })

  for (const earning of sorted) {
    if (remaining <= 0) break
    const open = toCents(earning.amount) - toCents(earning.allocated)
    if (open <= 0) continue
    const take = Math.min(open, remaining)
    lines.push({ earningId: earning.id, amount: fromCents(take) })
    remaining -= take
  }

  return {
    lines,
    applied: fromCents(toCents(paymentAmount) - remaining),
    leftoverCredit: fromCents(Math.max(0, remaining)),
  }
}

export interface BalanceInput {
  totalEarned: number
  totalPaid: number
}

export type PayStatus = "paid" | "partial" | "unpaid" | "credit"

export function payStatus({ totalEarned, totalPaid }: BalanceInput): PayStatus {
  const earned = toCents(totalEarned)
  const paid = toCents(totalPaid)
  if (paid > earned) return "credit"
  if (earned === 0) return "paid"
  if (paid === 0) return "unpaid"
  if (paid >= earned) return "paid"
  return "partial"
}

export function outstanding({ totalEarned, totalPaid }: BalanceInput): number {
  return fromCents(Math.max(0, toCents(totalEarned) - toCents(totalPaid)))
}

export function formatMoney(n: number): string {
  return `$${round2(n).toFixed(2)}`
}

/** 7.25 -> "7h 15m". Whole hours drop the minutes. */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
