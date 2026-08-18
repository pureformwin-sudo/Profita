import crypto from 'crypto'

/**
 * Pure helpers for the Quo webhook. No Supabase / no Next imports here so this
 * stays unit-testable.
 *
 * Quo uses Svix-style webhook signing (the same scheme OpenPhone and many others
 * use): the signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
 * base64 secret that follows the `whsec_` prefix, and the `svix-signature` header
 * may carry MULTIPLE space-separated versioned signatures (`v1,<sig> v1,<sig2>`)
 * during secret rotation — any one matching is valid.
 */

export type QuoKind = 'call' | 'message' | 'other'
export type QuoDirection = 'incoming' | 'outgoing' | null

export interface ParsedQuoEvent {
  quoEventId: string
  eventType: string
  kind: QuoKind
  direction: QuoDirection
  status: string | null
  fromNumber: string | null
  toNumber: string | null
  /** counterparty number, normalized to last 10 digits */
  contactNumber: string | null
  body: string | null
  durationSeconds: number | null
  recordingUrl: string | null
  occurredAt: string | null
  quoOrgId: string | null
}

/**
 * Normalize a phone number to its last 10 digits.
 *
 * This database contains BOTH '(559) 930-5181' and '5599602286' formats, and
 * `leads.phone` uses '' rather than NULL, so exact-string matching silently fails.
 * Comparing the last 10 digits also makes '+15599305181' match '(559) 930-5181'.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

/** Constant-time compare that won't throw on differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/**
 * Verify a Svix-style signature. Returns true when any provided v1 signature
 * matches. `secret` may be given with or without the `whsec_` prefix.
 */
export function verifyQuoSignature(opts: {
  body: string
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
  /**
   * One or more signing secrets. Quo models calls and messages as SEPARATE
   * webhook resources (POST /v1/webhooks/calls vs /v1/webhooks/messages), and
   * each one is issued its own secret — so verifying both requires trying each.
   */
  secret: string | string[]
  /** reject events older than this many seconds (replay protection) */
  toleranceSeconds?: number
  now?: number
}): { ok: true } | { ok: false; reason: string } {
  const { body, svixId, svixTimestamp, svixSignature, secret } = opts
  const tolerance = opts.toleranceSeconds ?? 300
  const now = opts.now ?? Date.now()

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing signature headers' }
  }

  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'invalid timestamp' }
  }
  // Svix timestamps are seconds.
  if (Math.abs(now / 1000 - ts) > tolerance) {
    return { ok: false, reason: 'timestamp outside tolerance' }
  }

  const secrets = (Array.isArray(secret) ? secret : [secret])
    .map((s) => s.trim())
    .filter(Boolean)
  if (secrets.length === 0) return { ok: false, reason: 'no secret configured' }

  // Header may hold several versioned sigs: "v1,<sigA> v1,<sigB>"
  const provided = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))

  let sawUsableSecret = false
  for (const candidate of secrets) {
    const raw = candidate.startsWith('whsec_')
      ? candidate.slice('whsec_'.length)
      : candidate
    let key: Buffer
    try {
      key = Buffer.from(raw, 'base64')
    } catch {
      continue // try the next secret rather than failing outright
    }
    sawUsableSecret = true

    const expected = crypto
      .createHmac('sha256', key)
      .update(`${svixId}.${svixTimestamp}.${body}`)
      .digest('base64')

    for (const sig of provided) {
      if (safeEqual(sig, expected)) return { ok: true }
    }
  }

  if (!sawUsableSecret) return { ok: false, reason: 'malformed secret' }
  return { ok: false, reason: 'no matching signature' }
}

function classify(eventType: string): QuoKind {
  const t = eventType.toLowerCase()
  if (t.includes('call')) return 'call'
  if (t.includes('message') || t.includes('sms')) return 'message'
  return 'other'
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v)
    }
  }
  return null
}

/**
 * Parse a Quo webhook envelope into our row shape.
 *
 * Deliberately defensive: providers nest the resource under `data.object`,
 * `data`, or the root depending on event, and field names vary
 * (`text`/`body`, `duration`/`durationSeconds`, `createdAt`/`completedAt`).
 * Unknown shapes still yield a row — `raw` always holds the original payload.
 */
export function parseQuoEvent(payload: any): ParsedQuoEvent | null {
  if (!payload || typeof payload !== 'object') return null

  const eventType = firstString(payload.type, payload.event, payload.eventType) ?? 'unknown'

  // resource may be at data.object, data, or root
  const data = payload.data ?? {}
  const obj = data.object ?? data ?? {}

  const quoEventId = firstString(payload.id, payload.eventId, obj.eventId)
  if (!quoEventId) return null

  const kind = classify(eventType)

  const rawDirection = firstString(obj.direction, data.direction)?.toLowerCase() ?? null
  const direction: QuoDirection =
    rawDirection === 'incoming' || rawDirection === 'inbound'
      ? 'incoming'
      : rawDirection === 'outgoing' || rawDirection === 'outbound'
        ? 'outgoing'
        : null

  const fromNumber = firstString(
    typeof obj.from === 'string' ? obj.from : obj.from?.phoneNumber,
    obj.fromNumber,
  )
  const toNumber = firstString(
    typeof obj.to === 'string' ? obj.to : Array.isArray(obj.to) ? obj.to[0]?.phoneNumber ?? obj.to[0] : obj.to?.phoneNumber,
    obj.toNumber,
  )

  // The counterparty is whichever end isn't us: for incoming that's `from`.
  const counterparty = direction === 'outgoing' ? toNumber : fromNumber

  return {
    quoEventId,
    eventType,
    kind,
    direction,
    status: firstString(obj.status, data.status),
    fromNumber,
    toNumber,
    contactNumber: normalizePhone(counterparty),
    body: kind === 'message' ? firstString(obj.text, obj.body, obj.message) : null,
    durationSeconds: kind === 'call' ? firstNumber(obj.duration, obj.durationSeconds) : null,
    recordingUrl: firstString(
      obj.recordingUrl,
      Array.isArray(obj.media) ? obj.media[0]?.url : undefined,
    ),
    occurredAt: firstString(obj.createdAt, obj.completedAt, obj.answeredAt, payload.createdAt),
    quoOrgId: firstString(payload.orgId, payload.context?.orgId, obj.orgId),
  }
}

/**
 * Map our coarse kind onto lead_activities.activity_type.
 *
 * The column has a CHECK constraint allowing only:
 *   knock | call | voicemail | sms | email | note | status_change | quote_sent |
 *   quote_viewed | follow_up_set | appointment | meeting | converted | lost
 * so a message must be 'sms' ('text' would violate the constraint), and 'other'
 * events get no activity row at all rather than a bogus one.
 */
export function activityTypeFor(kind: QuoKind): 'call' | 'sms' | null {
  if (kind === 'call') return 'call'
  if (kind === 'message') return 'sms'
  return null
}
