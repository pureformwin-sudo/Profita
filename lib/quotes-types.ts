// Quote types and constants (NOT a server action file - can export objects)

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired'

export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
}

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-500/10', text: 'text-slate-400' },
  sent: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  viewed: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  accepted: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  declined: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
  expired: { bg: 'bg-zinc-500/10', text: 'text-zinc-400' },
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  sort_order: number
}

export interface Quote {
  id: string
  user_id: string
  rep_user_id: string | null
  rep_employee_id: string | null
  lead_id: string | null
  quote_number: number
  status: QuoteStatus
  total: number
  notes: string | null
  valid_until: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
  items?: QuoteItem[]
  // Joined fields
  lead_name?: string
  lead_address?: string
  customer_name?: string
}
