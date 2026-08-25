/**
 * Automation type registry.
 *
 * Each automation *type* (Review Request, and whatever comes next) is declared
 * here in code: its trigger semantics, default copy, and which template tokens
 * it can resolve. Per-company state — enabled, edited body, delay, quiet hours,
 * cooldown — lives in the `message_automations` table.
 *
 * Adding a new automation later is one entry in AUTOMATION_TYPES plus a token
 * resolver if it needs variables beyond the shared ones. The cron sweep, the
 * settings UI, and the send path are all driven off this registry, so none of
 * them need to change.
 */

export type AutomationTypeId = 'review_request' | 'booking_confirmation'

export type AutomationTokenId =
  | 'first_name'
  | 'name'
  | 'company'
  | 'review_link'
  | 'website'

/**
 * What the automation's clock is measured from.
 *
 * - `job_completed` — counts forward from `jobs.completed_at`, so `delayMinutes`
 *   means "this long after the work finished".
 * - `job_created` — counts forward from `jobs.created_at`, so `delayMinutes`
 *   means "this long after the job was added or scheduled in the system". Fires
 *   at booking time, independent of when the appointment itself falls.
 */
export type AutomationTriggerAnchor = 'job_completed' | 'job_created'

export type AutomationTypeDef = {
  id: AutomationTypeId
  label: string
  /** One-line explanation shown in the automations list. */
  description: string
  /** Human-readable trigger, rendered in the UI so the rule is never implicit. */
  triggerLabel: string
  triggerAnchor: AutomationTriggerAnchor
  /**
   * Noun for the trigger event, used to label the delay control ("30 minutes
   * after booking") instead of hardcoding "after completion" for every type.
   */
  delayNoun: string
  /**
   * Job statuses that keep a job eligible once its delay has elapsed.
   *
   * Includes the states *after* Completed, because a job can be invoiced or paid
   * within the delay window and the review request should still go out — the
   * work was finished either way.
   */
  triggerStatuses: string[]
  defaultBody: string
  defaultDelayMinutes: number
  defaultCooldownDays: number
  /** Local-time send window: inclusive start hour, exclusive end hour. */
  defaultQuietHoursStart: number
  defaultQuietHoursEnd: number
  defaultTimezone: string
  /**
   * Tokens this type knows how to fill. A body referencing anything outside
   * this list is a configuration error, caught before a send goes out.
   */
  supportedTokens: AutomationTokenId[]
  /**
   * Tokens that must resolve to a non-empty value. `first_name` is deliberately
   * NOT required — the send is skipped for a nameless recipient rather than
   * failing the whole automation.
   */
  requiredTokens: AutomationTokenId[]
}

/**
 * Quiet-hours default zone.
 *
 * Cron runs in UTC, so a company that has never set a zone still needs a real
 * one or "8am-8pm" would be evaluated against UTC and fire overnight.
 *
 * Declared before AUTOMATION_TYPES because the table references it at module
 * init; a `const` below it would be in its temporal dead zone.
 */
export const DEFAULT_AUTOMATION_TIMEZONE = 'America/Los_Angeles'

/**
 * Default Review Request copy. Deliberately says nothing about referrals or
 * bonuses; that belongs to a separate automation type, not this one.
 *
 * The brand name is written out rather than using {{company}}, because the
 * company record holds the legal entity ("Lucent Holdings LLC") while customers
 * know the trading name. {{company}} is still available if a body wants it.
 */
const REVIEW_REQUEST_BODY =
  'Hi {{first_name}}, thanks again for choosing Lucent Exterior Cleaning! If you ' +
  "have a minute, we'd really appreciate a quick review — it helps a lot. {{review_link}}"

/**
 * Default Booking Confirmation copy.
 *
 * Generic with no name token, as specified.
 *
 * Caveat worth knowing before editing: this fires at booking time, so the
 * literal "tomorrow" is only accurate when the job happens to be booked one day
 * out (~31% of this company's history). Same-day and far-future bookings will
 * receive a "tomorrow" that doesn't match their appointment. Swapping the word
 * for a neutral phrase, or moving to a date-anchored trigger, are the two ways
 * to make it always true — both are deliberate product choices, not bugs.
 */
const BOOKING_CONFIRMATION_BODY =
  'Hi, thanks for choosing Lucent Exterior Cleaning. We will be at your home ' +
  'tomorrow to take care of everything. Check out our reviews and past work ' +
  'here: {{website}}'

export const AUTOMATION_TYPES: Record<AutomationTypeId, AutomationTypeDef> = {
  review_request: {
    id: 'review_request',
    label: 'Review Request',
    description:
      'Asks a customer for a Google review shortly after their job is finished.',
    triggerLabel: "Sent after a job's status changes to Completed",
    triggerAnchor: 'job_completed',
    delayNoun: 'completion',
    triggerStatuses: ['Completed', 'Invoiced', 'Paid', 'Closed'],
    defaultBody: REVIEW_REQUEST_BODY,
    defaultDelayMinutes: 90,
    defaultCooldownDays: 90,
    defaultQuietHoursStart: 8,
    defaultQuietHoursEnd: 20,
    defaultTimezone: DEFAULT_AUTOMATION_TIMEZONE,
    supportedTokens: ['first_name', 'name', 'company', 'review_link'],
    // Without a real URL the customer would receive a dangling sentence, so
    // this one is mandatory.
    requiredTokens: ['review_link'],
  },
  booking_confirmation: {
    id: 'booking_confirmation',
    label: 'Booking Confirmation',
    description:
      'Confirms the booking right after a job is scheduled, with a link to your work.',
    triggerLabel: 'Sent after a job is scheduled or created',
    triggerAnchor: 'job_created',
    delayNoun: 'booking',
    // Only jobs still awaiting service. A job created already Completed (logged
    // after the fact) must never be sent a booking confirmation.
    triggerStatuses: ['Scheduled', 'On the way', 'In progress'],
    defaultBody: BOOKING_CONFIRMATION_BODY,
    // Near-instant: 2 minutes rather than 0, so a job saved and then immediately
    // corrected or deleted doesn't text the customer about a booking that no
    // longer exists. The sweep interval dominates this anyway.
    defaultDelayMinutes: 2,
    // Per-job, not per-customer: a customer with two bookings in one week should
    // get a confirmation for each. Duplicate protection is the per-job ledger.
    defaultCooldownDays: 0,
    defaultQuietHoursStart: 8,
    defaultQuietHoursEnd: 20,
    defaultTimezone: DEFAULT_AUTOMATION_TIMEZONE,
    // No name tokens: the copy is intentionally generic.
    supportedTokens: ['company', 'website'],
    // The trailing "here:" would dangle without a URL.
    requiredTokens: ['website'],
  },
}

export function listAutomationTypes(): AutomationTypeDef[] {
  return Object.values(AUTOMATION_TYPES)
}

export function getAutomationType(id: string): AutomationTypeDef | null {
  return AUTOMATION_TYPES[id as AutomationTypeId] ?? null
}

export function isAutomationTypeId(id: string): id is AutomationTypeId {
  return id in AUTOMATION_TYPES
}

/** Per-company automation config as stored, with registry defaults applied. */
export type AutomationConfig = {
  automationType: AutomationTypeId
  enabled: boolean
  messageBody: string
  delayMinutes: number
  quietHoursStart: number
  quietHoursEnd: number
  cooldownDays: number
  /** IANA zone the quiet-hours window is measured in. */
  timezone: string
}

type AutomationRow = {
  automation_type?: string | null
  enabled?: boolean | null
  message_body?: string | null
  delay_minutes?: number | null
  quiet_hours_start?: number | null
  quiet_hours_end?: number | null
  cooldown_days?: number | null
  timezone?: string | null
}

/**
 * Merge a stored row over its type defaults.
 *
 * A company with no row yet resolves to defaults with `enabled: false`, so a
 * new automation never starts texting on its own — it has to be turned on.
 */
export function resolveAutomationConfig(
  type: AutomationTypeDef,
  row: AutomationRow | null | undefined,
): AutomationConfig {
  const body = row?.message_body?.trim()

  return {
    automationType: type.id,
    enabled: row?.enabled ?? false,
    messageBody: body ? body : type.defaultBody,
    delayMinutes: row?.delay_minutes ?? type.defaultDelayMinutes,
    quietHoursStart: row?.quiet_hours_start ?? type.defaultQuietHoursStart,
    quietHoursEnd: row?.quiet_hours_end ?? type.defaultQuietHoursEnd,
    cooldownDays: row?.cooldown_days ?? type.defaultCooldownDays,
    timezone: row?.timezone?.trim() || type.defaultTimezone,
  }
}

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi

/** Every distinct token referenced by a body, lowercased. */
export function extractTokens(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(TOKEN_PATTERN)) {
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

/**
 * Tokens the body uses that this automation type cannot fill.
 *
 * Surfaced in the editor so a typo like `{{firstname}}` is caught while saving
 * rather than shipping a literal `{{firstname}}` to a customer.
 */
export function findUnsupportedTokens(
  type: AutomationTypeDef,
  body: string,
): string[] {
  const supported = new Set<string>(type.supportedTokens)
  return extractTokens(body).filter((t) => !supported.has(t))
}
