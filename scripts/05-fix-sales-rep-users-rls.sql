-- Fix RLS policies for sales_rep_users table
-- Allow users to read their own record

-- Drop any existing policies
DROP POLICY IF EXISTS "sales_rep_users_select_own" ON sales_rep_users;
DROP POLICY IF EXISTS "sales_rep_users_insert" ON sales_rep_users;

-- Enable RLS if not already enabled
ALTER TABLE sales_rep_users ENABLE ROW LEVEL SECURITY;

-- Allow users to SELECT their own record (so they can check if they're a sales rep)
CREATE POLICY "sales_rep_users_select_own"
ON sales_rep_users FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR owner_user_id = auth.uid());

-- Allow service role to insert (the API handles this)
-- No INSERT policy needed for regular users - they use the API endpoint
