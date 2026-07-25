-- =============================================================================
-- 37 - Job Timer / Time Tracking
-- =============================================================================
-- ADDITIVE + NON-DESTRUCTIVE. Extends the existing (currently empty)
-- time_entries table rather than creating a second, competing time table.
-- Existing jobs with no time entries keep working exactly as before.
--
-- MODEL: one row per timer SEGMENT (work | break | travel).
--   Start  -> insert an open work segment (end_time NULL)
--   Pause  -> close the open segment
--   Resume -> insert a new open work segment
--   Finish -> close the open segment
-- All totals are DERIVED by summing segments, so there is exactly one source
-- of truth and elapsed time is always recomputed from stored timestamps
-- (never from a client-side interval).
-- =============================================================================

-- 1. Owners have a synthetic membership id ('owner') and therefore no
--    company_members row, so member_id must be nullable for owner-logged time.
ALTER TABLE time_entries ALTER COLUMN member_id DROP NOT NULL;

-- 2. Tenant scoping + the acting auth user + precise duration + audit trail.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_by uuid;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_at timestamptz;
-- is_manual marks entries created/corrected by hand so reports can distinguish
-- them from live-timed work. Historical rows are never silently overwritten.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

-- 3. Constrain entry_type to the supported kinds.
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_entry_type_check;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_entry_type_check
  CHECK (entry_type IN ('work', 'break', 'travel'));

-- 4. An entry must be attributable to someone (a member or an auth user).
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_actor_present_check;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_actor_present_check
  CHECK (member_id IS NOT NULL OR user_id IS NOT NULL);

-- 5. End must never precede start (guards bad manual corrections).
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_time_order_check;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_time_order_check
  CHECK (end_time IS NULL OR end_time >= start_time);

-- 6. Backfill tenant/user columns for any pre-existing rows (table is empty
--    today, so this is a no-op safeguard rather than a data change).
UPDATE time_entries te
SET company_id = cm.company_id
FROM company_members cm
WHERE te.member_id = cm.id AND te.company_id IS NULL;

UPDATE time_entries te
SET company_id = j.company_id
FROM jobs j
WHERE te.job_id = j.id AND te.company_id IS NULL;

UPDATE time_entries te
SET user_id = cm.user_id
FROM company_members cm
WHERE te.member_id = cm.id AND te.user_id IS NULL;

-- Keep the new precise column consistent with the legacy minutes column that
-- payroll-calculations already reads.
UPDATE time_entries
SET duration_seconds = duration_minutes * 60
WHERE duration_seconds IS NULL AND duration_minutes IS NOT NULL;

-- 7. Derive duration on write so seconds/minutes can never disagree, and no
--    client is trusted to compute elapsed time.
CREATE OR REPLACE FUNCTION time_entries_sync_duration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.end_time IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::integer);
    -- ROUND keeps short segments from truncating to 0 minutes in payroll.
    NEW.duration_minutes := ROUND(NEW.duration_seconds / 60.0)::integer;
  ELSE
    NEW.duration_seconds := NULL;
    NEW.duration_minutes := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_sync_duration_trg ON time_entries;
CREATE TRIGGER time_entries_sync_duration_trg
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION time_entries_sync_duration();

-- 8. Idempotency guard: at most ONE open (running) segment per user.
--    This is what makes double-tapping Start/Resume safe and prevents an
--    employee from silently double-billing two concurrent timers. The unique
--    index is partial, so completed history is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
  ON time_entries (user_id)
  WHERE end_time IS NULL AND user_id IS NOT NULL;

-- Same guard for member-scoped rows written by the crew sync path.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_member
  ON time_entries (member_id)
  WHERE end_time IS NULL AND member_id IS NOT NULL;

-- 9. Read paths: job summaries, active-timer lookup, per-employee reporting.
CREATE INDEX IF NOT EXISTS time_entries_job_id_idx ON time_entries (job_id);
CREATE INDEX IF NOT EXISTS time_entries_company_id_idx ON time_entries (company_id);
CREATE INDEX IF NOT EXISTS time_entries_user_start_idx ON time_entries (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS time_entries_company_start_idx ON time_entries (company_id, start_time DESC);

-- 10. Tenant-isolated RLS. Rewritten to also cover owner rows (member_id NULL,
--     user_id = auth.uid()) and company-scoped rows, so a user from one company
--     can never read or modify another company's time entries.
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_entries_select ON time_entries;
DROP POLICY IF EXISTS time_entries_insert ON time_entries;
DROP POLICY IF EXISTS time_entries_update ON time_entries;
DROP POLICY IF EXISTS time_entries_delete ON time_entries;

CREATE POLICY time_entries_select ON time_entries FOR SELECT USING (
  user_id = auth.uid()
  OR company_id IN (SELECT company_id FROM get_user_company_ids())
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
  OR job_id IN (
    SELECT id FROM jobs
    WHERE company_id IN (SELECT company_id FROM get_user_company_ids())
       OR user_id = auth.uid()
  )
);

CREATE POLICY time_entries_insert ON time_entries FOR INSERT WITH CHECK (
  (user_id = auth.uid() OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid()))
  AND (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM get_user_company_ids())
  )
);

CREATE POLICY time_entries_update ON time_entries FOR UPDATE USING (
  user_id = auth.uid()
  OR company_id IN (SELECT company_id FROM get_user_company_ids())
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);

CREATE POLICY time_entries_delete ON time_entries FOR DELETE USING (
  user_id = auth.uid()
  OR company_id IN (SELECT company_id FROM get_user_company_ids())
  OR member_id IN (SELECT id FROM company_members WHERE user_id = auth.uid())
);
