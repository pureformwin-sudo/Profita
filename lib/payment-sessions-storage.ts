// ============================================================================
// Payment Sessions storage
// Resumable pending payment handoffs. When Profita sends the user to JIM we
// create a pending session so the workflow survives the app being backgrounded.
// Nothing is ever marked paid here — the user must explicitly confirm via
// recordPayment. Sessions are safely cancellable.
// ============================================================================

import { createClient } from '@/lib/supabase/client'
import type { PaymentProvider, PaymentType } from './payments-types'

export type PaymentSessionStatus = 'pending' | 'completed' | 'cancelled'

export interface PaymentSession {
  id: string
  userId: string
  companyId: string | null
  customerId: string | null
  jobId: string | null
  invoiceId: string | null
  provider: PaymentProvider
  paymentType: PaymentType | null
  amount: number
  paymentLink: string | null
  status: PaymentSessionStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentSessionInput {
  customerId?: string | null
  jobId?: string | null
  invoiceId?: string | null
  provider?: PaymentProvider
  paymentType?: PaymentType | null
  amount: number
  paymentLink?: string | null
  notes?: string | null
}

function mapRow(r: any): PaymentSession {
  return {
    id: r.id,
    userId: r.user_id,
    companyId: r.company_id,
    customerId: r.customer_id,
    jobId: r.job_id,
    invoiceId: r.invoice_id,
    provider: (r.provider || 'jim') as PaymentProvider,
    paymentType: (r.payment_type || null) as PaymentType | null,
    amount: Number(r.amount),
    paymentLink: r.payment_link ?? null,
    status: (r.status || 'pending') as PaymentSessionStatus,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function getCompanyId(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data: owned } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle()
  if (owned) return owned.id
  const { data: membership } = await supabase.rpc('get_my_membership')
  return membership?.company_id ?? null
}

/** Create a pending payment session. Returns the session or null on error. */
export async function createPaymentSession(input: PaymentSessionInput): Promise<PaymentSession | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const companyId = await getCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('payment_sessions')
    .insert({
      user_id: user.id,
      company_id: companyId,
      customer_id: input.customerId || null,
      job_id: input.jobId || null,
      invoice_id: input.invoiceId || null,
      provider: input.provider || 'jim',
      payment_type: input.paymentType || null,
      amount: input.amount,
      payment_link: input.paymentLink || null,
      status: 'pending',
      notes: input.notes || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating payment session:', error.message)
    return null
  }
  return mapRow(data)
}

/** Update a pending session (e.g. attach a pasted payment link). */
export async function updatePaymentSession(
  id: string,
  updates: Partial<Pick<PaymentSessionInput, 'amount' | 'paymentLink' | 'paymentType' | 'notes'>>,
): Promise<PaymentSession | null> {
  const supabase = createClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.amount !== undefined) patch.amount = updates.amount
  if (updates.paymentLink !== undefined) patch.payment_link = updates.paymentLink
  if (updates.paymentType !== undefined) patch.payment_type = updates.paymentType
  if (updates.notes !== undefined) patch.notes = updates.notes

  const { data, error } = await supabase
    .from('payment_sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('Error updating payment session:', error.message)
    return null
  }
  return mapRow(data)
}

/** Mark a session completed (called after the payment is recorded). */
export async function completePaymentSession(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('payment_sessions')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

/** Cancel a pending session. */
export async function cancelPaymentSession(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('payment_sessions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

/** Most recent still-pending session for the current user, if any. */
export async function getLatestPendingSession(): Promise<PaymentSession | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payment_sessions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    // Table missing or other error — treat as no pending session.
    return null
  }
  return data ? mapRow(data) : null
}
