-- =============================================================================
-- Create Company Function with SECURITY DEFINER
-- =============================================================================
-- This function bypasses RLS to create a company for the calling user.
-- Use this when RLS policies are blocking the INSERT.
-- =============================================================================

-- Create a function that can insert companies bypassing RLS
CREATE OR REPLACE FUNCTION create_company_for_user(p_user_id uuid, p_name text DEFAULT 'My Company')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id uuid;
BEGIN
  -- Check if company already exists for this user
  SELECT id INTO new_company_id FROM companies WHERE owner_user_id = p_user_id;
  
  IF new_company_id IS NOT NULL THEN
    RETURN new_company_id;
  END IF;
  
  -- Create new company
  INSERT INTO companies (owner_user_id, name)
  VALUES (p_user_id, p_name)
  RETURNING id INTO new_company_id;
  
  RETURN new_company_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_company_for_user TO authenticated;

NOTIFY pgrst, 'reload schema';
