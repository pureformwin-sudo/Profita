import { type NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, sendSMS, getNotificationSettings, logNotification, parseTemplate } from '@/lib/notifications'

function genToken() {
  return randomBytes(18).toString('base64url')
}

function getBaseUrl(request: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  const origin = request.nextUrl.origin
  return origin
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const jobId: string = body.jobId
    const technicianNotes: string | undefined = body.technicianNotes
    const thankYouMessage: string | undefined = body.thankYouMessage
    const send: boolean = body.send !== false // default: also send
    const channel: 'email' | 'sms' | 'both' = body.channel || 'both'

    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    // Resolve job -> company + customer (RLS confirms access)
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, company_id, customer_id, job_type, date, status')
      .eq('id', jobId)
      .maybeSingle()
    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 })
    }
    if (!job.customer_id) {
      return NextResponse.json({ error: 'Job has no linked customer' }, { status: 400 })
    }

    // Upsert the completion report (one per job)
    const { data: existing } = await supabase
      .from('job_completion_reports')
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle()

    const token = existing?.report_token || genToken()
    const baseUrl = getBaseUrl(request)
    const reportUrl = `${baseUrl}/reports/${token}`

    const payload = {
      job_id: jobId,
      customer_id: job.customer_id,
      company_id: job.company_id,
      report_token: token,
      service_date: job.date || null,
      service_name: job.job_type || null,
      technician_notes: technicianNotes ?? existing?.technician_notes ?? null,
      thank_you_message: thankYouMessage ?? existing?.thank_you_message ?? null,
      report_url: reportUrl,
      updated_at: new Date().toISOString(),
    }

    const { data: report, error: upsertErr } = await supabase
      .from('job_completion_reports')
      .upsert(payload, { onConflict: 'job_id' })
      .select()
      .single()

    if (upsertErr) {
      console.error('[completion-report] upsert failed:', upsertErr)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    let emailResult: any = null
    let smsResult: any = null

    if (send) {
      // Load customer + company for messaging
      const [{ data: customer }, { data: company }] = await Promise.all([
        supabase.from('customers').select('id, name, phone, email').eq('id', job.customer_id).maybeSingle(),
        job.company_id
          ? supabase.from('companies').select('id, name').eq('id', job.company_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])

      const settings = await getNotificationSettings(user.id)
      const template = settings?.templates?.job_completed
      const businessName = company?.name || 'Profita'

      const variables: Record<string, string | undefined> = {
        customerName: customer?.name || 'there',
        businessName,
        reportLink: reportUrl,
        reviewLink: reportUrl,
        date: job.date || '',
      }

      const wantEmail = (channel === 'email' || channel === 'both') && settings?.emailEnabled && customer?.email
      const wantSms = (channel === 'sms' || channel === 'both') && settings?.smsEnabled && customer?.phone

      if (wantEmail && template && customer?.email) {
        const body = parseTemplate(template.email, variables) +
          `\n\nView your completion report with photos here:\n${reportUrl}`
        const subject = parseTemplate(template.emailSubject, variables)
        emailResult = await sendEmail(customer.email, subject, body, {
          apiKey: settings!.resendApiKey || '',
          fromEmail: settings!.resendFromEmail,
        }, businessName)
        await logNotification(user.id, {
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          type: 'job_completed',
          channel: 'email',
          message: body,
          subject,
          status: emailResult.success ? 'sent' : 'failed',
          errorMessage: emailResult.error,
          jobId,
          sentAt: new Date().toISOString(),
        } as any)
        if (emailResult.success) {
          await supabase.from('job_completion_reports')
            .update({ email_sent_at: new Date().toISOString() }).eq('id', report.id)
        }
      }

      if (wantSms && template && customer?.phone) {
        const msg = parseTemplate(template.sms, variables) + ` Report: ${reportUrl}`
        smsResult = await sendSMS(customer.phone, msg, {
          accountSid: settings!.twilioAccountSid || '',
          authToken: settings!.twilioAuthToken || '',
          phoneNumber: settings!.twilioPhoneNumber || '',
        })
        await logNotification(user.id, {
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          type: 'job_completed',
          channel: 'sms',
          message: msg,
          status: smsResult.success ? 'sent' : 'failed',
          errorMessage: smsResult.error,
          jobId,
          sentAt: new Date().toISOString(),
        } as any)
        if (smsResult.success) {
          await supabase.from('job_completion_reports')
            .update({ sms_sent_at: new Date().toISOString() }).eq('id', report.id)
        }
      }
    }

    return NextResponse.json({
      report,
      reportUrl,
      sent: {
        email: emailResult ? { success: emailResult.success, error: emailResult.error } : null,
        sms: smsResult ? { success: smsResult.success, error: smsResult.error } : null,
      },
    })
  } catch (err: any) {
    console.error('[completion-report] generate failed:', err)
    return NextResponse.json({ error: err.message || 'Failed to generate report' }, { status: 500 })
  }
}
