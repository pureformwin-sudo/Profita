-- Add status and is_admin columns to profiles if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster approval queries
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin);
