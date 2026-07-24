// ============================================================================
// Manual providers: Cash, Check, Other.
// No processing fee, no external app — recorded directly in Profita.
// ============================================================================

import type { PaymentProviderAdapter, FeeEstimate } from './types'

function zeroFee(amount: number): FeeEstimate {
  const amt = Number.isFinite(amount) && amount > 0 ? amount : 0
  return { fee: 0, net: amt, isEstimate: false, rateLabel: 'No processing fee' }
}

const baseCaps = {
  tapToPay: false,
  paymentLink: false,
  isExternalApp: false,
  oauth: false,
  paymentApi: false,
  transactionLookup: false,
  webhooks: false,
  autoReconcile: false,
}

export const cashProvider: PaymentProviderAdapter = {
  id: 'cash',
  label: 'Cash',
  capabilities: { ...baseCaps },
  calculateEstimatedFee: ({ amount }) => zeroFee(amount),
}

export const checkProvider: PaymentProviderAdapter = {
  id: 'check',
  label: 'Check',
  capabilities: { ...baseCaps },
  calculateEstimatedFee: ({ amount }) => zeroFee(amount),
}

export const otherProvider: PaymentProviderAdapter = {
  id: 'other',
  label: 'Other',
  capabilities: { ...baseCaps },
  calculateEstimatedFee: ({ amount }) => zeroFee(amount),
}
