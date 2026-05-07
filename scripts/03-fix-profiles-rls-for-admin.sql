-- Drop ALL existing profile policies to start clean
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_own_or_admin" ON profiles;

-- SELECT: authenticated users can read ALL profiles (for admin page)
-- No subqueries - simple and non-recursive
CREATE POLICY "profiles_select_authenticated"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- UPDATE: users can ONLY update their own row
-- Admin mutations use service role which bypasses RLS
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- INSERT: users can create their own profile
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
