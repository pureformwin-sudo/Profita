-- =============================================================================
-- Team & Permissions System (Idempotent - Safe to Re-run)
-- =============================================================================
-- This migration adds company/workspace support with role-based access control.
-- Run this AFTER all existing migrations.
-- =============================================================================

-- Companies / Workspaces
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  logo_url text,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_user_id);

-- Company Members (links users to companies with roles)
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'worker',
  status text NOT NULL DEFAULT 'invited',
  current_status text DEFAULT 'idle',
  current_job_id uuid,
  last_seen_at timestamptz,
  custom_permissions jsonb,
  invite_token text,
  invite_sent_at timestamptz,
  invite_accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_email ON company_members(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_unique ON company_members(company_id, email);

-- Job Assignments
CREATE TABLE IF NOT EXISTS job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  status text DEFAULT 'assigned',
  assigned_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_member ON job_assignments(member_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_assignments_unique ON job_assignments(job_id, member_id);

-- Time Entries
CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES company_members(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes integer,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_member ON time_entries(member_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_job ON time_entries(job_id);

-- Add company_id to existing tables (safe - uses IF NOT EXISTS)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE income ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- Try service_plans if it exists
DO $$ BEGIN
  ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Indexes for company_id
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_company ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_income_company ON income(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_service_plans_company ON service_plans(company_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- RLS for companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_owner_all ON companies;
CREATE POLICY companies_owner_all ON companies
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- RLS for company_members
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_members_select ON company_members;
CREATE POLICY company_members_select ON company_members
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS company_members_insert ON company_members;
CREATE POLICY company_members_insert ON company_members
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()));

DROP POLICY IF EXISTS company_members_update ON company_members;
CREATE POLICY company_members_update ON company_members
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS company_members_delete ON company_members;
CREATE POLICY company_members_delete ON company_members
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()));

-- RLS for job_assignments
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_assignments_all ON job_assignments;
CREATE POLICY job_assignments_all ON job_assignments
  FOR ALL TO authenticated
  USING (
    member_id IN (
      SELECT id FROM company_members 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- RLS for time_entries
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_entries_all ON time_entries;
CREATE POLICY time_entries_all ON time_entries
  FOR ALL TO authenticated
  USING (
    member_id IN (
      SELECT id FROM company_members 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- Auto-create company function
CREATE OR REPLACE FUNCTION create_company_for_owner()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE owner_user_id = NEW.user_id) THEN
    INSERT INTO companies (owner_user_id, name)
    VALUES (NEW.user_id, 'My Company');
    
    UPDATE customers 
    SET company_id = (SELECT id FROM companies WHERE owner_user_id = NEW.user_id)
    WHERE id = NEW.id;
  ELSE
    UPDATE customers 
    SET company_id = (SELECT id FROM companies WHERE owner_user_id = NEW.user_id)
    WHERE id = NEW.id AND company_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_create_company ON customers;
CREATE TRIGGER auto_create_company
  AFTER INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION create_company_for_owner();

-- Backfill existing data (safe - only updates NULL company_ids)
DO $$
DECLARE
  owner_record RECORD;
  new_company_id uuid;
BEGIN
  FOR owner_record IN 
    SELECT DISTINCT user_id 
    FROM customers 
    WHERE user_id IS NOT NULL 
    AND user_id NOT IN (SELECT owner_user_id FROM companies)
  LOOP
    INSERT INTO companies (owner_user_id, name)
    VALUES (owner_record.user_id, 'My Company')
    RETURNING id INTO new_company_id;
    
    UPDATE customers SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE jobs SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE invoices SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE estimates SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE income SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE expenses SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE employees SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
    UPDATE leads SET company_id = new_company_id WHERE user_id = owner_record.user_id AND company_id IS NULL;
  END LOOP;
END;
$$;

-- Try backfill service_plans separately
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id, owner_user_id FROM companies
  LOOP
    BEGIN
      UPDATE service_plans SET company_id = comp.id WHERE user_id = comp.owner_user_id AND company_id IS NULL;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
