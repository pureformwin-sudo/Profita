-- =====================================================================
-- Profita Phase 1: Multi-Mode Foundation
-- =====================================================================
-- Adds support for Admin / Crew / Sales Rep modes within one unified app.
-- Adds: user_mode_preference, territories, leads, job_clock_events, crew_users.
-- Extends: employees.role to include 'admin'.
-- =====================================================================

-- 1. Extend employees.role to allow 'admin' explicitly (alongside worker, sales_rep)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('worker', 'sales_rep', 'admin'));

-- 2. Persist each user's last-selected mode
CREATE TABLE IF NOT EXISTS user_mode_preference (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_mode text NOT NULL CHECK (current_mode IN ('admin', 'crew', 'sales_rep')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_mode_preference ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_mode_preference_own ON user_mode_preference;
CREATE POLICY user_mode_preference_own ON user_mode_preference
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. crew_users: link Supabase auth users -> employee records for crew members
--    Mirrors the existing sales_rep_users pattern.
CREATE TABLE IF NOT EXISTS crew_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (employee_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_users_user_id ON crew_users(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_users_owner_id ON crew_users(owner_user_id);
ALTER TABLE crew_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_users_owner_manage ON crew_users;
DROP POLICY IF EXISTS crew_users_self_select ON crew_users;
CREATE POLICY crew_users_owner_manage ON crew_users
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY crew_users_self_select ON crew_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. territories: drawn / named geographic areas owned by a workspace
CREATE TABLE IF NOT EXISTS territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- workspace owner
  name text NOT NULL,
  color text NOT NULL DEFAULT '#10b981',
  -- GeoJSON polygon coordinates as JSONB to avoid PostGIS dependency
  polygon jsonb,
  -- center_lat/lng used for zoom-to-territory when no polygon yet
  center_lat numeric(10, 7),
  center_lng numeric(10, 7),
  assigned_rep_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territories_user ON territories(user_id);
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS territories_owner_all ON territories;
DROP POLICY IF EXISTS territories_rep_read ON territories;
CREATE POLICY territories_owner_all ON territories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY territories_rep_read ON territories
  FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid())
  );

-- 5. leads: every door knocked / lead captured by a sales rep
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,    -- workspace owner
  rep_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,        -- sales rep auth user
  rep_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  territory_id uuid REFERENCES territories(id) ON DELETE SET NULL,
  -- Lead identity
  name text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  lat numeric(10, 7),
  lng numeric(10, 7),
  -- Pipeline (capitalized constants chosen to keep front-end consistent with JobStatus convention)
  status text NOT NULL DEFAULT 'knocked'
    CHECK (status IN ('knocked', 'not_home', 'not_interested', 'interested', 'quoted', 'booked', 'converted', 'lost')),
  notes text DEFAULT '',
  follow_up_at timestamptz,
  -- Conversion linkage
  converted_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_rep ON leads(rep_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(follow_up_at) WHERE follow_up_at IS NOT NULL;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_owner_all ON leads;
DROP POLICY IF EXISTS leads_rep_select ON leads;
DROP POLICY IF EXISTS leads_rep_insert ON leads;
DROP POLICY IF EXISTS leads_rep_update ON leads;
CREATE POLICY leads_owner_all ON leads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY leads_rep_select ON leads
  FOR SELECT TO authenticated
  USING (rep_user_id = auth.uid());
CREATE POLICY leads_rep_insert ON leads
  FOR INSERT TO authenticated
  WITH CHECK (
    rep_user_id = auth.uid()
    AND user_id IN (SELECT owner_user_id FROM sales_rep_users WHERE user_id = auth.uid())
  );
CREATE POLICY leads_rep_update ON leads
  FOR UPDATE TO authenticated
  USING (rep_user_id = auth.uid())
  WITH CHECK (rep_user_id = auth.uid());

-- 6. job_clock_events: crew clock-in/out + photos + notes
CREATE TABLE IF NOT EXISTS job_clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,    -- workspace owner
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  crew_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  crew_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('clock_in', 'clock_out', 'photo_before', 'photo_after', 'note')),
  photo_url text,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clock_job ON job_clock_events(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_clock_crew ON job_clock_events(crew_user_id, occurred_at DESC);
ALTER TABLE job_clock_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_clock_events_owner ON job_clock_events;
DROP POLICY IF EXISTS job_clock_events_crew_insert ON job_clock_events;
DROP POLICY IF EXISTS job_clock_events_crew_select ON job_clock_events;
CREATE POLICY job_clock_events_owner ON job_clock_events
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY job_clock_events_crew_insert ON job_clock_events
  FOR INSERT TO authenticated
  WITH CHECK (crew_user_id = auth.uid());
CREATE POLICY job_clock_events_crew_select ON job_clock_events
  FOR SELECT TO authenticated
  USING (crew_user_id = auth.uid());

-- 7. Allow crew users to read jobs they're assigned to (via job_workers)
DROP POLICY IF EXISTS crew_can_read_assigned_jobs ON jobs;
CREATE POLICY crew_can_read_assigned_jobs ON jobs
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT jw.job_id
      FROM job_workers jw
      JOIN crew_users cu ON cu.employee_id = jw.employee_id
      WHERE cu.user_id = auth.uid()
    )
  );

-- 8. Allow crew to mark a job complete (status update only, RLS already restricts via id IN)
DROP POLICY IF EXISTS crew_can_update_assigned_jobs ON jobs;
CREATE POLICY crew_can_update_assigned_jobs ON jobs
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT jw.job_id
      FROM job_workers jw
      JOIN crew_users cu ON cu.employee_id = jw.employee_id
      WHERE cu.user_id = auth.uid()
    )
  );

-- 9. Allow crew to read customers attached to their jobs
DROP POLICY IF EXISTS crew_can_read_assigned_customers ON customers;
CREATE POLICY crew_can_read_assigned_customers ON customers
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT j.customer_id
      FROM jobs j
      JOIN job_workers jw ON jw.job_id = j.id
      JOIN crew_users cu ON cu.employee_id = jw.employee_id
      WHERE cu.user_id = auth.uid()
    )
  );

-- 10. Allow crew to read job_workers rows for their own assignments (for hours summary)
DROP POLICY IF EXISTS crew_can_read_own_assignments ON job_workers;
CREATE POLICY crew_can_read_own_assignments ON job_workers
  FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT employee_id FROM crew_users WHERE user_id = auth.uid())
  );

-- 11. job_photos: before/after photos uploaded by crew, stored in Vercel Blob
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'before' CHECK (phase IN ('before', 'after')),
  pathname text NOT NULL UNIQUE,
  size_bytes integer,
  content_type text,
  caption text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_user ON job_photos(user_id);
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_photos_owner_or_crew_select ON job_photos;
CREATE POLICY job_photos_owner_or_crew_select ON job_photos
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crew_users cu
      JOIN job_workers jw ON jw.employee_id = cu.employee_id
      WHERE cu.user_id = auth.uid()
        AND jw.job_id = job_photos.job_id
    )
  );

DROP POLICY IF EXISTS job_photos_crew_insert ON job_photos;
CREATE POLICY job_photos_crew_insert ON job_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM crew_users cu
      JOIN job_workers jw ON jw.employee_id = cu.employee_id
      WHERE cu.user_id = auth.uid()
        AND jw.job_id = job_photos.job_id
    )
  );

DROP POLICY IF EXISTS job_photos_owner_delete ON job_photos;
CREATE POLICY job_photos_owner_delete ON job_photos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 12. Force PostgREST to reload its schema cache so the API sees new tables immediately
NOTIFY pgrst, 'reload schema';
