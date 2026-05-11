// Lead activity types and constants (NOT a server action file)

export type ActivityType = 'knock' | 'call' | 'sms' | 'email' | 'note' | 'status_change' | 'quote_sent' | 'booked'

export const ACTIVITY_TYPES: ActivityType[] = ['knock', 'call', 'sms', 'email', 'note', 'status_change', 'quote_sent', 'booked']

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  knock: 'Door Knock',
  call: 'Phone Call',
  sms: 'Text Message',
  email: 'Email',
  note: 'Note Added',
  status_change: 'Status Changed',
  quote_sent: 'Quote Sent',
  booked: 'Job Booked',
}

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  knock: 'door-open',
  call: 'phone',
  sms: 'message-square',
  email: 'mail',
  note: 'sticky-note',
  status_change: 'arrow-right',
  quote_sent: 'file-text',
  booked: 'calendar-check',
}

export interface LeadActivity {
  id: string
  user_id: string
  lead_id: string
  rep_employee_id: string | null
  activity_type: ActivityType
  old_status: string | null
  new_status: string | null
  notes: string | null
  metadata: Record<string, any>
  created_at: string
  // Joined
  rep_name?: string
}
