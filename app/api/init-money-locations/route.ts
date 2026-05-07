import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Create the money_locations table
    const { error } = await supabase.from('money_locations').select('count').limit(1).single()
    
    if (error && error.code === 'PGRST116') {
      // Table doesn't exist, create it
      await supabase.rpc('exec_sql', {
        sql: `CREATE TABLE IF NOT EXISTS money_locations (
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
        CREATE POLICY "Users can update own money locations" ON money_locations FOR UPDATE USING (auth.uid() = user_id);`
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
