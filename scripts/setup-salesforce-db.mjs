#!/usr/bin/env node
// Run this script to set up the salesforce database tables
// Usage: node scripts/setup-salesforce-db.mjs

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.log('\nTo run this script:')
  console.log('1. Go to your Supabase Dashboard > Settings > API')
  console.log('2. Copy the service_role key')  
  console.log('3. Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/setup-salesforce-db.mjs')
  process.exit(1)
}

const SQL = `
-- LEADS TABLE SETUP FOR D2D SALES
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

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID,
  title TEXT,
  status TEXT DEFAULT 'draft',
  line_items JSONB DEFAULT '[]',
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID,
  activity_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all" ON leads;
DROP POLICY IF EXISTS "quotes_all" ON quotes;
DROP POLICY IF EXISTS "activities_all" ON lead_activities;

CREATE POLICY "leads_all" ON leads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "quotes_all" ON quotes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "activities_all" ON lead_activities FOR ALL USING (auth.uid() = user_id);
`

async function runSetup() {
  console.log('Setting up Salesforce database tables...')
  console.log('Supabase URL:', SUPABASE_URL)
  
  // Supabase doesn't have a direct SQL execution endpoint via REST API
  // We need to use the Management API or run via psql
  // For now, output the SQL for manual execution
  
  console.log('\n=== COPY AND RUN THIS SQL IN SUPABASE SQL EDITOR ===\n')
  console.log(SQL)
  console.log('\n=== END SQL ===\n')
  
  console.log('Steps:')
  console.log('1. Go to your Supabase Dashboard')
  console.log('2. Click "SQL Editor" in the sidebar')
  console.log('3. Click "+ New query"')
  console.log('4. Paste the SQL above')
  console.log('5. Click "Run"')
  console.log('\nAfter running, refresh your app and the map should work!')
}

runSetup()
