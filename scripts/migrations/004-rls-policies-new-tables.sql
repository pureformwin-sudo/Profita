-- ============================================================================
-- MIGRATION 004: Update RLS policies for tables that now have company_id
-- Replace user_id-only policies with company-membership-based policies
-- ============================================================================

-- ============================================================================
-- booking_requests
-- ============================================================================
DROP POLICY IF EXISTS "Users can delete own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "Users can update own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "Users can insert own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "Users can view own booking requests" ON booking_requests;
DROP POLICY IF EXISTS "Allow public booking inserts" ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_select ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_insert ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_update ON booking_requests;
DROP POLICY IF EXISTS booking_requests_company_delete ON booking_requests;

CREATE POLICY booking_requests_company_select ON booking_requests FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY booking_requests_company_insert ON booking_requests FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

-- Keep public inserts for customer booking requests
CREATE POLICY booking_requests_public_insert ON booking_requests FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY booking_requests_company_update ON booking_requests FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY booking_requests_company_delete ON booking_requests FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- bookings
-- ============================================================================
DROP POLICY IF EXISTS bookings_all_own ON bookings;
DROP POLICY IF EXISTS bookings_company_select ON bookings;
DROP POLICY IF EXISTS bookings_company_insert ON bookings;
DROP POLICY IF EXISTS bookings_company_update ON bookings;
DROP POLICY IF EXISTS bookings_company_delete ON bookings;

CREATE POLICY bookings_company_select ON bookings FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY bookings_company_insert ON bookings FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY bookings_company_update ON bookings FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY bookings_company_delete ON bookings FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- customer_plans
-- ============================================================================
DROP POLICY IF EXISTS customer_plans_all_own ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_select ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_insert ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_update ON customer_plans;
DROP POLICY IF EXISTS customer_plans_company_delete ON customer_plans;

CREATE POLICY customer_plans_company_select ON customer_plans FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY customer_plans_company_insert ON customer_plans FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY customer_plans_company_update ON customer_plans FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY customer_plans_company_delete ON customer_plans FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- d2d_days
-- ============================================================================
DROP POLICY IF EXISTS "Users can update own d2d data" ON d2d_days;
DROP POLICY IF EXISTS "Users can insert own d2d data" ON d2d_days;
DROP POLICY IF EXISTS "Users can view own d2d data" ON d2d_days;
DROP POLICY IF EXISTS d2d_days_select_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_update_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_delete_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_insert_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_select ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_insert ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_update ON d2d_days;
DROP POLICY IF EXISTS d2d_days_company_delete ON d2d_days;

CREATE POLICY d2d_days_company_select ON d2d_days FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY d2d_days_company_insert ON d2d_days FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY d2d_days_company_update ON d2d_days FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY d2d_days_company_delete ON d2d_days FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- follow_ups
-- ============================================================================
DROP POLICY IF EXISTS follow_ups_all_own ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_select ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_insert ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_update ON follow_ups;
DROP POLICY IF EXISTS follow_ups_company_delete ON follow_ups;

CREATE POLICY follow_ups_company_select ON follow_ups FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY follow_ups_company_insert ON follow_ups FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY follow_ups_company_update ON follow_ups FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY follow_ups_company_delete ON follow_ups FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- in_app_notifications
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own notifications" ON in_app_notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON in_app_notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON in_app_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_select ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_insert ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_update ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_company_delete ON in_app_notifications;

CREATE POLICY in_app_notifications_company_select ON in_app_notifications FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_insert ON in_app_notifications FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_update ON in_app_notifications FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY in_app_notifications_company_delete ON in_app_notifications FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- lead_activities
-- ============================================================================
DROP POLICY IF EXISTS lead_activities_all_own ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_select ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_insert ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_update ON lead_activities;
DROP POLICY IF EXISTS lead_activities_company_delete ON lead_activities;

CREATE POLICY lead_activities_company_select ON lead_activities FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY lead_activities_company_insert ON lead_activities FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY lead_activities_company_update ON lead_activities FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY lead_activities_company_delete ON lead_activities FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- pending_income
-- ============================================================================
DROP POLICY IF EXISTS pending_income_delete_own ON pending_income;
DROP POLICY IF EXISTS pending_income_update_own ON pending_income;
DROP POLICY IF EXISTS pending_income_select_own ON pending_income;
DROP POLICY IF EXISTS pending_income_insert_own ON pending_income;
DROP POLICY IF EXISTS pending_income_company_select ON pending_income;
DROP POLICY IF EXISTS pending_income_company_insert ON pending_income;
DROP POLICY IF EXISTS pending_income_company_update ON pending_income;
DROP POLICY IF EXISTS pending_income_company_delete ON pending_income;

CREATE POLICY pending_income_company_select ON pending_income FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY pending_income_company_insert ON pending_income FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY pending_income_company_update ON pending_income FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY pending_income_company_delete ON pending_income FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- plan_automations
-- ============================================================================
DROP POLICY IF EXISTS plan_automations_all_own ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_select ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_insert ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_update ON plan_automations;
DROP POLICY IF EXISTS plan_automations_company_delete ON plan_automations;

CREATE POLICY plan_automations_company_select ON plan_automations FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY plan_automations_company_insert ON plan_automations FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY plan_automations_company_update ON plan_automations FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY plan_automations_company_delete ON plan_automations FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- quotes
-- ============================================================================
DROP POLICY IF EXISTS quotes_all_own ON quotes;
DROP POLICY IF EXISTS quotes_company_select ON quotes;
DROP POLICY IF EXISTS quotes_company_insert ON quotes;
DROP POLICY IF EXISTS quotes_company_update ON quotes;
DROP POLICY IF EXISTS quotes_company_delete ON quotes;

CREATE POLICY quotes_company_select ON quotes FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY quotes_company_insert ON quotes FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY quotes_company_update ON quotes FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY quotes_company_delete ON quotes FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- sales_rep_stats
-- ============================================================================
DROP POLICY IF EXISTS sales_rep_stats_all_own ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_select ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_insert ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_update ON sales_rep_stats;
DROP POLICY IF EXISTS sales_rep_stats_company_delete ON sales_rep_stats;

CREATE POLICY sales_rep_stats_company_select ON sales_rep_stats FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_insert ON sales_rep_stats FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_update ON sales_rep_stats FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY sales_rep_stats_company_delete ON sales_rep_stats FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- service_plans
-- ============================================================================
DROP POLICY IF EXISTS service_plans_all_own ON service_plans;
DROP POLICY IF EXISTS service_plans_company_select ON service_plans;
DROP POLICY IF EXISTS service_plans_company_insert ON service_plans;
DROP POLICY IF EXISTS service_plans_company_update ON service_plans;
DROP POLICY IF EXISTS service_plans_company_delete ON service_plans;

CREATE POLICY service_plans_company_select ON service_plans FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY service_plans_company_insert ON service_plans FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY service_plans_company_update ON service_plans FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY service_plans_company_delete ON service_plans FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- territories
-- ============================================================================
DROP POLICY IF EXISTS territories_all_own ON territories;
DROP POLICY IF EXISTS territories_company_select ON territories;
DROP POLICY IF EXISTS territories_company_insert ON territories;
DROP POLICY IF EXISTS territories_company_update ON territories;
DROP POLICY IF EXISTS territories_company_delete ON territories;

CREATE POLICY territories_company_select ON territories FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY territories_company_insert ON territories FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY territories_company_update ON territories FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY territories_company_delete ON territories FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- upcoming_expenses
-- ============================================================================
DROP POLICY IF EXISTS upcoming_expenses_select_own ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_update_own ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_insert_own ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_delete_own ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_select ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_insert ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_update ON upcoming_expenses;
DROP POLICY IF EXISTS upcoming_expenses_company_delete ON upcoming_expenses;

CREATE POLICY upcoming_expenses_company_select ON upcoming_expenses FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_insert ON upcoming_expenses FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_update ON upcoming_expenses FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY upcoming_expenses_company_delete ON upcoming_expenses FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- settings (keep user-specific but add company fallback)
-- ============================================================================
DROP POLICY IF EXISTS settings_update_own ON settings;
DROP POLICY IF EXISTS settings_delete_own ON settings;
DROP POLICY IF EXISTS settings_insert_own ON settings;
DROP POLICY IF EXISTS settings_select_own ON settings;
DROP POLICY IF EXISTS settings_company_select ON settings;
DROP POLICY IF EXISTS settings_company_insert ON settings;
DROP POLICY IF EXISTS settings_company_update ON settings;
DROP POLICY IF EXISTS settings_company_delete ON settings;

CREATE POLICY settings_company_select ON settings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()));

CREATE POLICY settings_company_insert ON settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY settings_company_update ON settings FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()));

CREATE POLICY settings_company_delete ON settings FOR DELETE TO authenticated
USING (user_id = auth.uid());

SELECT 'Migration 004 complete - RLS policies updated for 15 tables with company_id' as status;
