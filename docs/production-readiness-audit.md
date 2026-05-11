# Profita Production-Readiness Audit

**Date:** May 6, 2026  
**Goal:** Multi-tenant SaaS platform for service businesses + sales teams

---

## 1. What Is Already Built

### Operations (Profita Core)
| Feature | Status | Notes |
|---------|--------|-------|
| Auth (login/signup/forgot-password) | Built | Supabase Auth |
| Customers | Built | Has `company_id`, company-scoped RLS |
| Jobs | Built | Has `company_id`, company-scoped RLS |
| Invoices | Built | Has `company_id`, company-scoped RLS |
| Estimates | Built | Has `company_id`, company-scoped RLS |
| Calendar/Schedule | Built | Shows jobs by date |
| Service Plans | Built | Recurring memberships |
| Team Management | Built | Companies + members + roles |
| D2D Tracker | Built | Daily door-knock metrics |
| Notifications | Built | In-app notifications |
| Settings | Built | User preferences |
| Payroll | Built | Employee pay tracking |
| Employees | Built | Has `company_id` |
| Analytics | Built | Basic charts |
| Reports | Built | Financial reports |
| AI Growth | Built | AI insights (premium) |
| Booking Requests | Built | Public booking page |
| Invoice Payments | Built | Stripe integration |

### Sales Force (SalesHub)
| Feature | Status | Notes |
|---------|--------|-------|
| Sales Map | Built | Lead pins on map |
| Leads | Built | Has `company_id` |
| Pipeline | Built | Lead status board |
| Quotes | Built | Quote creation |
| Follow-ups | Built | Task management |
| Bookings/Appointments | Built | Has assigned_rep_id |
| Leaderboard | Built | Rep rankings view |
| Knock List | Built | Daily knock targets |
| My Stats | Built | Rep statistics |
| Territories | Built | Boundary management |

### Crew/Worker App
| Feature | Status | Notes |
|---------|--------|-------|
| Crew Dashboard | Built | Worker's job view |
| Today's Jobs | Built | Daily assignments |
| Week View | Built | Weekly schedule |
| Job Detail | Built | Individual job page |

---

## 2. What Is Missing

### Critical Multi-Tenant Gaps

| Issue | Severity | Details |
|-------|----------|---------|
| `d2d_days` missing `company_id` | HIGH | Only has `user_id`, not company-scoped |
| `service_plans` missing `company_id` | HIGH | Only has `user_id` |
| `customer_plans` missing `company_id` | HIGH | Only has `user_id` |
| `plan_automations` missing `company_id` | HIGH | Only has `user_id` |
| `booking_requests` missing `company_id` | HIGH | Only has `user_id` |
| `bookings` missing `company_id` | HIGH | Only has `user_id` |
| `employees` mixed model | MEDIUM | Has `company_id` but also uses `user_id` for RLS |
| `expenses` user-scoped RLS | MEDIUM | Has `company_id` but RLS uses `user_id` |
| `income` user-scoped RLS | MEDIUM | Has `company_id` but RLS uses `user_id` |
| `pending_income` missing `company_id` | HIGH | Only has `user_id` |
| `upcoming_expenses` missing `company_id` | HIGH | Only has `user_id` |
| `settings` missing `company_id` | MEDIUM | Personal settings only |
| `profiles` missing `company_id` | MEDIUM | User profile only |
| `subscriptions` missing `company_id` | MEDIUM | Should be company-level billing |
| `quotes` missing `company_id` | HIGH | Only has `user_id` |
| `follow_ups` missing `company_id` | HIGH | Only has `user_id` |
| `territories` missing `company_id` | HIGH | Only has `user_id` |
| `sales_rep_stats` missing `company_id` | HIGH | Only has `user_id` |
| `lead_activities` missing `company_id` | HIGH | Only has `user_id` |

### Missing Features

| Feature | Priority | Details |
|---------|----------|---------|
| Company onboarding flow | HIGH | No wizard for new company setup |
| Company settings page | HIGH | Logo, business info, branding |
| Multi-company switching | MEDIUM | User can belong to multiple companies |
| Payments table | HIGH | Track individual payments vs invoices |
| Commission tracking | MEDIUM | Sales rep commissions |
| Route optimization | MEDIUM | AI route planning |
| SMS/Email automation | MEDIUM | Customer notifications |
| Audit log | MEDIUM | Track changes for compliance |
| Data export | MEDIUM | CSV/Excel exports |
| Company-level billing | HIGH | Subscriptions per company |

---

## 3. What Is Fake/Demo Data

| Item | Location | Issue |
|------|----------|-------|
| Sales Rep Leaderboard | `sales_rep_leaderboard` view | Reads from real data but view has no RLS |
| Lead Pipeline Summary | `lead_pipeline_summary` view | Reads from real data but view has no RLS |
| Today's Follow-ups | `todays_follow_ups` view | No RLS on view |
| AI Growth insights | `app/ai-growth` | Real data, but AI prompts are demo |

---

## 4. Database Tables Needed

### New Tables Required
```sql
-- payments (track individual payment transactions)
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid REFERENCES auth.users(id),
  invoice_id uuid REFERENCES invoices(id),
  customer_id uuid REFERENCES customers(id),
  amount numeric NOT NULL,
  payment_method text, -- cash, check, card, ach
  payment_date date NOT NULL,
  reference_number text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- commissions (sales rep earnings)
CREATE TABLE commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid REFERENCES auth.users(id),
  member_id uuid REFERENCES company_members(id),
  job_id uuid REFERENCES jobs(id),
  invoice_id uuid REFERENCES invoices(id),
  lead_id uuid REFERENCES leads(id),
  amount numeric NOT NULL,
  commission_rate numeric,
  status text DEFAULT 'pending', -- pending, approved, paid
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- audit_log (change tracking)
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid REFERENCES auth.users(id),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL, -- insert, update, delete
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now()
);
```

### Tables Needing `company_id` Column
```sql
-- Add company_id to all missing tables
ALTER TABLE d2d_days ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE service_plans ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE customer_plans ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE plan_automations ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE booking_requests ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE bookings ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE pending_income ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE upcoming_expenses ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE quotes ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE follow_ups ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE territories ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE sales_rep_stats ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE lead_activities ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE subscriptions ADD COLUMN company_id uuid REFERENCES companies(id);
```

---

## 5. Security Rules Needed

### RLS Policy Updates Required

All tables need company-based RLS instead of just `user_id`:

```sql
-- Template for company-scoped RLS
CREATE POLICY {table}_company_select ON {table} FOR SELECT TO authenticated
USING (
  company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())
  OR company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  OR user_id = auth.uid()
);

-- Apply to: d2d_days, service_plans, customer_plans, plan_automations, 
-- booking_requests, bookings, pending_income, upcoming_expenses, quotes,
-- follow_ups, territories, sales_rep_stats, lead_activities, expenses, income
```

### Views Need Security

```sql
-- Views with RLS disabled need security_invoker
ALTER VIEW sales_rep_leaderboard SET (security_invoker = true);
ALTER VIEW lead_pipeline_summary SET (security_invoker = true);
ALTER VIEW todays_follow_ups SET (security_invoker = true);
```

### Company Members RLS

```sql
-- company_members has 0 policies! Critical fix:
CREATE POLICY company_members_owner_all ON company_members FOR ALL TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid()));

CREATE POLICY company_members_self_select ON company_members FOR SELECT TO authenticated
USING (user_id = auth.uid());
```

### Job Assignments / Time Entries RLS

```sql
-- job_assignments has 0 policies
-- time_entries has 0 policies
-- Both need company-scoped policies via join to jobs
```

---

## 6. User Roles Needed

### Current Roles (in `lib/permissions.ts`)
- owner
- admin
- dispatcher
- worker
- sales_rep
- accountant

### Missing Roles
| Role | Purpose | Permissions |
|------|---------|-------------|
| manager | Team lead for workers | Manage assigned team, view reports |
| office_staff | Front desk operations | Scheduling, customer calls, no finances |

### Role Permission Matrix
```
Permission          | owner | admin | manager | dispatcher | worker | sales_rep | accountant | office_staff
--------------------|-------|-------|---------|------------|--------|-----------|------------|-------------
view_dashboard      |   Y   |   Y   |    Y    |     Y      |   Y    |     Y     |     Y      |      Y
view_customers      |   Y   |   Y   |    Y    |     Y      |   *    |     Y     |     Y      |      Y
create_customers    |   Y   |   Y   |    Y    |     Y      |   N    |     Y     |     N      |      Y
view_jobs           |   Y   |   Y   |    Y    |     Y      |   *    |     Y     |     Y      |      Y
create_jobs         |   Y   |   Y   |    Y    |     Y      |   N    |     Y     |     N      |      Y
view_finances       |   Y   |   Y   |    N    |     N      |   N    |     N     |     Y      |      N
manage_invoices     |   Y   |   Y   |    N    |     N      |   N    |     N     |     Y      |      N
view_team           |   Y   |   Y   |    Y    |     Y      |   N    |     N     |     N      |      Y
manage_team         |   Y   |   Y   |    N    |     N      |   N    |     N     |     N      |      N
view_leads          |   Y   |   Y   |    N    |     N      |   N    |     Y     |     N      |      Y
manage_leads        |   Y   |   Y   |    N    |     N      |   N    |     Y     |     N      |      N
view_reports        |   Y   |   Y   |    Y    |     N      |   N    |     N     |     Y      |      N
manage_settings     |   Y   |   Y   |    N    |     N      |   N    |     N     |     N      |      N
view_payroll        |   Y   |   Y   |    N    |     N      |   N    |     N     |     Y      |      N

* = Assigned records only
```

---

## 7. Profita <-> Sales Force Integration Points

### Workflow: Door Knock -> Payment
```
SALES FORCE                          PROFITA
--------------------------------------------------------------
1. Door Knocked (d2d_days)
2. Lead Created (leads)
3. Follow-up Set (follow_ups)
4. Quote Created (quotes)
5. Appointment Booked (bookings)     
6. Deal Closed                       ->  7. Customer Created (customers)
                                     ->  8. Job Scheduled (jobs)
                                     ->  9. Invoice Sent (invoices)
                                     -> 10. Payment Collected (payments)
                                     -> 11. Profit Tracked (income)
```

### Data Flow Requirements
| From | To | Trigger | Action |
|------|----|---------|--------|
| Lead | Customer | Lead status = "converted" | Create customer with lead data |
| Quote | Job | Quote status = "accepted" | Create job from quote line items |
| Quote | Invoice | Quote status = "accepted" | Create invoice from quote |
| Job | Invoice | Job status = "completed" | Generate invoice if not exists |
| Invoice | Income | Payment received | Record income entry |
| Booking | Job | Appointment confirmed | Link or create job |

### Missing Linkages
- `quotes.converted_job_id` exists but no auto-creation logic
- `quotes.converted_invoice_id` exists but no auto-creation logic
- `leads.converted_customer_id` exists but no auto-creation logic
- No commission calculation on deal close
- No notification to owner when rep closes deal

---

## 8. What Should Be Fixed First

### Priority 1: Security (Week 1)
1. Add `company_id` to all tables missing it
2. Update RLS policies to company-based for all tables
3. Add RLS to `company_members`, `job_assignments`, `time_entries`
4. Secure views with `security_invoker`

### Priority 2: Data Integrity (Week 1-2)
1. Backfill `company_id` on existing data
2. Add NOT NULL constraints after backfill
3. Add foreign key indexes for performance

### Priority 3: Core Workflow (Week 2-3)
1. Lead -> Customer conversion
2. Quote -> Job + Invoice conversion
3. Job -> Invoice generation
4. Payment tracking

### Priority 4: Company Experience (Week 3-4)
1. Company onboarding wizard
2. Company settings page
3. Invite link flow improvements
4. Company-level subscription

---

## 9. Step-by-Step Build Plan

### Phase 1: Multi-Tenant Security (1-2 weeks)
```
[ ] 1.1 Add company_id columns to all tables
[ ] 1.2 Backfill company_id from user_id -> companies.owner_user_id
[ ] 1.3 Update all RLS policies to company-based
[ ] 1.4 Add RLS to company_members, job_assignments, time_entries
[ ] 1.5 Secure database views
[ ] 1.6 Update all storage functions to include company_id on insert
[ ] 1.7 Update all fetch functions to filter by company membership
[ ] 1.8 Test: Create 2 test companies, verify data isolation
```

### Phase 2: Company Foundation (1 week)
```
[ ] 2.1 Create company onboarding wizard (name, industry, logo)
[ ] 2.2 Create company settings page
[ ] 2.3 Auto-create company on first login if none exists
[ ] 2.4 Update navigation to show company name/logo
[ ] 2.5 Add company switcher for multi-company users
```

### Phase 3: Workflow Integration (2 weeks)
```
[ ] 3.1 Create payments table
[ ] 3.2 Build lead -> customer conversion flow
[ ] 3.3 Build quote -> job conversion flow
[ ] 3.4 Build quote -> invoice conversion flow
[ ] 3.5 Build job completion -> invoice generation
[ ] 3.6 Add payment recording UI
[ ] 3.7 Link all conversions with proper company_id
```

### Phase 4: Sales Rep Experience (1 week)
```
[ ] 4.1 Create commissions table
[ ] 4.2 Build commission calculation on deal close
[ ] 4.3 Sales rep earnings dashboard
[ ] 4.4 Leaderboard with company-scoped data
[ ] 4.5 Rep performance notifications
```

### Phase 5: Role Permissions (1 week)
```
[ ] 5.1 Add manager, office_staff roles
[ ] 5.2 Update permission matrix
[ ] 5.3 UI enforcement for all roles
[ ] 5.4 API enforcement via RLS
[ ] 5.5 Test each role's access
```

### Phase 6: Polish & Launch (1-2 weeks)
```
[ ] 6.1 Data export (CSV)
[ ] 6.2 Audit logging
[ ] 6.3 Company-level Stripe subscriptions
[ ] 6.4 Onboarding email sequence
[ ] 6.5 Help docs / tooltips
[ ] 6.6 Mobile optimization pass
[ ] 6.7 Performance audit
[ ] 6.8 Security audit
```

---

## Summary

**Current State:** Profita is ~70% built as a single-user app with partial multi-tenant support. The core CRUD for operations and sales features exists, but data isolation between companies is incomplete.

**Critical Gaps:**
- 15+ tables missing `company_id`
- RLS policies using `user_id` instead of company membership
- No workflow automation between Sales Force -> Profita
- Missing payments tracking table

**Estimated Timeline:** 6-8 weeks to production-ready multi-tenant SaaS

**Recommended First Action:** Run the SQL to add `company_id` to all tables and update RLS policies (Phase 1.1-1.3) before any UI work.
