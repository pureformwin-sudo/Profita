-- 48-quo-outbound-messaging.sql
-- Outbound SMS from Profita through Quo, plus the opt-out tracking that mass
-- texting legally requires.
--
-- Design notes:
--  * OPT-OUT IS THE POINT. Before this migration there was no consent column
--    anywhere, so a bulk send had no way to honor a "STOP" reply. Every send
--    path must filter on these flags.
--  * Flags live on BOTH customers and leads because either can be texted, and a
--    phone number may exist as one, the other, or both.
--  * `quo_outbound_messages` is the send log AND the safety rail: it is what
--    makes a bulk run resumable, auditable, and non-duplicating.
--  * Phone numbers are stored normalized to last-10-digits in `contact_number`
--    for matching, mirroring 47-quo-events.sql, because this DB mixes
--    '(559) 930-5181' with '5599602286' and uses '' rather than NULL on leads.

-- ---------------------------------------------------------------------------
-- 1. Opt-out flags
-- ---------------------------------------------------------------------------

alter table public.customers
  add column if not exists sms_opt_out        boolean not null default false,
  add column if not exists sms_opt_out_at     timestamptz,
  add column if not exists sms_opt_out_reason text;

alter table public.leads
  add column if not exists sms_opt_out        boolean not null default false,
  add column if not exists sms_opt_out_at     timestamptz,
  add column if not exists sms_opt_out_reason text;

-- Partial indexes: we almost always query for the small opted-out set, or
-- filter it out of a large send list.
create index if not exists customers_sms_opt_out_idx
  on public.customers (sms_opt_out) where sms_opt_out = true;

create index if not exists leads_sms_opt_out_idx
  on public.leads (sms_opt_out) where sms_opt_out = true;

-- ---------------------------------------------------------------------------
-- 2. Outbound send log
-- ---------------------------------------------------------------------------

create table if not exists public.quo_outbound_messages (
  id                uuid primary key default gen_random_uuid(),

  -- Tenancy. NOT NULL here (unlike quo_events): we never send without knowing
  -- which company is sending, because that determines the "from" number.
  company_id        uuid not null references public.companies(id) on delete cascade,

  -- Who triggered the send. Attributed to a real session user for audit.
  user_id           uuid not null,

  -- Recipient linkage. Both nullable: a send may target a customer, a lead, or
  -- a raw number that matches neither.
  customer_id       uuid references public.customers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,

  from_number       text not null,
  to_number         text not null,
  -- Normalized last-10-digits of the recipient, for dedupe and lookups.
  contact_number    text not null,

  body              text not null,

  status            text not null
                      check (status in ('sent', 'failed', 'skipped')),
  -- Why a message was skipped without being sent (opted out, duplicate in
  -- batch, unusable number). Kept so a bulk run explains itself.
  skip_reason       text,

  -- Quo's own message id, present only on a successful send.
  quo_message_id    text,
  error             text,

  -- Groups the rows of a single bulk run so the UI can report per-run totals.
  batch_id          uuid,

  -- Idempotency for bulk: a (batch_id, contact_number) pair may only exist
  -- once, so a retried or double-submitted run cannot re-text the same person.
  -- Enforced by the unique index below rather than a constraint, because
  -- batch_id is NULL for one-off sends.

  created_at        timestamptz not null default now()
);

create unique index if not exists quo_outbound_batch_recipient_uniq
  on public.quo_outbound_messages (batch_id, contact_number)
  where batch_id is not null;

create index if not exists quo_outbound_company_created_idx
  on public.quo_outbound_messages (company_id, created_at desc);

create index if not exists quo_outbound_contact_idx
  on public.quo_outbound_messages (contact_number);

create index if not exists quo_outbound_batch_idx
  on public.quo_outbound_messages (batch_id) where batch_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.quo_outbound_messages enable row level security;

-- Reads are scoped to the caller's company. Writes go through the server route
-- using the service role, which bypasses RLS, so no insert policy is needed.
--
-- NOTE: this uses the existing get_user_company_ids() helper, matching the
-- job_photos policies. `profiles` has NO company_id column, so the more obvious
-- "select company_id from profiles" form would not even compile here.
drop policy if exists quo_outbound_select_own_company on public.quo_outbound_messages;
create policy quo_outbound_select_own_company
  on public.quo_outbound_messages
  for select
  using (
    company_id in (select company_id from get_user_company_ids())
    or user_id = auth.uid()
  );

comment on table public.quo_outbound_messages is
  'Outbound SMS sent from Profita via Quo. One row per recipient per send, including skips, so bulk runs are auditable and non-duplicating.';
