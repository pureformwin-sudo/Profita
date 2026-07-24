// ============================================================================
// Payment provider registry.
// Central place to resolve a provider adapter. Add new processors here.
// ============================================================================

import type { PaymentProvider, PaymentType, PaymentMethod } from '@/lib/payments-types'
import type { PaymentProviderAdapter, DevicePlatform } from './types'
import { jimProvider } from './jim'
import { cashProvider, checkProvider, otherProvider } from './manual'

export * from './types'
export { jimProvider } from './jim'

const REGISTRY: Record<PaymentProvider, PaymentProviderAdapter> = {
  jim: jimProvider,
  cash: cashProvider,
  check: checkProvider,
  other: otherProvider,
  // Stripe exists in the schema for historical/legacy rows; treat like manual
  // here until a full Stripe adapter is implemented.
  stripe: { ...otherProvider, id: 'stripe', label: 'Stripe' },
}

export function getProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return REGISTRY[provider] || otherProvider
}

// Detect the current device platform (client-side only) for external launches.
export function detectPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

// The concrete payment_method stored for a given provider. JIM processes cards,
// so its method is 'card'; provider tracks that JIM was used.
export function methodForProvider(provider: PaymentProvider): PaymentMethod {
  switch (provider) {
    case 'jim':
      return 'card'
    case 'cash':
      return 'cash'
    case 'check':
      return 'check'
    case 'stripe':
      return 'stripe'
    default:
      return 'other'
  }
}

// Human-readable label for a payment type.
export function paymentTypeLabel(type: PaymentType | null): string {
  switch (type) {
    case 'tap_to_pay':
      return 'Tap to Pay'
    case 'payment_link':
      return 'Payment Link'
    case 'manual':
      return 'Manual'
    default:
      return ''
  }
}
