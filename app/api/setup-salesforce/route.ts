import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Minimal SQL without foreign key constraints for easier setup
const SETUP_SQL = `
-- LEADS TABLE SETUP FOR D2D SALES
-- Run this in Supabase SQL Editor

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

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check if leads table exists by trying to query it
    const { error: tableError } = await supabase.from('leads').select('id').limit(1)
    
    if (!tableError) {
      // Table exists
      return NextResponse.json({ success: true, message: 'Tables already exist!' })
    }
    
    // Table doesn't exist - return SQL for manual setup
    return NextResponse.json({
      success: false,
      needsSetup: true,
      message: 'Please run the SQL below in your Supabase SQL Editor',
      sql: SETUP_SQL,
      instructions: [
        '1. Go to your Supabase Dashboard',
        '2. Click "SQL Editor" in the sidebar', 
        '3. Click "+ New query"',
        '4. Paste the SQL below',
        '5. Click "Run"'
      ]
    })
  } catch (error: any) {
    console.error('[Setup] Error:', error)
    return NextResponse.json({
      error: 'Setup failed',
      message: error.message,
      hint: 'Please run the SQL manually in Supabase SQL Editor'
    }, { status: 500 })
  }
}

export async function GET() {
  // Return the SQL for manual setup
  return NextResponse.json({
    message: 'Copy this SQL to your Supabase SQL Editor and run it',
    sql: SETUP_SQL
  })
}
