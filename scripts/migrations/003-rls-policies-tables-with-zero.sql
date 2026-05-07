-- ============================================================================
-- MIGRATION 003: Add RLS policies to tables with 0 policies
-- Tables: company_members, job_assignments, time_entries
-- ============================================================================

-- ============================================================================
-- company_members RLS policies
-- ============================================================================

-- Drop any existing policies first (safe to run even if none exist)
DROP POLICY IF EXISTS company_members_select ON company_members;
DROP POLICY IF EXISTS company_members_insert ON company_members;
DROP POLICY IF EXISTS company_members_update ON company_members;
DROP POLICY IF EXISTS company_members_delete ON company_members;

-- SELECT: Owners can see all members of their company
-- Members can see other members of the same company
CREATE POLICY company_members_select ON company_members FOR SELECT TO authenticated
USING (
  -- User is the owner of this company
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  -- OR user is an active member of this company
  OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  -- OR this is the user's own membership record
  OR user_id = auth.uid()
);

-- INSERT: Only company owners can add members
CREATE POLICY company_members_insert ON company_members FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
);

-- UPDATE: Owners can update any member, members can update their own record (limited fields)
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
-- job_assignments RLS policies
-- Need to join through jobs -> company_id
-- ============================================================================

DROP POLICY IF EXISTS job_assignments_select ON job_assignments;
DROP POLICY IF EXISTS job_assignments_insert ON job_assignments;
DROP POLICY IF EXISTS job_assignments_update ON job_assignments;
DROP POLICY IF EXISTS job_assignments_delete ON job_assignments;

-- SELECT: Users can see assignments for jobs in their company
CREATE POLICY job_assignments_select ON job_assignments FOR SELECT TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
  -- OR the user is the assigned member
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);

-- INSERT: Owners and admins can create assignments
CREATE POLICY job_assignments_insert ON job_assignments FOR INSERT TO authenticated
WITH CHECK (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
);

-- UPDATE: Owners can update any, assigned members can update their own
CREATE POLICY job_assignments_update ON job_assignments FOR UPDATE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);

-- DELETE: Only owners can delete assignments
CREATE POLICY job_assignments_delete ON job_assignments FOR DELETE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
);

-- ============================================================================
-- time_entries RLS policies
-- Need to join through member_id -> company_members -> company_id
-- ============================================================================

DROP POLICY IF EXISTS time_entries_select ON time_entries;
DROP POLICY IF EXISTS time_entries_insert ON time_entries;
DROP POLICY IF EXISTS time_entries_update ON time_entries;
DROP POLICY IF EXISTS time_entries_delete ON time_entries;

-- SELECT: Users can see time entries for their company
CREATE POLICY time_entries_select ON time_entries FOR SELECT TO authenticated
USING (
  -- User is owner of company that the member belongs to
  member_id IN (
    SELECT id FROM company_members WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  )
  -- OR user is the member who created this entry
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  -- OR entry is for a job in user's company
  OR job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  )
);

-- INSERT: Members can insert their own time entries
CREATE POLICY time_entries_insert ON time_entries FOR INSERT TO authenticated
WITH CHECK (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  )
);

-- UPDATE: Members can update their own, owners can update any in their company
CREATE POLICY time_entries_update ON time_entries FOR UPDATE TO authenticated
USING (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  )
);

-- DELETE: Members can delete their own, owners can delete any in their company
CREATE POLICY time_entries_delete ON time_entries FOR DELETE TO authenticated
USING (
  member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR member_id IN (
    SELECT id FROM company_members WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  )
);

SELECT 'Migration 003 complete - RLS policies added for company_members, job_assignments, time_entries' as status;
