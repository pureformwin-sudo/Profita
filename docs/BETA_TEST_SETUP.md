# Beta Test Setup Guide

This document explains how to create test accounts and demo data for running the beta test checklist.

## Overview

Since Supabase auth users cannot be seeded automatically, this guide provides:
1. Manual steps to create test user accounts
2. SQL script to seed demo data for those users
3. Cleanup instructions

All demo records are prefixed with "BETA TEST" for easy identification.

---

## Step 1: Create Test User Accounts

Create these accounts manually via the signup flow at `/signup`:

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Super Admin | `beta-admin@profita.test` | `BetaTest123!` | Add to SUPER_ADMIN_EMAILS in super-admin.ts |
| Company Owner | `beta-owner@profita.test` | `BetaTest123!` | Creates the beta company |
| Admin | `beta-staff-admin@profita.test` | `BetaTest123!` | Invite as Admin role |
| Office Staff | `beta-office@profita.test` | `BetaTest123!` | Invite as Office Staff role |
| Sales Rep | `beta-sales@profita.test` | `BetaTest123!` | Invite as Sales Rep role |
| Crew Member | `beta-crew@profita.test` | `BetaTest123!` | Invite as Crew role |

### Account Creation Order

1. **Super Admin**: Sign up, then run SQL to set `is_admin = true` in profiles
2. **Company Owner**: Sign up normally, complete onboarding as "BETA TEST Company"
3. **Team Members**: Owner invites via Team page with appropriate roles

---

## Step 2: Configure Super Admin

After creating the super admin account, run this SQL:

```sql
-- Set is_admin flag for super admin
UPDATE profiles 
SET is_admin = true 
WHERE email = 'beta-admin@profita.test';
```

Or add the email to `SUPER_ADMIN_EMAILS` in `/lib/super-admin.ts`:

```typescript
const SUPER_ADMIN_EMAILS = [
  'beta-admin@profita.test',
  // ... other admins
]
```

---

## Step 3: Seed Demo Data

After the company owner has created the company and invited team members, run the seed script.

First, get the IDs you need:

```sql
-- Get company ID
SELECT id, name FROM companies WHERE name LIKE '%BETA TEST%';

-- Get user IDs
SELECT id, email FROM auth.users WHERE email LIKE '%beta%';

-- Get employee IDs (after team invites are accepted)
SELECT id, name, email, role FROM employees WHERE company_id = 'YOUR_COMPANY_ID';
```

Then run the seed script below, replacing the placeholder IDs.

---

## Step 4: Run Seed SQL Script

Copy this script to Supabase SQL Editor and replace the placeholder values:

```sql
-- ============================================
-- BETA TEST DATA SEED SCRIPT
-- ============================================
-- Replace these placeholders before running:
-- COMPANY_ID: UUID of "BETA TEST Company"
-- OWNER_USER_ID: UUID of beta-owner@profita.test
-- CREW_EMPLOYEE_ID: UUID of crew member employee record
-- SALES_EMPLOYEE_ID: UUID of sales rep employee record
-- ============================================

-- Set variables (replace with actual values)
DO $$
DECLARE
  v_company_id UUID := 'COMPANY_ID';
  v_owner_user_id UUID := 'OWNER_USER_ID';
  v_crew_employee_id UUID := 'CREW_EMPLOYEE_ID';
  v_sales_employee_id UUID := 'SALES_EMPLOYEE_ID';
  v_customer1_id UUID;
  v_customer2_id UUID;
  v_customer3_id UUID;
  v_job1_id UUID;
  v_job2_id UUID;
  v_job3_id UUID;
  v_lead1_id UUID;
  v_lead2_id UUID;
  v_quote_id UUID;
  v_estimate_id UUID;
  v_invoice_id UUID;
  v_portal_token TEXT;
BEGIN

  -- ============================================
  -- CUSTOMERS (3)
  -- ============================================
  
  INSERT INTO customers (id, company_id, user_id, name, email, phone, address, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, 
     'BETA TEST - John Smith', 'john.smith@example.com', '555-0101', 
     '123 Main St, Anytown, ST 12345', 'Beta test customer 1')
  RETURNING id INTO v_customer1_id;
  
  INSERT INTO customers (id, company_id, user_id, name, email, phone, address, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id,
     'BETA TEST - Jane Doe', 'jane.doe@example.com', '555-0102',
     '456 Oak Ave, Somewhere, ST 67890', 'Beta test customer 2')
  RETURNING id INTO v_customer2_id;
  
  INSERT INTO customers (id, company_id, user_id, name, email, phone, address, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id,
     'BETA TEST - Bob Wilson', 'bob.wilson@example.com', '555-0103',
     '789 Pine Rd, Elsewhere, ST 11111', 'Beta test customer 3 - Portal user')
  RETURNING id INTO v_customer3_id;

  RAISE NOTICE 'Created customers: %, %, %', v_customer1_id, v_customer2_id, v_customer3_id;

  -- ============================================
  -- JOBS (3)
  -- ============================================
  
  -- Job 1: Scheduled (assigned to crew member)
  INSERT INTO jobs (id, company_id, user_id, customer_id, date, job_type, status, price, notes, start_time)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_customer1_id,
     CURRENT_DATE + INTERVAL '2 days', 'Lawn Care', 'Scheduled', 150.00,
     'BETA TEST - Scheduled job for crew testing', '09:00')
  RETURNING id INTO v_job1_id;
  
  -- Assign crew member to job 1
  INSERT INTO job_workers (job_id, employee_id)
  VALUES (v_job1_id, v_crew_employee_id);
  
  -- Job 2: Completed
  INSERT INTO jobs (id, company_id, user_id, customer_id, date, job_type, status, price, notes, start_time, end_time)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_customer2_id,
     CURRENT_DATE - INTERVAL '3 days', 'Window Cleaning', 'Completed', 200.00,
     'BETA TEST - Completed job', '10:00', '12:00')
  RETURNING id INTO v_job2_id;
  
  -- Job 3: Scheduled (for portal customer)
  INSERT INTO jobs (id, company_id, user_id, customer_id, date, job_type, status, price, notes, start_time)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_customer3_id,
     CURRENT_DATE + INTERVAL '5 days', 'General Service', 'Scheduled', 175.00,
     'BETA TEST - Job for portal customer', '14:00')
  RETURNING id INTO v_job3_id;

  RAISE NOTICE 'Created jobs: %, %, %', v_job1_id, v_job2_id, v_job3_id;

  -- ============================================
  -- LEADS (2)
  -- ============================================
  
  INSERT INTO leads (id, company_id, user_id, owner_employee_id, name, email, phone, address, status, source, priority, estimated_value, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_sales_employee_id,
     'BETA TEST - Prospect Adams', 'prospect.adams@example.com', '555-0201',
     '100 New St, Newtown, ST 22222', 'new', 'D2D', 'high', 500.00,
     'BETA TEST - Hot lead for sales testing')
  RETURNING id INTO v_lead1_id;
  
  INSERT INTO leads (id, company_id, user_id, owner_employee_id, name, email, phone, address, status, source, priority, estimated_value, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_sales_employee_id,
     'BETA TEST - Prospect Baker', 'prospect.baker@example.com', '555-0202',
     '200 Old St, Oldtown, ST 33333', 'contacted', 'Referral', 'medium', 300.00,
     'BETA TEST - Follow-up needed')
  RETURNING id INTO v_lead2_id;

  RAISE NOTICE 'Created leads: %, %', v_lead1_id, v_lead2_id;

  -- ============================================
  -- QUOTE (1)
  -- ============================================
  
  INSERT INTO quotes (id, company_id, user_id, lead_id, quote_number, title, status, line_items, subtotal, tax_rate, tax_amount, total, valid_until, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_lead1_id,
     'BETA-Q-001', 'BETA TEST - Service Quote', 'draft',
     '[{"description": "Initial Service Setup", "quantity": 1, "unit_price": 250}, {"description": "Monthly Maintenance", "quantity": 3, "unit_price": 100}]'::jsonb,
     550.00, 8.00, 44.00, 594.00,
     CURRENT_DATE + INTERVAL '30 days',
     'BETA TEST - Quote for lead testing')
  RETURNING id INTO v_quote_id;

  RAISE NOTICE 'Created quote: %', v_quote_id;

  -- ============================================
  -- ESTIMATE (1)
  -- ============================================
  
  INSERT INTO estimates (id, company_id, user_id, customer_id, estimate_number, status, items, subtotal, tax_rate, tax_amount, total, issue_date, expiry_date, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_customer3_id,
     'BETA-E-001', 'pending',
     '[{"description": "Premium Service Package", "quantity": 1, "unit_price": 400}, {"description": "Add-on Service", "quantity": 2, "unit_price": 75}]'::jsonb,
     550.00, 8.00, 44.00, 594.00,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
     'BETA TEST - Estimate for portal testing')
  RETURNING id INTO v_estimate_id;

  RAISE NOTICE 'Created estimate: %', v_estimate_id;

  -- ============================================
  -- INVOICE (1) - For payment testing
  -- ============================================
  
  INSERT INTO invoices (id, company_id, user_id, customer_id, job_id, invoice_number, status, items, subtotal, tax_rate, tax_amount, total, amount_paid, issue_date, due_date, notes)
  VALUES 
    (gen_random_uuid(), v_company_id, v_owner_user_id, v_customer3_id, v_job2_id,
     'BETA-INV-001', 'sent',
     '[{"description": "Service Completed", "quantity": 1, "unit_price": 200}]'::jsonb,
     200.00, 8.00, 16.00, 216.00, 0.00,
     CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
     'BETA TEST - Invoice for payment flow testing')
  RETURNING id INTO v_invoice_id;

  RAISE NOTICE 'Created invoice: %', v_invoice_id;

  -- ============================================
  -- CUSTOMER PORTAL TOKEN (1)
  -- ============================================
  
  v_portal_token := 'beta_test_token_' || encode(gen_random_bytes(16), 'hex');
  
  INSERT INTO customer_portal_tokens (customer_id, token, expires_at, revoked)
  VALUES 
    (v_customer3_id, v_portal_token, CURRENT_TIMESTAMP + INTERVAL '30 days', false);

  RAISE NOTICE 'Created portal token: %', v_portal_token;

  -- ============================================
  -- IN-APP NOTIFICATION (1)
  -- ============================================
  
  INSERT INTO in_app_notifications (company_id, user_id, type, category, title, message, icon, read, job_id)
  VALUES 
    (v_company_id, v_owner_user_id, 'job_created', 'job',
     'BETA TEST - New Job Scheduled', 'A new job has been scheduled for testing.',
     'briefcase', false, v_job1_id);

  RAISE NOTICE 'Created notification';

  -- ============================================
  -- FEEDBACK SUBMISSION (1)
  -- ============================================
  
  INSERT INTO beta_feedback (user_id, company_id, type, message, page_url, status)
  VALUES 
    (v_owner_user_id, v_company_id, 'feature',
     'BETA TEST - Sample feedback: Would love to see a dark mode option!',
     '/dashboard', 'new');

  RAISE NOTICE 'Created feedback';

  -- ============================================
  -- SUMMARY
  -- ============================================
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'BETA TEST DATA SEEDED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Customers: 3';
  RAISE NOTICE 'Jobs: 3 (1 assigned to crew, 1 completed, 1 for portal)';
  RAISE NOTICE 'Leads: 2';
  RAISE NOTICE 'Quote: 1';
  RAISE NOTICE 'Estimate: 1';
  RAISE NOTICE 'Invoice: 1 (for payment testing)';
  RAISE NOTICE 'Portal Token: %', v_portal_token;
  RAISE NOTICE 'Notification: 1';
  RAISE NOTICE 'Feedback: 1';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Portal URL: /portal?token=%', v_portal_token;
  RAISE NOTICE 'Payment URL: /pay/%', v_invoice_id;
  RAISE NOTICE '============================================';

END $$;
```

---

## Step 5: Verify Setup

After running the seed script, verify the data:

```sql
-- Check customers
SELECT name, email FROM customers WHERE name LIKE 'BETA TEST%';

-- Check jobs
SELECT j.notes, j.status, c.name as customer 
FROM jobs j 
JOIN customers c ON j.customer_id = c.id 
WHERE j.notes LIKE 'BETA TEST%';

-- Check job assignments
SELECT e.name as crew_member, j.notes as job
FROM job_workers jw
JOIN employees e ON jw.employee_id = e.id
JOIN jobs j ON jw.job_id = j.id
WHERE j.notes LIKE 'BETA TEST%';

-- Check leads
SELECT name, status, source FROM leads WHERE name LIKE 'BETA TEST%';

-- Check portal token
SELECT t.token, c.name as customer 
FROM customer_portal_tokens t
JOIN customers c ON t.customer_id = c.id
WHERE c.name LIKE 'BETA TEST%';

-- Check invoice for payment
SELECT invoice_number, total, status FROM invoices WHERE invoice_number LIKE 'BETA%';
```

---

## Step 6: Test Each Role

### Super Admin
- URL: `/admin`
- Can see all companies, users, feedback

### Company Owner
- URL: `/dashboard`
- Full access to company features

### Crew Member
- URL: `/crew/today`
- Should only see assigned job (BETA TEST - Scheduled job)

### Customer Portal
- URL: `/portal?token=YOUR_PORTAL_TOKEN`
- Should see: 1 estimate, 1 invoice, 1 upcoming booking

---

## Cleanup Script

To remove all beta test data after testing:

```sql
-- WARNING: This deletes all BETA TEST data!
-- Run each section carefully.

-- Delete feedback
DELETE FROM beta_feedback WHERE message LIKE 'BETA TEST%';

-- Delete notifications  
DELETE FROM in_app_notifications WHERE title LIKE 'BETA TEST%';

-- Delete portal tokens for beta customers
DELETE FROM customer_portal_tokens 
WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'BETA TEST%');

-- Delete invoices
DELETE FROM invoices WHERE invoice_number LIKE 'BETA%';

-- Delete estimates
DELETE FROM estimates WHERE estimate_number LIKE 'BETA%';

-- Delete quotes
DELETE FROM quotes WHERE quote_number LIKE 'BETA%';

-- Delete job workers for beta jobs
DELETE FROM job_workers 
WHERE job_id IN (SELECT id FROM jobs WHERE notes LIKE 'BETA TEST%');

-- Delete jobs
DELETE FROM jobs WHERE notes LIKE 'BETA TEST%';

-- Delete leads
DELETE FROM leads WHERE name LIKE 'BETA TEST%';

-- Delete customers
DELETE FROM customers WHERE name LIKE 'BETA TEST%';

-- Optionally: Delete beta users from auth.users (requires service role)
-- DELETE FROM auth.users WHERE email LIKE 'beta-%@profita.test';

-- Optionally: Delete beta company
-- DELETE FROM companies WHERE name LIKE '%BETA TEST%';
```

---

## Quick Reference

| Test Item | How to Find |
|-----------|-------------|
| Portal URL | `/portal?token=<token from seed output>` |
| Payment URL | `/pay/<invoice_id from seed output>` |
| Crew job | Login as beta-crew@profita.test, go to /crew/today |
| Sales leads | Login as beta-sales@profita.test, go to /sales/leads |
| Admin feedback | Login as beta-admin@profita.test, go to /admin/feedback |

---

## Troubleshooting

### "Company not found"
- Ensure company owner completed onboarding with "BETA TEST" in company name

### "No jobs visible for crew"
- Check job_workers table has correct employee_id
- Verify crew member accepted team invite

### "Portal token invalid"
- Token may have expired (30 day expiry)
- Check customer_portal_tokens table for revoked = false

### "Cannot access /admin"
- Verify profiles.is_admin = true for super admin
- Or add email to SUPER_ADMIN_EMAILS list
