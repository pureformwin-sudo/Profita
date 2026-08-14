-- Migration 43: backfill the Work & Pay ledger from existing job_workers rows.
--
-- CONTEXT / DECISION
-- job_workers holds 163 rows totalling $10,443.12, all with paid = false.
-- The owner confirmed this is real work that was ALREADY PAID outside Profita.
-- So we do NOT want Work & Pay to show $10,443.12 outstanding on day one.
--
-- Therefore this migration:
--   1. Snapshots job_workers.paid / paid_at so the change is fully reversible.
--   2. Creates one earning per job_workers row (kind 'per_job', job_worker_id set),
--      preserving per-job history and dates.
--   3. Creates ONE offsetting opening payment per employee (is_opening = true)
--      and allocates it across that employee's earnings, so outstanding lands on $0.
--   4. Sets job_workers.paid = true / paid_at so the legacy Payroll tab, which reads
--      that boolean, agrees with the new ledger instead of contradicting it.
--
-- Net effect: full history is visible, Outstanding starts at $0, and both screens agree.
-- Reversal: scripts/43-reverse-work-pay-backfill.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Snapshot the columns we are about to mutate (reversibility)
-- ---------------------------------------------------------------------------
create table if not exists job_workers_paid_snapshot_43 (
  job_worker_id uuid primary key,
  prev_paid     boolean,
  prev_paid_at  timestamptz,
  snapshot_at   timestamptz not null default now()
);

-- Only snapshot rows we have not snapshotted before, so re-running is safe.
insert into job_workers_paid_snapshot_43 (job_worker_id, prev_paid, prev_paid_at)
select w.id, w.paid, w.paid_at
from job_workers w
where not exists (
  select 1 from job_workers_paid_snapshot_43 s where s.job_worker_id = w.id
);

-- ---------------------------------------------------------------------------
-- 2. One earning per job_workers row.
--    company_id: prefer the employee's, fall back to the job's (7 of 163 rows
--    have an employee company_id; all 163 resolve via jobs.company_id).
--    earned_on: the job's date, so history lands on the right day.
--    The unique index on job_worker_id makes this idempotent.
-- ---------------------------------------------------------------------------
insert into employee_earnings (
  company_id, employee_id, amount, earned_on, kind, job_worker_id, memo
)
select
  coalesce(e.company_id, j.company_id),
  w.employee_id,
  w.amount_earned,
  coalesce(j.date, current_date),
  'per_job',
  w.id,
  'Backfilled from job_workers by migration 43'
from job_workers w
join employees e on e.id = w.employee_id
left join jobs j on j.id = w.job_id
where coalesce(e.company_id, j.company_id) is not null
  and not exists (
    select 1 from employee_earnings ee where ee.job_worker_id = w.id
  );

-- ---------------------------------------------------------------------------
-- 3. One opening payment per employee, covering their backfilled earnings,
--    then allocate it oldest-earning-first so nothing shows as owed.
-- ---------------------------------------------------------------------------
do $$
declare
  r            record;
  v_payment_id uuid;
  v_remaining  numeric(12,2);
  v_take       numeric(12,2);
  e            record;
begin
  for r in
    select
      ee.company_id,
      ee.employee_id,
      sum(ee.amount)   as total,
      max(ee.earned_on) as last_earned
    from employee_earnings ee
    where ee.job_worker_id is not null
      and ee.memo = 'Backfilled from job_workers by migration 43'
    group by ee.company_id, ee.employee_id
  loop
    -- Skip if this employee already has an opening payment (idempotent re-run).
    if exists (
      select 1 from employee_payments p
      where p.employee_id = r.employee_id and p.is_opening
    ) then
      continue;
    end if;

    insert into employee_payments (
      company_id, employee_id, amount, paid_on, method, memo, is_opening
    )
    values (
      r.company_id,
      r.employee_id,
      r.total,
      r.last_earned,
      'Opening balance',
      'Opening balance: work recorded in Profita but paid outside it, before Work & Pay existed.',
      true
    )
    returning id into v_payment_id;

    v_remaining := r.total;

    -- Oldest earning first, same ordering the live payment path uses.
    for e in
      select ee.id, ee.amount
      from employee_earnings ee
      where ee.employee_id = r.employee_id
        and ee.job_worker_id is not null
      order by ee.earned_on asc, ee.created_at asc, ee.id asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, e.amount);
      insert into payment_allocations (company_id, payment_id, earning_id, amount)
      values (r.company_id, v_payment_id, e.id, v_take);
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reconcile the legacy Payroll tab, which computes "Still Owed" from
--    job_workers.paid. Without this, Payroll would keep showing $10,443.12
--    owed while Work & Pay correctly shows $0.
-- ---------------------------------------------------------------------------
update job_workers w
set paid = true,
    paid_at = coalesce(w.paid_at, now())
where exists (
  select 1 from employee_earnings ee where ee.job_worker_id = w.id
)
and w.paid is not true;

commit;
