-- ============================================================================
-- MIGRATION 005: Update RLS for tables that already have company_id but 
-- still use user_id-only policies
-- Tables: employees, expenses, income, leads, job_workers
-- ============================================================================

-- ============================================================================
-- employees - already has company_id, update RLS
-- ============================================================================
DROP POLICY IF EXISTS "Users can insert their own employees" ON employees;
DROP POLICY IF EXISTS "Users can view their own employees" ON employees;
DROP POLICY IF EXISTS "Users can update their own employees" ON employees;
DROP POLICY IF EXISTS "Users can delete their own employees" ON employees;
DROP POLICY IF EXISTS employees_company_select ON employees;
DROP POLICY IF EXISTS employees_company_insert ON employees;
DROP POLICY IF EXISTS employees_company_update ON employees;
DROP POLICY IF EXISTS employees_company_delete ON employees;

CREATE POLICY employees_company_select ON employees FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY employees_company_insert ON employees FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY employees_company_update ON employees FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY employees_company_delete ON employees FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- expenses - already has company_id, update RLS
-- ============================================================================
DROP POLICY IF EXISTS expenses_select_own ON expenses;
DROP POLICY IF EXISTS expenses_insert_own ON expenses;
DROP POLICY IF EXISTS expenses_delete_own ON expenses;
DROP POLICY IF EXISTS expenses_update_own ON expenses;
DROP POLICY IF EXISTS expenses_company_select ON expenses;
DROP POLICY IF EXISTS expenses_company_insert ON expenses;
DROP POLICY IF EXISTS expenses_company_update ON expenses;
DROP POLICY IF EXISTS expenses_company_delete ON expenses;

CREATE POLICY expenses_company_select ON expenses FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY expenses_company_insert ON expenses FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY expenses_company_update ON expenses FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY expenses_company_delete ON expenses FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- income - already has company_id, update RLS
-- ============================================================================
DROP POLICY IF EXISTS income_insert_own ON income;
DROP POLICY IF EXISTS income_delete_own ON income;
DROP POLICY IF EXISTS income_select_own ON income;
DROP POLICY IF EXISTS income_update_own ON income;
DROP POLICY IF EXISTS income_company_select ON income;
DROP POLICY IF EXISTS income_company_insert ON income;
DROP POLICY IF EXISTS income_company_update ON income;
DROP POLICY IF EXISTS income_company_delete ON income;

CREATE POLICY income_company_select ON income FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY income_company_insert ON income FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY income_company_update ON income FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY income_company_delete ON income FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- leads - already has company_id, update RLS
-- ============================================================================
DROP POLICY IF EXISTS leads_all_own ON leads;
DROP POLICY IF EXISTS leads_company_select ON leads;
DROP POLICY IF EXISTS leads_company_insert ON leads;
DROP POLICY IF EXISTS leads_company_update ON leads;
DROP POLICY IF EXISTS leads_company_delete ON leads;

CREATE POLICY leads_company_select ON leads FOR SELECT TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY leads_company_insert ON leads FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY leads_company_update ON leads FOR UPDATE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active') OR user_id = auth.uid());

CREATE POLICY leads_company_delete ON leads FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()) OR user_id = auth.uid());

-- ============================================================================
-- job_workers - needs to check through jobs -> company_id
-- ============================================================================
DROP POLICY IF EXISTS "Users can update job workers for their jobs" ON job_workers;
DROP POLICY IF EXISTS "Users can delete job workers for their jobs" ON job_workers;
DROP POLICY IF EXISTS "Users can view job workers for their jobs" ON job_workers;
DROP POLICY IF EXISTS "Users can insert job workers for their jobs" ON job_workers;
DROP POLICY IF EXISTS job_workers_company_select ON job_workers;
DROP POLICY IF EXISTS job_workers_company_insert ON job_workers;
DROP POLICY IF EXISTS job_workers_company_update ON job_workers;
DROP POLICY IF EXISTS job_workers_company_delete ON job_workers;

CREATE POLICY job_workers_company_select ON job_workers FOR SELECT TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_insert ON job_workers FOR INSERT TO authenticated
WITH CHECK (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_update ON job_workers FOR UPDATE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY job_workers_company_delete ON job_workers FOR DELETE TO authenticated
USING (
  job_id IN (
    SELECT id FROM jobs WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
);

-- ============================================================================
-- invoice_items - needs to check through invoices -> company_id
-- ============================================================================
DROP POLICY IF EXISTS invoice_items_update_own ON invoice_items;
DROP POLICY IF EXISTS invoice_items_delete_own ON invoice_items;
DROP POLICY IF EXISTS invoice_items_insert_own ON invoice_items;
DROP POLICY IF EXISTS invoice_items_select_own ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_select ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_insert ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_update ON invoice_items;
DROP POLICY IF EXISTS invoice_items_company_delete ON invoice_items;

CREATE POLICY invoice_items_company_select ON invoice_items FOR SELECT TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_insert ON invoice_items FOR INSERT TO authenticated
WITH CHECK (
  invoice_id IN (
    SELECT id FROM invoices WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_update ON invoice_items FOR UPDATE TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY invoice_items_company_delete ON invoice_items FOR DELETE TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM invoices WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
);

-- ============================================================================
-- estimate_items - needs to check through estimates -> company_id
-- ============================================================================
DROP POLICY IF EXISTS estimate_items_insert_own ON estimate_items;
DROP POLICY IF EXISTS estimate_items_select_own ON estimate_items;
DROP POLICY IF EXISTS estimate_items_update_own ON estimate_items;
DROP POLICY IF EXISTS estimate_items_delete_own ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_select ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_insert ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_update ON estimate_items;
DROP POLICY IF EXISTS estimate_items_company_delete ON estimate_items;

CREATE POLICY estimate_items_company_select ON estimate_items FOR SELECT TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_insert ON estimate_items FOR INSERT TO authenticated
WITH CHECK (
  estimate_id IN (
    SELECT id FROM estimates WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_update ON estimate_items FOR UPDATE TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
      OR user_id = auth.uid()
  )
);

CREATE POLICY estimate_items_company_delete ON estimate_items FOR DELETE TO authenticated
USING (
  estimate_id IN (
    SELECT id FROM estimates WHERE 
      company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
      OR user_id = auth.uid()
  )
);

SELECT 'Migration 005 complete - RLS policies updated for employees, expenses, income, leads, job_workers, invoice_items, estimate_items' as status;
