-- =============================================================================
-- Migration 42 - Work & Pay ledger spine
-- =============================================================================
-- Earnings (credit) and payments (debit) are SEPARATE tables joined by explicit
-- allocations. Outstanding is always:
--     sum(employee_earnings.amount) - sum(payment_allocations.amount)
-- and never a `paid` boolean. A boolean cannot represent a partial payment, and
-- the moment it is wrong there is no way to tell what was actually settled.
--
-- Money is numeric(10,2) everywhere, mirroring job_workers.amount_earned, so no
-- value silently changes scale when it crosses between the two systems.
--
-- Strictly additive: creates new tables only. Nothing existing is modified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Work entries - one row per employee per work period
-- -----------------------------------------------------------------------------
-- Multi-shift days are multiple rows for the same (employee_id, work_date), so
-- there is deliberately NO unique constraint on that pair. A morning and an
-- evening shift are two real work periods, not a conflict to be collapsed.
create table if not exists public.employee_work_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  work_date     date not null,

  comp_type     text not null check (comp_type in ('hourly','full_day','half_day','flat','per_job')),

  -- Clock times are optional: full_day / flat / per_job do not need them.
  start_time    timestamptz,
  end_time      timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),

  -- Lets the owner say "just pay 6 hours" without fabricating clock times.
  hours_override numeric(6,2) check (hours_override is null or hours_override >= 0),

  -- The rate is SNAPSHOT at save time so a later raise cannot silently restate
  -- what an already-recorded day cost. rate_source records where it came from.
  rate_snapshot numeric(10,2) check (rate_snapshot is null or rate_snapshot >= 0),
  rate_source   text not null default 'history' check (rate_source in ('history','override')),

  -- Always >= 0. For comp_type='per_job' this is 0 and the money lives in
  -- job_workers (see work_entry_jobs.job_worker_id).
  computed_amount numeric(10,2) not null default 0 check (computed_amount >= 0),

  notes         text,

  -- Once locked the row is immutable (enforced by trigger below), so a period
  -- that has been paid out cannot be edited from under the payment.
  locked_at     timestamptz,

  created_at    timestamptz not null default now(),
  created_by    uuid,

  -- end_time may legitimately be on the following calendar day (a shift that
  -- crosses midnight), so this only requires ordering, not same-day.
  constraint work_entry_time_order check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create index if not exists idx_work_entries_company on public.employee_work_entries(company_id);
create index if not exists idx_work_entries_employee_date on public.employee_work_entries(employee_id, work_date desc);

-- -----------------------------------------------------------------------------
-- 2. Work entry -> jobs, and the anti-double-count seam
-- -----------------------------------------------------------------------------
-- job_worker_id is the important column. Per-job pay already lives in
-- job_workers ($10,443.12 of it). When a work entry is per-job we POINT AT that
-- row instead of computing a parallel amount, which makes double-counting
-- structurally impossible rather than something the UI has to remember.
create table if not exists public.work_entry_jobs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  work_entry_id  uuid not null references public.employee_work_entries(id) on delete cascade,
  job_id         uuid not null references public.jobs(id) on delete cascade,

  job_worker_id  uuid references public.job_workers(id) on delete set null,

  created_at     timestamptz not null default now(),

  unique (work_entry_id, job_id)
);

create index if not exists idx_work_entry_jobs_entry on public.work_entry_jobs(work_entry_id);
create index if not exists idx_work_entry_jobs_job on public.work_entry_jobs(job_id);
-- Partial unique: one job_workers row can only ever be claimed by one work
-- entry, so the same per-job money cannot be attached to two entries.
create unique index if not exists uq_work_entry_jobs_job_worker
  on public.work_entry_jobs(job_worker_id) where job_worker_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Earnings - the credit side of the ledger
-- -----------------------------------------------------------------------------
create table if not exists public.employee_earnings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  employee_id   uuid not null references public.employees(id) on delete cascade,

  amount        numeric(10,2) not null,
  earned_on     date not null,
  kind          text not null check (kind in ('work','per_job','adjustment','opening')),

  -- Exactly one provenance, or none for adjustments/opening balances.
  work_entry_id uuid references public.employee_work_entries(id) on delete cascade,
  job_worker_id uuid references public.job_workers(id) on delete cascade,

  memo          text,
  created_at    timestamptz not null default now(),
  created_by    uuid,

  -- An earning derived from BOTH a work entry and a job_workers row would be
  -- the exact double-count this design exists to prevent.
  constraint earning_single_source check (
    not (work_entry_id is not null and job_worker_id is not null)
  )
);

create index if not exists idx_earnings_company on public.employee_earnings(company_id);
-- Supports oldest-first allocation, which scans by (employee, earned_on).
create index if not exists idx_earnings_employee_date on public.employee_earnings(employee_id, earned_on, created_at);
create unique index if not exists uq_earnings_job_worker
  on public.employee_earnings(job_worker_id) where job_worker_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Payments - the debit side
-- -----------------------------------------------------------------------------
create table if not exists public.employee_payments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  employee_id     uuid not null references public.employees(id) on delete cascade,

  amount          numeric(10,2) not null check (amount > 0),
  paid_on         date not null,
  method          text,
  memo            text,

  -- Nullable link so labour cost reaches Finances exactly once. Left null when
  -- the payment happened outside Profita.
  expense_id      uuid references public.expenses(id) on delete set null,

  -- Marks the money that was already paid before this ledger existed, so the
  -- backfilled $10,443.12 never looks like it was paid through the app.
  is_opening      boolean not null default false,

  -- Makes a double-submitted payment form a no-op instead of paying twice.
  idempotency_key text,

  created_at      timestamptz not null default now(),
  created_by      uuid
);

create index if not exists idx_payments_company on public.employee_payments(company_id);
create index if not exists idx_payments_employee_date on public.employee_payments(employee_id, paid_on desc);
create unique index if not exists uq_payments_idempotency
  on public.employee_payments(company_id, idempotency_key) where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- 5. Allocations - which payment settled which earning
-- -----------------------------------------------------------------------------
-- Because a payment is only ever *applied*, both partial payment and
-- overpayment are representable without ever mutating an earning.
create table if not exists public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,

  -- Deleting a payment removes its allocations (the money simply un-applies).
  payment_id  uuid not null references public.employee_payments(id) on delete cascade,
  -- RESTRICT: an earning that has money applied to it cannot be deleted out
  -- from under that payment. Unallocate first.
  earning_id  uuid not null references public.employee_earnings(id) on delete restrict,

  amount      numeric(10,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),

  unique (payment_id, earning_id)
);

create index if not exists idx_alloc_payment on public.payment_allocations(payment_id);
create index if not exists idx_alloc_earning on public.payment_allocations(earning_id);

-- -----------------------------------------------------------------------------
-- 6. Adjustments - bonus / reimbursement / deduction
-- -----------------------------------------------------------------------------
-- amount is signed: a deduction is negative. It becomes an employee_earnings
-- row of kind='adjustment' so it flows through the same Outstanding math.
create table if not exists public.employee_pay_adjustments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  employee_id uuid not null references public.employees(id) on delete cascade,

  kind        text not null check (kind in ('bonus','reimbursement','deduction')),
  amount      numeric(10,2) not null check (amount <> 0),
  effective_on date not null,
  memo        text,

  earning_id  uuid references public.employee_earnings(id) on delete set null,

  created_at  timestamptz not null default now(),
  created_by  uuid
);

create index if not exists idx_adjustments_employee on public.employee_pay_adjustments(employee_id, effective_on desc);

-- =============================================================================
-- 7. Integrity triggers - the invariants that keep Outstanding honest
-- =============================================================================

-- Over-allocation guard. Checked in the DB rather than the client because two
-- concurrent payments could each individually look affordable.
create or replace function public.check_allocation_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payment_amount numeric(10,2);
  v_allocated      numeric(10,2);
  v_earning_amount numeric(10,2);
begin
  select amount into v_payment_amount
    from public.employee_payments where id = new.payment_id;

  select coalesce(sum(amount), 0) into v_allocated
    from public.payment_allocations
   where payment_id = new.payment_id
     and id <> new.id;

  if v_allocated + new.amount > v_payment_amount + 0.001 then
    raise exception
      'allocation exceeds payment: payment % is %, already allocated %, tried to add %',
      new.payment_id, v_payment_amount, v_allocated, new.amount;
  end if;

  select amount into v_earning_amount
    from public.employee_earnings where id = new.earning_id;

  select coalesce(sum(amount), 0) into v_allocated
    from public.payment_allocations
   where earning_id = new.earning_id
     and id <> new.id;

  -- Guards against paying an earning twice via two different payments.
  if v_allocated + new.amount > v_earning_amount + 0.001 then
    raise exception
      'allocation exceeds earning: earning % is %, already allocated %, tried to add %',
      new.earning_id, v_earning_amount, v_allocated, new.amount;
  end if;

  return new;
end;
$$;

drop trigger if exists check_allocation_limits_trg on public.payment_allocations;
create trigger check_allocation_limits_trg
  before insert or update on public.payment_allocations
  for each row execute function public.check_allocation_limits();

-- Reducing a payment/earning below what is already allocated would silently
-- invert Outstanding, so block it rather than let the number drift.
create or replace function public.check_amount_not_below_allocated()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allocated numeric(10,2);
begin
  if tg_table_name = 'employee_payments' then
    select coalesce(sum(amount), 0) into v_allocated
      from public.payment_allocations where payment_id = new.id;
    if new.amount < v_allocated - 0.001 then
      raise exception 'cannot reduce payment % to %: % is already allocated',
        new.id, new.amount, v_allocated;
    end if;
  else
    select coalesce(sum(amount), 0) into v_allocated
      from public.payment_allocations where earning_id = new.id;
    if new.amount < v_allocated - 0.001 then
      raise exception 'cannot reduce earning % to %: % is already allocated',
        new.id, new.amount, v_allocated;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_payment_amount_trg on public.employee_payments;
create trigger check_payment_amount_trg
  before update of amount on public.employee_payments
  for each row execute function public.check_amount_not_below_allocated();

drop trigger if exists check_earning_amount_trg on public.employee_earnings;
create trigger check_earning_amount_trg
  before update of amount on public.employee_earnings
  for each row execute function public.check_amount_not_below_allocated();

-- Locked work entries are immutable. Unlocking is allowed (that is the escape
-- hatch); changing money while locked is not.
create or replace function public.guard_locked_work_entry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked_at is not null then
      raise exception 'work entry % is locked and cannot be deleted', old.id;
    end if;
    return old;
  end if;

  if old.locked_at is not null and new.locked_at is not null then
    if new.computed_amount <> old.computed_amount
       or new.comp_type <> old.comp_type
       or new.work_date <> old.work_date
       or coalesce(new.rate_snapshot, -1) <> coalesce(old.rate_snapshot, -1) then
      raise exception 'work entry % is locked; unlock it before changing pay details', old.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_locked_work_entry_trg on public.employee_work_entries;
create trigger guard_locked_work_entry_trg
  before update or delete on public.employee_work_entries
  for each row execute function public.guard_locked_work_entry();

-- =============================================================================
-- 8. RLS - mirrors the existing policy shape exactly
-- =============================================================================
-- get_user_company_ids() is SET-RETURNING in this database, so it is queried as
-- a table. Writing unnest(...) here would fail.
do $$
declare
  t text;
begin
  foreach t in array array[
    'employee_work_entries',
    'work_entry_jobs',
    'employee_earnings',
    'employee_payments',
    'payment_allocations',
    'employee_pay_adjustments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_company_access', t);
    execute format($f$
      create policy %I on public.%I
        for all
        using (company_id in (select company_id from public.get_user_company_ids()))
        with check (company_id in (select company_id from public.get_user_company_ids()))
    $f$, t || '_company_access', t);
  end loop;
end $$;

-- =============================================================================
-- 9. Outstanding balance - one definition, used everywhere
-- =============================================================================
-- Every screen reads this function so two screens can never disagree about what
-- is owed. earnings - allocations, by construction.
create or replace function public.employee_balances()
returns table (
  employee_id        uuid,
  employee_name      text,
  total_earned       numeric,
  total_paid         numeric,
  outstanding        numeric,
  unallocated_credit numeric
)
language sql
stable
set search_path = public
as $$
  with earned as (
    select e.employee_id, sum(e.amount) amt
      from public.employee_earnings e
     group by 1
  ),
  allocated as (
    select e.employee_id, sum(a.amount) amt
      from public.payment_allocations a
      join public.employee_earnings e on e.id = a.earning_id
     group by 1
  ),
  paid as (
    select p.employee_id, sum(p.amount) amt
      from public.employee_payments p
     group by 1
  )
  select
    emp.id,
    emp.name,
    coalesce(earned.amt, 0)::numeric,
    coalesce(paid.amt, 0)::numeric,
    (coalesce(earned.amt, 0) - coalesce(allocated.amt, 0))::numeric,
    -- Money paid that is not yet applied to any earning: a credit on account.
    -- Surfaced rather than hidden, because it is real money already out.
    (coalesce(paid.amt, 0) - coalesce(allocated.amt, 0))::numeric
  from public.employees emp
  left join earned    on earned.employee_id    = emp.id
  left join allocated on allocated.employee_id = emp.id
  left join paid      on paid.employee_id      = emp.id
  where coalesce(earned.amt, 0) <> 0 or coalesce(paid.amt, 0) <> 0
$$;

grant execute on function public.employee_balances() to authenticated;
