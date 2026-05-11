-- Create service_plans table
CREATE TABLE IF NOT EXISTS service_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'annually')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'pending_renewal', 'active', 'renewed', 'expiring_soon', 'expired', 'cancelled')),
  start_date DATE,
  end_date DATE,
  next_billing_date DATE,
  auto_renew BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_plans_user_id ON service_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_customer_id ON service_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_status ON service_plans(status);

-- Enable RLS
ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "service_plans_select_own" ON service_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_plans_insert_own" ON service_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_plans_update_own" ON service_plans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "service_plans_delete_own" ON service_plans
  FOR DELETE USING (auth.uid() = user_id);
