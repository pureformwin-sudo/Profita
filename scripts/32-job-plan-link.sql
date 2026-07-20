-- Script 32: Link jobs to service-plan memberships (recurring scheduling)
-- SAFE + ADDITIVE ONLY. Does not drop, reset, or modify any existing rows.
-- Adds a nullable foreign key so a scheduled job can be tied to the specific
-- customer_plans membership (recurring occurrence) it fulfills.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS customer_plan_id uuid;

-- Link to the membership; ON DELETE SET NULL so removing a membership never
-- deletes historical jobs — the job stays in history, just unlinked.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'jobs_customer_plan_id_fkey'
      AND table_name = 'jobs'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_customer_plan_id_fkey
      FOREIGN KEY (customer_plan_id)
      REFERENCES customer_plans(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Fast lookup of the open scheduled job for a membership.
CREATE INDEX IF NOT EXISTS idx_jobs_customer_plan_id
  ON jobs(customer_plan_id)
  WHERE customer_plan_id IS NOT NULL;
