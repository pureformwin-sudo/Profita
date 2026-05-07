-- Create a separate table just for tracking where your money physically is
-- This doesn't affect income/expense tracking at all

CREATE TABLE IF NOT EXISTS money_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cash DECIMAL(12,2) DEFAULT 0,
  digital DECIMAL(12,2) DEFAULT 0,
  checks DECIMAL(12,2) DEFAULT 0,
  card DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE money_locations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own money locations" ON money_locations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own money locations" ON money_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own money locations" ON money_locations
  FOR UPDATE USING (auth.uid() = user_id);
