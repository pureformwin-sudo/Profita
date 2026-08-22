-- Generalize lead_activities so it can record communications against a lead,
-- a customer, or a job -- not just a lead.
--
-- Before this, lead_id was NOT NULL with an FK to leads(id), so a call or text
-- to a *customer* physically could not be stored anywhere: there was no
-- customer_activities table either. This is additive and backwards compatible --
-- every existing row keeps its lead_id and all existing lead queries are
-- unaffected.
--
-- NOTE on the CHECK: the constraint is ">= 1", not "= 1". A call placed from the
-- job drawer is a call to that job's customer, so it is genuinely useful for
-- that row to carry BOTH customer_id and job_id -- the customer timeline and the
-- job timeline should each surface it. Requiring exactly one would have forced
-- us to throw away the job context.

-- 1. lead_id becomes optional
ALTER TABLE lead_activities
  ALTER COLUMN lead_id DROP NOT NULL;

-- 2. new subject columns. ON DELETE CASCADE matches the existing lead_id FK, so
--    deleting a customer or job cleans up its activity rows rather than leaving
--    orphans pointing at nothing.
ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS job_id      uuid REFERENCES jobs(id)      ON DELETE CASCADE;

-- 3. at least one subject must be present, so a row can never be orphaned with
--    no attachment point at all.
ALTER TABLE lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_has_subject;

ALTER TABLE lead_activities
  ADD CONSTRAINT lead_activities_has_subject
  CHECK (num_nonnulls(lead_id, customer_id, job_id) >= 1);

-- 4. indexes for the new lookup paths (lead_id is already indexed)
CREATE INDEX IF NOT EXISTS lead_activities_customer_id_idx
  ON lead_activities (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_activities_job_id_idx
  ON lead_activities (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;
