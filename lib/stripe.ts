import 'server-only'

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

// Keep backwards compatibility but lazy
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
