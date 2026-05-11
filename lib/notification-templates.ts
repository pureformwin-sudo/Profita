import type { NotificationSettings } from './types'

// Default templates for notifications - client-safe (no server imports)
export const DEFAULT_TEMPLATES: NotificationSettings['templates'] = {
  lead_followup: {
    sms: "Hi {{customerName}}! Thanks for your interest. I'm {{repName}} from {{businessName}}. Would you like to schedule a free estimate? Reply YES or call us!",
    email: "Hi {{customerName}},\n\nThank you for your interest in our services! I'm {{repName}} from {{businessName}}.\n\nI'd love to schedule a free estimate at your convenience. Please reply to this email or call us to set up a time.\n\nBest regards,\n{{repName}}",
    emailSubject: "Thanks for your interest - {{businessName}}",
    enabled: true,
  },
  appointment_confirmation: {
    sms: "Confirmed! Your appointment with {{businessName}} is scheduled for {{date}} at {{time}}. See you then! Reply STOP to cancel.",
    email: "Hi {{customerName}},\n\nYour appointment is confirmed!\n\nDate: {{date}}\nTime: {{time}}\nAddress: {{address}}\n\nWe look forward to seeing you!\n\nBest regards,\n{{businessName}}",
    emailSubject: "Appointment Confirmed - {{date}}",
    enabled: true,
  },
  appointment_reminder: {
    sms: "Reminder: Your appointment with {{businessName}} is tomorrow ({{date}}) at {{time}}. See you soon!",
    email: "Hi {{customerName}},\n\nThis is a friendly reminder that your appointment is tomorrow!\n\nDate: {{date}}\nTime: {{time}}\nAddress: {{address}}\n\nIf you need to reschedule, please let us know.\n\nBest regards,\n{{businessName}}",
    emailSubject: "Reminder: Appointment Tomorrow",
    enabled: true,
  },
  appointment_missed: {
    sms: "Hi {{customerName}}, we missed you today! Would you like to reschedule? Reply or call {{businessName}}.",
    email: "Hi {{customerName}},\n\nWe noticed you couldn't make it to your appointment today. No worries - we'd be happy to reschedule at your convenience.\n\nPlease reply to this email or give us a call to set up a new time.\n\nBest regards,\n{{businessName}}",
    emailSubject: "Missed Appointment - Let's Reschedule",
    enabled: true,
  },
  invoice_sent: {
    sms: "Hi {{customerName}}, your invoice #{{invoiceNumber}} for ${{amount}} is ready. Due by {{dueDate}}. Thank you! - {{businessName}}",
    email: "Hi {{customerName}},\n\nYour invoice is ready!\n\nInvoice #: {{invoiceNumber}}\nAmount: ${{amount}}\nDue Date: {{dueDate}}\n\nThank you for your business!\n\nBest regards,\n{{businessName}}",
    emailSubject: "Invoice #{{invoiceNumber}} from {{businessName}}",
    enabled: true,
  },
  payment_reminder: {
    sms: "Friendly reminder: Invoice #{{invoiceNumber}} for ${{amount}} is due in 3 days. Thank you! - {{businessName}}",
    email: "Hi {{customerName}},\n\nThis is a friendly reminder that your invoice is due soon.\n\nInvoice #: {{invoiceNumber}}\nAmount: ${{amount}}\nDue Date: {{dueDate}}\n\nPlease let us know if you have any questions.\n\nBest regards,\n{{businessName}}",
    emailSubject: "Payment Reminder - Invoice #{{invoiceNumber}}",
    enabled: true,
  },
  job_completed: {
    sms: "Thank you {{customerName}}! Your job is complete. We'd love a review! {{reviewLink}} - {{businessName}}",
    email: "Hi {{customerName}},\n\nThank you for choosing {{businessName}}! Your job has been completed.\n\nWe hope you're satisfied with our work. If you have a moment, we'd really appreciate a review:\n{{reviewLink}}\n\nThank you for your business!\n\nBest regards,\n{{businessName}}",
    emailSubject: "Job Complete - Thank You!",
    enabled: true,
  },
  hot_lead_alert: {
    sms: "🔥 Hot lead alert! {{repName}} added {{customerName}} at {{address}}. Contact: {{phone}}",
    email: "Hot Lead Alert!\n\nRep: {{repName}}\nCustomer: {{customerName}}\nAddress: {{address}}\nPhone: {{phone}}\nEmail: {{customerEmail}}\n\nFollow up ASAP!",
    emailSubject: "🔥 Hot Lead: {{customerName}}",
    enabled: true,
  },
}
