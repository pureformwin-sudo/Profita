# Profita Beta Test Checklist

## Test Accounts Needed

| Role | Description | How to Create |
|------|-------------|---------------|
| Super Admin | Platform admin with /admin access | Add email to `SUPER_ADMIN_EMAILS` in super-admin.ts or set `is_admin=true` in profiles |
| Company Owner | Creates company, full permissions | Sign up new account |
| Admin | Company admin, most permissions | Invite via Team page with Admin role |
| Office Staff | Limited permissions | Invite via Team page with Office Staff role |
| Sales Rep | D2D sales access | Invite via Team page with Sales Rep role |
| Crew Member | Job execution only | Invite via Team page with Crew role |
| Customer Portal | Customer-facing access | Generate portal link from customer drawer |

---

## 1. Signup & Onboarding

### New User Signup
- [ ] Navigate to /signup
- [ ] Fill in name, email, password
- [ ] Password validation shows requirements
- [ ] Submit creates account
- [ ] Email confirmation sent (if enabled)
- [ ] User lands on appropriate page

### Pending Approval (if enabled)
- [ ] New user sees /pending-approval
- [ ] Status shows "Awaiting Approval"
- [ ] Admin can approve in /admin/users
- [ ] User auto-redirects after approval

### Onboarding Flow
- [ ] First login shows /onboarding
- [ ] Step 1: Company Info saves correctly
- [ ] Step 2: Services config works
- [ ] Step 3: Pricing & Goals saves
- [ ] Step 4: Sales Team config works
- [ ] Step 5: Invoicing settings save
- [ ] Complete onboarding redirects to dashboard
- [ ] Skip option works

### Company Settings
- [ ] /settings/company loads
- [ ] Company name editable
- [ ] Logo upload works
- [ ] Address saves correctly
- [ ] Business hours configurable

---

## 2. Core Operations

### Customers
- [ ] /customers page loads
- [ ] Add customer button works
- [ ] Customer form validates required fields
- [ ] Customer saves successfully
- [ ] Customer appears in list
- [ ] Search filters customers
- [ ] Customer drawer opens on click
- [ ] Edit customer works
- [ ] Delete customer works (with confirmation)

### Jobs
- [ ] /jobs page loads
- [ ] Create job from customer works
- [ ] Job form has all required fields
- [ ] Service selection works
- [ ] Date/time picker works
- [ ] Assign crew member works
- [ ] Job saves successfully
- [ ] Job appears in list
- [ ] Job status filters work
- [ ] Job detail page loads
- [ ] Edit job works
- [ ] Status change works

### Calendar
- [ ] /calendar page loads
- [ ] Jobs display on correct dates
- [ ] Click job opens detail
- [ ] Drag-drop rescheduling works (if enabled)
- [ ] Month/week/day views work

### Invoices
- [ ] /invoices page loads
- [ ] Create invoice from job works
- [ ] Line items editable
- [ ] Tax calculation correct
- [ ] Invoice saves successfully
- [ ] Invoice status shows correctly
- [ ] Send invoice generates link
- [ ] Mark as paid works
- [ ] Partial payment works

### Team
- [ ] /team page loads
- [ ] Invite team member works
- [ ] Role selection shows all roles
- [ ] Invitation email sends (if configured)
- [ ] Team member appears in list
- [ ] Edit member permissions works
- [ ] Remove member works

---

## 3. Sales Force

### Leads
- [ ] /sales/leads page loads
- [ ] Add lead works
- [ ] Lead form captures all fields
- [ ] Lead status changes work
- [ ] Lead converts to customer

### Pipeline
- [ ] /sales/pipeline page loads
- [ ] Pipeline stages display
- [ ] Drag leads between stages
- [ ] Deal values show correctly

### Quotes
- [ ] /sales/quotes page loads
- [ ] Create quote works
- [ ] Quote items editable
- [ ] Send quote generates link
- [ ] Quote status updates

### Follow-ups
- [ ] /sales/follow-ups page loads
- [ ] Follow-up reminders display
- [ ] Mark follow-up complete works
- [ ] Snooze follow-up works

### Bookings
- [ ] /sales/bookings page loads
- [ ] Booking calendar displays
- [ ] Create booking works
- [ ] Booking notifications work

### D2D Tracker
- [ ] D2D page loads
- [ ] Territory map displays
- [ ] Log door knock works
- [ ] Daily stats update
- [ ] Leaderboard shows rankings

---

## 4. Crew App

### Access & Authentication
- [ ] Crew member logs in successfully
- [ ] Crew mode activates (bottom nav changes)
- [ ] Crew member only sees assigned jobs

### Today Page (/crew/today)
- [ ] Page loads with assigned jobs
- [ ] Jobs grouped by status
- [ ] Quick stats show (jobs count, hours)
- [ ] "On My Way" button works
- [ ] "Start Job" button works
- [ ] Address link opens maps

### Job Detail (/crew/job/[id])
- [ ] Job detail loads
- [ ] Customer info displays
- [ ] Status dropdown works
- [ ] Status transitions: Scheduled -> On My Way -> In Progress -> Completed
- [ ] Invalid transitions blocked
- [ ] Clock In button works
- [ ] Clock Out button works
- [ ] Photo upload works (before/after)
- [ ] Notes field saves
- [ ] Mark Complete works
- [ ] Time entry syncs to payroll

### Week Page (/crew/week)
- [ ] Page loads with weekly view
- [ ] Jobs show on correct days
- [ ] Status badges display
- [ ] Tap job navigates to detail

### Security
- [ ] Crew cannot see unassigned jobs
- [ ] Crew cannot edit other crew's time
- [ ] Crew cannot access admin pages
- [ ] Job assignment verified on status change

---

## 5. Customer Portal

### Portal Link Generation
- [ ] Open customer detail drawer
- [ ] Click "Portal" button
- [ ] Link copies to clipboard
- [ ] Toast confirms link copied

### Portal Access (Incognito)
- [ ] Open portal link in incognito
- [ ] Portal dashboard loads
- [ ] Customer name displays
- [ ] No login required

### Portal Dashboard
- [ ] Stats cards show (pending quotes, unpaid invoices, etc.)
- [ ] Recent activity displays
- [ ] Navigation works

### Portal Estimates
- [ ] /portal/estimates shows customer's estimates only
- [ ] Estimate detail loads
- [ ] Accept estimate works
- [ ] Decline estimate works
- [ ] Status updates

### Portal Invoices
- [ ] /portal/invoices shows customer's invoices only
- [ ] Invoice detail loads
- [ ] Pay button navigates to payment
- [ ] Paid status displays correctly

### Portal Bookings
- [ ] /portal/bookings shows upcoming appointments
- [ ] Booking details display

### Portal Service History
- [ ] /portal/service-history shows completed jobs
- [ ] Job details display

### Portal Request Service
- [ ] /portal/request-service form loads
- [ ] Submit request works
- [ ] Confirmation displays

### Security
- [ ] Invalid token shows error
- [ ] Expired token blocked
- [ ] Customer only sees their own data
- [ ] No cross-customer data leakage

---

## 6. SaaS Admin

### Access Control
- [ ] Super admin can access /admin
- [ ] Normal user redirected from /admin
- [ ] Owner cannot access /admin (unless super admin)

### Admin Dashboard (/admin)
- [ ] Platform stats display
- [ ] Total companies count
- [ ] Total users count
- [ ] Total revenue (if tracked)
- [ ] Quick links work

### Companies (/admin/companies)
- [ ] Company list loads
- [ ] Search works
- [ ] Plan filter works
- [ ] Click company opens detail
- [ ] Inline plan edit works

### Company Detail (/admin/companies/[id])
- [ ] Company info displays
- [ ] Member list shows
- [ ] Recent jobs show
- [ ] Recent invoices show
- [ ] Plan editing works

### Data Isolation
- [ ] Admin sees all companies
- [ ] Company data remains isolated
- [ ] No cross-company leakage

---

## 7. Notifications

### In-App Notifications
- [ ] Bell icon shows unread count
- [ ] Click bell navigates to /notifications
- [ ] Notification list loads
- [ ] Mark as read works
- [ ] Mark all as read works
- [ ] Notification categories filter

### Notification Settings
- [ ] /settings/notifications loads
- [ ] Email toggle works
- [ ] SMS config saves (if Twilio configured)
- [ ] Template editing works

### Customer-Facing Safety
- [ ] Customer notifications do NOT expose internal notes
- [ ] Customer notifications use customer-safe templates

---

## 8. Stripe Payment (Production Test)

### Prerequisites
- [ ] STRIPE_SECRET_KEY set
- [ ] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set
- [ ] STRIPE_WEBHOOK_SECRET set
- [ ] Webhook endpoint registered in Stripe dashboard

### Payment Flow Test
- [ ] Create test invoice for $1.00
- [ ] Navigate to /pay/[invoiceId]
- [ ] Invoice details display correctly
- [ ] "Pay Now" button works
- [ ] Stripe Embedded Checkout loads
- [ ] Enter test card (4242 4242 4242 4242)
- [ ] Payment completes successfully
- [ ] Success message displays

### Webhook Verification
- [ ] Webhook fires on payment
- [ ] Invoice status updates to "paid"
- [ ] amount_paid field updates
- [ ] payments table gets new record
- [ ] Job status updates to "Paid" (if applicable)

---

## 9. Feedback System

- [ ] Feedback button visible in header
- [ ] Click opens feedback dialog
- [ ] Type selection works (Bug/Feature/General)
- [ ] Message field accepts input
- [ ] Submit sends feedback
- [ ] Success toast displays
- [ ] Feedback logged (to DB or console)

---

## Issues Found

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Severity: CRITICAL / HIGH / MEDIUM / LOW

---

## Final Checklist

- [ ] TypeScript: 0 errors
- [ ] npm run build: passes
- [ ] All critical flows tested
- [ ] No blocking bugs
- [ ] Feedback system working
- [ ] Stripe webhook verified
- [ ] RLS policies verified
- [ ] Cross-company isolation verified

---

## Beta Launch Readiness Score

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Signup & Onboarding | /10 | 10 | |
| Core Operations | /20 | 20 | |
| Sales Force | /15 | 15 | |
| Crew App | /15 | 15 | |
| Customer Portal | /15 | 15 | |
| SaaS Admin | /10 | 10 | |
| Notifications | /5 | 5 | |
| Stripe Payment | /5 | 5 | |
| Feedback System | /5 | 5 | |
| **TOTAL** | /100 | 100 | |

**Go/No-Go Decision:** [ ] GO / [ ] NO-GO

**Signed off by:** _________________ **Date:** _____________
