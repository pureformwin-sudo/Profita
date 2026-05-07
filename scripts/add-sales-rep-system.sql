-- Add sales rep role system
-- This migration adds support for sales reps who can schedule jobs but not see finances

-- 1. Add role column to employees table (default to 'worker' for existing employees)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker' CHECK (role IN ('worker', 'sales_rep'));

-- 2. Create sales_rep_users table to link Supabase auth users to employees
-- This allows sales reps to log in with their own account
CREATE TABLE IF NOT EXISTS sales_rep_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(employee_id)
);

-- 3. Enable RLS on sales_rep_users
ALTER TABLE sales_rep_users ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Sales reps can read their own record
CREATE POLICY "Sales reps can read own record" ON sales_rep_users
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Policy: Owners can manage their sales rep users
CREATE POLICY "Owners can manage sales rep users" ON sales_rep_users
  FOR ALL USING (auth.uid() = owner_user_id);

-- 6. Add invite_code column to employees for sales rep signup
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 7. Add invited_email column to employees  
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS invited_email TEXT;

-- 8. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_rep_users_user_id ON sales_rep_users(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_rep_users_owner_id ON sales_rep_users(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_employees_invite_code ON employees(invite_code);

-- 9. Policy: Allow sales reps to read jobs for their owner
CREATE POLICY "Sales reps can read owner jobs" ON jobs
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- 10. Policy: Allow sales reps to insert jobs for their owner
CREATE POLICY "Sales reps can insert owner jobs" ON jobs
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- 11. Policy: Allow sales reps to update jobs for their owner
CREATE POLICY "Sales reps can update owner jobs" ON jobs
  FOR UPDATE USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- 12. Policy: Allow sales reps to read customers for their owner
CREATE POLICY "Sales reps can read owner customers" ON customers
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- 13. Policy: Allow sales reps to insert customers for their owner
CREATE POLICY "Sales reps can insert owner customers" ON customers
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );

-- 14. Policy: Allow sales reps to read employees (to see team for job assignment)
CREATE POLICY "Sales reps can read owner employees" ON employees
  FOR SELECT USING (
    user_id IN (
      SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid()
    )
  );
