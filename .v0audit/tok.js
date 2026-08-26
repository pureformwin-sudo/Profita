// count_tokens is free and needs no credit. Bounds the FIXED per-call overhead,
// which tells us whether "oversized prompt" is actually a cost driver.

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

const inferredUser = [
  'Service address (city not stated): 1247 Woodworth Ave',
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

const plainUser = 'Service address: 10849 E San Felipe Ave Clovis, CA 93619'

async function count(label, system, user, withTools) {
  const body = {
    model: 'claude-sonnet-5',
    system,
    messages: [{ role: 'user', content: user }],
  }
  if (withTools) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }]
  }
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.log(label.padEnd(34), 'ERR', res.status, (await res.text()).slice(0, 160))
    return null
  }
  const j = await res.json()
  console.log(label.padEnd(34), String(j.input_tokens).padStart(6), 'tokens')
  return j.input_tokens
}

;(async () => {
  console.log('=== fixed per-call prompt size (no search results yet) ===')
  const sysOnly = await count('system only', SYSTEM_PROMPT, 'x', false)
  const inferNoTools = await count('system + inferred-city user', SYSTEM_PROMPT, inferredUser, false)
  const inferTools = await count('  + web_search tool def', SYSTEM_PROMPT, inferredUser, true)
  const plainTools = await count('system + plain user + tool', SYSTEM_PROMPT, plainUser, true)

  if (inferTools && plainTools) {
    console.log('')
    console.log('=== what this means ===')
    console.log('  fixed overhead is ~' + inferTools + ' tok = $' + ((inferTools / 1e6) * 2).toFixed(5))
    console.log('  even re-sent across 5 turns: $' + (((inferTools * 5) / 1e6) * 2).toFixed(4))
    console.log('  observed cost per lookup:    $0.17')
    console.log('  -> prompt size accounts for ' + (((inferTools * 5) / 1e6) * 2 / 0.17 * 100).toFixed(1) + '% of it')
  }
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
