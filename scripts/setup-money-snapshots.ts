import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setup() {
  console.log('Creating money_snapshots table...')
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.money_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        cash NUMERIC DEFAULT 0,
        digital NUMERIC DEFAULT 0,
        checks NUMERIC DEFAULT 0,
        card NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(user_id, month)
      );

      ALTER TABLE public.money_snapshots ENABLE ROW LEVEL SECURITY;

      CREATE POLICY IF NOT EXISTS "money_snapshots_select_own" ON public.money_snapshots 
        FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY IF NOT EXISTS "money_snapshots_insert_own" ON public.money_snapshots 
        FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE POLICY IF NOT EXISTS "money_snapshots_update_own" ON public.money_snapshots 
        FOR UPDATE USING (auth.uid() = user_id);
      CREATE POLICY IF NOT EXISTS "money_snapshots_delete_own" ON public.money_snapshots 
        FOR DELETE USING (auth.uid() = user_id);
    `
  })

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Table created successfully!')
  }
}

setup()
