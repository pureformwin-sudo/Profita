-- ============================================================================
-- 31 - Service Plan Recurring Scheduling (ADDITIVE, NON-DESTRUCTIVE)
-- ----------------------------------------------------------------------------
-- Adds per-membership recurring-service scheduling to the EXISTING
-- customer_plans table. This migration is strictly additive:
--   * No tables are dropped.
--   * No rows are deleted.
--   * No existing IDs, plan assignments, or dates are modified.
--   * No next_service_date values are guessed / backfilled.
-- Existing memberships keep their current plan_id, status, start_date,
-- next_billing_date, autopay, and visits_used exactly as they are.
-- ============================================================================

-- 1. Add the new scheduling columns (idempotent).
ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS last_service_date  date;

ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS service_start_date date;

-- Per-membership auto-renew. NULL = inherit from the plan's auto_renew.
ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS auto_renew boolean;

-- Optional per-member frequency override. NULL = use the plan's frequency.
ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS frequency_override text;

ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS custom_days_override integer;

-- 2. Seed service_start_date from the already-existing start_date, but ONLY
--    where it is currently NULL. This copies data the customer already has;
--    it does not invent a schedule and does not touch next_service_date.
UPDATE customer_plans
  SET service_start_date = start_date
  WHERE service_start_date IS NULL
    AND start_date IS NOT NULL;

-- 3. Helpful index for sorting the schedule by due date.
CREATE INDEX IF NOT EXISTS idx_customer_plans_next_service_date
  ON customer_plans (next_service_date);

-- 4. Reload PostgREST schema cache so the new columns are exposed immediately.
NOTIFY pgrst, 'reload schema';
