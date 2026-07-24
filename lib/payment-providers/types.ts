// ============================================================================
// Payment Provider Adapter architecture
// ----------------------------------------------------------------------------
// A provider-agnostic interface so new processors (JIM today; Stripe, Square,
// etc. later) can be added WITHOUT changing invoices, payments, or finances.
//
// IMPORTANT: Adapters must NEVER fabricate provider APIs, URL schemes, deep
// links, or webhook payloads. When a capability is not officially documented,
// the adapter exposes it as unsupported (returns null / false) and the UI falls
// back to the manual, human-in-the-loop workflow.
// ============================================================================

import type { PaymentProvider, PaymentType, FeePaidBy } from '@/lib/payments-types'

export type DevicePlatform = 'ios' | 'android' | 'other'

// Estimated processing fee for a given amount + payment type.
export interface FeeEstimate {
  fee: number
  net: number
  // Always true for external/manual providers — rates can change and the
  // actual fee is only known inside the provider app, so we never assert it.
  isEstimate: boolean
  // Human-readable rate description, e.g. "1.99% per tap".
  rateLabel: string
}

export interface FeeInput {
  amount: number
  paymentType: PaymentType
  feePaidBy?: FeePaidBy
}

// Describes how to launch an external provider app/site. No invented schemes —
// only officially published destinations (app store / web) are returned.
export interface ExternalLaunch {
  // Best-effort URL to open. On mobile this is typically the store listing
  // (which offers to open the installed app); on desktop, the provider site.
  url: string
  // A documented deep link / universal link, if and when the provider
  // publishes one. Null until verified — see JIM adapter notes.
  deepLink: string | null
  label: string
}

// Capability flags + extension points for future provider integrations.
export interface ProviderCapabilities {
  tapToPay: boolean
  paymentLink: boolean
  isExternalApp: boolean
  // ---- Documented FUTURE extension points (all false today) --------------
  // Flip these on (and implement the matching adapter methods) if/when the
  // provider publishes the capability. The manual-confirmation flow can then
  // be replaced without touching invoices/payments.
  oauth: boolean            // JIM OAuth / account connect
  paymentApi: boolean       // programmatic payment creation
  transactionLookup: boolean// query a transaction/reference status
  webhooks: boolean         // async payment confirmation
  autoReconcile: boolean    // automatic matching to invoices
}

export interface PaymentProviderAdapter {
  id: PaymentProvider
  label: string
  capabilities: ProviderCapabilities

  // Estimate the processing fee. UI labels the result as an estimate.
  calculateEstimatedFee(input: FeeInput): FeeEstimate

  // How to open the provider's external app/site for this platform. Returns
  // null for non-external providers (cash/check/other).
  getExternalLaunch?(platform: DevicePlatform): ExternalLaunch | null
}
