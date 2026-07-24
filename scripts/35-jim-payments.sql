-- ============================================================================
-- Script 35: JIM Payments (ADDITIVE — non-destructive)
-- Extends the payments table with provider/fee metadata and adds a
-- payment_sessions table for resumable pending payment handoffs to JIM.
-- Also adds payment_settings jsonb to settings for JIM configuration.
-- ============================================================================

-- 1) Extend payments with provider + fee tracking -----------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'other';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type text;          -- 'tap_to_pay' | 'payment_link' | 'manual'
ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee_paid_by text;           -- 'business' | 'customer'
ALTER TABLE payments ADD COLUMN IF NOT EXISTS net_amount numeric;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_link text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill existing rows so provider/net stay consistent with historical data.
UPDATE payments
SET provider = CASE
    WHEN payment_method = 'cash' THEN 'cash'
    WHEN payment_method = 'check' THEN 'check'
    WHEN payment_method = 'stripe' THEN 'stripe'
    ELSE 'other'
  END
WHERE provider IS NULL OR provider = 'other';

UPDATE payments
SET net_amount = amount - COALESCE(processing_fee, 0)
WHERE net_amount IS NULL;

-- 2) payment_sessions: resumable pending JIM handoffs -------------------------
CREATE TABLE IF NOT EXISTS payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid,
  customer_id uuid,
  job_id uuid,
  invoice_id uuid,
  provider text NOT NULL DEFAULT 'jim',
  payment_type text,                                   -- 'tap_to_pay' | 'payment_link'
  amount numeric NOT NULL DEFAULT 0,
  payment_link text,
  status text NOT NULL DEFAULT 'pending',              -- 'pending' | 'completed' | 'cancelled'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_sessions_all_own ON payment_sessions;
CREATE POLICY payment_sessions_all_own ON payment_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS payment_sessions_user_status_idx
  ON payment_sessions (user_id, status);

-- 3) settings.payment_settings jsonb for JIM config ---------------------------
ALTER TABLE settings ADD COLUMN IF NOT EXISTS payment_settings jsonb DEFAULT '{}'::jsonb;

-- Reload PostgREST schema cache so the new table/columns are picked up.
NOTIFY pgrst, 'reload schema';
