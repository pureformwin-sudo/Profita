-- ============================================================================
-- MIGRATION 006: Fix views with RLS disabled
-- Views: lead_pipeline_summary, sales_rep_leaderboard, todays_follow_ups
-- 
-- These are database VIEWS (not tables). Views don't have RLS in PostgreSQL.
-- We need to either:
-- 1. Create them with SECURITY INVOKER (inherits caller's permissions)
-- 2. Or add WHERE clauses that filter by user/company
-- ============================================================================

-- ============================================================================
-- Drop existing views
-- ============================================================================
DROP VIEW IF EXISTS lead_pipeline_summary;
DROP VIEW IF EXISTS sales_rep_leaderboard;
DROP VIEW IF EXISTS todays_follow_ups;

-- ============================================================================
-- lead_pipeline_summary - Recreate with company filtering
-- ============================================================================
CREATE OR REPLACE VIEW lead_pipeline_summary 
WITH (security_invoker = true)
AS
SELECT 
  l.user_id,
  l.company_id,
  l.status,
  COUNT(*) as count,
  SUM(l.estimated_value) as total_value,
  AVG(l.score) as avg_score
FROM leads l
WHERE 
  l.company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  OR l.company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  OR l.user_id = auth.uid()
GROUP BY l.user_id, l.company_id, l.status;

-- ============================================================================
-- sales_rep_leaderboard - Recreate with company filtering
-- ============================================================================
CREATE OR REPLACE VIEW sales_rep_leaderboard
WITH (security_invoker = true)
AS
SELECT 
  srs.user_id,
  srs.company_id,
  srs.employee_id,
  e.name as rep_name,
  SUM(srs.doors_knocked) as total_doors,
  SUM(srs.leads_generated) as total_leads,
  SUM(srs.appointments_set) as total_appointments,
  SUM(srs.total_sold) as total_revenue,
  CASE 
    WHEN SUM(srs.leads_generated) > 0 
    THEN (SUM(srs.quotes_accepted)::numeric / SUM(srs.leads_generated)::numeric * 100)
    ELSE 0 
  END as conversion_rate
FROM sales_rep_stats srs
LEFT JOIN employees e ON srs.employee_id = e.id
WHERE 
  srs.company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  OR srs.company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  OR srs.user_id = auth.uid()
GROUP BY srs.user_id, srs.company_id, srs.employee_id, e.name;

-- ============================================================================
-- todays_follow_ups - Recreate with company filtering
-- ============================================================================
CREATE OR REPLACE VIEW todays_follow_ups
WITH (security_invoker = true)
AS
SELECT 
  f.id,
  f.user_id,
  f.company_id,
  f.title,
  f.description,
  f.lead_id,
  f.customer_id,
  f.assigned_to,
  f.due_date,
  f.due_time,
  f.follow_up_type,
  f.priority,
  f.status,
  f.is_recurring,
  f.recurrence_rule,
  f.completed_at,
  f.completed_by,
  f.completion_notes,
  f.reminder_at,
  f.created_at,
  f.updated_at,
  l.name as lead_name,
  l.phone as lead_phone,
  l.address as lead_address,
  c.name as customer_name,
  e.name as assigned_to_name
FROM follow_ups f
LEFT JOIN leads l ON f.lead_id = l.id
LEFT JOIN customers c ON f.customer_id = c.id
LEFT JOIN employees e ON f.assigned_to = e.id
WHERE 
  f.due_date = CURRENT_DATE
  AND (
    f.company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
    OR f.company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
    OR f.user_id = auth.uid()
  );

-- Grant access to authenticated users
GRANT SELECT ON lead_pipeline_summary TO authenticated;
GRANT SELECT ON sales_rep_leaderboard TO authenticated;
GRANT SELECT ON todays_follow_ups TO authenticated;

SELECT 'Migration 006 complete - Views recreated with security_invoker and company filtering' as status;
