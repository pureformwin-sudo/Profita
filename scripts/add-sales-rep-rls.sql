-- Add RLS policies for sales reps to access owner's jobs
DROP POLICY IF EXISTS "Sales reps can view owner jobs" ON jobs;
CREATE POLICY "Sales reps can view owner jobs" ON jobs
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sales reps can insert owner jobs" ON jobs;
CREATE POLICY "Sales reps can insert owner jobs" ON jobs
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sales reps can update owner jobs" ON jobs;
CREATE POLICY "Sales reps can update owner jobs" ON jobs
  FOR UPDATE USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- Add RLS policies for sales reps to access owner's customers
DROP POLICY IF EXISTS "Sales reps can view owner customers" ON customers;
CREATE POLICY "Sales reps can view owner customers" ON customers
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sales reps can insert owner customers" ON customers;
CREATE POLICY "Sales reps can insert owner customers" ON customers
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sales reps can update owner customers" ON customers;
CREATE POLICY "Sales reps can update owner customers" ON customers
  FOR UPDATE USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- Add policy for sales reps to view employees (to see team assignments)
DROP POLICY IF EXISTS "Sales reps can view owner employees" ON employees;
CREATE POLICY "Sales reps can view owner employees" ON employees
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );
