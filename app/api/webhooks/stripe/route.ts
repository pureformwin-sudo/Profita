import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Lazy init Supabase admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.payment_status === 'paid' && session.metadata?.invoice_id) {
        const invoiceId = session.metadata.invoice_id
        const amountPaid = session.amount_total ? session.amount_total / 100 : 0
        const paymentIntentId = session.payment_intent as string

        console.log('[Stripe Webhook] Processing payment for invoice:', invoiceId)

        try {
          // Get invoice details
          const { data: invoice, error: fetchError } = await supabaseAdmin
            .from('invoices')
            .select('id, total, amount_paid, job_id, customer_id, user_id, company_id')
            .eq('id', invoiceId)
            .single()

          if (fetchError || !invoice) {
            console.error('[Stripe Webhook] Invoice not found:', invoiceId)
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
          }

          // Update invoice status and amount_paid
          const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update({
              status: 'paid',
              amount_paid: (invoice.amount_paid || 0) + amountPaid,
              stripe_payment_intent_id: paymentIntentId,
            })
            .eq('id', invoiceId)

          if (updateError) {
            console.error('[Stripe Webhook] Failed to update invoice:', updateError)
            return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
          }

          // Record the payment in payments table
          const { data: payment, error: paymentError } = await supabaseAdmin
            .from('payments')
            .insert({
              company_id: invoice.company_id,
              user_id: invoice.user_id,
              invoice_id: invoiceId,
              job_id: invoice.job_id,
              customer_id: invoice.customer_id,
              amount: amountPaid,
              payment_method: 'card',
              payment_date: new Date().toISOString(),
              status: 'completed',
              stripe_payment_intent_id: paymentIntentId,
              notes: `Online payment via Stripe - ${session.metadata?.invoice_number || ''}`,
            })
            .select()
            .single()

          if (paymentError) {
            console.error('[Stripe Webhook] Failed to record payment:', paymentError)
            // Don't fail the webhook - invoice is already updated
          } else {
            console.log('[Stripe Webhook] Payment recorded:', payment?.id)
          }

          // Update job status to Paid if applicable
          if (invoice.job_id) {
            const totalPaid = (invoice.amount_paid || 0) + amountPaid
            if (totalPaid >= invoice.total) {
              await supabaseAdmin
                .from('jobs')
                .update({ status: 'Paid', paid_amount: totalPaid })
                .eq('id', invoice.job_id)
            }
          }

          console.log('[Stripe Webhook] Invoice updated successfully:', invoiceId)
        } catch (err) {
          console.error('[Stripe Webhook] Error processing payment:', err)
          return NextResponse.json({ error: 'Processing error' }, { status: 500 })
        }
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log('[Stripe Webhook] Payment failed:', paymentIntent.id)
      // Could add notification logic here
      break
    }

    default:
      console.log('[Stripe Webhook] Unhandled event type:', event.type)
  }

  return NextResponse.json({ received: true })
}
