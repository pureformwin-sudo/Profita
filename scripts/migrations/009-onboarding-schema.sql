-- ============================================================================
-- MIGRATION 009: Add onboarding and company settings fields
-- SAFE: Uses ADD COLUMN IF NOT EXISTS - will not overwrite existing data
-- ============================================================================

-- ============================================================================
-- Extend companies table with onboarding and settings fields
-- ============================================================================

-- Onboarding tracking
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0;

-- Company profile extensions
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS team_size text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;

-- Services and job configuration
ALTER TABLE companies ADD COLUMN IF NOT EXISTS services_offered jsonb DEFAULT '[]'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_job_types jsonb DEFAULT '[]'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_pricing jsonb DEFAULT '{}'::jsonb;

-- Sales Force settings
ALTER TABLE companies ADD COLUMN IF NOT EXISTS uses_sales_force boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sales_goals jsonb DEFAULT '{}'::jsonb;

-- Business goals
ALTER TABLE companies ADD COLUMN IF NOT EXISTS job_goals jsonb DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_goals jsonb DEFAULT '{}'::jsonb;

-- Invoice and tax settings
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '[]'::jsonb;

-- Notification preferences (company-wide defaults)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;

-- ============================================================================
-- Update existing companies: mark them as onboarding completed if they have data
-- This prevents existing users from being trapped in onboarding
-- ============================================================================

-- Mark companies as onboarding_completed if they have:
-- - At least 1 customer OR
-- - At least 1 job OR
-- - At least 1 invoice OR
-- - A non-default company name
UPDATE companies c
SET onboarding_completed = true
WHERE onboarding_completed = false
AND (
  EXISTS (SELECT 1 FROM customers WHERE company_id = c.id)
  OR EXISTS (SELECT 1 FROM jobs WHERE company_id = c.id)
  OR EXISTS (SELECT 1 FROM invoices WHERE company_id = c.id)
  OR (c.name IS NOT NULL AND c.name != 'My Company' AND c.name != '')
);

-- ============================================================================
-- Add index for faster onboarding status lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_companies_onboarding ON companies(owner_user_id, onboarding_completed);

-- ============================================================================
-- Verify migration
-- ============================================================================
SELECT 'Migration 009 complete - Onboarding schema added' as status;
SELECT 
  COUNT(*) as total_companies,
  SUM(CASE WHEN onboarding_completed THEN 1 ELSE 0 END) as completed_onboarding,
  SUM(CASE WHEN NOT onboarding_completed THEN 1 ELSE 0 END) as pending_onboarding
FROM companies;
