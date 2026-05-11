// Run this script with: node scripts/run-leads-migration.js
// Make sure you have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('Running leads table migration...')
  
  // Read the SQL file
  const sqlPath = path.join(process.cwd(), 'scripts', '018-create-leads-table.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  
  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  console.log(`Found ${statements.length} SQL statements`)
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    if (!stmt) continue
    
    try {
      const { error } = await supabase.rpc('exec_sql', { query: stmt })
      if (error) {
        console.log(`Statement ${i + 1}: ${error.message}`)
      } else {
        console.log(`Statement ${i + 1}: OK`)
      }
    } catch (e) {
      console.log(`Statement ${i + 1}: ${e.message}`)
    }
  }
  
  console.log('Migration complete!')
}

runMigration()
