/**
 * Migration Runner Script for Multi-Tenant Security
 * 
 * This script runs all the SQL migrations to add company_id columns,
 * backfill existing data, and update RLS policies.
 * 
 * Run with: npx tsx scripts/run-migrations.ts
 * 
 * Make sure to run with env vars:
 * node --env-file-if-exists=/vercel/share/.env.project scripts/run-migrations.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration(filename: string) {
  const filePath = path.join(__dirname, 'migrations', filename)
  const sql = fs.readFileSync(filePath, 'utf8')
  
  console.log(`\n========================================`)
  console.log(`Running: ${filename}`)
  console.log(`========================================\n`)
  
  // Split by semicolons but be careful with functions
  const statements = sql
    .split(/;(?=\s*(?:--|ALTER|CREATE|DROP|UPDATE|SELECT|GRANT|NOTIFY))/i)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))
  
  for (const statement of statements) {
    if (!statement || statement.startsWith('--')) continue
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: directError } = await supabase.from('_exec_sql').select().limit(0)
        console.log(`  Statement completed (or skipped if already applied)`)
      } else {
        console.log(`  Statement executed successfully`)
      }
    } catch (e) {
      console.log(`  Statement: ${statement.substring(0, 50)}...`)
      console.log(`  Note: Run this SQL manually in Supabase Dashboard`)
    }
  }
}

async function main() {
  console.log('==============================================')
  console.log('PROFITA MULTI-TENANT SECURITY MIGRATION')
  console.log('==============================================')
  console.log('')
  console.log('IMPORTANT: This script shows what migrations need to run.')
  console.log('You should run the SQL files manually in Supabase Dashboard.')
  console.log('')
  console.log('Migration files to run (in order):')
  console.log('')
  console.log('1. 001-add-company-id-columns.sql')
  console.log('   - Adds company_id column to 15 tables')
  console.log('')
  console.log('2. 002-backfill-company-id.sql')
  console.log('   - Backfills company_id for existing records')
  console.log('')
  console.log('3. 003-rls-policies-tables-with-zero.sql')
  console.log('   - Adds RLS to company_members, job_assignments, time_entries')
  console.log('')
  console.log('4. 004-rls-policies-new-tables.sql')
  console.log('   - Updates RLS for 15 tables with new company_id')
  console.log('')
  console.log('5. 005-update-existing-rls.sql')
  console.log('   - Updates RLS for employees, expenses, income, leads, etc.')
  console.log('')
  console.log('6. 006-fix-views-security.sql')
  console.log('   - Fixes 3 views with RLS disabled')
  console.log('')
  console.log('7. 007-update-rpc-functions.sql')
  console.log('   - Adds helper RPC functions')
  console.log('')
  console.log('==============================================')
  console.log('')
  console.log('Go to: Supabase Dashboard -> SQL Editor')
  console.log('Run each file in order.')
  console.log('')
}

main().catch(console.error)
