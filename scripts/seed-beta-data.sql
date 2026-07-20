-- ============================================
-- BETA TEST SEED DATA - FINAL VERSION
-- ============================================
-- Company ID: 293e130f-6cca-4196-9f63-d3bec900940b
-- Owner User ID: 3e324a74-35e3-443f-9ec2-eb3ce2ef3b04
-- ============================================
-- This script creates demo data for beta testing.
-- All records are prefixed with "BETA TEST" for easy cleanup.
-- Non-destructive: uses INSERT only, no DELETE/UPDATE.
-- ============================================

-- ============================================
-- 1. CUSTOMERS
-- ============================================
INSERT INTO customers (id, company_id, user_id, name, email, phone, address, city, state, zip, notes, created_at)
VALUES
  ('b0000001-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04', 
   'BETA TEST - John Smith', 'beta.john@example.com', '555-0101', '123 Main St', 'Austin', 'TX', '78701', 
   'Beta test customer - residential', NOW()),
  ('b0000001-0000-0000-0000-000000000002', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04', 
   'BETA TEST - Acme Corp', 'beta.acme@example.com', '555-0102', '456 Business Ave', 'Austin', 'TX', '78702', 
   'Beta test customer - commercial', NOW()),
  ('b0000001-0000-0000-0000-000000000003', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04', 
   'BETA TEST - Sarah Johnson', 'beta.sarah@example.com', '555-0103', '789 Oak Lane', 'Austin', 'TX', '78703', 
   'Beta test customer - for portal testing', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. JOBS
-- ============================================
INSERT INTO jobs (id, company_id, user_id, customer_id, title, description, status, scheduled_date, scheduled_time, address, city, state, zip, total, created_at)
VALUES
  -- Job 1: Scheduled (for crew to work on)
  ('b0000002-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000001-0000-0000-0000-000000000001', 'BETA TEST - Lawn Maintenance', 'Weekly lawn mowing and edging service',
   'Scheduled', CURRENT_DATE + INTERVAL '1 day', '09:00', '123 Main St', 'Austin', 'TX', '78701', 150.00, NOW()),
  -- Job 2: Completed (for history)
  ('b0000002-0000-0000-0000-000000000002', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000001-0000-0000-0000-000000000002', 'BETA TEST - Office Cleaning', 'Monthly deep cleaning service',
   'Completed', CURRENT_DATE - INTERVAL '3 days', '14:00', '456 Business Ave', 'Austin', 'TX', '78702', 350.00, NOW() - INTERVAL '7 days'),
  -- Job 3: Scheduled (for portal customer)
  ('b0000002-0000-0000-0000-000000000003', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000001-0000-0000-0000-000000000003', 'BETA TEST - Window Washing', 'Exterior window cleaning - 2 story home',
   'Scheduled', CURRENT_DATE + INTERVAL '5 days', '10:00', '789 Oak Lane', 'Austin', 'TX', '78703', 200.00, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. JOB WORKERS (Assign crew to job 1)
-- Uses first employee found for the company
-- ============================================
INSERT INTO job_workers (id, job_id, employee_id, created_at)
SELECT 
  'b0000003-0000-0000-0000-000000000001',
  'b0000002-0000-0000-0000-000000000001',
  e.id,
  NOW()
FROM employees e
WHERE e.company_id = '293e130f-6cca-4196-9f63-d3bec900940b'
ORDER BY e.created_at ASC
FETCH FIRST 1 ROW ONLY
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. LEADS
-- ============================================
INSERT INTO leads (id, company_id, user_id, name, email, phone, address, city, state, zip, source, status, notes, created_at)
VALUES
  ('b0000004-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'BETA TEST - Mike Wilson', 'beta.mike@example.com', '555-0201', '321 Elm Street', 'Austin', 'TX', '78704',
   'Website', 'New', 'Interested in weekly lawn care', NOW()),
  ('b0000004-0000-0000-0000-000000000002', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'BETA TEST - Lisa Brown', 'beta.lisa@example.com', '555-0202', '654 Pine Road', 'Austin', 'TX', '78705',
   'Referral', 'Contacted', 'Needs quote for commercial cleaning', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. QUOTES
-- ============================================
INSERT INTO quotes (id, company_id, user_id, lead_id, title, description, amount, status, valid_until, created_at)
VALUES
  ('b0000005-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000004-0000-0000-0000-000000000002', 'BETA TEST - Commercial Cleaning Quote', 
   'Weekly office cleaning for 5,000 sq ft facility', 500.00, 'Sent', CURRENT_DATE + INTERVAL '30 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 6. ESTIMATES
-- ============================================
INSERT INTO estimates (id, company_id, user_id, customer_id, estimate_number, status, subtotal, tax, total, notes, valid_until, created_at)
VALUES
  ('b0000006-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000001-0000-0000-0000-000000000003', 'BETA-EST-001', 'Sent', 180.00, 14.85, 194.85,
   'BETA TEST - Window washing estimate for portal customer', CURRENT_DATE + INTERVAL '14 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 7. ESTIMATE LINE ITEMS
-- ============================================
INSERT INTO estimate_line_items (id, estimate_id, description, quantity, unit_price, total)
VALUES
  ('b0000007-0000-0000-0000-000000000001', 'b0000006-0000-0000-0000-000000000001', 
   'Exterior window cleaning - ground floor', 10, 8.00, 80.00),
  ('b0000007-0000-0000-0000-000000000002', 'b0000006-0000-0000-0000-000000000001', 
   'Exterior window cleaning - second floor', 10, 10.00, 100.00)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 8. INVOICES
-- ============================================
INSERT INTO invoices (id, company_id, user_id, customer_id, job_id, invoice_number, status, subtotal, tax, total, amount_paid, due_date, created_at)
VALUES
  ('b0000008-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'b0000001-0000-0000-0000-000000000003', 'b0000002-0000-0000-0000-000000000003',
   'BETA-INV-001', 'Sent', 200.00, 16.50, 216.50, 0.00, CURRENT_DATE + INTERVAL '30 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 9. INVOICE LINE ITEMS
-- ============================================
INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, total)
VALUES
  ('b0000009-0000-0000-0000-000000000001', 'b0000008-0000-0000-0000-000000000001', 
   'Window Washing Service - 2 Story Home', 1, 200.00, 200.00)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 10. CUSTOMER PORTAL TOKEN
-- ============================================
INSERT INTO customer_portal_tokens (id, customer_id, token, expires_at, revoked, created_at)
VALUES
  ('b000000a-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000003',
   'beta_test_portal_token_12345', NOW() + INTERVAL '30 days', false, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 11. IN-APP NOTIFICATION
-- ============================================
INSERT INTO in_app_notifications (id, company_id, user_id, type, title, message, link, read, created_at)
VALUES
  ('b000000b-0000-0000-0000-000000000001', '293e130f-6cca-4196-9f63-d3bec900940b', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04',
   'job_created', 'BETA TEST - New Job Created', 'A new job "Lawn Maintenance" has been scheduled for tomorrow.',
   '/jobs', false, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 12. BETA FEEDBACK (Test Entry)
-- ============================================
INSERT INTO beta_feedback (id, user_id, company_id, type, message, page_url, status, created_at)
VALUES
  ('b000000c-0000-0000-0000-000000000001', '3e324a74-35e3-443f-9ec2-eb3ce2ef3b04', '293e130f-6cca-4196-9f63-d3bec900940b',
   'feature', 'BETA TEST - This is a test feedback entry for the admin review page.', '/dashboard', 'new', NOW())
ON CONFLICT (id) DO NOTHING;


-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify customers
SELECT id, name, email, phone FROM customers WHERE name LIKE 'BETA TEST%';

-- Verify jobs
SELECT id, title, status, scheduled_date, total FROM jobs WHERE title LIKE 'BETA TEST%';

-- Verify job workers assignment
SELECT jw.id, j.title, e.name as employee_name
FROM job_workers jw
JOIN jobs j ON j.id = jw.job_id
JOIN employees e ON e.id = jw.employee_id
WHERE j.title LIKE 'BETA TEST%';

-- Verify leads
SELECT id, name, status, source FROM leads WHERE name LIKE 'BETA TEST%';

-- Verify quotes
SELECT id, title, amount, status FROM quotes WHERE title LIKE 'BETA TEST%';

-- Verify estimates
SELECT id, estimate_number, status, total FROM estimates WHERE notes LIKE 'BETA TEST%';

-- Verify invoices
SELECT id, invoice_number, status, total, amount_paid FROM invoices WHERE invoice_number LIKE 'BETA%';

-- Verify portal token
SELECT t.id, c.name as customer_name, t.token, t.expires_at
FROM customer_portal_tokens t
JOIN customers c ON c.id = t.customer_id
WHERE t.token LIKE 'beta_test%';

-- Verify notifications
SELECT id, type, title, read FROM in_app_notifications WHERE title LIKE 'BETA TEST%';

-- Verify feedback
SELECT id, type, message, status FROM beta_feedback WHERE message LIKE 'BETA TEST%';


-- ============================================
-- TEST URLS (after running this script)
-- ============================================
-- Customer Portal: /portal?token=beta_test_portal_token_12345
-- Invoice Payment: /pay/b0000008-0000-0000-0000-000000000001
-- Admin Feedback:  /admin/feedback
-- Crew Today:      /crew/today (login as crew member)
-- ============================================


-- ============================================
-- CLEANUP SCRIPT (Run when done testing)
-- ============================================
-- DELETE FROM beta_feedback WHERE message LIKE 'BETA TEST%';
-- DELETE FROM in_app_notifications WHERE title LIKE 'BETA TEST%';
-- DELETE FROM customer_portal_tokens WHERE token LIKE 'beta_test%';
-- DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE 'BETA%');
-- DELETE FROM invoices WHERE invoice_number LIKE 'BETA%';
-- DELETE FROM estimate_line_items WHERE estimate_id IN (SELECT id FROM estimates WHERE notes LIKE 'BETA TEST%');
-- DELETE FROM estimates WHERE notes LIKE 'BETA TEST%';
-- DELETE FROM quotes WHERE title LIKE 'BETA TEST%';
-- DELETE FROM leads WHERE name LIKE 'BETA TEST%';
-- DELETE FROM job_workers WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE 'BETA TEST%');
-- DELETE FROM jobs WHERE title LIKE 'BETA TEST%';
-- DELETE FROM customers WHERE name LIKE 'BETA TEST%';
