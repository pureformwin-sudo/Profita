// Lead activity types and constants (NOT a server action file)

// These MUST stay in sync with the CHECK constraint on lead_activities.activity_type.
// 'booked' was previously listed here but the database rejects it (23514), so any
// code logging it would have failed at runtime. 'voicemail' is the inverse case:
// the database allows it and call logging needs it, but it was missing here.
export type ActivityType =
  | 'knock'
  | 'call'
  | 'voicemail'
  | 'sms'
  | 'email'
  | 'note'
  | 'status_change'
  | 'quote_sent'
  | 'quote_viewed'
  | 'follow_up_set'
  | 'appointment'
  | 'meeting'
  | 'converted'
  | 'lost'

export const ACTIVITY_TYPES: ActivityType[] = [
  'knock',
  'call',
  'voicemail',
  'sms',
  'email',
  'note',
  'status_change',
  'quote_sent',
  'quote_viewed',
  'follow_up_set',
  'appointment',
  'meeting',
  'converted',
  'lost',
]

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  knock: 'Door Knock',
  call: 'Phone Call',
  voicemail: 'Voicemail',
  sms: 'Text Message',
  email: 'Email',
  note: 'Note Added',
  status_change: 'Status Changed',
  quote_sent: 'Quote Sent',
  quote_viewed: 'Quote Viewed',
  follow_up_set: 'Follow-up Set',
  appointment: 'Appointment',
  meeting: 'Meeting',
  converted: 'Converted',
  lost: 'Lost',
}

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  knock: 'door-open',
  call: 'phone',
  voicemail: 'voicemail',
  sms: 'message-square',
  email: 'mail',
  note: 'sticky-note',
  status_change: 'arrow-right',
  quote_sent: 'file-text',
  quote_viewed: 'eye',
  follow_up_set: 'clock',
  appointment: 'calendar-check',
  meeting: 'users',
  converted: 'check-circle',
  lost: 'x-circle',
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
