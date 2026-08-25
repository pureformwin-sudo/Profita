-- 019: Message automations (template system) + job completion timestamps
--
-- Three pieces:
--   1. jobs.completed_at  — the trigger clock. Did not exist before; `jobs` had
--      only created_at and `date` (the scheduled day), neither of which tells us
--      when work actually finished.
--   2. message_automations — per-company config for each automation type.
--   3. automation_sends    — the idempotency ledger.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. jobs.completed_at
--
-- Stamped by trigger rather than in app code because job status is written from
-- ~17 different call sites (job detail, kanban, quick actions, timer, bulk
-- updates, customer portal...). Any one of them forgetting to set the timestamp
-- would silently mean "no review request for that job", which is exactly the
-- kind of bug nobody notices. The database is the only real choke point.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.jobs
  add column if not exists completed_at timestamptz;

comment on column public.jobs.completed_at is
  'When the job first reached a completed-or-later status. Set by trigger, not app code. NULL for jobs completed before this migration, which keeps them ineligible for automations.';

create or replace function public.stamp_job_completed_at()
returns trigger
language plpgsql
as $$
begin
  -- Sticky across the downstream lifecycle: Completed -> Invoiced -> Paid ->
  -- Closed must NOT re-stamp or clear the time, or a job invoiced two days
  -- later would look freshly finished and fire a late review request.
  if new.status in ('Completed', 'Invoiced', 'Paid', 'Closed') then
    if new.completed_at is null then
      new.completed_at := now();
    end if;

  -- Reverted to a pre-completion status: the job isn't done after all, so drop
  -- the timestamp. A genuine later completion re-stamps and is still protected
  -- from double-texting by the automation_sends unique constraint below.
  elsif new.status in ('Scheduled', 'On the way', 'In progress') then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_stamp_completed_at on public.jobs;

create trigger jobs_stamp_completed_at
  before insert or update of status on public.jobs
  for each row
  execute function public.stamp_job_completed_at();

-- Partial index: the cron only ever scans completed, not-yet-swept jobs.
create index if not exists jobs_completed_at_idx
  on public.jobs (completed_at)
  where completed_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. message_automations — per-company, per-type configuration.
--
-- The automation TYPE (its trigger logic, default copy, available tokens) lives
-- in code in lib/automations/registry.ts. Only the parts an operator can change
-- live here, so adding a new automation type later is a registry entry plus a
-- row, not a schema change.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.message_automations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  -- Matches a key in the code-side registry.
  automation_type text not null,

  enabled boolean not null default false,

  -- Operator-editable copy. NULL means "use the registry default", so improved
  -- default wording ships to anyone who never customized theirs.
  message_body text,

  -- How long after the trigger event to send.
  delay_minutes integer not null default 90,

  -- Local-time window, inclusive start / exclusive end. Sends outside it are
  -- deferred to the next open window, never dropped.
  quiet_hours_start integer not null default 8,
  quiet_hours_end integer not null default 20,

  -- IANA zone the window above is measured in. Cron runs in UTC, so without this
  -- an "8am-8pm" rule would fire at midnight local time.
  timezone text not null default 'America/Los_Angeles',

  -- Don't re-ask the same customer inside this many days.
  cooldown_days integer not null default 90,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint message_automations_company_type_key unique (company_id, automation_type),
  constraint message_automations_delay_sane check (delay_minutes between 0 and 10080),
  constraint message_automations_quiet_sane check (
    quiet_hours_start between 0 and 23
    and quiet_hours_end between 1 and 24
    and quiet_hours_start < quiet_hours_end
  ),
  constraint message_automations_cooldown_sane check (cooldown_days between 0 and 3650)
);

create index if not exists message_automations_company_idx
  on public.message_automations (company_id);

drop trigger if exists message_automations_set_updated_at on public.message_automations;
create trigger message_automations_set_updated_at
  before update on public.message_automations
  for each row
  execute function public.update_updated_at_column();

alter table public.message_automations enable row level security;

drop policy if exists message_automations_company_select on public.message_automations;
create policy message_automations_company_select on public.message_automations
  for select using (
    company_id in (select company_id from public.get_user_company_ids())
    or user_id = auth.uid()
  );

drop policy if exists message_automations_company_insert on public.message_automations;
create policy message_automations_company_insert on public.message_automations
  for insert with check (
    company_id in (select company_id from public.get_user_company_ids())
    or user_id = auth.uid()
  );

drop policy if exists message_automations_company_update on public.message_automations;
create policy message_automations_company_update on public.message_automations
  for update using (
    company_id in (select company_id from public.get_user_company_ids())
    or user_id = auth.uid()
  );

drop policy if exists message_automations_company_delete on public.message_automations;
create policy message_automations_company_delete on public.message_automations
  for delete using (
    company_id in (select company_id from public.get_user_company_ids())
    or user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. automation_sends — one row per (company, automation, job).
--
-- This is the "never text the same person twice" guarantee, and it has to be a
-- DB constraint rather than an app-level check: two overlapping cron runs (a
-- slow run still finishing when the next fires) would both read "not sent yet"
-- and both send. The unique index makes the second insert fail instead.
--
-- Skips and failures are recorded too, so a customer who never got a review
-- request has a visible reason rather than just an absent row.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.automation_sends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  automation_type text not null,

  job_id uuid references public.jobs(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,

  -- 'sent' | 'skipped' | 'failed'
  outcome text not null,
  -- Why it was skipped or how it failed. NULL for a clean send.
  detail text,

  -- Links to the timeline entry created by the shared send path.
  lead_activity_id uuid references public.lead_activities(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint automation_sends_outcome_valid
    check (outcome in ('sent', 'skipped', 'failed'))
);

-- The idempotency guarantee. Claimed BEFORE the text goes out, so a crash
-- between claim and send fails closed (no text) rather than open (double text).
create unique index if not exists automation_sends_unique_per_job
  on public.automation_sends (company_id, automation_type, job_id)
  where job_id is not null;

-- Cooldown lookups: "when did we last ask this customer?"
create index if not exists automation_sends_cooldown_idx
  on public.automation_sends (company_id, automation_type, customer_id, created_at desc);

alter table public.automation_sends enable row level security;

-- Read-only to operators; only the cron (service role, which bypasses RLS)
-- writes here. No insert/update/delete policy on purpose — a client that could
-- forge ledger rows could suppress or replay customer texts.
drop policy if exists automation_sends_company_select on public.automation_sends;
create policy automation_sends_company_select on public.automation_sends
  for select using (
    company_id in (select company_id from public.get_user_company_ids())
  );
