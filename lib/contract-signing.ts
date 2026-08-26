/**
 * Public, token-scoped access to a single contract for signing.
 *
 * This is the only part of the contracts feature reachable without logging in,
 * so it is deliberately narrow:
 *
 *  - Lookup is by share token ONLY. The caller never supplies a contract id,
 *    so there is nothing to enumerate or tamper with.
 *  - The payload returned to the browser is an explicit allowlist of display
 *    fields. Internal ids (company_id, customer_id) never cross the wire.
 *  - Signing is a one-way transition from `final` to `signed`, guarded in the
 *    UPDATE itself so a double-submit cannot overwrite an existing signature.
 *
 * Uses the service-role key because an anonymous visitor has no RLS identity.
 * That makes the token check the entire security boundary — treat it as such.
 */

import { createClient } from '@supabase/supabase-js'
import type { SignatureKind } from '@/lib/types'

/** Max size of a drawn-signature PNG. Guards against multi-MB payloads. */
const MAX_SIGNATURE_BYTES = 400_000

/** Typed names are a legal signature; keep them sane but permissive. */
const MAX_NAME_LENGTH = 120

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Exactly what the public signing page is allowed to see. */
export interface PublicContract {
  contractNumber: string
  customerName: string
  serviceAddress: string | null
  price: number | null
  termYears: number | null
  installDate: string | null
  takedownDate: string | null
  notes: string | null
  /** Frozen wording. Never the live template. */
  body: string
  status: 'final' | 'signed'
  companyName: string | null
  /** Present only once signed. */
  signatureKind: SignatureKind | null
  signatureName: string | null
  signatureImage: string | null
  signedAt: string | null
  companySignatureName: string | null
  companySignedAt: string | null
}

function num(v: string | number | null): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

/**
 * Shape of the columns selected below.
 *
 * The service-role client is untyped (no generated Database types), so
 * `.select()` on a built-up column string widens to an error union. Declaring
 * the row explicitly keeps the mapping below type-checked.
 */
interface TokenRow {
  contract_number: string
  customer_name: string
  service_address: string | null
  price: string | number | null
  term_years: number | null
  install_date: string | null
  takedown_date: string | null
  notes: string | null
  body_snapshot: string | null
  status: string
  company_signature_name: string | null
  company_signed_at: string | null
  signature_kind: string | null
  signature_name: string | null
  signature_image: string | null
  signed_at: string | null
  company_id: string
}

/**
 * Resolve a share token to its contract.
 *
 * Returns null for any token that doesn't match, isn't shared, or belongs to a
 * contract that was reverted to draft — the caller renders one generic
 * "not available" state for all of these so the response can't be used to
 * probe which tokens once existed.
 */
export async function loadContractByToken(token: string): Promise<PublicContract | null> {
  if (!token || token.length < 20) return null

  const supabase = serviceClient()

  const { data: raw, error } = await supabase
    .from('light_contracts')
    .select(
      'contract_number, customer_name, service_address, price, term_years, install_date, ' +
        'takedown_date, notes, body_snapshot, status, company_signature_name, ' +
        'company_signed_at, signature_kind, signature_name, signature_image, signed_at, company_id',
    )
    .eq('share_token', token)
    .maybeSingle()

  if (error || !raw) return null
  const data = raw as unknown as TokenRow
  // A draft has no frozen wording; there is nothing safe to present.
  if (data.status !== 'final' && data.status !== 'signed') return null
  if (!data.body_snapshot) return null

  // Business name for the letterhead, resolved separately so it stays current.
  const { data: settings } = await supabase
    .from('settings')
    .select('profile')
    .eq('company_id', data.company_id)
    .limit(1)
    .maybeSingle()

  const profile = (settings?.profile ?? null) as { businessName?: string } | null

  return {
    contractNumber: data.contract_number,
    customerName: data.customer_name,
    serviceAddress: data.service_address,
    price: num(data.price),
    termYears: data.term_years,
    installDate: data.install_date,
    takedownDate: data.takedown_date,
    notes: data.notes,
    body: data.body_snapshot,
    status: data.status,
    companyName: profile?.businessName ?? null,
    signatureKind:
      data.signature_kind === 'typed' || data.signature_kind === 'drawn'
        ? data.signature_kind
        : null,
    signatureName: data.signature_name,
    signatureImage: data.signature_image,
    signedAt: data.signed_at,
    companySignatureName: data.company_signature_name,
    companySignedAt: data.company_signed_at,
  }
}

export interface SignInput {
  token: string
  kind: SignatureKind
  /** Typed legal name. Required for both kinds. */
  name: string
  /** PNG data URL. Required when kind is 'drawn'. */
  image?: string | null
  ip?: string | null
  userAgent?: string | null
}

export type SignResult =
  | { ok: true; contract: PublicContract }
  | { ok: false; status: number; error: string }

/** Reject anything that isn't a bounded inline PNG. */
function validateSignatureImage(image: string): string | null {
  if (!image.startsWith('data:image/png;base64,')) {
    return 'Signature image must be a PNG.'
  }
  // base64 inflates by ~4/3; compare against the decoded size.
  const base64 = image.slice('data:image/png;base64,'.length)
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return 'Signature image is malformed.'
  if ((base64.length * 3) / 4 > MAX_SIGNATURE_BYTES) return 'Signature image is too large.'
  return null
}

export async function signContract(input: SignInput): Promise<SignResult> {
  const name = (input.name ?? '').trim()

  if (!input.token) return { ok: false, status: 400, error: 'Missing signing token.' }
  if (!name) return { ok: false, status: 400, error: 'Please enter your full legal name.' }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, status: 400, error: 'That name is too long.' }
  }
  if (input.kind !== 'typed' && input.kind !== 'drawn') {
    return { ok: false, status: 400, error: 'Invalid signature type.' }
  }

  let image: string | null = null
  if (input.kind === 'drawn') {
    if (!input.image) {
      return { ok: false, status: 400, error: 'Please draw your signature before signing.' }
    }
    const imageError = validateSignatureImage(input.image)
    if (imageError) return { ok: false, status: 400, error: imageError }
    image = input.image
  }

  const supabase = serviceClient()
  const signedAt = new Date().toISOString()

  // The `.eq('status', 'final')` filter is the concurrency guard: a second
  // submit matches zero rows rather than overwriting the first signature.
  const { data, error } = await supabase
    .from('light_contracts')
    .update({
      status: 'signed',
      signature_kind: input.kind,
      signature_name: name,
      signature_image: image,
      signed_at: signedAt,
      signer_ip: input.ip ?? null,
      signer_user_agent: input.userAgent?.slice(0, 400) ?? null,
    })
    .eq('share_token', input.token)
    .eq('status', 'final')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[v0] contract signing failed:', error.message)
    return { ok: false, status: 500, error: 'Could not record the signature.' }
  }

  if (!data) {
    // Either the token is bad or it was already signed. Distinguish so an
    // honest double-click gets a sensible message instead of a hard error.
    const existing = await loadContractByToken(input.token)
    if (existing?.status === 'signed') {
      return { ok: true, contract: existing }
    }
    return { ok: false, status: 404, error: 'This contract is no longer available to sign.' }
  }

  const contract = await loadContractByToken(input.token)
  if (!contract) {
    return { ok: false, status: 500, error: 'Signed, but the contract could not be reloaded.' }
  }
  return { ok: true, contract }
}
