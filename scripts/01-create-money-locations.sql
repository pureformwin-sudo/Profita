CREATE TABLE IF NOT EXISTS money_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash DECIMAL(12,2) DEFAULT 0,
  digital DECIMAL(12,2) DEFAULT 0,
  checks DECIMAL(12,2) DEFAULT 0,
  card DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own money locations" ON money_locations;
DROP POLICY IF EXISTS "Users can insert own money locations" ON money_locations;
DROP POLICY IF EXISTS "Users can update own money locations" ON money_locations;

CREATE POLICY "Users can view own money locations" ON money_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own money locations" ON money_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own money locations" ON money_locations FOR UPDATE USING (auth.uid() = user_id);
