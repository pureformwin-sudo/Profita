-- ============================================================================
-- MIGRATION 007: Update RPC functions to use company_id
-- This ensures server-side functions also respect company boundaries
-- ============================================================================

-- ============================================================================
-- get_my_membership - Already exists, but verify it works correctly
-- ============================================================================
CREATE OR REPLACE FUNCTION get_my_membership()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  role text,
  status text,
  name text,
  email text,
  phone text,
  custom_permissions jsonb,
  current_status text,
  current_job_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id,
    cm.company_id,
    cm.role,
    cm.status,
    cm.name,
    cm.email,
    cm.phone,
    cm.custom_permissions,
    cm.current_status,
    cm.current_job_id
  FROM company_members cm
  WHERE cm.user_id = auth.uid()
  AND cm.status = 'active'
  LIMIT 1;
END;
$$;

-- ============================================================================
-- get_user_company_id - Helper to get the current user's company ID
-- Returns company they own OR company they're a member of
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- First check if user owns a company
  SELECT id INTO v_company_id
  FROM companies
  WHERE owner_user_id = auth.uid()
  LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    RETURN v_company_id;
  END IF;
  
  -- Then check if user is a member of a company
  SELECT company_id INTO v_company_id
  FROM company_members
  WHERE user_id = auth.uid()
  AND status = 'active'
  LIMIT 1;
  
  RETURN v_company_id;
END;
$$;

-- ============================================================================
-- is_company_owner - Check if current user owns a specific company
-- ============================================================================
CREATE OR REPLACE FUNCTION is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies
    WHERE id = p_company_id
    AND owner_user_id = auth.uid()
  );
END;
$$;

-- ============================================================================
-- is_company_member - Check if current user is a member of a specific company
-- ============================================================================
CREATE OR REPLACE FUNCTION is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
END;
$$;

-- ============================================================================
-- can_access_company - Check if current user can access a company's data
-- (either as owner or active member)
-- ============================================================================
CREATE OR REPLACE FUNCTION can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN is_company_owner(p_company_id) OR is_company_member(p_company_id);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_my_membership TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id TO authenticated;
GRANT EXECUTE ON FUNCTION is_company_owner TO authenticated;
GRANT EXECUTE ON FUNCTION is_company_member TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_company TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';

SELECT 'Migration 007 complete - RPC functions updated for company-based access' as status;
