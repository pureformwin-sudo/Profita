-- =============================================================================
-- 40 - Employee compensation history + identity links + time-based earnings
-- =============================================================================
-- STRICTLY ADDITIVE. No existing row is modified except employees.member_id /
-- employees.linked_user_id, which are new nullable columns.
--
-- Money safety: job_workers.amount_earned stays authoritative and untouched.
-- Everything here is *derived reporting* alongside it, never a rewrite.
--
-- CRITICAL DATA NOTE (verified against live data before writing this):
--   employees.user_id is the OWNER who created the record - all 13 employees
--   share user_id = the company owner. It is NOT the employee's own auth
--   identity. time_entries.user_id is that same owner. So joining
--   employees.user_id = time_entries.user_id would fan 13 employees across 24
--   time entries and invent labor cost that nobody worked.
--   => We add a dedicated linked_user_id, and NEVER infer identity from user_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Identity link columns on employees
-- -----------------------------------------------------------------------------
alter table public.employees
  add column if not exists member_id uuid references public.company_members(id) on delete set null,
  add column if not exists linked_user_id uuid;

comment on column public.employees.member_id is
  'Optional link to the company_members row for this person. Enables resolving timer hours to a pay rate.';
comment on column public.employees.linked_user_id is
  'The employee''s OWN auth user id. Deliberately separate from employees.user_id, which is the owner who created the record.';

create index if not exists employees_member_id_idx on public.employees(member_id);
create index if not exists employees_linked_user_id_idx on public.employees(linked_user_id);

-- -----------------------------------------------------------------------------
-- 2. Backfill links ONLY on unambiguous, case-insensitive email match
-- -----------------------------------------------------------------------------
-- Guarded so a shared/duplicated email can never map many employees onto one
-- member (the live data has 8 employees sharing pureformwin@gmail.com).
with candidate as (
  select
    e.id as employee_id,
    m.id as member_id,
    m.user_id as member_user_id,
    count(*) over (partition by lower(btrim(e.email))) as employees_with_email,
    count(*) over (partition by m.id)                 as members_matched
  from public.employees e
  join public.company_members m
    on lower(btrim(m.email)) = lower(btrim(e.email))
  where e.email is not null
    and btrim(e.email) <> ''
    -- employees.company_id is NULL for most live rows, so NULL means "unknown"
    -- and is allowed to match rather than blocking every link.
    and (e.company_id is null or e.company_id = m.company_id)
)
update public.employees e
set member_id      = c.member_id,
    linked_user_id = coalesce(e.linked_user_id, c.member_user_id)
from candidate c
where e.id = c.employee_id
  and c.employees_with_email = 1   -- email identifies exactly one employee
  and c.members_matched = 1        -- and maps to exactly one member
  and e.member_id is null;

-- -----------------------------------------------------------------------------
-- 3. Compensation history with effective dates
-- -----------------------------------------------------------------------------
create table if not exists public.employee_compensation_history (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  company_id     uuid references public.companies(id) on delete cascade,
  pay_type       text not null check (pay_type in ('hourly','per_job','salary','commission')),
  pay_rate       numeric(12,2) not null default 0 check (pay_rate >= 0),
  commission_rate numeric(6,3) check (commission_rate is null or commission_rate >= 0),
  commission_type text,
  effective_from date not null default current_date,
  effective_to   date,
  note           text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  -- An open-ended row must not start after it ends.
  constraint comp_history_valid_range check (effective_to is null or effective_to >= effective_from)
);

comment on table public.employee_compensation_history is
  'Rate changes over time. Historical earnings are valued at the rate in force on the work date, so a raise never retroactively rewrites past labor cost.';

create index if not exists comp_history_employee_idx on public.employee_compensation_history(employee_id, effective_from desc);
create index if not exists comp_history_company_idx  on public.employee_compensation_history(company_id);

-- Prevent overlapping open-ended periods for the same employee.
create unique index if not exists comp_history_one_open_per_employee
  on public.employee_compensation_history(employee_id)
  where effective_to is null;

-- -----------------------------------------------------------------------------
-- 4. RLS mirroring the existing company-scoped pattern
-- -----------------------------------------------------------------------------
alter table public.employee_compensation_history enable row level security;

drop policy if exists comp_history_select on public.employee_compensation_history;
create policy comp_history_select on public.employee_compensation_history
  for select using (
    company_id is null
    or company_id in (select company_id from public.get_user_company_ids())
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
  );

drop policy if exists comp_history_insert on public.employee_compensation_history;
create policy comp_history_insert on public.employee_compensation_history
  for insert with check (
    company_id is null
    or company_id in (select company_id from public.get_user_company_ids())
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
  );

drop policy if exists comp_history_update on public.employee_compensation_history;
create policy comp_history_update on public.employee_compensation_history
  for update using (
    company_id is null
    or company_id in (select company_id from public.get_user_company_ids())
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
  );

drop policy if exists comp_history_delete on public.employee_compensation_history;
create policy comp_history_delete on public.employee_compensation_history
  for delete using (
    company_id is null
    or company_id in (select company_id from public.get_user_company_ids())
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 5. Seed history from each employee's CURRENT rate
-- -----------------------------------------------------------------------------
-- Opened far enough back that existing work resolves to today's known rate
-- rather than to nothing. Only for employees with no history yet.
insert into public.employee_compensation_history
  (employee_id, company_id, pay_type, pay_rate, commission_rate, commission_type, effective_from, note)
select
  e.id,
  e.company_id,
  case when e.pay_type in ('hourly','per_job','salary','commission') then e.pay_type else 'per_job' end,
  coalesce(e.pay_rate, 0),
  e.commission_rate,
  e.commission_type,
  coalesce(e.created_at::date, current_date - 365),
  'Seeded from current employee rate by migration 40'
from public.employees e
where not exists (
  select 1 from public.employee_compensation_history h where h.employee_id = e.id
);

-- -----------------------------------------------------------------------------
-- 6. Rate resolution: the rate in force on a given date
-- -----------------------------------------------------------------------------
create or replace function public.employee_rate_on(
  p_employee_id uuid,
  p_date date default current_date
)
returns table (pay_type text, pay_rate numeric, commission_rate numeric, commission_type text)
language sql
stable
security invoker
set search_path = public
as $$
  select h.pay_type, h.pay_rate, h.commission_rate, h.commission_type
  from public.employee_compensation_history h
  where h.employee_id = p_employee_id
    and h.effective_from <= p_date
    and (h.effective_to is null or h.effective_to >= p_date)
  order by h.effective_from desc
  limit 1
$$;

comment on function public.employee_rate_on(uuid, date) is
  'Rate in force for an employee on a date. Used so past work is valued at the historical rate.';

-- -----------------------------------------------------------------------------
-- 7. Timer hours resolved to an employee
-- -----------------------------------------------------------------------------
-- Seconds for a time entry, tolerating either duration column.
-- Defined BEFORE its callers so function-body validation can resolve it.
create or replace function public.te_seconds(t public.time_entries)
returns bigint
language sql
immutable
set search_path = public
as $$
  select coalesce(
    t.duration_seconds,
    t.duration_minutes * 60,
    case when t.end_time is not null
      then greatest(0, extract(epoch from (t.end_time - t.start_time))::bigint)
    end,
    0
  )::bigint
$$;

-- SECURITY INVOKER so existing RLS on time_entries / employees scopes rows.
-- Only 'work' counts as payable; travel and break are reported separately.
-- Joins ONLY on the explicit link columns - never on employees.user_id.
create or replace function public.employee_hours_worked(
  p_start date default null,
  p_end   date default null
)
returns table (
  employee_id   uuid,
  employee_name text,
  work_seconds  bigint,
  travel_seconds bigint,
  break_seconds bigint,
  entry_count   bigint,
  open_entries  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id,
    e.name,
    coalesce(sum(case when t.entry_type = 'work'   then public.te_seconds(t) end), 0)::bigint,
    coalesce(sum(case when t.entry_type = 'travel' then public.te_seconds(t) end), 0)::bigint,
    coalesce(sum(case when t.entry_type = 'break'  then public.te_seconds(t) end), 0)::bigint,
    count(t.id)::bigint,
    count(t.id) filter (where t.end_time is null)::bigint
  from public.employees e
  join public.time_entries t
    on (e.member_id is not null and t.member_id = e.member_id)
    or (e.linked_user_id is not null and t.user_id = e.linked_user_id)
  where (p_start is null or t.start_time::date >= p_start)
    and (p_end   is null or t.start_time::date <= p_end)
  group by e.id, e.name
$$;

-- -----------------------------------------------------------------------------
-- 8. Unattributed hours - so labor time never silently vanishes
-- -----------------------------------------------------------------------------
-- Time logged by a user that maps to NO employee record. Surfaced in the UI
-- instead of being dropped, since dropping it understates labor.
create or replace function public.unattributed_hours(
  p_start date default null,
  p_end   date default null
)
returns table (work_seconds bigint, entry_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(case when t.entry_type = 'work' then public.te_seconds(t) end), 0)::bigint,
    count(*)::bigint
  from public.time_entries t
  where not exists (
    select 1 from public.employees e
    where (e.member_id is not null and t.member_id = e.member_id)
       or (e.linked_user_id is not null and t.user_id = e.linked_user_id)
  )
  and (p_start is null or t.start_time::date >= p_start)
  and (p_end   is null or t.start_time::date <= p_end)
$$;

grant execute on function public.employee_rate_on(uuid, date)  to authenticated;
grant execute on function public.employee_hours_worked(date, date) to authenticated;
grant execute on function public.unattributed_hours(date, date)  to authenticated;
grant execute on function public.te_seconds(public.time_entries) to authenticated;
