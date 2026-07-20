-- Migration 017: Add RLS policy for accepting invites
-- 
-- Problem: When a user signs up via invite, they need to update their company_members
-- row to set user_id and status='active'. But they can't do this because:
-- 1. They're not yet a member of the company (user_id is NULL)
-- 2. Existing RLS policies only allow members to update their own rows
--
-- Solution: Add a policy that allows any authenticated user to update a company_members
-- row IF they are updating their own invite (matching their email) AND setting their user_id

-- Drop existing policy if it exists
DROP POLICY IF EXISTS company_members_accept_own_invite ON company_members;

-- Policy: Users can accept their own invite
-- Conditions:
-- 1. User is authenticated
-- 2. The row's email matches the user's email
-- 3. The row's status is 'invited' (not already accepted)
-- 4. The row has an invite_token (it's a pending invite)
CREATE POLICY company_members_accept_own_invite ON company_members
  FOR UPDATE
  TO authenticated
  USING (
    -- Can only update rows that match their email and are pending invites
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND status = 'invited'
  )
  WITH CHECK (
    -- Must be setting their own user_id and activating
    user_id = auth.uid()
    AND status = 'active'
  );

-- Also ensure users can read their own invite to validate it
DROP POLICY IF EXISTS company_members_read_own_invite ON company_members;

CREATE POLICY company_members_read_own_invite ON company_members
  FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Allow anon users to read invites by token (for the invite page before signup)
DROP POLICY IF EXISTS company_members_read_by_token ON company_members;

CREATE POLICY company_members_read_by_token ON company_members
  FOR SELECT
  TO anon
  USING (
    invite_token IS NOT NULL
    AND status = 'invited'
  );
