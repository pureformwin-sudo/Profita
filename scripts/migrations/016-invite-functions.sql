-- Migration 016: Create invite token RPC functions
-- These functions allow the invite page to validate and accept invites

-- Function to get invite details by token (public access for invite page)
CREATE OR REPLACE FUNCTION get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  role TEXT,
  status TEXT,
  company_name TEXT,
  company_id UUID
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id,
    cm.email,
    cm.name,
    cm.role,
    cm.status,
    c.name AS company_name,
    cm.company_id
  FROM company_members cm
  JOIN companies c ON c.id = cm.company_id
  WHERE cm.invite_token = p_token;
END;
$$;

-- Grant execute to anon (for unauthenticated invite page access)
GRANT EXECUTE ON FUNCTION get_invite_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_invite_by_token(TEXT) TO authenticated;

-- Function to accept an invite (links user_id and updates status)
CREATE OR REPLACE FUNCTION accept_invite(p_token TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_id UUID;
  v_user_id UUID;
  v_member_status TEXT;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Find the invite
  SELECT id, status INTO v_member_id, v_member_status
  FROM company_members
  WHERE invite_token = p_token;
  
  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite not found');
  END IF;
  
  IF v_member_status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite already accepted');
  END IF;
  
  IF v_member_status != 'invited' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite is no longer valid');
  END IF;
  
  -- Update the company member with user_id and set status to active
  UPDATE company_members
  SET 
    user_id = v_user_id,
    status = 'active',
    invite_accepted_at = NOW(),
    invite_token = NULL, -- Clear the token after use
    updated_at = NOW()
  WHERE id = v_member_id;
  
  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION accept_invite(TEXT) TO authenticated;

-- Also create a profile for the new user if it doesn't exist
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_profile();
