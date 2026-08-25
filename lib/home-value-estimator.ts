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
 *    dollar figure, having quietly assumed Clovis CA. Any address lacking its
 *    own locality is therefore marked `localityAssumed` and force-demoted to an
 *    area estimate, no matter what the model claims.
 *  - Markdown-fenced JSON. Sometimes the reply is wrapped in ```json fences
 *    despite instructions, so parsing strips fences before `JSON.parse`.
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
 * The company's service area, used only to interpret addresses that already
 * name a locality. It is deliberately NOT injected into addresses that lack one
 * — that would manufacture the exact false precision this module guards against.
 */
const SERVICE_AREA_HINT = 'Clovis / Fresno County, California'

export interface HomeValueEstimate {
  estimateUsd: number | null
  lowUsd: number | null
  highUsd: number | null
  basis: ValueBasis
  confidence: ValueConfidence
  note: string
  /** True when the address had no city/state/ZIP of its own. */
  localityAssumed: boolean
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
  '5. If the input has no usable street address or locality, use basis "none" with null figures.',
  '6. Do NOT guess a city that is not present in the input. If no city, state, or ZIP is given, you cannot use basis "property".',
  '',
  'Reply with ONLY a raw JSON object. No prose, no markdown fences.',
  '{"estimate_usd": number|null, "low_usd": number|null, "high_usd": number|null,',
  ' "basis": "property"|"area"|"none", "confidence": "high"|"medium"|"low", "note": string}',
  '',
  'note: one short sentence a salesperson can read, naming the source if you found one.',
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

  // The locality is supplied as context for interpreting a partial address, and
  // the model is told explicitly that it does not license a property-level claim.
  const userContent = localityAssumed
    ? [
        `Service address (INCOMPLETE - no city, state, or ZIP given): ${trimmed}`,
        `The company operates in ${SERVICE_AREA_HINT}, but this is an assumption, not part of the address.`,
        'Because the locality is not stated, you MUST NOT use basis "property". Use basis "area" at best.',
      ].join('\n')
    : `Service address: ${trimmed}`

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

  // Guard 1: an address with no stated locality can never be a property match,
  // whatever the model returned. Observed live: "3096 Kenosha Ave" came back as
  // property/high/$815,000 with the city silently invented.
  if (localityAssumed && basis === 'property') {
    basis = 'area'
    confidence = 'low'
  }

  // Guard 2: no searches means no lookup happened, so the figure is recalled
  // rather than sourced. Demote confidence so the UI can flag it.
  if (searchCount === 0 && basis !== 'none' && confidence === 'high') {
    confidence = 'medium'
  }

  // Guard 3: a basis claiming a figure but with none parsed is incoherent.
  if (basis !== 'none' && estimateUsd == null) {
    basis = 'none'
    confidence = 'low'
  }

  // An area estimate is neighborhood-wide by definition; never let it read as
  // high confidence for this specific home.
  if (basis === 'area' && confidence === 'high') {
    confidence = 'medium'
  }

  return {
    estimateUsd: basis === 'none' ? null : estimateUsd,
    lowUsd: basis === 'none' ? null : toMoney(parsed.low_usd),
    highUsd: basis === 'none' ? null : toMoney(parsed.high_usd),
    basis,
    confidence,
    note,
    localityAssumed,
    model: MODEL,
    searchCount,
  }
}
