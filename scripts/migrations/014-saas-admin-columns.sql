-- Migration 014: Add SaaS admin columns to companies table
-- These columns support multi-tenant subscription management

-- Add plan_type column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'plan_type') THEN
    ALTER TABLE companies ADD COLUMN plan_type TEXT DEFAULT 'free';
  END IF;
END $$;

-- Add subscription_status column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'subscription_status') THEN
    ALTER TABLE companies ADD COLUMN subscription_status TEXT DEFAULT 'trialing';
  END IF;
END $$;

-- Add trial_ends_at column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'trial_ends_at') THEN
    ALTER TABLE companies ADD COLUMN trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');
  END IF;
END $$;

-- Add mrr column if not exists (Monthly Recurring Revenue)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'mrr') THEN
    ALTER TABLE companies ADD COLUMN mrr DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add owner_email column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'owner_email') THEN
    ALTER TABLE companies ADD COLUMN owner_email TEXT;
  END IF;
END $$;

-- Add stripe_customer_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT;
  END IF;
END $$;

-- Add stripe_subscription_id column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'stripe_subscription_id') THEN
    ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT;
  END IF;
END $$;

-- Create audit_logs table for super admin tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can read all audit logs (via is_admin flag on profiles)
CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Anyone can insert audit logs (for logging their own actions)
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Add check constraints for valid values
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_plan_type_check 
  CHECK (plan_type IN ('free', 'starter', 'pro', 'enterprise'));

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_check 
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'paused'));
