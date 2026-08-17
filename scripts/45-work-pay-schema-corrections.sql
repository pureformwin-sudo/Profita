-- =============================================================================
-- 45. Work & Pay schema corrections
-- =============================================================================
-- Migration 42 drifted from the spec in three ways. The ledger is still empty
-- (0 earnings, 0 payments, 0 work entries), so these are reshapes, not data
-- migrations. Fixing before the UI is built, not after.
--
--  1. comp_type had an invented 'half_day' and was MISSING the spec's type #4,
--     "Hourly + Per Job Bonus" ($20/hr PLUS a $25 bonus on a particular job).
--     Without it there is no way to record the most common real-world mix.
--
--  2. work_entry_jobs had no money column. The spec requires per-job amounts:
--     "Allow the owner to specify whether each job receives the standard
--     amount or a custom amount." A single entry-level rate cannot express
--     "job A = $75 standard, job B = $120 custom".
--
--  3. employee_work_entries had no entry_method. The spec is explicit:
--     "Store which method created the entry" (manual vs live clock).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. comp_type: drop half_day, add hourly_plus_bonus
-- -----------------------------------------------------------------------------
-- Guard: only safe while no rows use half_day. If any exist, abort loudly
-- rather than silently rewriting someone's pay basis.
do $$
declare
  n integer;
begin
  select count(*) into n from employee_work_entries where comp_type = 'half_day';
  if n > 0 then
    raise exception
      'ABORT: % work entries use comp_type=half_day. Reclassify them before running 45.', n;
  end if;
end $$;

alter table employee_work_entries
  drop constraint if exists employee_work_entries_comp_type_check;

alter table employee_work_entries
  add constraint employee_work_entries_comp_type_check
  check (comp_type in ('hourly', 'full_day', 'per_job', 'hourly_plus_bonus', 'flat'));

comment on column employee_work_entries.comp_type is
  'Spec comp types: hourly | full_day | per_job | hourly_plus_bonus | flat. '
  'full_day still records start/end times for performance analysis but pays the '
  'day rate. hourly_plus_bonus pays hours x rate PLUS work_entry_jobs.amount.';

-- -----------------------------------------------------------------------------
-- 2. Per-job money on work_entry_jobs
-- -----------------------------------------------------------------------------
-- amount is nullable on purpose:
--   NULL  => this job uses the entry's standard per-job rate (rate_snapshot)
--   set   => custom amount for THIS job, overriding the standard
-- For hourly_plus_bonus, amount is the bonus added on top of hourly pay.
alter table work_entry_jobs
  add column if not exists amount numeric(10, 2)
    check (amount is null or amount >= 0);

alter table work_entry_jobs
  add column if not exists amount_kind text not null default 'standard'
    check (amount_kind in ('standard', 'custom', 'bonus'));

comment on column work_entry_jobs.amount is
  'Per-job money. NULL = use the entry standard rate. Set = custom amount for '
  'this job, or the bonus when comp_type=hourly_plus_bonus.';

comment on column work_entry_jobs.amount_kind is
  'standard = inherit entry rate (amount must be NULL); custom = per-job override; '
  'bonus = added on top of hourly pay.';

-- Keep amount and amount_kind honest about each other: 'standard' means
-- "inherit", so carrying a number there would be ambiguous about which wins.
alter table work_entry_jobs
  drop constraint if exists work_entry_jobs_amount_kind_agrees;

alter table work_entry_jobs
  add constraint work_entry_jobs_amount_kind_agrees
  check (
    (amount_kind = 'standard' and amount is null)
    or (amount_kind in ('custom', 'bonus') and amount is not null)
  );

-- -----------------------------------------------------------------------------
-- 3. entry_method: manual vs live clock
-- -----------------------------------------------------------------------------
alter table employee_work_entries
  add column if not exists entry_method text not null default 'manual'
    check (entry_method in ('manual', 'clock'));

comment on column employee_work_entries.entry_method is
  'How the entry was created. Both paths are first-class per spec: the owner may '
  'type hours at end of day (manual) or use Clock In/Out (clock).';

commit;
