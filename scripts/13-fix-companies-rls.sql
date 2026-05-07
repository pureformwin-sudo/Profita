-- Fix companies RLS to allow INSERT
-- The FOR ALL policy wasn't working correctly for INSERT operations

-- Drop the existing combined policy
DROP POLICY IF EXISTS companies_owner_all ON companies;

-- Create separate policies for each operation
CREATE POLICY companies_select ON companies
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY companies_insert ON companies
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY companies_update ON companies
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY companies_delete ON companies
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
