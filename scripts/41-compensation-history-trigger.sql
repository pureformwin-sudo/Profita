-- =============================================================================
-- 41 - Close the previous open compensation row automatically
-- =============================================================================
-- Fixes: inserting a rate change failed with
--   duplicate key value violates unique constraint
--   "comp_history_one_open_per_employee"
--
-- Migration 40 added a unique index allowing only ONE open-ended row
-- (effective_to is null) per employee, but nothing ever closed the previous
-- open row. The client comment claimed a trigger did this; no such trigger
-- existed, so every rate change was guaranteed to fail.
--
-- This is also why a naive fix is wrong: the failing case backdated to
-- 2026-08-07 while the seeded row opened 2026-08-13. Closing the older row at
-- (new.effective_from - 1) would have written effective_to = 2026-08-06 onto a
-- row whose effective_from = 2026-08-13, violating comp_history_valid_range.
--
-- Money safety: this only sequences rows inside
-- employee_compensation_history. job_workers is untouched, and no rate VALUE is
-- ever altered - only the window it applies to.
-- =============================================================================

create or replace function public.comp_history_close_previous()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  open_row public.employee_compensation_history;
begin
  -- Default the company from the employee so RLS company scoping works even
  -- when the client does not send it.
  if new.company_id is null then
    select e.company_id into new.company_id
    from public.employees e
    where e.id = new.employee_id;
  end if;

  -- Explicitly historical inserts (already closed) need no sequencing.
  if new.effective_to is not null then
    return new;
  end if;

  select *
    into open_row
    from public.employee_compensation_history
   where employee_id = new.employee_id
     and effective_to is null
   limit 1;

  -- First ever row for this employee.
  if open_row.id is null then
    return new;
  end if;

  if new.effective_from > open_row.effective_from then
    -- Normal forward-dated change: the old rate ends the day before the new
    -- one starts, leaving no gap and no overlap.
    update public.employee_compensation_history
       set effective_to = new.effective_from - 1
     where id = open_row.id;
    return new;

  elsif new.effective_from = open_row.effective_from then
    -- Same-day correction. Closing the old row would need
    -- effective_to = effective_from - 1, which the range check forbids, and the
    -- old row covered zero elapsed days anyway. Update it in place and cancel
    -- the insert so exactly one row survives for that date.
    update public.employee_compensation_history
       set pay_type        = new.pay_type,
           pay_rate        = new.pay_rate,
           commission_rate = new.commission_rate,
           commission_type = new.commission_type,
           note            = coalesce(new.note, note)
     where id = open_row.id;
    return null;

  else
    -- Backdated change: the new row describes an EARLIER window than the row
    -- that is currently open. The existing row stays open (it is still the
    -- present rate) and the new row is bounded to end where that row begins.
    -- This is what makes backdating safe rather than a constraint violation.
    new.effective_to := open_row.effective_from - 1;
    return new;
  end if;
end;
$$;

comment on function public.comp_history_close_previous is
  'Keeps employee_compensation_history non-overlapping: closes the prior open row for forward-dated changes, updates in place for same-day corrections, and bounds backdated rows so they end where the current open row begins.';

drop trigger if exists comp_history_close_previous_trg
  on public.employee_compensation_history;

create trigger comp_history_close_previous_trg
  before insert on public.employee_compensation_history
  for each row
  execute function public.comp_history_close_previous();
