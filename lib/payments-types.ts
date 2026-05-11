// ============================================================================
// Payment Types for Phase 4
// ============================================================================

export type PaymentMethod = 'cash' | 'check' | 'card' | 'bank_transfer' | 'stripe' | 'zelle' | 'venmo' | 'other'
export type PaymentStatus = 'completed' | 'pending' | 'refunded' | 'failed'

// Invoice payment status (calculated from payments)
export type InvoicePaymentStatus = 
  | 'unpaid'         // No payments received
  | 'partially_paid' // Some payment received, balance remaining
  | 'paid'           // Full amount paid
  | 'overdue'        // Past due date, not fully paid
  | 'refunded'       // All payments refunded
  | 'void'           // Invoice cancelled/voided

export interface Payment {
  id: string
  companyId: string
  userId: string | null
  invoiceId: string | null
  jobId: string | null
  customerId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentDate: string // YYYY-MM-DD
  referenceNumber: string | null
  status: PaymentStatus
  notes: string | null
  stripePaymentIntentId: string | null
  createdAt: string
  updatedAt: string
  // Joined fields (optional)
  customerName?: string
  invoiceNumber?: string
}

export interface PaymentInput {
  invoiceId?: string | null
  jobId?: string | null
  customerId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentDate?: string
  referenceNumber?: string | null
  status?: PaymentStatus
  notes?: string | null
  stripePaymentIntentId?: string | null
}

export interface PaymentWithDetails extends Omit<Payment, 'customerName' | 'invoiceNumber'> {
  customerName: string
  invoiceNumber: string | null
  invoiceTotal: number | null
}

// Invoice with calculated payment info
export interface InvoiceWithBalance {
  id: string
  invoiceNumber: string
  customerId: string
  customerName?: string
  total: number
  amountPaid: number
  balance: number
  paymentStatus: InvoicePaymentStatus
  dueDate: string
  issueDate: string
  payments: Payment[]
}

// Customer balance summary
export interface CustomerBalance {
  customerId: string
  customerName: string
  totalInvoiced: number
  totalPaid: number
  balanceDue: number
  overdueAmount: number
  invoiceCount: number
  unpaidInvoiceCount: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
}

// Customer payment history entry
export interface CustomerPaymentHistoryEntry {
  id: string
  type: 'invoice' | 'payment'
  date: string
  description: string
  amount: number // Positive for invoices, negative for payments
  balance: number // Running balance after this entry
  invoiceId?: string
  invoiceNumber?: string
  paymentMethod?: PaymentMethod
  referenceNumber?: string
}

// Result types for operations
export interface RecordPaymentResult {
  success: boolean
  payment?: Payment
  error?: string
  invoiceFullyPaid?: boolean
  remainingBalance?: number
}

export interface RefundPaymentResult {
  success: boolean
  payment?: Payment
  error?: string
  newBalance?: number
}
