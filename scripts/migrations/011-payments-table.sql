-- ============================================================================
-- MIGRATION 011: Create payments table for Phase 4
-- Dedicated table for tracking individual payment transactions
-- SAFE: Additive only - no existing data is modified, deleted, or overwritten
-- ============================================================================

-- ============================================================================
-- Create payments table
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_number text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'refunded', 'failed')),
  notes text,
  stripe_payment_intent_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE payments IS 'Individual payment transactions - Phase 4 payments tracking';
COMMENT ON COLUMN payments.amount IS 'Payment amount - must be greater than 0';
COMMENT ON COLUMN payments.payment_method IS 'cash, check, card, bank_transfer, stripe, other';
COMMENT ON COLUMN payments.status IS 'completed, pending, refunded, failed';

-- ============================================================================
-- Create indexes for efficient lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_job_id ON payments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================================
-- Enable Row Level Security
-- ============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies using get_user_company_ids() helper function
-- Same pattern as other company-scoped tables (bookings, leads, quotes, etc.)
-- ============================================================================

-- SELECT: Users can view payments for their company
CREATE POLICY payments_company_select ON payments FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- INSERT: Users can create payments for their company
CREATE POLICY payments_company_insert ON payments FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- UPDATE: Users can update payments for their company
CREATE POLICY payments_company_update ON payments FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- DELETE: Users can delete payments for their company
CREATE POLICY payments_company_delete ON payments FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- ============================================================================
-- Create trigger for updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- ============================================================================
-- Verify migration
-- ============================================================================
SELECT 'Migration 011 complete - Created payments table with RLS' as status;

-- Show table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
