-- ============================================================================
-- MIGRATION 001: Add company_id columns to all tables that need them
-- Run this FIRST before any other migrations
-- This is SAFE - it only adds nullable columns, nothing breaks
-- ============================================================================

-- 1. booking_requests - add company_id
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 2. bookings - add company_id
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 3. customer_plans - add company_id
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 4. d2d_days - add company_id
ALTER TABLE d2d_days ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 5. follow_ups - add company_id
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 6. in_app_notifications - add company_id
ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 7. lead_activities - add company_id
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 8. pending_income - add company_id
ALTER TABLE pending_income ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 9. plan_automations - add company_id
ALTER TABLE plan_automations ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 10. quotes - add company_id
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 11. sales_rep_stats - add company_id
ALTER TABLE sales_rep_stats ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 12. service_plans - add company_id
ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 13. territories - add company_id
ALTER TABLE territories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 14. upcoming_expenses - add company_id
ALTER TABLE upcoming_expenses ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 15. settings - add company_id
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_requests_company_id ON booking_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_bookings_company_id ON bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_plans_company_id ON customer_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_d2d_days_company_id ON d2d_days(company_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_company_id ON follow_ups(company_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_company_id ON in_app_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_company_id ON lead_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_pending_income_company_id ON pending_income(company_id);
CREATE INDEX IF NOT EXISTS idx_plan_automations_company_id ON plan_automations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_rep_stats_company_id ON sales_rep_stats(company_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_company_id ON service_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_territories_company_id ON territories(company_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_expenses_company_id ON upcoming_expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_settings_company_id ON settings(company_id);

-- Done! Verify columns were added
SELECT 'Migration 001 complete - company_id columns added to 15 tables' as status;
