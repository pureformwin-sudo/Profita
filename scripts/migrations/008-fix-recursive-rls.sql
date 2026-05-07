-- ============================================================================
-- MIGRATION 008: Fix infinite recursion in company_members RLS policy
-- The original policy checked company_members to access company_members
-- This fix removes the self-referential check
-- ============================================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS company_members_select ON company_members;
DROP POLICY IF EXISTS company_members_insert ON company_members;
DROP POLICY IF EXISTS company_members_update ON company_members;
DROP POLICY IF EXISTS company_members_delete ON company_members;

-- SELECT: Users can see members if:
-- 1. They own the company (check companies table, not company_members)
-- 2. OR this is their own membership record (user_id = auth.uid())
-- We CANNOT check company_members for membership here - that would be recursive
CREATE POLICY company_members_select ON company_members FOR SELECT TO authenticated
USING (
  -- User owns this company
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  -- OR this is the user's own record
  OR user_id = auth.uid()
);

-- INSERT: Only company owners can add members
CREATE POLICY company_members_insert ON company_members FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
);

-- UPDATE: Owners can update any member, members can update their own record
CREATE POLICY company_members_update ON company_members FOR UPDATE TO authenticated
USING (
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  OR user_id = auth.uid()
);

-- DELETE: Only company owners can remove members
CREATE POLICY company_members_delete ON company_members FOR DELETE TO authenticated
USING (
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
);

-- ============================================================================
-- Now we need to fix ALL other RLS policies that reference company_members
-- The pattern:
--   company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
-- This is FINE for other tables, but we need to ensure it doesn't cause issues
-- ============================================================================

-- The issue is that when checking RLS on company_members, it triggers RLS checks
-- on company_members again. We need to use SECURITY DEFINER functions instead.

-- Create a helper function that bypasses RLS to get user's company_id
CREATE OR REPLACE FUNCTION get_user_company_ids()
RETURNS TABLE (company_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Get companies user owns
  SELECT id as company_id FROM companies WHERE owner_user_id = auth.uid()
  UNION
  -- Get companies user is a member of (direct query, bypasses RLS)
  SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active'
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_user_company_ids() TO authenticated;

-- ============================================================================
-- Now update ALL policies to use the helper function instead of inline subquery
-- This prevents the recursive RLS check
-- ============================================================================

-- booking_requests
DROP POLICY IF EXISTS booking_requests_company_select ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_insert ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_update ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_delete ON booking_requests;
DROP POLICY IF EXISTS booking_requests_public_insert ON booking_requests;

CREATE POLICY booking_requests_company_select ON booking_requests FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY booking_requests_company_insert ON booking_requests FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY booking_requests_public_insert ON booking_requests FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY booking_requests_company_update ON booking_requests FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY booking_requests_company_delete ON booking_requests FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- bookings
DROP POLICY IF EXISTS bookings_company_select ON bookings;
DROP POLICY IF EXISTS bookings_company_insert ON bookings;
DROP POLICY IF EXISTS bookings_company_update ON bookings;
DROP POLICY IF EXISTS bookings_company_delete ON bookings;

CREATE POLICY bookings_company_select ON bookings FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY bookings_company_insert ON bookings FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY bookings_company_update ON bookings FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY bookings_company_delete ON bookings FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- customer_plans
DROP POLICY IF EXISTS customer_plans_company_select ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_insert ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_update ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_delete ON customer_plans;

CREATE POLICY customer_plans_company_select ON customer_plans FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customer_plans_company_insert ON customer_plans FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customer_plans_company_update ON customer_plans FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customer_plans_company_delete ON customer_plans FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- customers
DROP POLICY IF EXISTS customers_company_select ON customers;
DROP POLICY IF EXISTS customers_company_insert ON customers;
DROP POLICY IF EXISTS customers_company_update ON customers;
DROP POLICY IF EXISTS customers_company_delete ON customers;
DROP POLICY IF EXISTS "Users can manage their own customers" ON customers;

CREATE POLICY customers_company_select ON customers FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customers_company_insert ON customers FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customers_company_update ON customers FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY customers_company_delete ON customers FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- d2d_days
DROP POLICY IF EXISTS d2d_days_company_select ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_insert ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_update ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_delete ON d2d_days;

CREATE POLICY d2d_days_company_select ON d2d_days FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY d2d_days_company_insert ON d2d_days FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY d2d_days_company_update ON d2d_days FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY d2d_days_company_delete ON d2d_days FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- employees
DROP POLICY IF EXISTS employees_company_select ON employees;
DROP POLICY IF EXISTS employees_company_insert ON employees;
DROP POLICY IF EXISTS employees_company_update ON employees;
DROP POLICY IF EXISTS employees_company_delete ON employees;

CREATE POLICY employees_company_select ON employees FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY employees_company_insert ON employees FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY employees_company_update ON employees FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY employees_company_delete ON employees FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- estimates
DROP POLICY IF EXISTS estimates_company_select ON estimates;
DROP POLICY IF EXISTS estimates_company_insert ON estimates;
DROP POLICY IF EXISTS estimates_company_update ON estimates;
DROP POLICY IF EXISTS estimates_company_delete ON estimates;
DROP POLICY IF EXISTS "Users can manage their own estimates" ON estimates;

CREATE POLICY estimates_company_select ON estimates FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY estimates_company_insert ON estimates FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY estimates_company_update ON estimates FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY estimates_company_delete ON estimates FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- estimate_items
DROP POLICY IF EXISTS estimate_items_company_select ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_insert ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_update ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_delete ON estimate_items;

CREATE POLICY estimate_items_company_select ON estimate_items FOR SELECT TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_insert ON estimate_items FOR INSERT TO authenticated
WITH CHECK (
  estimate_id IN (
    SELECT id FROM estimates WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_update ON estimate_items FOR UPDATE TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_delete ON estimate_items FOR DELETE TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

-- expenses
DROP POLICY IF EXISTS expenses_company_select ON expenses;
DROP POLICY IF EXISTS expenses_company_insert ON expenses;
DROP POLICY IF EXISTS expenses_company_update ON expenses;
DROP POLICY IF EXISTS expenses_company_delete ON expenses;

CREATE POLICY expenses_company_select ON expenses FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY expenses_company_insert ON expenses FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY expenses_company_update ON expenses FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY expenses_company_delete ON expenses FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- follow_ups
DROP POLICY IF EXISTS follow_ups_company_select ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_insert ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_update ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_delete ON follow_ups;

CREATE POLICY follow_ups_company_select ON follow_ups FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY follow_ups_company_insert ON follow_ups FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY follow_ups_company_update ON follow_ups FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY follow_ups_company_delete ON follow_ups FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- in_app_notifications
DROP POLICY IF EXISTS in_app_notifications_company_select ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_insert ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_update ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_delete ON in_app_notifications;

CREATE POLICY in_app_notifications_company_select ON in_app_notifications FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_insert ON in_app_notifications FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_update ON in_app_notifications FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_delete ON in_app_notifications FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- income
DROP POLICY IF EXISTS income_company_select ON income;
DROP POLICY IF EXISTS income_company_insert ON income;
DROP POLICY IF EXISTS income_company_update ON income;
DROP POLICY IF EXISTS income_company_delete ON income;

CREATE POLICY income_company_select ON income FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY income_company_insert ON income FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY income_company_update ON income FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY income_company_delete ON income FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- invoices
DROP POLICY IF EXISTS invoices_company_select ON invoices;
DROP POLICY IF EXISTS invoices_company_insert ON invoices;
DROP POLICY IF EXISTS invoices_company_update ON invoices;
DROP POLICY IF EXISTS invoices_company_delete ON invoices;
DROP POLICY IF EXISTS "Users can manage their own invoices" ON invoices;

CREATE POLICY invoices_company_select ON invoices FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY invoices_company_insert ON invoices FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY invoices_company_update ON invoices FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY invoices_company_delete ON invoices FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- invoice_items
DROP POLICY IF EXISTS invoice_items_company_select ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_insert ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_update ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_delete ON invoice_items;

CREATE POLICY invoice_items_company_select ON invoice_items FOR SELECT TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_insert ON invoice_items FOR INSERT TO authenticated
WITH CHECK (
  invoice_id IN (
    SELECT id FROM invoices WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_update ON invoice_items FOR UPDATE TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_delete ON invoice_items FOR DELETE TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

-- jobs
DROP POLICY IF EXISTS jobs_company_select ON jobs;
DROP POLICY IF EXISTS jobs_company_insert ON jobs;
DROP POLICY IF EXISTS jobs_company_update ON jobs;
DROP POLICY IF EXISTS jobs_company_delete ON jobs;
DROP POLICY IF EXISTS "Users can manage their own jobs" ON jobs;

CREATE POLICY jobs_company_select ON jobs FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY jobs_company_insert ON jobs FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY jobs_company_update ON jobs FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY jobs_company_delete ON jobs FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- job_assignments
DROP POLICY IF EXISTS job_assignments_select ON job_assignments;
DROP POLICY IF EXISTS job_assignments_insert ON job_assignments;
DROP POLICY IF EXISTS job_assignments_update ON job_assignments;
DROP POLICY IF EXISTS job_assignments_delete ON job_assignments;

CREATE POLICY job_assignments_select ON job_assignments FOR SELECT TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);

CREATE POLICY job_assignments_insert ON job_assignments FOR INSERT TO authenticated
WITH CHECK (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY job_assignments_update ON job_assignments FOR UPDATE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);

CREATE POLICY job_assignments_delete ON job_assignments FOR DELETE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

-- job_workers
DROP POLICY IF EXISTS job_workers_company_select ON job_workers;
DROP POLICY IF EXISTS job_workers_company_insert ON job_workers;
DROP POLICY IF EXISTS job_workers_company_update ON job_workers;
DROP POLICY IF EXISTS job_workers_company_delete ON job_workers;

CREATE POLICY job_workers_company_select ON job_workers FOR SELECT TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_insert ON job_workers FOR INSERT TO authenticated
WITH CHECK (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_update ON job_workers FOR UPDATE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_delete ON job_workers FOR DELETE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

-- lead_activities
DROP POLICY IF EXISTS lead_activities_company_select ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_insert ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_update ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_delete ON lead_activities;

CREATE POLICY lead_activities_company_select ON lead_activities FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY lead_activities_company_insert ON lead_activities FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY lead_activities_company_update ON lead_activities FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY lead_activities_company_delete ON lead_activities FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- leads
DROP POLICY IF EXISTS leads_company_select ON leads;
DROP POLICY IF EXISTS leads_company_insert ON leads;
DROP POLICY IF EXISTS leads_company_update ON leads;
DROP POLICY IF EXISTS leads_company_delete ON leads;

CREATE POLICY leads_company_select ON leads FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY leads_company_insert ON leads FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY leads_company_update ON leads FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY leads_company_delete ON leads FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- pending_income
DROP POLICY IF EXISTS pending_income_company_select ON pending_income;
DROP POLICY IF EXISTS pending_income_company_insert ON pending_income;
DROP POLICY IF EXISTS pending_income_company_update ON pending_income;
DROP POLICY IF EXISTS pending_income_company_delete ON pending_income;

CREATE POLICY pending_income_company_select ON pending_income FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY pending_income_company_insert ON pending_income FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY pending_income_company_update ON pending_income FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY pending_income_company_delete ON pending_income FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- plan_automations
DROP POLICY IF EXISTS plan_automations_company_select ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_insert ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_update ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_delete ON plan_automations;

CREATE POLICY plan_automations_company_select ON plan_automations FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY plan_automations_company_insert ON plan_automations FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY plan_automations_company_update ON plan_automations FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY plan_automations_company_delete ON plan_automations FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- quotes
DROP POLICY IF EXISTS quotes_company_select ON quotes;
DROP POLICY IF EXISTS quotes_company_insert ON quotes;
DROP POLICY IF EXISTS quotes_company_update ON quotes;
DROP POLICY IF EXISTS quotes_company_delete ON quotes;

CREATE POLICY quotes_company_select ON quotes FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY quotes_company_insert ON quotes FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY quotes_company_update ON quotes FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY quotes_company_delete ON quotes FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- quote_items
DROP POLICY IF EXISTS quote_items_company_select ON quote_items;
DROP POLICY IF EXISTS quote_items_company_insert ON quote_items;
DROP POLICY IF EXISTS quote_items_company_update ON quote_items;
DROP POLICY IF EXISTS quote_items_company_delete ON quote_items;
DROP POLICY IF EXISTS quote_items_all_own ON quote_items;

CREATE POLICY quote_items_company_select ON quote_items FOR SELECT TO authenticated
USING (
  quote_id IN (
    SELECT id FROM quotes WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY quote_items_company_insert ON quote_items FOR INSERT TO authenticated
WITH CHECK (
  quote_id IN (
    SELECT id FROM quotes WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY quote_items_company_update ON quote_items FOR UPDATE TO authenticated
USING (
  quote_id IN (
    SELECT id FROM quotes WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY quote_items_company_delete ON quote_items FOR DELETE TO authenticated
USING (
  quote_id IN (
    SELECT id FROM quotes WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

-- sales_rep_stats
DROP POLICY IF EXISTS sales_rep_stats_company_select ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_insert ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_update ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_delete ON sales_rep_stats;

CREATE POLICY sales_rep_stats_company_select ON sales_rep_stats FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_insert ON sales_rep_stats FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_update ON sales_rep_stats FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_delete ON sales_rep_stats FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- service_plans
DROP POLICY IF EXISTS service_plans_company_select ON service_plans;
DROP POLICY IF EXISTS service_plans_company_insert ON service_plans;
DROP POLICY IF EXISTS service_plans_company_update ON service_plans;
DROP POLICY IF EXISTS service_plans_company_delete ON service_plans;

CREATE POLICY service_plans_company_select ON service_plans FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY service_plans_company_insert ON service_plans FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY service_plans_company_update ON service_plans FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY service_plans_company_delete ON service_plans FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- settings
DROP POLICY IF EXISTS settings_company_select ON settings;
DROP POLICY IF EXISTS settings_company_insert ON settings;
DROP POLICY IF EXISTS settings_company_update ON settings;
DROP POLICY IF EXISTS settings_company_delete ON settings;

CREATE POLICY settings_company_select ON settings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM get_user_company_ids()));

CREATE POLICY settings_company_insert ON settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY settings_company_update ON settings FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM get_user_company_ids()));

CREATE POLICY settings_company_delete ON settings FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- territories
DROP POLICY IF EXISTS territories_company_select ON territories;
DROP POLICY IF EXISTS territories_company_insert ON territories;
DROP POLICY IF EXISTS territories_company_update ON territories;
DROP POLICY IF EXISTS territories_company_delete ON territories;

CREATE POLICY territories_company_select ON territories FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY territories_company_insert ON territories FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY territories_company_update ON territories FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY territories_company_delete ON territories FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- time_entries
DROP POLICY IF EXISTS time_entries_select ON time_entries;
DROP POLICY IF EXISTS time_entries_insert ON time_entries;
DROP POLICY IF EXISTS time_entries_update ON time_entries;
DROP POLICY IF EXISTS time_entries_delete ON time_entries;

CREATE POLICY time_entries_select ON time_entries FOR SELECT TO authenticated
USING (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE company_id IN (SELECT company_id FROM get_user_company_ids())
  )
  OR job_id IN (
    SELECT id FROM jobs WHERE company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid()
  )
);

CREATE POLICY time_entries_insert ON time_entries FOR INSERT TO authenticated
WITH CHECK (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE company_id IN (SELECT company_id FROM get_user_company_ids())
  )
);

CREATE POLICY time_entries_update ON time_entries FOR UPDATE TO authenticated
USING (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE company_id IN (SELECT company_id FROM get_user_company_ids())
  )
);

CREATE POLICY time_entries_delete ON time_entries FOR DELETE TO authenticated
USING (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE company_id IN (SELECT company_id FROM get_user_company_ids())
  )
);

-- upcoming_expenses
DROP POLICY IF EXISTS upcoming_expenses_company_select ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_insert ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_update ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_delete ON upcoming_expenses;

CREATE POLICY upcoming_expenses_company_select ON upcoming_expenses FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_insert ON upcoming_expenses FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_update ON upcoming_expenses FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_delete ON upcoming_expenses FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM get_user_company_ids()) OR user_id = auth.uid());

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Migration 008 complete - Fixed infinite recursion by using SECURITY DEFINER helper function' as status;
