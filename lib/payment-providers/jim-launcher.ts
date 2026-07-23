// Client-side helper for launching the JIM app / store during a payment.
//
// IMPORTANT: JIM does NOT publish a public URL scheme, deep link, or API.
// Payments are created and confirmed inside the JIM mobile app; the merchant
// then shares a payment link (for remote pay) or taps the customer's card
// (Tap to Pay) in-app. So this helper never invents a `jim://` scheme — it
// opens the JIM website / app store listing and relies on the OS to hand off
// to the installed app, plus a copy-to-clipboard fallback for the amount.
//
// If JIM later publishes a documented deep link, wire it in `openJim()` below
// (see the EXTENSION POINT comment) — nothing else needs to change.

const JIM_WEB_URL = 'https://www.jim.com'
const JIM_IOS_URL = 'https://apps.apple.com/us/app/jim/id6478170026'
const JIM_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.jim.app'

export type MobilePlatform = 'ios' | 'android' | 'desktop'

export function detectPlatform(): MobilePlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

// Best store/app target for the current device.
export function jimTarget(platform: MobilePlatform = detectPlatform()): string {
  if (platform === 'ios') return JIM_IOS_URL
  if (platform === 'android') return JIM_ANDROID_URL
  return JIM_WEB_URL
}

// Open JIM. Opens in a new tab/window so the v0 preview iframe (or the app
// itself) is never navigated away and any in-progress payment session is kept.
export function openJim(platform: MobilePlatform = detectPlatform()) {
  // EXTENSION POINT: if JIM publishes a deep link, attempt it first here, e.g.
  //   const opened = tryDeepLink(`jim://charge?amount=${cents}`)
  //   if (opened) return
  const url = jimTarget(platform)
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// Copy the raw amount (e.g. "125.00") so the merchant can paste it into JIM.
export async function copyAmount(amount: number): Promise<boolean> {
  const text = amount.toFixed(2)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* noop */
  }
  return false
}

// Build a prefilled SMS handoff to send a JIM payment link to the customer.
export function buildPaymentLinkSms(phone: string | undefined, link: string, opts?: { businessName?: string; amount?: number }) {
  const biz = opts?.businessName ? `${opts.businessName}: ` : ''
  const amt = opts?.amount != null ? ` for $${opts.amount.toFixed(2)}` : ''
  const body = `${biz}Here's your secure payment link${amt}: ${link}`
  const num = (phone || '').replace(/[^\d+]/g, '')
  return `sms:${num}?&body=${encodeURIComponent(body)}`
}

export function buildPaymentLinkEmail(email: string | undefined, link: string, opts?: { businessName?: string; amount?: number }) {
  const amt = opts?.amount != null ? ` for $${opts.amount.toFixed(2)}` : ''
  const subject = `${opts?.businessName || 'Your'} payment link`
  const body = `Hi,\n\nYou can pay${amt} securely here:\n${link}\n\nThank you!${opts?.businessName ? `\n${opts.businessName}` : ''}`
  return `mailto:${email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
