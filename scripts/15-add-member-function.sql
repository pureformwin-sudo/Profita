-- Create a function to add company members that bypasses RLS
-- This is needed because the owner needs to be able to invite team members

CREATE OR REPLACE FUNCTION add_company_member(
  p_company_id uuid,
  p_email text,
  p_name text,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'worker'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_member_id uuid;
  v_invite_token text;
  v_owner_id uuid;
BEGIN
  -- Verify the caller owns this company
  SELECT owner_user_id INTO v_owner_id FROM companies WHERE id = p_company_id;
  
  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'You do not own this company';
  END IF;
  
  -- Check if member already exists
  SELECT id INTO new_member_id 
  FROM company_members 
  WHERE company_id = p_company_id AND email = p_email;
  
  IF new_member_id IS NOT NULL THEN
    RETURN new_member_id;
  END IF;
  
  -- Generate invite token
  v_invite_token := encode(gen_random_bytes(32), 'hex');
  
  -- Insert new member
  INSERT INTO company_members (
    company_id,
    email,
    name,
    phone,
    role,
    status,
    invite_token,
    invite_sent_at
  )
  VALUES (
    p_company_id,
    p_email,
    p_name,
    p_phone,
    p_role,
    'invited',
    v_invite_token,
    now()
  )
  RETURNING id INTO new_member_id;
  
  RETURN new_member_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_company_member TO authenticated;

NOTIFY pgrst, 'reload schema';
