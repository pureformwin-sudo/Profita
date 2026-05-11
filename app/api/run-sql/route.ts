import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { sql } = await req.json()
    
    if (!sql) {
      return NextResponse.json({ error: 'No SQL provided' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Execute using Supabase's rpc if available, otherwise use raw query
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
      // If rpc doesn't exist, the tables need to be created via Supabase dashboard
      return NextResponse.json({ 
        error: error.message,
        hint: 'Run the SQL in Supabase Dashboard > SQL Editor'
      }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
