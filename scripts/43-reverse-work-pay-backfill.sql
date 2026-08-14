-- Reversal for migration 43.
--
-- Undoes the opening-balance backfill and restores job_workers.paid / paid_at
-- to the exact values captured in job_workers_paid_snapshot_43.
--
-- Safe to run only if you have NOT since recorded real payments through
-- Work & Pay. It deliberately refuses to run if any non-opening payment exists,
-- because deleting backfilled earnings underneath real allocations would
-- destroy money records.

begin;

do $$
declare
  v_real_payments int;
begin
  select count(*) into v_real_payments
  from employee_payments p
  where not p.is_opening;

  if v_real_payments > 0 then
    raise exception
      'Refusing to reverse: % real (non-opening) payment(s) exist. Reversing now could delete earnings that real payments are allocated against.',
      v_real_payments;
  end if;
end $$;

-- 1. Restore job_workers.paid / paid_at from the snapshot.
update job_workers w
set paid    = s.prev_paid,
    paid_at = s.prev_paid_at
from job_workers_paid_snapshot_43 s
where s.job_worker_id = w.id;

-- 2. Delete the opening payments. payment_allocations cascades from payment_id,
--    which releases the allocations without touching earnings directly.
delete from employee_payments where is_opening;

-- 3. Delete the backfilled earnings (now unallocated, so the guard triggers allow it).
delete from employee_earnings
where job_worker_id is not null
  and memo = 'Backfilled from job_workers by migration 43';

-- 4. Drop the snapshot table now that it has been consumed.
drop table if exists job_workers_paid_snapshot_43;

commit;
