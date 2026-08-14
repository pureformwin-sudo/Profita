-- Reversal for migration 44 (scripts/44-employee-hygiene.sql).
-- Restores employees.active and employees.company_id to their pre-migration
-- values from employees_hygiene_snapshot_44. Deletes nothing.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees_hygiene_snapshot_44'
  ) then
    raise exception 'Cannot reverse: employees_hygiene_snapshot_44 is missing';
  end if;
end $$;

update employees e
set active     = s.active,
    company_id = s.company_id
from employees_hygiene_snapshot_44 s
where e.id = s.employee_id
  and (e.active is distinct from s.active
    or e.company_id is distinct from s.company_id);

-- Verify the restore is exact before committing.
do $$
declare v_diff integer;
begin
  select count(*) into v_diff
  from employees e
  join employees_hygiene_snapshot_44 s on s.employee_id = e.id
  where e.active is distinct from s.active
     or e.company_id is distinct from s.company_id;
  if v_diff > 0 then
    raise exception 'Reversal incomplete: % employee row(s) still differ', v_diff;
  end if;
end $$;

commit;
