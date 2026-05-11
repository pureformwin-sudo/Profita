-- Service Plans table - defines available recurring service plans
CREATE TABLE IF NOT EXISTS service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly', -- monthly, quarterly, biannual, annual, custom
  custom_days integer, -- for custom frequency
  visits_per_period integer NOT NULL DEFAULT 1,
  auto_renew boolean NOT NULL DEFAULT true,
  is_priority boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_plans_user ON service_plans(user_id);

ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_plans_select_own ON service_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY service_plans_insert_own ON service_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY service_plans_update_own ON service_plans
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY service_plans_delete_own ON service_plans
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Customer Plan Assignments - links customers to plans
CREATE TABLE IF NOT EXISTS customer_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES service_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active', -- active, paused, cancelled, expired
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_billing_date date,
  next_service_date date,
  autopay boolean NOT NULL DEFAULT false,
  visits_used integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_plans_user ON customer_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_plans_customer ON customer_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_plans_plan ON customer_plans(plan_id);

ALTER TABLE customer_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_plans_select_own ON customer_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY customer_plans_insert_own ON customer_plans
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY customer_plans_update_own ON customer_plans
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY customer_plans_delete_own ON customer_plans
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Plan automations settings
CREATE TABLE IF NOT EXISTS plan_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  auto_invoice boolean NOT NULL DEFAULT true,
  auto_schedule boolean NOT NULL DEFAULT true,
  send_reminders boolean NOT NULL DEFAULT true,
  retry_failed boolean NOT NULL DEFAULT false,
  ai_winback boolean NOT NULL DEFAULT false,
  ai_upsell boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_automations_select_own ON plan_automations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY plan_automations_insert_own ON plan_automations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY plan_automations_update_own ON plan_automations
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
