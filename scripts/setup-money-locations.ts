import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function setup() {
  // Create table directly using raw query via REST API
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  })
  
  // Try using the admin query endpoint instead
  const { data, error } = await supabase.from('money_locations').select('id').limit(1)
  
  if (error && error.code === '42P01') {
    // Table doesn't exist - we need to create it via Supabase Dashboard
    console.log('Table does not exist. Please run this SQL in Supabase Dashboard:')
    console.log(`
CREATE TABLE money_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash DECIMAL(12,2) DEFAULT 0,
  digital DECIMAL(12,2) DEFAULT 0,
  checks DECIMAL(12,2) DEFAULT 0,
  card DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own money locations" ON money_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own money locations" ON money_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own money locations" ON money_locations FOR UPDATE USING (auth.uid() = user_id);
    `)
  } else if (error) {
    console.error('Error:', error)
  } else {
    console.log('Table already exists!')
  }
}

setup()
