-- ============================================================================
-- MIGRATION 010: Add workflow links to jobs table for Phase 3
-- Links jobs back to their originating leads and quotes
-- SAFE: All columns are nullable, no existing data is modified or deleted
-- ============================================================================

-- ============================================================================
-- Add lead_id to jobs - links job to originating lead
-- ============================================================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- ============================================================================
-- Add quote_id to jobs - links job to the quote it was created from
-- ============================================================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

-- ============================================================================
-- Add indexes for efficient lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON jobs(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_quote_id ON jobs(quote_id) WHERE quote_id IS NOT NULL;

-- ============================================================================
-- Verify migration
-- ============================================================================
SELECT 'Migration 010 complete - Added lead_id and quote_id to jobs table' as status;

-- Show current jobs count (should remain unchanged)
SELECT COUNT(*) as total_jobs FROM jobs;
