-- ============================================================================
-- MIGRATION 012: Commissions and Roles for Phase 5
-- Adds commission tracking, commission rules, and employee commission fields
-- SAFE: Additive only - no existing data is modified, deleted, or overwritten
-- ============================================================================

-- ============================================================================
-- 1. Add commission fields to employees table
-- ============================================================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'percentage';

COMMENT ON COLUMN employees.commission_rate IS 'Default commission rate for this employee (e.g., 10 for 10% or flat dollar amount)';
COMMENT ON COLUMN employees.commission_type IS 'percentage or flat';

-- ============================================================================
-- 2. Create commission_rules table
-- Defines company-wide rules for calculating commissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('lead_created', 'job_created', 'job_completed', 'invoice_paid', 'payment_received')),
  rate_type text NOT NULL DEFAULT 'percentage' CHECK (rate_type IN ('percentage', 'flat')),
  rate_value numeric NOT NULL DEFAULT 0 CHECK (rate_value >= 0),
  min_base_amount numeric,
  max_commission numeric,
  applies_to_roles text[] DEFAULT ARRAY['sales_rep'],
  active boolean DEFAULT true,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE commission_rules IS 'Company-defined rules for calculating commissions - Phase 5';
COMMENT ON COLUMN commission_rules.trigger_type IS 'When commission is triggered: lead_created, job_created, job_completed, invoice_paid, payment_received';
COMMENT ON COLUMN commission_rules.rate_type IS 'percentage (e.g., 10 = 10%) or flat (e.g., 50 = $50)';
COMMENT ON COLUMN commission_rules.rate_value IS 'The rate value - either percentage or flat dollar amount';
COMMENT ON COLUMN commission_rules.min_base_amount IS 'Minimum base amount required to qualify for commission (nullable)';
COMMENT ON COLUMN commission_rules.max_commission IS 'Maximum commission cap (nullable)';
COMMENT ON COLUMN commission_rules.applies_to_roles IS 'Array of roles that qualify for this commission rule';
COMMENT ON COLUMN commission_rules.priority IS 'Higher priority rules are evaluated first (default 0)';

-- ============================================================================
-- 3. Create commissions table
-- Individual commission records for tracking earned/paid commissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  member_id uuid REFERENCES company_members(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('lead_created', 'job_created', 'job_completed', 'invoice_paid', 'payment_received', 'manual')),
  amount numeric NOT NULL CHECK (amount >= 0),
  rate numeric NOT NULL DEFAULT 0,
  rate_type text NOT NULL DEFAULT 'percentage' CHECK (rate_type IN ('percentage', 'flat')),
  base_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'approved', 'paid', 'void')),
  earned_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payout_reference text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE commissions IS 'Individual commission records - Phase 5 commission tracking';
COMMENT ON COLUMN commissions.trigger_type IS 'What triggered this commission: lead_created, job_created, job_completed, invoice_paid, payment_received, manual';
COMMENT ON COLUMN commissions.amount IS 'Calculated commission amount';
COMMENT ON COLUMN commissions.rate IS 'The rate used for calculation';
COMMENT ON COLUMN commissions.rate_type IS 'percentage or flat';
COMMENT ON COLUMN commissions.base_amount IS 'The base amount used for calculation (e.g., job price, invoice total)';
COMMENT ON COLUMN commissions.status IS 'pending (calculated), earned (confirmed), approved (manager approved), paid (paid out), void (cancelled)';
COMMENT ON COLUMN commissions.payout_reference IS 'Reference for payout (check number, payroll run ID, etc.)';

-- ============================================================================
-- 4. Create indexes for commission_rules
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_commission_rules_company_id ON commission_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_trigger_type ON commission_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON commission_rules(active) WHERE active = true;

-- ============================================================================
-- 5. Create indexes for commissions
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_commissions_company_id ON commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_commissions_employee_id ON commissions(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_member_id ON commissions(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_rule_id ON commissions(rule_id) WHERE rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_lead_id ON commissions(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_job_id ON commissions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_invoice_id ON commissions(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_payment_id ON commissions(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_trigger_type ON commissions(trigger_type);
CREATE INDEX IF NOT EXISTS idx_commissions_earned_at ON commissions(earned_at) WHERE earned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_paid_at ON commissions(paid_at) WHERE paid_at IS NOT NULL;

-- ============================================================================
-- 6. Enable Row Level Security
-- ============================================================================
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. RLS Policies for commission_rules
-- Same pattern as other company-scoped tables
-- ============================================================================

-- SELECT: Users can view commission rules for their company
CREATE POLICY commission_rules_company_select ON commission_rules FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- INSERT: Users can create commission rules for their company
CREATE POLICY commission_rules_company_insert ON commission_rules FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- UPDATE: Users can update commission rules for their company
CREATE POLICY commission_rules_company_update ON commission_rules FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- DELETE: Users can delete commission rules for their company
CREATE POLICY commission_rules_company_delete ON commission_rules FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- ============================================================================
-- 8. RLS Policies for commissions
-- Same pattern as other company-scoped tables
-- ============================================================================

-- SELECT: Users can view commissions for their company
CREATE POLICY commissions_company_select ON commissions FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- INSERT: Users can create commissions for their company
CREATE POLICY commissions_company_insert ON commissions FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- UPDATE: Users can update commissions for their company
CREATE POLICY commissions_company_update ON commissions FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- DELETE: Users can delete commissions for their company
CREATE POLICY commissions_company_delete ON commissions FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()));

-- ============================================================================
-- 9. Create trigger for updated_at timestamps
-- ============================================================================

-- commission_rules updated_at trigger
CREATE OR REPLACE FUNCTION update_commission_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commission_rules_updated_at ON commission_rules;
CREATE TRIGGER commission_rules_updated_at
  BEFORE UPDATE ON commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_rules_updated_at();

-- commissions updated_at trigger
CREATE OR REPLACE FUNCTION update_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commissions_updated_at ON commissions;
CREATE TRIGGER commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_commissions_updated_at();

-- ============================================================================
-- 10. Verify migration
-- ============================================================================
SELECT 'Migration 012 complete - Added commission_rules and commissions tables' as status;

-- Show commission_rules structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'commission_rules' 
ORDER BY ordinal_position;

-- Show commissions structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'commissions' 
ORDER BY ordinal_position;

-- Show employees new columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
  AND column_name IN ('commission_rate', 'commission_type')
ORDER BY ordinal_position;
