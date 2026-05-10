-- ============================================================================
-- Migration 013: Fix payments table RLS policies
-- 
-- The payments table has RLS enabled but 0 policies applied.
-- This migration adds the missing company-scoped RLS policies.
-- ============================================================================

-- Drop any existing policies first
DROP POLICY IF EXISTS payments_company_select ON payments;
DROP POLICY IF EXISTS payments_company_insert ON payments;
DROP POLICY IF EXISTS payments_company_update ON payments;
DROP POLICY IF EXISTS payments_company_delete ON payments;

-- SELECT: Users can view payments for their company
CREATE POLICY payments_company_select ON payments FOR SELECT TO authenticated
USING (
  company_id IN (SELECT company_id FROM get_user_company_ids())
  OR user_id = auth.uid()
);

-- INSERT: Users can create payments for their company
CREATE POLICY payments_company_insert ON payments FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT company_id FROM get_user_company_ids())
  OR user_id = auth.uid()
);

-- UPDATE: Users can update payments for their company
CREATE POLICY payments_company_update ON payments FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT company_id FROM get_user_company_ids())
  OR user_id = auth.uid()
);

-- DELETE: Users can delete payments for their company
CREATE POLICY payments_company_delete ON payments FOR DELETE TO authenticated
USING (
  company_id IN (SELECT company_id FROM get_user_company_ids())
  OR user_id = auth.uid()
);

-- ============================================================================
-- Verification: Check that policies were created
-- ============================================================================
-- Run this query after migration to verify:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'payments';
