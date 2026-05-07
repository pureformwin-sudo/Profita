-- =============================================================================
-- 10-salesforce-extended.sql
-- Profita Salesforce: Extended schema for full field-sales functionality
-- Run AFTER 09-multi-mode-foundation.sql
-- =============================================================================

-- ============================================================
-- 1. EXTEND LEADS TABLE
-- ============================================================

-- Add fields for richer lead tracking
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS service_interest text,
  ADD COLUMN IF NOT EXISTS estimated_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS do_not_knock boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'door_knock',
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_reason text;

-- Index for follow-up queries
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- ============================================================
-- 2. LEAD ACTIVITY (timeline of all interactions)
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rep_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  activity_type text NOT NULL, -- 'knock', 'call', 'sms', 'email', 'note', 'status_change', 'quote_sent', 'booked'
  old_status text,
  new_status text,
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON lead_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_rep ON lead_activity(rep_employee_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_type ON lead_activity(activity_type);
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

-- Owner sees all activity for their leads
DROP POLICY IF EXISTS lead_activity_owner_all ON lead_activity;
CREATE POLICY lead_activity_owner_all ON lead_activity
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reps see activity for leads they're assigned to
DROP POLICY IF EXISTS lead_activity_rep_select ON lead_activity;
CREATE POLICY lead_activity_rep_select ON lead_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      JOIN leads l ON l.sales_rep_id = sru.employee_id
      WHERE sru.auth_user_id = auth.uid()
        AND l.id = lead_activity.lead_id
    )
  );

DROP POLICY IF EXISTS lead_activity_rep_insert ON lead_activity;
CREATE POLICY lead_activity_rep_insert ON lead_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      JOIN leads l ON l.sales_rep_id = sru.employee_id
      WHERE sru.auth_user_id = auth.uid()
        AND l.id = lead_activity.lead_id
    )
  );

-- ============================================================
-- 3. QUOTES (linked to leads)
-- ============================================================

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  rep_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  quote_number serial,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  service_type text,
  property_type text,
  description text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_rep ON quotes(rep_employee_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_owner_all ON quotes;
CREATE POLICY quotes_owner_all ON quotes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quotes_rep_select ON quotes;
CREATE POLICY quotes_rep_select ON quotes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = quotes.rep_employee_id
    )
  );

DROP POLICY IF EXISTS quotes_rep_insert ON quotes;
CREATE POLICY quotes_rep_insert ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = quotes.rep_employee_id
    )
  );

DROP POLICY IF EXISTS quotes_rep_update ON quotes;
CREATE POLICY quotes_rep_update ON quotes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = quotes.rep_employee_id
    )
  );

-- ============================================================
-- 4. QUOTE LINE ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_items_owner_all ON quote_items;
CREATE POLICY quote_items_owner_all ON quote_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quote_items_rep_select ON quote_items;
CREATE POLICY quote_items_rep_select ON quote_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN sales_rep_users sru ON sru.employee_id = q.rep_employee_id
      WHERE sru.auth_user_id = auth.uid()
        AND q.id = quote_items.quote_id
    )
  );

DROP POLICY IF EXISTS quote_items_rep_insert ON quote_items;
CREATE POLICY quote_items_rep_insert ON quote_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN sales_rep_users sru ON sru.employee_id = q.rep_employee_id
      WHERE sru.auth_user_id = auth.uid()
        AND q.id = quote_items.quote_id
    )
  );

-- ============================================================
-- 5. REP GOALS (daily/weekly/monthly targets)
-- ============================================================

CREATE TABLE IF NOT EXISTS rep_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  metric text NOT NULL CHECK (metric IN ('doors', 'leads', 'quotes', 'revenue', 'bookings')),
  target_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period, metric, start_date)
);
CREATE INDEX IF NOT EXISTS idx_rep_goals_employee ON rep_goals(employee_id);
CREATE INDEX IF NOT EXISTS idx_rep_goals_dates ON rep_goals(start_date, end_date);
ALTER TABLE rep_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rep_goals_owner_all ON rep_goals;
CREATE POLICY rep_goals_owner_all ON rep_goals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS rep_goals_rep_select ON rep_goals;
CREATE POLICY rep_goals_rep_select ON rep_goals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = rep_goals.employee_id
    )
  );

-- ============================================================
-- 6. REP LOCATION SESSIONS (optional route tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS rep_location_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  territory_id uuid REFERENCES territories(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  route_polyline text, -- encoded polyline for the route
  total_distance_meters numeric,
  doors_knocked integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_location_sessions_employee ON rep_location_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_rep_location_sessions_dates ON rep_location_sessions(started_at);
ALTER TABLE rep_location_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rep_location_sessions_owner_all ON rep_location_sessions;
CREATE POLICY rep_location_sessions_owner_all ON rep_location_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS rep_location_sessions_rep_all ON rep_location_sessions;
CREATE POLICY rep_location_sessions_rep_all ON rep_location_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = rep_location_sessions.employee_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_rep_users sru
      WHERE sru.auth_user_id = auth.uid()
        AND sru.employee_id = rep_location_sessions.employee_id
    )
  );

-- ============================================================
-- 7. HELPER FUNCTION: Get rep stats for a date range
-- ============================================================

CREATE OR REPLACE FUNCTION get_rep_stats(
  p_employee_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  doors_knocked bigint,
  leads_created bigint,
  conversations bigint,
  quotes_sent bigint,
  quotes_accepted bigint,
  bookings_made bigint,
  revenue_sold numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE((
      SELECT COUNT(*) FROM lead_activity la
      JOIN leads l ON l.id = la.lead_id
      WHERE l.sales_rep_id = p_employee_id
        AND la.activity_type = 'knock'
        AND la.created_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS doors_knocked,
    COALESCE((
      SELECT COUNT(*) FROM leads l
      WHERE l.sales_rep_id = p_employee_id
        AND l.created_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS leads_created,
    COALESCE((
      SELECT COUNT(*) FROM lead_activity la
      JOIN leads l ON l.id = la.lead_id
      WHERE l.sales_rep_id = p_employee_id
        AND la.activity_type IN ('call', 'sms', 'note')
        AND la.created_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS conversations,
    COALESCE((
      SELECT COUNT(*) FROM quotes q
      WHERE q.rep_employee_id = p_employee_id
        AND q.status != 'draft'
        AND q.sent_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS quotes_sent,
    COALESCE((
      SELECT COUNT(*) FROM quotes q
      WHERE q.rep_employee_id = p_employee_id
        AND q.status = 'accepted'
        AND q.accepted_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS quotes_accepted,
    COALESCE((
      SELECT COUNT(*) FROM jobs j
      WHERE j.sales_rep_id = p_employee_id
        AND j.created_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS bookings_made,
    COALESCE((
      SELECT SUM(q.total) FROM quotes q
      WHERE q.rep_employee_id = p_employee_id
        AND q.status = 'accepted'
        AND q.accepted_at::date BETWEEN p_start_date AND p_end_date
    ), 0) AS revenue_sold;
$$;

-- ============================================================
-- 8. REFRESH SCHEMA CACHE
-- ============================================================

NOTIFY pgrst, 'reload schema';
