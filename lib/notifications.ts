// Server-only notification functions
// This file should only be imported in API routes or server components

import { Resend } from 'resend'
import twilio from 'twilio'
import { createClient } from '@/lib/supabase/server'
import type { NotificationType, NotificationChannel, NotificationLog, NotificationSettings } from './types'
import { DEFAULT_TEMPLATES } from './notification-templates'

// Re-export for API routes that need it
export { DEFAULT_TEMPLATES }

// Create Twilio client with user's credentials
function createTwilioClient(accountSid: string, authToken: string) {
  return twilio(accountSid, authToken)
}

// Create Resend client with user's API key
function createResendClient(apiKey: string) {
  return new Resend(apiKey)
}

// Replace template variables
export function parseTemplate(template: string, variables: Record<string, string | undefined>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '')
  }
  return result
}

// Get notification settings for a user
export async function getNotificationSettings(userId: string): Promise<NotificationSettings | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('settings')
    .select('profile')
    .eq('user_id', userId)
    .single()
  
  if (error || !data?.profile?.notification_settings) {
    // Return default settings
    return {
      smsEnabled: false,
      emailEnabled: false,
      defaultChannel: 'email',
      templates: DEFAULT_TEMPLATES,
    }
  }
  
  return data.profile.notification_settings as NotificationSettings
}

// Save notification settings
export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: existing } = await supabase
    .from('settings')
    .select('profile')
    .eq('user_id', userId)
    .single()
  
  const currentProfile = existing?.profile || {}
  const updatedProfile = {
    ...currentProfile,
    notification_settings: settings,
  }
  
  const { error } = await supabase
    .from('settings')
    .upsert({
      user_id: userId,
      profile: updatedProfile,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  
  return !error
}

// Send SMS via Twilio using user's credentials
export async function sendSMS(
  to: string, 
  message: string, 
  credentials: { accountSid: string; authToken: string; phoneNumber: string }
): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!credentials.accountSid || !credentials.authToken) {
    return { success: false, error: 'Twilio not configured. Add your Account SID and Auth Token in Notification Settings.' }
  }
  
  if (!credentials.phoneNumber) {
    return { success: false, error: 'No Twilio phone number configured. Add it in Notification Settings.' }
  }
  
  try {
    const client = createTwilioClient(credentials.accountSid, credentials.authToken)
    const result = await client.messages.create({
      body: message,
      to: to,
      from: credentials.phoneNumber,
    })
    return { success: true, sid: result.sid }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send SMS' }
  }
}

// Send Email via Resend using user's credentials
export async function sendEmail(
  to: string, 
  subject: string, 
  html: string,
  credentials: { apiKey: string; fromEmail?: string },
  fromName?: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!credentials.apiKey) {
    return { success: false, error: 'Resend not configured. Add your API Key in Notification Settings.' }
  }
  
  try {
    const client = createResendClient(credentials.apiKey)
    const result = await client.emails.send({
      from: `${fromName || 'Profita'} <${credentials.fromEmail || 'onboarding@resend.dev'}>`,
      to: [to],
      subject: subject,
      html: html.replace(/\n/g, '<br>'),
    })
    return { success: true, id: result.data?.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send email' }
  }
}

// Log notification to database
export async function logNotification(
  userId: string,
  data: Omit<NotificationLog, 'id' | 'createdAt'>
): Promise<string | null> {
  const supabase = await createClient()
  
  const { data: result, error } = await supabase
    .from('notification_logs')
    .insert({
      user_id: userId,
      customer_id: data.customerId,
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      customer_email: data.customerEmail,
      rep_id: data.repId,
      rep_name: data.repName,
      type: data.type,
      channel: data.channel,
      message: data.message,
      subject: data.subject,
      status: data.status,
      error_message: data.errorMessage,
      job_id: data.jobId,
      invoice_id: data.invoiceId,
      sent_at: data.sentAt,
    })
    .select('id')
    .single()
  
  if (error) {
    console.error('Failed to log notification:', error)
    return null
  }
  
  return result?.id
}

// Get notification logs for a user
export async function getNotificationLogs(userId: string, limit = 50): Promise<NotificationLog[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('notification_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Failed to get notification logs:', error)
    return []
  }
  
  return data.map(row => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    repId: row.rep_id,
    repName: row.rep_name,
    type: row.type,
    channel: row.channel,
    message: row.message,
    subject: row.subject,
    status: row.status,
    errorMessage: row.error_message,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }))
}

// Main function to send a notification
export async function sendNotification({
  userId,
  customer,
  type,
  channel,
  variables,
  jobId,
  invoiceId,
  repId,
  repName,
}: {
  userId: string
  customer: { id: string; name: string; phone?: string; email?: string }
  type: NotificationType
  channel?: NotificationChannel
  variables: Record<string, string | undefined>
  jobId?: string
  invoiceId?: string
  repId?: string
  repName?: string
}): Promise<{ success: boolean; smsResult?: any; emailResult?: any }> {
  const settings = await getNotificationSettings(userId)
  
  if (!settings) {
    return { success: false }
  }
  
  const template = settings.templates[type]
  if (!template || !template.enabled) {
    return { success: false }
  }
  
  // Determine which channel(s) to use
  const effectiveChannel = channel || settings.defaultChannel
  const sendSms = (effectiveChannel === 'sms' || effectiveChannel === 'both') && settings.smsEnabled && customer.phone
  const sendEmailNotif = (effectiveChannel === 'email' || effectiveChannel === 'both') && settings.emailEnabled && customer.email
  
  let smsResult = null
  let emailResult = null
  
  // Send SMS
  if (sendSms && customer.phone) {
    const smsMessage = parseTemplate(template.sms, variables)
    smsResult = await sendSMS(customer.phone, smsMessage, {
      accountSid: settings.twilioAccountSid || '',
      authToken: settings.twilioAuthToken || '',
      phoneNumber: settings.twilioPhoneNumber || '',
    })
    
    await logNotification(userId, {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      repId,
      repName,
      type,
      channel: 'sms',
      message: smsMessage,
      status: smsResult.success ? 'sent' : 'failed',
      errorMessage: smsResult.error,
      jobId,
      invoiceId,
      sentAt: new Date().toISOString(),
    })
  }
  
  // Send Email
  if (sendEmailNotif && customer.email) {
    const emailMessage = parseTemplate(template.email, variables)
    const emailSubject = parseTemplate(template.emailSubject, variables)
    emailResult = await sendEmail(customer.email, emailSubject, emailMessage, {
      apiKey: settings.resendApiKey || '',
      fromEmail: settings.resendFromEmail,
    })
    
    await logNotification(userId, {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      repId,
      repName,
      type,
      channel: 'email',
      message: emailMessage,
      subject: emailSubject,
      status: emailResult.success ? 'sent' : 'failed',
      errorMessage: emailResult.error,
      jobId,
      invoiceId,
      sentAt: new Date().toISOString(),
    })
  }
  
  return {
    success: (smsResult?.success || false) || (emailResult?.success || false),
    smsResult,
    emailResult,
  }
}

// Send test notification
export async function sendTestNotification(
  userId: string,
  channel: 'sms' | 'email',
  to: string,
  type: NotificationType
): Promise<{ success: boolean; error?: string }> {
  const settings = await getNotificationSettings(userId)
  if (!settings) {
    return { success: false, error: 'No notification settings found' }
  }
  
  const template = settings.templates[type]
  const testVariables = {
    customerName: 'Test Customer',
    businessName: 'Your Business',
    repName: 'Test Rep',
    date: 'January 15, 2026',
    time: '10:00 AM',
    address: '123 Test St',
    phone: '(555) 123-4567',
    invoiceNumber: 'INV-001',
    amount: '150.00',
    dueDate: 'January 20, 2026',
    paymentLink: 'https://example.com/pay',
    reviewLink: 'https://example.com/review',
    customerPhone: '(555) 987-6543',
    customerEmail: 'test@example.com',
    notes: 'Test notes',
  }
  
  if (channel === 'sms') {
    const message = parseTemplate(template.sms, testVariables)
    return await sendSMS(to, message, {
      accountSid: settings.twilioAccountSid || '',
      authToken: settings.twilioAuthToken || '',
      phoneNumber: settings.twilioPhoneNumber || '',
    })
  } else {
    const message = parseTemplate(template.email, testVariables)
    const subject = parseTemplate(template.emailSubject, testVariables)
    return await sendEmail(to, subject, message, {
      apiKey: settings.resendApiKey || '',
      fromEmail: settings.resendFromEmail,
    })
  }
}
