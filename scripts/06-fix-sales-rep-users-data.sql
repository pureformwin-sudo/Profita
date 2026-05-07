-- Fix poisoned sales_rep_users data
-- The user_id was incorrectly set to the owner's ID instead of the rep's auth ID

-- Clear all bad sales_rep_users rows so reps can re-link correctly
DELETE FROM sales_rep_users;

-- After running this, sales reps need to:
-- 1. Go to /rep/login
-- 2. Create a new account OR sign in (if they already have a Supabase auth account)
-- 3. The system will auto-create the correct sales_rep_users link
