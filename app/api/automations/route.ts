/**
 * Read and update message automation configuration.
 *
 * Company scoping comes from `resolveSendContext()`, the same helper the manual
 * send routes use, so a caller can only ever touch their own tenant.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import {
  getReviewLink,
  getWebsite,
  loadAutomations,
  loadRecentAutomationSends,
  saveAutomation,
  saveReviewLink,
  saveWebsite,
} from '@/lib/automations-storage'
import { getAutomationType, type AutomationTypeId } from '@/lib/message-automations'

export async function GET() {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { ctx } = resolved

    const [{ configs, needsSetup }, reviewLink, website, history] = await Promise.all([
      loadAutomations(ctx.companyId),
      getReviewLink(ctx.companyId),
      getWebsite(ctx.companyId),
      loadRecentAutomationSends(ctx.companyId),
    ])

    return NextResponse.json({ configs, needsSetup, reviewLink, website, history })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load automations'
    console.error('[Automations API] GET failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { ctx } = resolved

    const payload = (await req.json().catch(() => null)) as {
      automationType?: string
      enabled?: boolean
      messageBody?: string
      delayMinutes?: number
      quietHoursStart?: number
      quietHoursEnd?: number
      cooldownDays?: number
      timezone?: string
      reviewLink?: string
      website?: string
    } | null

    if (!payload?.automationType) {
      return NextResponse.json({ error: 'automationType is required' }, { status: 400 })
    }

    const def = getAutomationType(payload.automationType as AutomationTypeId)
    if (!def) {
      return NextResponse.json(
        { error: `Unknown automation type: ${payload.automationType}` },
        { status: 400 },
      )
    }

    const body = (payload.messageBody ?? '').trim()
    if (!body) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    // Validate the window here as well as in the DB constraint, so the user gets
    // a readable message instead of a raw Postgres violation.
    const start = Number(payload.quietHoursStart ?? def.defaultQuietHoursStart)
    const end = Number(payload.quietHoursEnd ?? def.defaultQuietHoursEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
      return NextResponse.json(
        { error: 'Send window must start before it ends' },
        { status: 400 },
      )
    }

    const delay = Number(payload.delayMinutes ?? def.defaultDelayMinutes)
    if (!Number.isInteger(delay) || delay < 0 || delay > 10080) {
      return NextResponse.json(
        { error: 'Delay must be between 0 minutes and 7 days' },
        { status: 400 },
      )
    }

    const cooldown = Number(payload.cooldownDays ?? def.defaultCooldownDays)
    if (!Number.isInteger(cooldown) || cooldown < 0) {
      return NextResponse.json({ error: 'Cooldown must be 0 or more days' }, { status: 400 })
    }

    // Save the link first: enabling an automation whose body needs a link that
    // failed to save would just produce skipped sends.
    if (payload.reviewLink !== undefined) {
      await saveReviewLink(ctx.companyId, payload.reviewLink)
    }
    if (payload.website !== undefined) {
      await saveWebsite(ctx.companyId, payload.website)
    }

    await saveAutomation(ctx.companyId, ctx.userId, def.id, {
      enabled: Boolean(payload.enabled),
      messageBody: body,
      delayMinutes: delay,
      quietHoursStart: start,
      quietHoursEnd: end,
      cooldownDays: cooldown,
      timezone: payload.timezone?.trim() || def.defaultTimezone,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save automation'
    console.error('[Automations API] PUT failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
