-- MINIMAL LEADS TABLE SETUP
-- Copy this entire script and run it in your Supabase SQL Editor
-- Go to: Supabase Dashboard > SQL Editor > New Query > Paste > Run

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT DEFAULT '',
  address TEXT,
  phone TEXT,
  email TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'knocked',
  notes TEXT,
  source TEXT DEFAULT 'd2d',
  follow_up_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  title TEXT,
  status TEXT DEFAULT 'draft',
  line_items JSONB DEFAULT '[]',
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead_activities table
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads
DROP POLICY IF EXISTS "leads_select" ON leads;
DROP POLICY IF EXISTS "leads_insert" ON leads;
DROP POLICY IF EXISTS "leads_update" ON leads;
DROP POLICY IF EXISTS "leads_delete" ON leads;

CREATE POLICY "leads_select" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for quotes
DROP POLICY IF EXISTS "quotes_select" ON quotes;
DROP POLICY IF EXISTS "quotes_insert" ON quotes;
DROP POLICY IF EXISTS "quotes_update" ON quotes;
DROP POLICY IF EXISTS "quotes_delete" ON quotes;

CREATE POLICY "quotes_select" ON quotes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "quotes_insert" ON quotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "quotes_update" ON quotes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "quotes_delete" ON quotes FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for lead_activities
DROP POLICY IF EXISTS "activities_select" ON lead_activities;
DROP POLICY IF EXISTS "activities_insert" ON lead_activities;

CREATE POLICY "activities_select" ON lead_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "activities_insert" ON lead_activities FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Done! Your leads, quotes, and activities tables are now ready.
