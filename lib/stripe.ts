import 'server-only'

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    }
    _stripe = new Stripe(key, {
      apiVersion: '2025-04-30.basil',
    })
  }
  return _stripe
}

// Export the getter function as the default way to access Stripe
// This ensures lazy initialization and proper error handling
export const stripe = {
  get checkout() {
    return getStripe().checkout
  },
  get webhooks() {
    return getStripe().webhooks
  },
  get customers() {
    return getStripe().customers
  },
  get paymentIntents() {
    return getStripe().paymentIntents
  },
}

// Also export getStripe for cases where direct Stripe instance access is needed
export { getStripe as getStripeInstance }
