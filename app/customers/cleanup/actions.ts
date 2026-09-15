'use server'

import { getCustomers, updateCustomer } from '@/lib/storage'
import { auditCustomers, type CleanupSuggestion } from '@/lib/customer-cleanup'

export interface AuditResult {
  suggestions: CleanupSuggestion[]
  counts: {
    total: number
    autoFixable: number
    needsReview: number
    clean: number
  }
}

/** Read-only: load every (company-scoped) customer and audit it. */
export async function runCustomerAudit(): Promise<AuditResult> {
  const customers = await getCustomers()
  const suggestions = auditCustomers(customers)

  const autoFixable = suggestions.filter((s) => s.autoFixed).length
  const needsReview = suggestions.filter((s) => s.needsReview).length

  return {
    suggestions,
    counts: {
      total: suggestions.length,
      autoFixable,
      needsReview,
      clean: suggestions.length - autoFixable - needsReview,
    },
  }
}

export interface CleanupDecision {
  customerId: string
  name?: string
  /** Empty string clears the phone; undefined leaves it untouched. */
  phone?: string
}

export interface ApplyResult {
  appliedCount: number
  failures: { id: string; name: string; error: string }[]
}

/**
 * Apply reviewed decisions. This is a best-effort batch: every decision is
 * attempted, per-row outcomes are collected, and the result reports which rows
 * failed. It never throws on a partial failure — the caller re-audits after so
 * the screen reflects exactly what landed.
 */
export async function applyCustomerCleanup(
  decisions: CleanupDecision[],
): Promise<ApplyResult> {
  const failures: ApplyResult['failures'] = []
  let appliedCount = 0

  for (const decision of decisions) {
    const updates: { name?: string; phone?: string } = {}
    if (decision.name !== undefined) updates.name = decision.name
    // `phone: ''` intentionally clears the field (e.g. after moving a misfiled
    // last name into the name); undefined leaves it alone.
    if (decision.phone !== undefined) updates.phone = decision.phone

    if (Object.keys(updates).length === 0) continue

    try {
      const result = await updateCustomer(decision.customerId, updates)
      if (result) {
        appliedCount += 1
      } else {
        failures.push({
          id: decision.customerId,
          name: decision.name ?? decision.customerId,
          error: 'Update returned no row',
        })
      }
    } catch (err) {
      failures.push({
        id: decision.customerId,
        name: decision.name ?? decision.customerId,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { appliedCount, failures }
}
