-- Recurring Service Plan enrollment from Jobs (ADDITIVE, safe to re-run).
-- Preserves all existing data. Adds:
--   1. customer_plans.price_override  -> per-member agreed price (null = use master plan price)
--   2. jobs.pending_plan_enrollment   -> intent to enroll a customer, applied only
--                                        when the job is Completed/Paid. jsonb shape:
--        { "planId": uuid, "priceOverride": number|null, "autoRenew": bool|null,
--          "note": string|null, "anchorDate": "YYYY-MM-DD"|null, "mode": "enroll"|"change" }

ALTER TABLE customer_plans
  ADD COLUMN IF NOT EXISTS price_override numeric;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pending_plan_enrollment jsonb;

COMMENT ON COLUMN customer_plans.price_override IS
  'Per-member agreed recurring price. NULL = inherit the master service_plans.price.';
COMMENT ON COLUMN jobs.pending_plan_enrollment IS
  'Pending recurring-plan enrollment intent, activated when the job is Completed/Paid. NULL = none.';
