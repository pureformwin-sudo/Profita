-- ============================================================================
-- Job Photos & Completion Reports
-- ----------------------------------------------------------------------------
-- This migration (re)creates job_photos with the richer schema required by the
-- Photos feature, plus job_completion_reports and job_photo_comparisons.
--
-- Photos are stored in a PRIVATE Vercel Blob bucket and served through the
-- /api/job-photos/file route. `storage_path` holds the blob pathname.
-- Company scoping mirrors the existing jobs/customers policies which use the
-- get_user_company_ids() helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. job_photos
-- ----------------------------------------------------------------------------
-- Note: an earlier migration defined a slimmer job_photos (phase/pathname). We
-- bring the table up to the full schema, preserving any existing rows.
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bring columns up to date (idempotent)
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS photo_type text NOT NULL DEFAULT 'before';
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS caption text DEFAULT '';
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS size_bytes integer;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now();

-- Migrate legacy column "phase" -> "photo_type", "pathname" -> "storage_path"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='job_photos' AND column_name='phase') THEN
    UPDATE job_photos SET photo_type = phase WHERE photo_type IS NULL OR photo_type = 'before';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='job_photos' AND column_name='pathname') THEN
    UPDATE job_photos SET storage_path = COALESCE(storage_path, pathname);
  END IF;
END $$;

-- photo_type constraint: spec allows before/progress/after. We keep before/after
-- as the active set but allow progress for forward-compatibility.
ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_photo_type_check;
ALTER TABLE job_photos ADD CONSTRAINT job_photos_photo_type_check
  CHECK (photo_type IN ('before', 'progress', 'after'));

-- Backfill company_id / customer_id from the parent job where missing
UPDATE job_photos jp
SET company_id = j.company_id,
    customer_id = COALESCE(jp.customer_id, j.customer_id)
FROM jobs j
WHERE jp.job_id = j.id
  AND (jp.company_id IS NULL OR jp.customer_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_company ON job_photos(company_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_customer ON job_photos(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_photos_storage_path ON job_photos(storage_path);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

-- Drop legacy + recreate policies
DROP POLICY IF EXISTS job_photos_owner_or_crew_select ON job_photos;
DROP POLICY IF EXISTS job_photos_crew_insert ON job_photos;
DROP POLICY IF EXISTS job_photos_owner_delete ON job_photos;
DROP POLICY IF EXISTS job_photos_company_select ON job_photos;
DROP POLICY IF EXISTS job_photos_company_insert ON job_photos;
DROP POLICY IF EXISTS job_photos_company_update ON job_photos;
DROP POLICY IF EXISTS job_photos_company_delete ON job_photos;

-- SELECT: company members + the legacy owner
CREATE POLICY job_photos_company_select ON job_photos
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY job_photos_company_insert ON job_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY job_photos_company_update ON job_photos
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY job_photos_company_delete ON job_photos
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 2. job_completion_reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_completion_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_token text UNIQUE NOT NULL,
  service_date date,
  service_name text,
  technician_notes text,
  thank_you_message text,
  report_url text,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One report per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_completion_reports_job ON job_completion_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_completion_reports_company ON job_completion_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_completion_reports_customer ON job_completion_reports(customer_id);

ALTER TABLE job_completion_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS completion_reports_company_select ON job_completion_reports;
DROP POLICY IF EXISTS completion_reports_company_insert ON job_completion_reports;
DROP POLICY IF EXISTS completion_reports_company_update ON job_completion_reports;
DROP POLICY IF EXISTS completion_reports_company_delete ON job_completion_reports;

CREATE POLICY completion_reports_company_select ON job_completion_reports
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_completion_reports.job_id AND j.user_id = auth.uid())
  );

CREATE POLICY completion_reports_company_insert ON job_completion_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_completion_reports.job_id AND j.user_id = auth.uid())
  );

CREATE POLICY completion_reports_company_update ON job_completion_reports
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_completion_reports.job_id AND j.user_id = auth.uid())
  );

CREATE POLICY completion_reports_company_delete ON job_completion_reports
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_completion_reports.job_id AND j.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. job_photo_comparisons (Smart Comparisons)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_photo_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  before_photo_id uuid NOT NULL REFERENCES job_photos(id) ON DELETE CASCADE,
  after_photo_id uuid NOT NULL REFERENCES job_photos(id) ON DELETE CASCADE,
  confidence_score numeric,
  created_by text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_comparisons_job ON job_photo_comparisons(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_comparisons_pair ON job_photo_comparisons(before_photo_id, after_photo_id);

ALTER TABLE job_photo_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_comparisons_company_all ON job_photo_comparisons;
CREATE POLICY photo_comparisons_company_all ON job_photo_comparisons
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_photo_comparisons.job_id AND j.user_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM get_user_company_ids())
    OR EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_photo_comparisons.job_id AND j.user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4. Public report RPC (SECURITY DEFINER) — fetch report + photos by token.
--    Used by the public /reports/[token] page. Bypasses RLS but ONLY exposes
--    the single report matching the (unguessable) token.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_completion_report_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'report', to_jsonb(r),
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email,
      'address', c.address, 'logo_url', c.logo_url, 'website', c.website
    ),
    'customer', jsonb_build_object(
      'id', cust.id, 'name', cust.name, 'address', cust.address,
      'phone', cust.phone, 'email', cust.email
    ),
    'job', jsonb_build_object(
      'id', j.id, 'job_type', j.job_type, 'date', j.date, 'status', j.status, 'notes', j.notes
    ),
    'photos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'photo_type', p.photo_type, 'storage_path', p.storage_path,
        'caption', p.caption, 'uploaded_at', p.uploaded_at
      ) ORDER BY p.uploaded_at)
      FROM job_photos p WHERE p.job_id = r.job_id
    ), '[]'::jsonb),
    'comparisons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cmp.id, 'before_photo_id', cmp.before_photo_id,
        'after_photo_id', cmp.after_photo_id, 'confidence_score', cmp.confidence_score
      ))
      FROM job_photo_comparisons cmp WHERE cmp.job_id = r.job_id
    ), '[]'::jsonb)
  )
  INTO result
  FROM job_completion_reports r
  JOIN companies c ON c.id = r.company_id
  JOIN customers cust ON cust.id = r.customer_id
  JOIN jobs j ON j.id = r.job_id
  WHERE r.report_token = p_token;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_completion_report_by_token(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
