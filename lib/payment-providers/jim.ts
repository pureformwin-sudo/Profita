// ============================================================================
// JIM provider adapter (https://www.jim.com)
// ----------------------------------------------------------------------------
// JIM is an external mobile app (iOS/Android) by CloudWalk. As of this build
// JIM publishes NO public URL scheme, deep link, developer API, or webhooks.
// The verified workflow is entirely in-app: open JIM, type the amount, then
// Tap to Pay or create a Payment Link and share it.
//
// Therefore this adapter:
//   * Does NOT invent a `jim://` scheme or any API.
//   * Launches JIM via its official App Store / Play Store listing (which, on
//     a device with JIM installed, offers to open the app) or its website.
//   * Keeps the amount one tap away (the UI provides "Copy Amount").
//   * Records payments only after the user manually confirms completion.
//
// EXTENSION POINTS (fill in when JIM publishes them — see capabilities):
//   * deepLink: set JIM_DEEP_LINK to the official universal link. The UI will
//     prefer it automatically (ExternalLaunch.deepLink).
//   * oauth / paymentApi / transactionLookup / webhooks / autoReconcile:
//     implement matching methods + flip the capability flag. The manual
//     confirmation step can then be replaced without touching invoices.
// ============================================================================

import type {
  PaymentProviderAdapter,
  FeeInput,
  FeeEstimate,
  ExternalLaunch,
  DevicePlatform,
} from './types'

// Official, published destinations only.
const JIM_IOS_APP_STORE = 'https://apps.apple.com/us/app/jim'
const JIM_ANDROID_PLAY_STORE = 'https://play.google.com/store/search?q=jim%20payments&c=apps'
const JIM_WEBSITE = 'https://www.jim.com/'

// No verified deep link exists yet. Leave null. When JIM publishes an official
// universal link, set it here and the UI will use it automatically.
const JIM_DEEP_LINK: string | null = null

// Current published JIM rates (subject to change — always shown as estimates).
export const JIM_TAP_RATE = 0.0199 // 1.99% per tap
export const JIM_LINK_RATE = 0.0499 // 4.99% per link
export const JIM_LINK_FLAT = 0.3 // + $0.30 per link

export const jimProvider: PaymentProviderAdapter = {
  id: 'jim',
  label: 'JIM',
  capabilities: {
    tapToPay: true,
    paymentLink: true,
    isExternalApp: true,
    // Not yet published by JIM — manual workflow used until these exist.
    oauth: false,
    paymentApi: false,
    transactionLookup: false,
    webhooks: false,
    autoReconcile: false,
  },

  calculateEstimatedFee({ amount, paymentType }: FeeInput): FeeEstimate {
    const amt = Number.isFinite(amount) && amount > 0 ? amount : 0
    let fee = 0
    let rateLabel = ''
    if (paymentType === 'tap_to_pay') {
      fee = amt * JIM_TAP_RATE
      rateLabel = '1.99% per tap'
    } else if (paymentType === 'payment_link') {
      fee = amt * JIM_LINK_RATE + JIM_LINK_FLAT
      rateLabel = '4.99% + $0.30 per link'
    }
    fee = Math.round(fee * 100) / 100
    return {
      fee,
      net: Math.round((amt - fee) * 100) / 100,
      isEstimate: true,
      rateLabel,
    }
  },

  getExternalLaunch(platform: DevicePlatform): ExternalLaunch {
    let url = JIM_WEBSITE
    if (platform === 'ios') url = JIM_IOS_APP_STORE
    else if (platform === 'android') url = JIM_ANDROID_PLAY_STORE
    return {
      url: JIM_DEEP_LINK || url,
      deepLink: JIM_DEEP_LINK,
      label: 'Open JIM',
    }
  },
}
