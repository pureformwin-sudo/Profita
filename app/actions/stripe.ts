'use server'

import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import type Stripe from 'stripe'

// Custom type for Stripe errors since Stripe.errors.StripeError is a value, not a type
interface StripeErrorLike {
  type?: string
  code?: string
  param?: string
  statusCode?: number
  raw?: unknown
}

export async function createInvoicePaymentSession(invoiceId: string): Promise<string> {
  console.log('[Stripe] === Starting payment session creation ===')
  console.log('[Stripe] invoiceId:', invoiceId)
  console.log('[Stripe] STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY)
  console.log('[Stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY exists:', !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  
  try {
    // Validate invoice ID
    if (!invoiceId || typeof invoiceId !== 'string') {
      console.error('[Stripe] Invalid invoice ID:', invoiceId)
      throw new Error('Invalid invoice ID')
    }

    const supabase = await createClient()
    
    // Get invoice details
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, customers(name, email)')
      .eq('id', invoiceId)
      .single()

    if (error) {
      console.error('[Stripe] Database error fetching invoice:', error)
      throw new Error('Unable to load invoice. Please try again.')
    }

    if (!invoice) {
      console.error('[Stripe] Invoice not found:', invoiceId)
      throw new Error('Invoice not found')
    }

    console.log('[Stripe] Invoice details:', {
      id: invoice.id,
      number: invoice.invoice_number,
      status: invoice.status,
      total: invoice.total,
      totalType: typeof invoice.total,
      amountPaid: invoice.amount_paid,
      amountPaidType: typeof invoice.amount_paid,
      customerName: invoice.customers?.name || 'N/A',
    })

    // Check if already paid
    if (invoice.status === 'paid' || invoice.status === 'Paid') {
      console.error('[Stripe] Invoice already paid:', invoiceId)
      throw new Error('This invoice has already been paid')
    }

    // Calculate amount due in cents
    const total = parseFloat(invoice.total) || 0
    const amountPaid = parseFloat(invoice.amount_paid) || 0
    const amountDue = total - amountPaid
    const amountInCents = Math.round(amountDue * 100)

    console.log('[Stripe] Amount calculation:', { 
      total, 
      amountPaid, 
      amountDue, 
      amountInCents,
      isValidAmount: amountInCents >= 50
    })

    // Validate minimum amount (Stripe minimum is $0.50 = 50 cents)
    if (amountInCents < 50) {
      console.error('[Stripe] Amount too low:', amountInCents)
      throw new Error('Payment amount must be at least $0.50')
    }

    // Get the current domain for return URLs
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    console.log('[Stripe] Using base URL:', baseUrl)

    // Initialize Stripe
    console.log('[Stripe] Initializing Stripe client...')
    const stripe = getStripe()
    console.log('[Stripe] Stripe client initialized')

    // Prepare line items
    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoice_number || 'Payment'}`,
            description: `Payment for services - ${invoice.customers?.name || 'Customer'}`,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ]

    console.log('[Stripe] Line items:', JSON.stringify(lineItems, null, 2))

    // Create Checkout Session
    console.log('[Stripe] Creating checkout session...')
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      redirect_on_completion: 'never',
      line_items: lineItems,
      mode: 'payment',
      metadata: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number || '',
      },
      return_url: `${baseUrl}/pay/${invoiceId}?session_id={CHECKOUT_SESSION_ID}`,
    })

    console.log('[Stripe] Session created successfully:', {
      sessionId: session.id,
      hasClientSecret: !!session.client_secret,
      clientSecretLength: session.client_secret?.length || 0,
      paymentStatus: session.payment_status,
      status: session.status,
    })

    if (!session.client_secret) {
      console.error('[Stripe] No client secret returned from Stripe')
      throw new Error('Failed to initialize payment. Please try again.')
    }

    return session.client_secret
  } catch (err) {
    // Detailed error logging
    const error = err as Error & StripeErrorLike
    
    console.error('[Stripe] === ERROR DETAILS ===')
    console.error('[Stripe] Error message:', error.message)
    console.error('[Stripe] Error name:', error.name)
    
    // Check if it's a Stripe error
    if ('type' in error) {
      console.error('[Stripe] Stripe error type:', error.type)
      console.error('[Stripe] Stripe error code:', error.code)
      console.error('[Stripe] Stripe error param:', error.param)
      console.error('[Stripe] Stripe status code:', error.statusCode)
      console.error('[Stripe] Stripe raw:', error.raw)
    }
    
    console.error('[Stripe] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('[Stripe] === END ERROR DETAILS ===')
    
    // Re-throw user-friendly errors
    if (error.message.includes('Invoice') || 
        error.message.includes('Payment') || 
        error.message.includes('paid') ||
        error.message.includes('$0.50')) {
      throw error
    }
    
    // For Stripe API errors, provide a generic message
    throw new Error('Unable to process payment. Please try again or contact support.')
  }
}

export async function handlePaymentSuccess(sessionId: string) {
  console.log('[Stripe] Handling payment success for session:', sessionId)
  
  try {
    const supabase = await createClient()
    const stripe = getStripe()
    
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    console.log('[Stripe] Session retrieved:', {
      paymentStatus: session.payment_status,
      invoiceId: session.metadata?.invoice_id,
      amountTotal: session.amount_total,
    })
    
    if (session.payment_status === 'paid' && session.metadata?.invoice_id) {
      // Update invoice status
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          amount_paid: session.amount_total ? session.amount_total / 100 : 0,
          stripe_payment_intent_id: session.payment_intent as string,
        })
        .eq('id', session.metadata.invoice_id)

      if (error) {
        console.error('[Stripe] Error updating invoice:', error)
        throw new Error('Failed to update invoice')
      }

      console.log('[Stripe] Invoice updated successfully')
      return { success: true, invoiceId: session.metadata.invoice_id }
    }

    return { success: false }
  } catch (err) {
    const error = err as Error
    console.error('[Stripe] Error handling payment success:', error)
    throw error
  }
}

export async function getPaymentLink(invoiceId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/pay/${invoiceId}`
}
