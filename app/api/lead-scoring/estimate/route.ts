/**
 * Run Claude home-value estimates for one customer or a batch.
 *
 * Estimates are billed per web search, so this route never runs implicitly — it
 * only ever fires from an explicit user action, and it refuses addresses that
 * cannot be valued before spending anything on them.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSendContext } from '@/lib/quo-send'
import { createClient } from '@/lib/supabase/server'
import { estimateHomeValue } from '@/lib/home-value-estimator'
import { saveEstimate } from '@/lib/lead-scoring-storage'
import { isAddressValuable } from '@/lib/lead-scoring'

/**
 * Ceiling on one batch. Each address costs multiple billed searches and ~10-30s,
 * so an unbounded "estimate all 205" would blow both the budget and the function
 * timeout. The UI pages through with repeated calls.
 */
const MAX_BATCH = 10

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveSendContext()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const companyId = resolved.ctx.companyId

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY is not set. Add it in the Vars section of the v0 settings menu, then try again.',
        },
        { status: 400 },
      )
    }

    const body = (await req.json().catch(() => null)) as {
      customerId?: string
      /** Estimate the next N customers that have no estimate yet. */
      batch?: boolean
      limit?: number
    } | null

    const supabase = await createClient()

    // Resolve the target customers, always scoped to this company.
    let targets: Array<{ id: string; name: string; address: string | null }> = []

    if (body?.customerId) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, address')
        .eq('company_id', companyId)
        .eq('id', body.customerId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      targets = [
        { id: data.id as string, name: data.name as string, address: (data.address as string) ?? null },
      ]
    } else if (body?.batch) {
      const limit = Math.min(Math.max(1, body.limit ?? 5), MAX_BATCH)

      const [customersRes, existingRes] = await Promise.all([
        supabase.from('customers').select('id, name, address').eq('company_id', companyId),
        supabase
          .from('lead_scores')
          .select('customer_id, estimated_at')
          .eq('company_id', companyId),
      ])
      if (customersRes.error) throw new Error(customersRes.error.message)

      const alreadyDone = new Set(
        (existingRes.data ?? [])
          .filter((r) => r.estimated_at != null)
          .map((r) => r.customer_id as string),
      )

      targets = (customersRes.data ?? [])
        .map((c) => ({
          id: c.id as string,
          name: c.name as string,
          address: ((c.address as string | null) ?? null) || null,
        }))
        // Skip unusable addresses before spending a single search on them.
        .filter((c) => !alreadyDone.has(c.id) && isAddressValuable(c.address))
        .slice(0, limit)
    } else {
      return NextResponse.json(
        { error: 'Provide either customerId or batch: true' },
        { status: 400 },
      )
    }

    const results: Array<{
      customerId: string
      name: string
      status: 'estimated' | 'skipped' | 'failed'
      basis?: string
      estimateUsd?: number | null
      searchCount?: number
      localityInferred?: string | null
      reason?: string
    }> = []

    // Sequential on purpose: parallel calls hit Anthropic rate limits and the
    // partial-failure story gets much harder to report honestly.
    for (const target of targets) {
      if (!isAddressValuable(target.address)) {
        results.push({
          customerId: target.id,
          name: target.name,
          status: 'skipped',
          reason: 'Address is too incomplete to identify a property or area.',
        })
        continue
      }

      try {
        const estimate = await estimateHomeValue(target.address as string)
        await saveEstimate(companyId, target.id, {
          ...estimate,
          addressUsed: target.address as string,
        })
        results.push({
          customerId: target.id,
          name: target.name,
          status: 'estimated',
          basis: estimate.basis,
          estimateUsd: estimate.estimateUsd,
          searchCount: estimate.searchCount,
          localityInferred: estimate.localityInferred,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Estimate failed'
        console.error(`[Lead Scoring] estimate failed for ${target.id}:`, message)
        // One bad address must not abort the rest of the batch.
        results.push({
          customerId: target.id,
          name: target.name,
          status: 'failed',
          reason: message.slice(0, 200),
        })
      }
    }

    return NextResponse.json({
      results,
      estimated: results.filter((r) => r.status === 'estimated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Estimate request failed'
    console.error('[Lead Scoring API] POST failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
