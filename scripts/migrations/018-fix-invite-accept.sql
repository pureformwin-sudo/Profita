-- Migration 018: Fix invite acceptance RLS policies
-- The previous RLS policies queried auth.users directly which regular users can't access
-- This migration creates a SECURITY DEFINER function to get user email and updates the RLS

-- First, drop the problematic policies
DROP POLICY IF EXISTS company_members_read_own_invite ON public.company_members;
DROP POLICY IF EXISTS company_members_accept_own_invite ON public.company_members;
DROP POLICY IF EXISTS company_members_read_by_token ON public.company_members;

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.get_my_email();
DROP FUNCTION IF EXISTS public.accept_invite(TEXT);
DROP FUNCTION IF EXISTS public.get_invite_by_token(TEXT);

-- Create a SECURITY DEFINER function to get the current user's email
-- This allows RLS policies to check email without needing direct auth.users access
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- Create a SECURITY DEFINER function to accept an invite
-- This handles all the logic server-side with elevated permissions
CREATE OR REPLACE FUNCTION public.accept_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user email from auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Find the invite by token
  SELECT * INTO v_invite 
  FROM public.company_members 
  WHERE invite_token = p_token;
  
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invite token');
  END IF;
  
  -- Check if already accepted
  IF v_invite.status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite already accepted');
  END IF;
  
  -- Check if invite is for this user's email
  IF v_invite.email != v_user_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invite is for a different email address');
  END IF;
  
  -- Update the company_members row
  UPDATE public.company_members
  SET 
    user_id = v_user_id,
    status = 'active',
    invite_accepted_at = NOW(),
    invite_token = NULL,
    updated_at = NOW()
  WHERE id = v_invite.id;
  
  -- Also update or create the profiles entry if needed
  INSERT INTO public.profiles (id, name, email, status)
  VALUES (v_user_id, v_invite.name, v_user_email, 'active')
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, profiles.name),
    status = 'active';
  
  RETURN jsonb_build_object(
    'success', true, 
    'company_id', v_invite.company_id,
    'role', v_invite.role
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;

-- Create a function to get invite by token (public access for validation)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  role TEXT,
  status TEXT,
  company_id UUID,
  company_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id,
    cm.email,
    cm.name,
    cm.role,
    cm.status,
    cm.company_id,
    c.name as company_name
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.invite_token = p_token;
END;
$$;

-- Grant execute to anon (for unauthenticated invite validation) and authenticated
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO authenticated;

-- Recreate the RLS policies using the get_my_email() function instead of direct auth.users access
-- Policy: Allow users to read their own invite by email match
CREATE POLICY company_members_read_own_invite ON public.company_members
  FOR SELECT
  USING (
    email = public.get_my_email()
    OR user_id = auth.uid()
  );

-- Policy: Allow users to accept their own invite by email match
CREATE POLICY company_members_accept_own_invite ON public.company_members
  FOR UPDATE
  USING (
    email = public.get_my_email()
    AND status = 'invited'
    AND user_id IS NULL
  )
  WITH CHECK (
    email = public.get_my_email()
    AND status IN ('invited', 'active')
  );

-- Policy: Allow reading invite by token (for invite validation before signup)
-- This is handled by the get_invite_by_token RPC function instead of direct table access
-- But we keep a minimal policy for the direct fallback
CREATE POLICY company_members_read_by_token ON public.company_members
  FOR SELECT
  USING (
    invite_token IS NOT NULL 
    AND status = 'invited'
  );

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_company_members_invite_token ON public.company_members(invite_token) WHERE invite_token IS NOT NULL;
