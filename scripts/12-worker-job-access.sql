-- =============================================================================
-- Worker Job Access via job_assignments
-- =============================================================================
-- This adds RLS policies for workers to access jobs they're assigned to
-- via the new company_members/job_assignments system.
-- =============================================================================

-- Workers can read jobs they're assigned to via job_assignments
DROP POLICY IF EXISTS workers_can_read_assigned_jobs ON jobs;
CREATE POLICY workers_can_read_assigned_jobs ON jobs
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT ja.job_id 
      FROM job_assignments ja
      JOIN company_members cm ON cm.id = ja.member_id
      WHERE cm.user_id = auth.uid()
      AND cm.status = 'active'
    )
  );

-- Workers can update jobs they're assigned to (status, notes)
DROP POLICY IF EXISTS workers_can_update_assigned_jobs ON jobs;
CREATE POLICY workers_can_update_assigned_jobs ON jobs
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT ja.job_id 
      FROM job_assignments ja
      JOIN company_members cm ON cm.id = ja.member_id
      WHERE cm.user_id = auth.uid()
      AND cm.status = 'active'
    )
  );

-- Workers can read customers for jobs they're assigned to
DROP POLICY IF EXISTS workers_can_read_assigned_customers ON customers;
CREATE POLICY workers_can_read_assigned_customers ON customers
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT j.customer_id 
      FROM jobs j
      JOIN job_assignments ja ON ja.job_id = j.id
      JOIN company_members cm ON cm.id = ja.member_id
      WHERE cm.user_id = auth.uid()
      AND cm.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';
