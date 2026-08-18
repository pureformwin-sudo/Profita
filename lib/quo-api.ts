/**
 * Outbound Quo API client.
 *
 * The key is read from process.env.QUO_API_KEY at call time and is NEVER
 * hardcoded, logged, or returned. Every function here is best-effort: it returns
 * null instead of throwing, because an enrichment failure must never cause the
 * webhook to reject a delivery that we already stored.
 */

/** Quo is the rebrand of OpenPhone, so the API host is overridable. */
const QUO_API_BASE = process.env.QUO_API_BASE_URL ?? 'https://api.openphone.com/v1'

export function hasQuoApiKey(): boolean {
  return Boolean(process.env.QUO_API_KEY)
}

/**
 * Look up a contact's display name in Quo by phone number.
 *
 * Used only to give an auto-created lead a real name instead of just a number.
 * Returns null when the key is unset, the contact is unknown, or anything fails.
 */
export async function lookupQuoContactName(phone: string): Promise<string | null> {
  const key = process.env.QUO_API_KEY
  if (!key) return null

  try {
    const url = new URL(`${QUO_API_BASE}/contacts`)
    url.searchParams.append('phoneNumbers[]', phone)

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Quo/OpenPhone use the bare key (no "Bearer " prefix).
        Authorization: key,
        'content-type': 'application/json',
      },
      // Never let a slow third party hold the webhook open.
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn(`[Quo API] Contact lookup returned ${res.status}`)
      return null
    }

    const json: any = await res.json()
    const contact = Array.isArray(json?.data) ? json.data[0] : json?.data

    if (!contact) return null

    const first = typeof contact.firstName === 'string' ? contact.firstName.trim() : ''
    const last = typeof contact.lastName === 'string' ? contact.lastName.trim() : ''
    const full = [first, last].filter(Boolean).join(' ')

    if (full) return full
    if (typeof contact.name === 'string' && contact.name.trim()) {
      return contact.name.trim()
    }
    return null
  } catch (err) {
    // Timeouts and network errors are expected occasionally; stay quiet-ish.
    console.warn(
      '[Quo API] Contact lookup failed:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return null
  }
}
