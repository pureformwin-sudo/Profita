-- Migration 44: employee data hygiene (NON-DESTRUCTIVE)
--
-- Decisions this implements (approved by owner):
--   1. Duplicate/unused employee rows are DEACTIVATED, never deleted.
--      Rationale: 17 tables reference employees, several ON DELETE CASCADE.
--      Every duplicate owns an employee_compensation_history row (pay-rate
--      history). Deleting would silently destroy it. Deactivating achieves the
--      real goal -- a clean Add Work picker -- with zero destruction.
--   2. employees.company_id is backfilled ONLY where unambiguously derivable
--      from that employee's job_workers -> jobs.company_id (exactly 1 distinct
--      company). Ambiguous or underivable rows are left alone.
--
-- Reversal: scripts/44-reverse-employee-hygiene.sql restores prior values from
-- the snapshot table created below.

begin;

-- ---------------------------------------------------------------------------
-- Snapshot BEFORE any write, so reversal is exact.
-- ---------------------------------------------------------------------------
create table if not exists employees_hygiene_snapshot_44 (
  employee_id  uuid primary key,
  name         text,
  active       boolean,
  company_id   uuid,
  snapshot_at  timestamptz not null default now()
);

insert into employees_hygiene_snapshot_44 (employee_id, name, active, company_id)
select e.id, e.name, e.active, e.company_id
from employees e
on conflict (employee_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Backfill company_id where unambiguous.
-- ---------------------------------------------------------------------------
with derived as (
  select
    e.id as employee_id,
    (
      select j.company_id
      from job_workers w
      join jobs j on j.id = w.job_id
      where w.employee_id = e.id
        and j.company_id is not null
      group by j.company_id
      order by count(*) desc
      limit 1
    ) as company_id,
    (
      select count(distinct j.company_id)
      from job_workers w
      join jobs j on j.id = w.job_id
      where w.employee_id = e.id
        and j.company_id is not null
    ) as distinct_companies
  from employees e
  where e.company_id is null
)
update employees e
set company_id = d.company_id
from derived d
where e.id = d.employee_id
  and d.company_id is not null
  and d.distinct_companies = 1;   -- ambiguous rows are skipped on purpose

-- ---------------------------------------------------------------------------
-- 2. Deactivate employee rows that carry no money and no work history.
--    Conservative: an employee is only deactivated when EVERY money/history
--    reference is absent. Anything with a single dollar or entry is untouched.
-- ---------------------------------------------------------------------------
update employees e
set active = false
where e.active is true
  and not exists (select 1 from job_workers               x where x.employee_id = e.id)
  and not exists (select 1 from employee_earnings         x where x.employee_id = e.id)
  and not exists (select 1 from employee_payments         x where x.employee_id = e.id)
  and not exists (select 1 from employee_pay_adjustments  x where x.employee_id = e.id)
  and not exists (select 1 from employee_work_entries     x where x.employee_id = e.id)
  and not exists (select 1 from commissions              x where x.employee_id = e.id)
  and not exists (select 1 from sales_rep_stats          x where x.employee_id = e.id)
  and not exists (select 1 from sales_rep_users          x where x.employee_id = e.id)
  and not exists (select 1 from leads                    x where x.owner_employee_id = e.id)
  and not exists (select 1 from lead_activities          x where x.rep_employee_id = e.id)
  and not exists (select 1 from bookings                 x where x.assigned_rep_id = e.id)
  and not exists (select 1 from customers                x where x.sales_rep_id = e.id)
  and not exists (select 1 from territories              x where x.assigned_rep_id = e.id)
  and not exists (
    select 1 from time_entries t
    where e.member_id is not null and t.member_id = e.member_id
  );

-- ---------------------------------------------------------------------------
-- Assertions: nothing with money may have been deactivated, and no money moved.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad          integer;
  v_jw_total     numeric;
  v_earn_total   numeric;
  v_outstanding  numeric;
begin
  select count(*) into v_bad
  from employees e
  where e.active is not true
    and exists (select 1 from job_workers x where x.employee_id = e.id);
  if v_bad > 0 then
    raise exception 'Migration 44 aborted: % employee(s) with job history were deactivated', v_bad;
  end if;

  select coalesce(sum(amount_earned), 0) into v_jw_total from job_workers;
  if v_jw_total <> 10443.12 then
    raise exception 'Migration 44 aborted: job_workers total changed to %', v_jw_total;
  end if;

  select coalesce(sum(amount), 0) into v_earn_total from employee_earnings;
  if v_earn_total <> 10443.12 then
    raise exception 'Migration 44 aborted: ledger earnings changed to %', v_earn_total;
  end if;

  select coalesce(sum(outstanding), 0) into v_outstanding from employee_balances();
  if v_outstanding <> 0 then
    raise exception 'Migration 44 aborted: outstanding drifted to %', v_outstanding;
  end if;

  -- Every employee holding money must now be company-scoped.
  select count(*) into v_bad
  from employees e
  where e.company_id is null
    and exists (select 1 from job_workers x where x.employee_id = e.id);
  if v_bad > 0 then
    raise exception 'Migration 44: % employee(s) with earnings still have NULL company_id', v_bad;
  end if;
end $$;

commit;
