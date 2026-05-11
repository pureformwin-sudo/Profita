-- ============================================================================
-- PROFITA MULTI-TENANT SECURITY MIGRATION
-- ============================================================================
-- 
-- PURPOSE: Ensure no company can ever see another company's data
--
-- WHAT THIS DOES:
-- 1. Adds company_id to 15 tables that were missing it
-- 2. Backfills company_id for all existing records
-- 3. Adds RLS policies to 3 tables that had none (company_members, job_assignments, time_entries)
-- 4. Updates RLS policies on 22 tables to use company-membership-based access
-- 5. Fixes 3 views that had RLS disabled
-- 6. Adds helper RPC functions for company access checks
--
-- HOW TO RUN:
-- 1. Go to Supabase Dashboard -> SQL Editor
-- 2. Run each migration file in order (001, 002, 003, 004, 005, 006, 007)
-- 3. Or copy this entire file and run it all at once
--
-- SAFETY:
-- - All changes are additive (no data is deleted)
-- - Uses IF NOT EXISTS and IF EXISTS to be idempotent (safe to run multiple times)
-- - company_id columns are nullable so existing app code won't break immediately
--
-- ============================================================================

-- Run migrations in order:
-- 001: Add company_id columns
-- 002: Backfill company_id
-- 003: RLS for tables with 0 policies
-- 004: RLS for new company_id tables
-- 005: Update existing RLS policies
-- 006: Fix views security
-- 007: Update RPC functions

-- For each migration, copy the contents of the corresponding file and run in Supabase SQL Editor.

-- After running all migrations, verify with:
SELECT 
  'Tables with company_id' as check_type,
  COUNT(*) as count
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND column_name = 'company_id';

-- Check RLS policies
SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;
