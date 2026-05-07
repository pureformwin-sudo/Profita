-- D2D daily stats table - one row per (user, date)
CREATE TABLE IF NOT EXISTS d2d_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  doors integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  closes integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  area text DEFAULT '',
  area_locked boolean NOT NULL DEFAULT false,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_d2d_days_user_date ON d2d_days(user_id, date DESC);

ALTER TABLE d2d_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS d2d_days_select_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_insert_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_update_own ON d2d_days;
DROP POLICY IF EXISTS d2d_days_delete_own ON d2d_days;

CREATE POLICY d2d_days_select_own ON d2d_days
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY d2d_days_insert_own ON d2d_days
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY d2d_days_update_own ON d2d_days
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY d2d_days_delete_own ON d2d_days
  FOR DELETE TO authenticated USING (user_id = auth.uid());
