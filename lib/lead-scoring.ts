/**
 * Lead scoring: combines an estimated home value with real lifetime spend.
 *
 * Two rules shape everything in this file:
 *
 * 1. A number that was never established is `null`, never `0`. A customer with
 *    an unreadable address has *unknown* home value; scoring them as a $0 home
 *    would rank them below a genuine trailer and quietly bury the lead.
 * 2. A human override always wins over the model. The estimates here are
 *    fallible by construction, so the person who has stood on the driveway gets
 *    the final say.
 */

/** How a home value figure was arrived at. */
export type ValueBasis =
  /** Resolved to a specific property from public records/listings. */
  | 'property'
  /** Median for the city or ZIP — the street address was not resolvable. */
  | 'area'
  /** Nothing usable in the address at all. No figure produced. */
  | 'none'

export type ValueConfidence = 'high' | 'medium' | 'low'

/** A stored estimate row, as it comes back from `lead_scores`. */
export interface LeadScoreRecord {
  customerId: string
  estimatedHomeValue: number | null
  valueLow: number | null
  valueHigh: number | null
  valueBasis: ValueBasis | null
  confidence: ValueConfidence | null
  confidenceNote: string | null
  /** True when the city/state was inferred rather than present in the address. */
  localityAssumed: boolean
  /** Service-area city the rule resolved to, e.g. 'Clovis, CA'. */
  localityInferred: string | null
  /** True when the street matched several service-area cities. */
  localityAmbiguous: boolean
  addressUsed: string | null
  model: string | null
  estimatedAt: string | null
  overrideHomeValue: number | null
  overrideNote: string | null
  overrideAt: string | null
}

/** A fully computed row, ready to render. */
export interface ScoredLead {
  customerId: string
  customerName: string
  address: string | null
  lifetimeSpend: number
  /** Whichever value scoring actually used: override if set, else estimate. */
  effectiveHomeValue: number | null
  /** True when `effectiveHomeValue` came from the override field. */
  isOverridden: boolean
  estimate: LeadScoreRecord | null
  /** 0-100, or null when home value is unknown *and* there is no spend. */
  score: number | null
  /** Sub-scores, exposed so the UI can explain the number. */
  valueComponent: number | null
  spendComponent: number
  /** Why the row can't be fully scored, if applicable. */
  limitation: LeadLimitation | null
}

export type LeadLimitation =
  /** Address is too vague to value — needs a city/state or ZIP. */
  | 'insufficient_address'
  /** Has an address but no estimate has been run yet. */
  | 'not_estimated'
  /** Only an area median was available, so the figure is neighborhood-wide. */
  | 'area_only'
  /**
   * Valued against an assumed service-area city because the address named none.
   * The figure is property-specific, but rests on the city being right.
   */
  | 'locality_inferred'

/**
 * Weighting between the two signals.
 *
 * Spend is weighted higher than home value on purpose: it is first-party fact,
 * while home value is an outside estimate. A customer who has actually paid is
 * a better bet than one who merely lives somewhere expensive.
 */
export const SCORE_WEIGHTS = { spend: 0.6, homeValue: 0.4 } as const

/**
 * Normalization ceilings, calibrated against this company's real data rather
 * than round numbers.
 *
 * Lifetime spend: median is $250 and the 90th percentile is $1,000, so a $2,000
 * ceiling puts a typical customer near the middle of the range instead of
 * squashing everyone into the bottom few percent (which a $50k ceiling would).
 *
 * Home value: local stock runs roughly $300k-$900k, so the band is anchored
 * there. Below `homeValueFloor` scores 0, above the ceiling scores full marks.
 */
export const SCORE_SCALE = {
  spendCeiling: 2_000,
  homeValueFloor: 250_000,
  homeValueCeiling: 900_000,
} as const

/** Clamp to 0..1. */
function unit(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Spend sub-score, 0-100.
 *
 * Square-rooted so the first few hundred dollars move the needle more than the
 * jump from $1.8k to $2k. Linear scaling made every customer below the 90th
 * percentile look identical.
 */
export function spendSubScore(lifetimeSpend: number): number {
  const ratio = unit(lifetimeSpend / SCORE_SCALE.spendCeiling)
  return Math.round(Math.sqrt(ratio) * 100)
}

/** Home value sub-score, 0-100. Null in, null out — never silently 0. */
export function homeValueSubScore(homeValue: number | null): number | null {
  if (homeValue == null || !Number.isFinite(homeValue)) return null
  const span = SCORE_SCALE.homeValueCeiling - SCORE_SCALE.homeValueFloor
  return Math.round(unit((homeValue - SCORE_SCALE.homeValueFloor) / span) * 100)
}

/**
 * Composite 0-100 score.
 *
 * When home value is unknown the score is computed from spend alone rather than
 * treating the missing half as zero. A customer with $1,500 of paid work and an
 * illegible address must not be outranked by a stranger in a big house.
 * `limitation` on the row is what tells the reader the score is spend-only.
 */
export function compositeScore(
  lifetimeSpend: number,
  homeValue: number | null,
): { score: number | null; valueComponent: number | null; spendComponent: number } {
  const spendComponent = spendSubScore(lifetimeSpend)
  const valueComponent = homeValueSubScore(homeValue)

  if (valueComponent == null) {
    // Nothing at all to go on: no value, no spend. Leave it unscored rather
    // than printing a confident 0.
    if (lifetimeSpend <= 0) {
      return { score: null, valueComponent: null, spendComponent }
    }
    return { score: spendComponent, valueComponent: null, spendComponent }
  }

  const score = Math.round(
    spendComponent * SCORE_WEIGHTS.spend + valueComponent * SCORE_WEIGHTS.homeValue,
  )
  return { score, valueComponent, spendComponent }
}

/** Street suffixes that mark a line as an actual address rather than a name. */
const STREET_SUFFIX =
  /\b(ave|avenue|st|street|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|cir|circle|pl|place|ter|terrace|trail|trl|pkwy|parkway|hwy|highway)\b\.?/i

/**
 * Whether an address has any hope of being valued.
 *
 * A locality is NOT required. The company works a known service area (Clovis /
 * Fresno, with Madera secondary), so a bare street line like "3096 Kenosha Ave"
 * can be resolved against those cities — 165 of the 177 locality-less addresses
 * on the book are exactly this shape, and excluding them would strand most of
 * the customer list.
 *
 * What is still required is a street *shape*: a leading house number plus either
 * a street suffix or an explicit locality. "Philip Carrol" and bare "Scott" fail
 * here and are never sent to the model — attaching a service-area city to a
 * person's name would invent a property that was never in the record.
 */
export function isAddressValuable(address: string | null | undefined): boolean {
  const raw = (address ?? '').trim()
  if (raw.length < 6) return false
  if (!/^\d+\s+\S/.test(raw)) return false
  return (
    STREET_SUFFIX.test(raw) ||
    raw.includes(',') ||
    /\b\d{5}\b/.test(raw) ||
    /\b(ca|california)\b/i.test(raw) ||
    /\b(clovis|fresno|sanger|madera|reedley|kingsburg|selma|visalia)\b/i.test(raw)
  )
}

/** Human-readable label for a basis/limitation combination. */
export function basisLabel(basis: ValueBasis | null): string {
  if (basis === 'property') return 'Property match'
  if (basis === 'area') return 'Area estimate'
  if (basis === 'none') return 'No estimate'
  return 'Not estimated'
}

/**
 * Resolve which home value scoring should use, and why the row may be limited.
 */
export function resolveEffectiveValue(
  address: string | null,
  record: LeadScoreRecord | null,
): {
  effectiveHomeValue: number | null
  isOverridden: boolean
  limitation: LeadLimitation | null
} {
  // Override first, unconditionally — including when no estimate exists, so a
  // user can score a customer the model could never resolve.
  if (record?.overrideHomeValue != null) {
    return {
      effectiveHomeValue: Number(record.overrideHomeValue),
      isOverridden: true,
      limitation: null,
    }
  }

  if (!isAddressValuable(address)) {
    return {
      effectiveHomeValue: null,
      isOverridden: false,
      limitation: 'insufficient_address',
    }
  }

  if (!record || record.estimatedAt == null) {
    return { effectiveHomeValue: null, isOverridden: false, limitation: 'not_estimated' }
  }

  if (record.valueBasis === 'none' || record.estimatedHomeValue == null) {
    return {
      effectiveHomeValue: null,
      isOverridden: false,
      limitation: 'insufficient_address',
    }
  }

  // An area figure is the weaker caveat, so it wins the label when both apply.
  // Otherwise a property match built on an assumed city is flagged as inferred.
  const limitation: LeadLimitation | null =
    record.valueBasis === 'area'
      ? 'area_only'
      : record.localityAssumed
        ? 'locality_inferred'
        : null

  return {
    effectiveHomeValue: Number(record.estimatedHomeValue),
    isOverridden: false,
    limitation,
  }
}

/** Build a fully scored row from its parts. */
export function buildScoredLead(input: {
  customerId: string
  customerName: string
  address: string | null
  lifetimeSpend: number
  record: LeadScoreRecord | null
}): ScoredLead {
  const { effectiveHomeValue, isOverridden, limitation } = resolveEffectiveValue(
    input.address,
    input.record,
  )
  const { score, valueComponent, spendComponent } = compositeScore(
    input.lifetimeSpend,
    effectiveHomeValue,
  )

  return {
    customerId: input.customerId,
    customerName: input.customerName,
    address: input.address,
    lifetimeSpend: input.lifetimeSpend,
    effectiveHomeValue,
    isOverridden,
    estimate: input.record,
    score,
    valueComponent,
    spendComponent,
    limitation,
  }
}

/**
 * Sort by score, highest first.
 *
 * Unscored rows sink to the bottom rather than being dropped: they still need to
 * be visible so the user can fix the address or set an override.
 */
export function sortByScore(leads: ScoredLead[]): ScoredLead[] {
  return [...leads].sort((a, b) => {
    if (a.score == null && b.score == null) {
      return b.lifetimeSpend - a.lifetimeSpend
    }
    if (a.score == null) return 1
    if (b.score == null) return -1
    if (b.score !== a.score) return b.score - a.score
    return b.lifetimeSpend - a.lifetimeSpend
  })
}

/** Compact USD, e.g. "$815k". Returns a dash for null so tables stay aligned. */
export function formatMoneyCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/** Exact USD with separators, e.g. "$815,000". */
export function formatMoneyExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}
