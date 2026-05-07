-- ============================================================================
-- MIGRATION 002: Backfill company_id for existing records
-- Run this AFTER migration 001
-- This links existing data to the correct company based on user_id
-- ============================================================================

-- Backfill booking_requests
UPDATE booking_requests br
SET company_id = c.id
FROM companies c
WHERE br.user_id = c.owner_user_id
AND br.company_id IS NULL;

-- Backfill bookings
UPDATE bookings b
SET company_id = c.id
FROM companies c
WHERE b.user_id = c.owner_user_id
AND b.company_id IS NULL;

-- Backfill customer_plans
UPDATE customer_plans cp
SET company_id = c.id
FROM companies c
WHERE cp.user_id = c.owner_user_id
AND cp.company_id IS NULL;

-- Backfill d2d_days
UPDATE d2d_days d
SET company_id = c.id
FROM companies c
WHERE d.user_id = c.owner_user_id
AND d.company_id IS NULL;

-- Backfill follow_ups
UPDATE follow_ups f
SET company_id = c.id
FROM companies c
WHERE f.user_id = c.owner_user_id
AND f.company_id IS NULL;

-- Backfill in_app_notifications
UPDATE in_app_notifications n
SET company_id = c.id
FROM companies c
WHERE n.user_id = c.owner_user_id
AND n.company_id IS NULL;

-- Backfill lead_activities
UPDATE lead_activities la
SET company_id = c.id
FROM companies c
WHERE la.user_id = c.owner_user_id
AND la.company_id IS NULL;

-- Backfill pending_income
UPDATE pending_income pi
SET company_id = c.id
FROM companies c
WHERE pi.user_id = c.owner_user_id
AND pi.company_id IS NULL;

-- Backfill plan_automations
UPDATE plan_automations pa
SET company_id = c.id
FROM companies c
WHERE pa.user_id = c.owner_user_id
AND pa.company_id IS NULL;

-- Backfill quotes
UPDATE quotes q
SET company_id = c.id
FROM companies c
WHERE q.user_id = c.owner_user_id
AND q.company_id IS NULL;

-- Backfill sales_rep_stats
UPDATE sales_rep_stats srs
SET company_id = c.id
FROM companies c
WHERE srs.user_id = c.owner_user_id
AND srs.company_id IS NULL;

-- Backfill service_plans
UPDATE service_plans sp
SET company_id = c.id
FROM companies c
WHERE sp.user_id = c.owner_user_id
AND sp.company_id IS NULL;

-- Backfill territories
UPDATE territories t
SET company_id = c.id
FROM companies c
WHERE t.user_id = c.owner_user_id
AND t.company_id IS NULL;

-- Backfill upcoming_expenses
UPDATE upcoming_expenses ue
SET company_id = c.id
FROM companies c
WHERE ue.user_id = c.owner_user_id
AND ue.company_id IS NULL;

-- Backfill settings
UPDATE settings s
SET company_id = c.id
FROM companies c
WHERE s.user_id = c.owner_user_id
AND s.company_id IS NULL;

-- Also backfill records for team members (users who are members of a company but not owners)
-- This catches records created by sales reps or crew members

UPDATE booking_requests br
SET company_id = cm.company_id
FROM company_members cm
WHERE br.user_id = cm.user_id
AND cm.status = 'active'
AND br.company_id IS NULL;

UPDATE bookings b
SET company_id = cm.company_id
FROM company_members cm
WHERE b.user_id = cm.user_id
AND cm.status = 'active'
AND b.company_id IS NULL;

UPDATE customer_plans cp
SET company_id = cm.company_id
FROM company_members cm
WHERE cp.user_id = cm.user_id
AND cm.status = 'active'
AND cp.company_id IS NULL;

UPDATE d2d_days d
SET company_id = cm.company_id
FROM company_members cm
WHERE d.user_id = cm.user_id
AND cm.status = 'active'
AND d.company_id IS NULL;

UPDATE follow_ups f
SET company_id = cm.company_id
FROM company_members cm
WHERE f.user_id = cm.user_id
AND cm.status = 'active'
AND f.company_id IS NULL;

UPDATE in_app_notifications n
SET company_id = cm.company_id
FROM company_members cm
WHERE n.user_id = cm.user_id
AND cm.status = 'active'
AND n.company_id IS NULL;

UPDATE lead_activities la
SET company_id = cm.company_id
FROM company_members cm
WHERE la.user_id = cm.user_id
AND cm.status = 'active'
AND la.company_id IS NULL;

UPDATE pending_income pi
SET company_id = cm.company_id
FROM company_members cm
WHERE pi.user_id = cm.user_id
AND cm.status = 'active'
AND pi.company_id IS NULL;

UPDATE plan_automations pa
SET company_id = cm.company_id
FROM company_members cm
WHERE pa.user_id = cm.user_id
AND cm.status = 'active'
AND pa.company_id IS NULL;

UPDATE quotes q
SET company_id = cm.company_id
FROM company_members cm
WHERE q.user_id = cm.user_id
AND cm.status = 'active'
AND q.company_id IS NULL;

UPDATE sales_rep_stats srs
SET company_id = cm.company_id
FROM company_members cm
WHERE srs.user_id = cm.user_id
AND cm.status = 'active'
AND srs.company_id IS NULL;

UPDATE service_plans sp
SET company_id = cm.company_id
FROM company_members cm
WHERE sp.user_id = cm.user_id
AND cm.status = 'active'
AND sp.company_id IS NULL;

UPDATE territories t
SET company_id = cm.company_id
FROM company_members cm
WHERE t.user_id = cm.user_id
AND cm.status = 'active'
AND t.company_id IS NULL;

UPDATE upcoming_expenses ue
SET company_id = cm.company_id
FROM company_members cm
WHERE ue.user_id = cm.user_id
AND cm.status = 'active'
AND ue.company_id IS NULL;

UPDATE settings s
SET company_id = cm.company_id
FROM company_members cm
WHERE s.user_id = cm.user_id
AND cm.status = 'active'
AND s.company_id IS NULL;

-- Show backfill results
SELECT 'Migration 002 complete - company_id backfilled for existing records' as status;
