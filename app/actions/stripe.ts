'use server'

import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function createInvoicePaymentSession(invoiceId: string) {
  const supabase = await createClient()
  
  // Get invoice details
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, customers(name, email)')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) {
    throw new Error('Invoice not found')
  }

  if (invoice.status === 'Paid') {
    throw new Error('Invoice already paid')
  }

  const amountDue = Math.round((invoice.total - invoice.amount_paid) * 100) // Convert to cents

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    redirect_on_completion: 'never',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `Payment for services - ${invoice.customers?.name || 'Customer'}`,
          },
          unit_amount: amountDue,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    metadata: {
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
    },
  })

  return session.client_secret
}

export async function handlePaymentSuccess(sessionId: string) {
  const supabase = await createClient()
  
  // Retrieve session from Stripe
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  
  if (session.payment_status === 'paid' && session.metadata?.invoice_id) {
    // Update invoice status
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'Paid',
        amount_paid: session.amount_total ? session.amount_total / 100 : 0,
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .eq('id', session.metadata.invoice_id)

    if (error) {
      console.error('Error updating invoice:', error)
      throw new Error('Failed to update invoice')
    }

    return { success: true, invoiceId: session.metadata.invoice_id }
  }

  return { success: false }
}

export async function getPaymentLink(invoiceId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/pay/${invoiceId}`
}
