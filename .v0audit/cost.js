// Measure the true cost of ONE estimator call, exactly as the app makes it.
// Mirrors lib/home-value-estimator.ts request shape verbatim.

const MODEL = 'claude-sonnet-5'
const WEB_SEARCH_TOOL = 'web_search_20250305'
const MAX_SEARCHES = 4

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

// The inferred-city path: 38 of 49 real rows took this branch.
const userContent = [
  `Service address (city not stated): 1247 Woodworth Ave`,
  '',
  'This company serves a known area. Resolve the street against these candidate cities only:',
  '  Primary (most likely): Clovis, CA or Fresno, CA',
  '  Secondary (only if the street or context points there): Madera, CA',
  '',
  'Search to determine which candidate city actually contains this street, then value the property there.',
  'Report the city you used in locality_used.',
  'If the street exists in more than one candidate city and you cannot determine which, set locality_ambiguous true and use basis "area".',
  'Do not consider any city outside the candidate list.',
].join('\n')

// Sonnet list pricing, $/million tokens.
const IN = 3.0
const OUT = 15.0
const CACHE_READ = 0.3
const CACHE_WRITE = 3.75
const PER_SEARCH = 0.01

;(async () => {
  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
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
  })

  const ms = Date.now() - t0
  if (!res.ok) {
    console.log('HTTP', res.status, (await res.text()).slice(0, 400))
    return
  }
  const j = await res.json()
  const u = j.usage || {}

  console.log('=== latency ===')
  console.log('  wall time        :', (ms / 1000).toFixed(1), 's')

  console.log('=== raw usage block ===')
  console.log(' ', JSON.stringify(u))

  const blocks = j.content || []
  const counts = {}
  for (const b of blocks) counts[b.type] = (counts[b.type] || 0) + 1
  console.log('=== content blocks ===')
  console.log(' ', JSON.stringify(counts))

  const searches =
    u.server_tool_use?.web_search_requests ??
    blocks.filter((b) => b.type === 'server_tool_use').length

  const inTok = u.input_tokens || 0
  const outTok = u.output_tokens || 0
  const cr = u.cache_read_input_tokens || 0
  const cw = u.cache_creation_input_tokens || 0

  const cIn = (inTok / 1e6) * IN
  const cOut = (outTok / 1e6) * OUT
  const cCr = (cr / 1e6) * CACHE_READ
  const cCw = (cw / 1e6) * CACHE_WRITE
  const cSearch = searches * PER_SEARCH
  const total = cIn + cOut + cCr + cCw + cSearch

  console.log('=== cost decomposition (one lookup) ===')
  console.log('  web searches     :', searches, '->  $' + cSearch.toFixed(4))
  console.log('  input tokens     :', inTok, '->  $' + cIn.toFixed(4))
  console.log('  output tokens    :', outTok, '->  $' + cOut.toFixed(4))
  if (cr) console.log('  cache read       :', cr, '->  $' + cCr.toFixed(4))
  if (cw) console.log('  cache write      :', cw, '->  $' + cCw.toFixed(4))
  console.log('  ---------------------------------------')
  console.log('  TOTAL            :  $' + total.toFixed(4))
  console.log('')
  console.log('  share from search fees :', ((cSearch / total) * 100).toFixed(0) + '%')
  console.log('  share from tokens      :', (((total - cSearch) / total) * 100).toFixed(0) + '%')

  const txt = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  console.log('=== model answer (truncated) ===')
  console.log(' ', txt.slice(0, 300).replace(/\s+/g, ' '))
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
