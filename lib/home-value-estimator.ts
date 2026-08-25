/**
 * Home value estimation via Claude with the server-side web search tool.
 *
 * Server-only. `ANTHROPIC_API_KEY` must never reach the browser.
 *
 * Why web search is mandatory here: Claude has no property database and no
 * internet access on its own. Asked to value "3133 Scott Avenue" unaided it
 * produces a plausible-looking number from training patterns, not a lookup.
 * With `web_search` it actually reads Zillow/Redfin/assessor pages first, so the
 * figure traces to a real source. Without the tool this feature would be a
 * random number generator wearing a dollar sign.
 *
 * Two failure modes were observed in live testing and are guarded below:
 *
 *  - Silent locality invention. Given "3096 Kenosha Ave" with no city or state,
 *    the model returned basis "property" with *high* confidence and a specific
 *    dollar figure, having quietly assumed Clovis CA. Locality is never left to
 *    the model to invent: either the address states it, or the explicit service
 *    area rule below supplies it and the row is flagged.
 *  - Markdown-fenced JSON. Sometimes the reply is wrapped in ```json fences
 *    despite instructions, so parsing strips fences before `JSON.parse`.
 *
 * ── Service area inference ────────────────────────────────────────────────────
 * 165 of 177 locality-less customer addresses are real street lines missing only
 * a city, and the book is overwhelmingly Clovis (21 tagged) then Fresno (4) then
 * Madera (1). So a missing city is resolved against the known service area
 * rather than abandoned.
 *
 * The confidence ceiling for these is 'medium', not 'high'. The distinction that
 * matters: the service area rule makes the *search* possible, but only a
 * verified single-property match justifies confidence, and "which of Clovis vs
 * Fresno vs Madera" is still genuinely unresolved until the search confirms it.
 * A street existing in two of those cities is real ambiguity — two different
 * houses, two different values — so those are held at area level. Every inferred
 * row stays badged, and the manual override is the correction path.
 */

import 'server-only'

import type { ValueBasis, ValueConfidence } from '@/lib/lead-scoring'

/** Current Sonnet. Verified against the live /v1/models list. */
const MODEL = 'claude-sonnet-5'

/** Anthropic's server-side search tool version. */
const WEB_SEARCH_TOOL = 'web_search_20250305'

/**
 * Cap on searches per address. Each one is billed, and testing showed the
 * useful answer lands within 2-4; more just runs up cost.
 */
const MAX_SEARCHES = 4

/** Anthropic can be slow with tool loops; well under the route's own budget. */
const REQUEST_TIMEOUT_MS = 120_000

/**
 * Service area, in priority order, for resolving addresses that name no city.
 *
 * Ordering reflects the actual book: Clovis dominates, Fresno is the adjacent
 * metro, Madera is the secondary fallback across the river. `primary` cities are
 * offered as the default assumption; `secondary` is only chosen when the street
 * context points there.
 */
const SERVICE_AREA = {
  primary: ['Clovis, CA', 'Fresno, CA'],
  secondary: ['Madera, CA'],
} as const

/** Flat list for prompt construction and ambiguity checks. */
const SERVICE_AREA_CITIES = [...SERVICE_AREA.primary, ...SERVICE_AREA.secondary]

/** Region label used when an address already names its own locality. */
const SERVICE_AREA_HINT = 'Clovis / Fresno County, California'

/**
 * Ceiling for service-area-inferred estimates.
 *
 * 'medium' rather than 'high': the rule licenses the lookup, but the city itself
 * is still an assumption, and a wrong city means a different house entirely.
 * 'high' stays reserved for addresses that state their own locality.
 */
const INFERRED_CONFIDENCE_CEILING: ValueConfidence = 'medium'

export interface HomeValueEstimate {
  estimateUsd: number | null
  lowUsd: number | null
  highUsd: number | null
  basis: ValueBasis
  confidence: ValueConfidence
  note: string
  /** True when the address had no city/state/ZIP of its own. */
  localityAssumed: boolean
  /**
   * Service-area city the rule resolved to, e.g. 'Clovis, CA'. Null when the
   * address supplied its own locality. Surfaced in the UI so a wrong inference
   * is visible rather than hidden inside the number.
   */
  localityInferred: string | null
  /**
   * True when the street plausibly exists in more than one service-area city.
   * Genuine ambiguity, so the estimate is held at area level.
   */
  localityAmbiguous: boolean
  model: string
  /** Number of web searches Claude actually ran. 0 means it did not look. */
  searchCount: number
}

const SYSTEM_PROMPT = [
  'You estimate US residential home values for a home-services company sizing up sales leads.',
  '',
  'Rules:',
  '1. ALWAYS search public sources (Zillow, Redfin, Realtor, county assessor) before answering. Never answer from memory alone.',
  '2. Never invent a figure. If you cannot find data, say so via the basis field.',
  '3. If the address resolves to a specific property, use basis "property".',
  '4. If you can only determine the city/ZIP/neighborhood, estimate the AREA median and use basis "area". Do NOT present an area median as a property value.',
  '5. If the input has no usable street address at all, use basis "none" with null figures.',
  '6. Never invent a city of your own. If no locality is given, use only the candidate cities supplied in the user message, and report which one you used.',
  '7. If the street plausibly exists in more than one candidate city and you cannot tell them apart, set locality_ambiguous true and fall back to basis "area".',
  '',
  'Reply with ONLY a raw JSON object. No prose, no markdown fences.',
  '{"estimate_usd": number|null, "low_usd": number|null, "high_usd": number|null,',
  ' "basis": "property"|"area"|"none", "confidence": "high"|"medium"|"low",',
  ' "locality_used": string|null, "locality_ambiguous": boolean, "note": string}',
  '',
  'locality_used: the city you actually priced against, e.g. "Clovis, CA". Null if the address named its own.',
  'note: one short sentence a salesperson can read, naming the source if you found one.',
  '  If you assumed a city, say which one, so the reader can correct it.',
].join('\n')

/**
 * Whether the address carries its own locality.
 *
 * Drives the `localityAssumed` demotion. A bare street line cannot support a
 * property-level claim regardless of how confident the model sounds.
 */
export function hasOwnLocality(address: string): boolean {
  return (
    /\b\d{5}\b/.test(address) ||
    /\b(ca|california)\b/i.test(address) ||
    /\b(clovis|fresno|sanger|madera|reedley|kingsburg|selma|visalia)\b/i.test(address)
  )
}

/**
 * Whether the input looks like an actual street line: a house number followed by
 * a named street.
 *
 * The service-area rule applies only to these. "3096 Kenosha Ave" is a real
 * address missing a city and is worth resolving; "Philip Carrol" and "Scott" are
 * not addresses at all, and attaching a city to them would invent a property
 * that was never in the record.
 */
export function looksLikeStreetLine(address: string): boolean {
  const t = address.trim()
  if (!/^\d+\s+\S/.test(t)) return false
  return /\b(ave|avenue|st|street|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard|cir|circle|pl|place|ter|terrace|trail|trl|pkwy|parkway|hwy|highway)\b\.?/i.test(
    t,
  )
}

/** Strip markdown fences the model sometimes adds despite instructions. */
function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

/** Pull the outermost JSON object, tolerating stray prose around it. */
function extractJson(text: string): unknown {
  const cleaned = stripFences(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/** Coerce to a plausible US home value, rejecting nonsense. */
function toMoney(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  // Anything outside this band is a parsing artifact, not a house.
  if (n < 10_000 || n > 100_000_000) return null
  return Math.round(n)
}

function toBasis(v: unknown): ValueBasis {
  return v === 'property' || v === 'area' || v === 'none' ? v : 'none'
}

function toConfidence(v: unknown): ValueConfidence {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'low'
}

/**
 * Estimate one address.
 *
 * Throws only on transport/auth failure. A model that cannot find anything is a
 * successful call returning basis "none" — that is data, not an error.
 */
export async function estimateHomeValue(address: string): Promise<HomeValueEstimate> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it in the Vars section of the v0 settings menu.',
    )
  }

  const trimmed = address.trim()
  const localityAssumed = !hasOwnLocality(trimmed)

  // The service-area rule applies only to genuine street lines. Anything that
  // isn't one gets no inferred city: attaching Clovis to "Philip Carrol" would
  // conjure a property the record never contained.
  const inferable = localityAssumed && looksLikeStreetLine(trimmed)

  let userContent: string
  if (!localityAssumed) {
    userContent = `Service address: ${trimmed}`
  } else if (inferable) {
    // A known service-area rule, so the model is told to resolve the street
    // against these specific cities — but it must report which one it used, and
    // flag the case where it genuinely cannot tell them apart.
    userContent = [
      `Service address (city not stated): ${trimmed}`,
      '',
      'This company serves a known area. Resolve the street against these candidate cities only:',
      `  Primary (most likely): ${SERVICE_AREA.primary.join(' or ')}`,
      `  Secondary (only if the street or context points there): ${SERVICE_AREA.secondary.join(', ')}`,
      '',
      'Search to determine which candidate city actually contains this street, then value the property there.',
      'Report the city you used in locality_used.',
      'If the street exists in more than one candidate city and you cannot determine which, set locality_ambiguous true and use basis "area".',
      'Do not consider any city outside the candidate list.',
    ].join('\n')
  } else {
    userContent = [
      `Input (NOT a usable street address): ${trimmed}`,
      `The company operates in ${SERVICE_AREA_HINT}, but this input has no street number and street name.`,
      'Do not attach a city to it. Use basis "none" with null figures.',
    ].join('\n')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        tools: [{ type: WEB_SEARCH_TOOL, name: 'web_search', max_uses: MAX_SEARCHES }],
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Anthropic request timed out')
    }
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Surface the status: 401 means a bad key, 429 means rate limited, and the
    // caller shows different guidance for each.
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`)
  }

  const payload = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>
    stop_reason?: string
  }

  const blocks = payload.content ?? []
  const searchCount = blocks.filter((b) => b?.type === 'server_tool_use').length
  const text = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim()

  const parsed = extractJson(text) as Record<string, unknown> | null

  if (!parsed) {
    return {
      estimateUsd: null,
      lowUsd: null,
      highUsd: null,
      basis: 'none',
      confidence: 'low',
      note: 'Could not read a usable estimate from the model response.',
      localityAssumed,
      localityInferred: null,
      localityAmbiguous: false,
      model: MODEL,
      searchCount,
    }
  }

  let basis = toBasis(parsed.basis)
  let confidence = toConfidence(parsed.confidence)
  const estimateUsd = toMoney(parsed.estimate_usd)
  const note =
    typeof parsed.note === 'string' && parsed.note.trim()
      ? parsed.note.trim().slice(0, 400)
      : 'No note provided.'

  // Only accept a locality the model claims if it is one we actually offered;
  // otherwise it wandered outside the service area and the claim is discarded.
  const claimedLocality =
    typeof parsed.locality_used === 'string' ? parsed.locality_used.trim() : ''
  const matchedCity = SERVICE_AREA_CITIES.find(
    (c) =>
      claimedLocality.toLowerCase().includes(c.split(',')[0].toLowerCase()) &&
      claimedLocality.length > 0,
  )
  let localityInferred = inferable ? (matchedCity ?? null) : null
  let localityAmbiguous = inferable && parsed.locality_ambiguous === true

  // Guard 1: locality is never the model's to invent.
  //   - Not a street line: no city may be attached at all.
  //   - Street line, but the model named a city outside the service area (or
  //     none): the inference rule did not actually resolve, so no property claim.
  //   - Ambiguous across candidate cities: two candidate cities means two
  //     different houses, so hold at area level.
  // A street line resolved to a single service-area city MAY keep basis
  // 'property' — that is the point of the rule.
  if (localityAssumed && basis === 'property') {
    if (!inferable || !localityInferred || localityAmbiguous) {
      basis = 'area'
      confidence = 'low'
    }
  }

  // Guard 2: no searches means no lookup happened, so the figure is recalled
  // rather than sourced. Demote confidence so the UI can flag it.
  if (searchCount === 0 && basis !== 'none' && confidence === 'high') {
    confidence = 'medium'
  }

  // Guard 3: an inferred city is still an assumption. It permits the lookup and
  // 'medium' confidence, but 'high' stays reserved for addresses that state
  // their own locality.
  if (localityAssumed && confidence === 'high') {
    confidence = INFERRED_CONFIDENCE_CEILING
  }

  // Guard 4: a basis claiming a figure but with none parsed is incoherent.
  if (basis !== 'none' && estimateUsd == null) {
    basis = 'none'
    confidence = 'low'
  }

  // An area estimate is neighborhood-wide by definition; never let it read as
  // high confidence for this specific home.
  if (basis === 'area' && confidence === 'high') {
    confidence = 'medium'
  }

  // Nothing was valued, so there is no locality to report.
  if (basis === 'none') {
    localityInferred = null
    localityAmbiguous = false
  }

  return {
    estimateUsd: basis === 'none' ? null : estimateUsd,
    lowUsd: basis === 'none' ? null : toMoney(parsed.low_usd),
    highUsd: basis === 'none' ? null : toMoney(parsed.high_usd),
    basis,
    confidence,
    note,
    localityAssumed,
    localityInferred,
    localityAmbiguous,
    model: MODEL,
    searchCount,
  }
}
