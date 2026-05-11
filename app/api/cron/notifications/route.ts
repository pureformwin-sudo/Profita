import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendNotification, getNotificationSettings } from '@/lib/notifications'

// This cron job should be run daily to send scheduled notifications:
// - Appointment reminders (24 hours before)
// - Payment reminders (3 days before invoice due date)
// 
// Set up a Vercel Cron Job or external scheduler to call this endpoint daily
// Cron schedule: "0 8 * * *" (8:00 AM daily)

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Verify cron secret to prevent unauthorized calls
function verifyCronAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return false
  
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // Skip auth if no secret set (dev mode)
  
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  // Use service role key for admin access
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  const results = {
    appointmentReminders: 0,
    paymentReminders: 0,
    errors: [] as string[],
  }

  try {
    // Get all users with notification settings enabled
    const { data: allSettings } = await supabase
      .from('settings')
      .select('user_id, profile')
    
    if (!allSettings) {
      return NextResponse.json({ message: 'No settings found', results })
    }

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0]

    for (const settings of allSettings) {
      const notifSettings = settings.profile?.notification_settings
      if (!notifSettings?.smsEnabled && !notifSettings?.emailEnabled) {
        continue // Skip users without notifications enabled
      }

      const userId = settings.user_id

      // 1. Appointment Reminders (jobs scheduled for tomorrow)
      if (notifSettings.templates?.appointment_reminder?.enabled) {
        const { data: tomorrowJobs } = await supabase
          .from('jobs')
          .select(`
            id,
            date,
            customer_id,
            customers (
              id,
              name,
              phone,
              email,
              address
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'Scheduled')
          .eq('date', tomorrowStr)

        if (tomorrowJobs) {
          for (const job of tomorrowJobs) {
            const customer = job.customers as any
            if (!customer || (!customer.phone && !customer.email)) continue

            try {
              await sendNotification({
                userId,
                customer: {
                  id: customer.id,
                  name: customer.name,
                  phone: customer.phone,
                  email: customer.email,
                },
                type: 'appointment_reminder',
                variables: {
                  customerName: customer.name,
                  businessName: settings.profile?.businessName || 'Our Company',
                  date: new Date(job.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  }),
                  time: 'scheduled time', // Jobs don't store time in this schema
                  address: customer.address,
                },
                jobId: job.id,
              })
              results.appointmentReminders++
            } catch (error: any) {
              results.errors.push(`Appointment reminder failed for ${customer.name}: ${error.message}`)
            }
          }
        }
      }

      // 2. Payment Reminders (invoices due in 3 days)
      if (notifSettings.templates?.payment_reminder?.enabled) {
        const { data: upcomingInvoices } = await supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            total,
            due_date,
            customer_id,
            customers (
              id,
              name,
              phone,
              email
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'Sent')
          .eq('due_date', threeDaysStr)

        if (upcomingInvoices) {
          for (const invoice of upcomingInvoices) {
            const customer = invoice.customers as any
            if (!customer || (!customer.phone && !customer.email)) continue

            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://profita.app'
              await sendNotification({
                userId,
                customer: {
                  id: customer.id,
                  name: customer.name,
                  phone: customer.phone,
                  email: customer.email,
                },
                type: 'payment_reminder',
                variables: {
                  customerName: customer.name,
                  businessName: settings.profile?.businessName || 'Our Company',
                  invoiceNumber: invoice.invoice_number,
                  amount: invoice.total.toFixed(2),
                  dueDate: new Date(invoice.due_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                  paymentLink: `${baseUrl}/pay/${invoice.id}`,
                },
                invoiceId: invoice.id,
              })
              results.paymentReminders++
            } catch (error: any) {
              results.errors.push(`Payment reminder failed for ${customer.name}: ${error.message}`)
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${results.appointmentReminders} appointment reminders and ${results.paymentReminders} payment reminders`,
      results,
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
