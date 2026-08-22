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
 * Quo's documented write limit is 10 requests/second (observed on live response
 * headers: `ratelimit-policy: "per-second"; q=10; w=1`). Bulk sends stay well
 * under it — going faster just earns 429s and slows the whole run down.
 */
export const QUO_SEND_RATE_LIMIT_PER_SECOND = 10

/** Conservative gap between bulk sends, ~5/sec. */
export const QUO_SEND_INTERVAL_MS = 200

/**
 * Normalize a messy stored phone number to the E.164 form Quo requires.
 *
 * Quo validates `from`/`to` against ^\+[1-9]\d{1,14}$, and our DB holds numbers
 * in mixed shapes ("(559) 203-3939", "559-203-3939", "+15592033939"). Returns
 * null when the value cannot be a real US/E.164 number, so callers can skip it
 * instead of burning an API call on a guaranteed 400.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // Keep a leading + but strip everything else that isn't a digit.
  const hadPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  if (hadPlus) {
    // Already international; trust it if it fits E.164 bounds.
    if (digits.length < 8 || digits.length > 15) return null
    if (digits.startsWith('0')) return null
    return `+${digits}`
  }

  // Bare 10-digit US number.
  if (digits.length === 10) {
    if (digits.startsWith('0') || digits.startsWith('1')) return null
    return `+1${digits}`
  }
  // 11-digit US number with country code.
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1)
    if (area.startsWith('0') || area.startsWith('1')) return null
    return `+${digits}`
  }
  return null
}

export type QuoSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string; status: number | null; retryable: boolean }

/**
 * Send a single SMS through Quo.
 *
 * Unlike the enrichment helpers above, this deliberately DOES surface failures:
 * a send that silently returns null would show the user a success state for a
 * text that never left the building. One recipient per call — passing several
 * numbers in `to` creates a group thread rather than N personalized messages.
 */
export async function sendQuoMessage(params: {
  to: string
  from: string
  body: string
  /** Abort budget for the individual HTTP call. */
  timeoutMs?: number
}): Promise<QuoSendResult> {
  const key = process.env.QUO_API_KEY
  if (!key) {
    return { ok: false, error: 'QUO_API_KEY is not configured', status: null, retryable: false }
  }

  const to = normalizePhoneE164(params.to)
  const from = normalizePhoneE164(params.from)
  if (!to) {
    return { ok: false, error: `Unusable phone number: ${params.to}`, status: null, retryable: false }
  }
  if (!from) {
    return {
      ok: false,
      error: `Unusable sending number: ${params.from}`,
      status: null,
      retryable: false,
    }
  }
  const body = params.body?.trim()
  if (!body) {
    // Quo requires content to match .*\S.* — catch it before the round trip.
    return { ok: false, error: 'Message body is empty', status: null, retryable: false }
  }

  try {
    const res = await fetch(`${QUO_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        // Quo/OpenPhone use the bare key (no "Bearer " prefix).
        Authorization: key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ content: body, from, to: [to] }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
      cache: 'no-store',
    })

    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON body (gateway error page); fall through to the status-based path.
    }

    if (!res.ok) {
      const message =
        (typeof json?.message === 'string' && json.message) ||
        `Quo returned ${res.status}`
      return {
        ok: false,
        error: message,
        status: res.status,
        // 429 and 5xx are worth another attempt; a 400 never is.
        retryable: res.status === 429 || res.status >= 500,
      }
    }

    const id = json?.data?.id ?? json?.id ?? null
    return { ok: true, messageId: typeof id === 'string' ? id : null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    // Never log the message body or the key.
    console.warn('[Quo API] Send failed:', message)
    return { ok: false, error: message, status: null, retryable: true }
  }
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
