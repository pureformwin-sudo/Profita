-- Migration 46: Work & Pay atomic write path.
--
-- Why these are SQL functions and not TypeScript:
--
-- 1. A work entry and its earning must appear together or not at all. The
--    Supabase JS client cannot wrap two inserts in one transaction, so doing
--    this client-side leaves a window where a work entry exists with no
--    earning - hours recorded, money invisible.
--
-- 2. Allocating a payment requires reading open earnings and writing
--    allocations with nothing else interleaving. Without SELECT ... FOR UPDATE,
--    two payments recorded at once can both allocate the same open earning and
--    overpay it. The trigger from migration 42 would reject the second write,
--    but only after the first had already been applied - a confusing failure.
--
-- 3. Money math lives server-side so a UI bug cannot write a wrong amount.
--    lib/work-pay-math.ts mirrors this logic for preview only; the values
--    stored are always the ones computed here. scripts/test-work-pay-parity.ts
--    asserts the two agree.

begin;

-- Optional pay period on a payment ("this covers Aug 1-15"). The spec asks for
-- it in Record Payment; migration 42 missed it.
alter table employee_payments
  add column if not exists pay_period_start date,
  add column if not exists pay_period_end date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_payments'::regclass
      and conname = 'employee_payments_pay_period_order'
  ) then
    alter table employee_payments
      add constraint employee_payments_pay_period_order
      check (
        (pay_period_start is null and pay_period_end is null)
        or (pay_period_start is not null and pay_period_end is not null
            and pay_period_end >= pay_period_start)
      );
  end if;
end $$;

-- Idempotency must be per company, and only when a key was supplied.
create unique index if not exists employee_payments_idempotency_uniq
  on employee_payments (company_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Hours worked, as decimal hours. Mirrors computeHours() in work-pay-math.ts.
-- ---------------------------------------------------------------------------
create or replace function work_entry_hours(
  p_start timestamptz,
  p_end timestamptz,
  p_break_minutes integer default 0,
  p_hours_override numeric default null
) returns numeric
language plpgsql
immutable
as $$
declare
  v_break_hours numeric := greatest(0, coalesce(p_break_minutes, 0)) / 60.0;
  v_end timestamptz := p_end;
  v_gross numeric;
  v_paid numeric;
begin
  -- An override is the paid figure already; subtracting the break again would
  -- double count it.
  if p_hours_override is not null then
    return greatest(0, p_hours_override);
  end if;

  if p_start is null or v_end is null then
    return 0;
  end if;

  -- Overnight shift: 9:00 PM -> 5:00 AM is 8 hours, not negative.
  if v_end <= p_start then
    v_end := v_end + interval '1 day';
  end if;

  v_gross := extract(epoch from (v_end - p_start)) / 3600.0;
  v_paid := v_gross - v_break_hours;

  -- A break longer than the shift is bad input, not negative pay.
  return greatest(0, v_paid);
end;
$$;

-- ---------------------------------------------------------------------------
-- What a work entry earned. Mirrors computeEarning() in work-pay-math.ts.
--
-- p_jobs is [{"amount_kind":"standard|custom|bonus","amount":123.45}, ...]
-- Rounds once, at the end.
-- ---------------------------------------------------------------------------
create or replace function compute_work_entry_amount(
  p_comp_type text,
  p_rate numeric,
  p_hours numeric,
  p_flat_amount numeric default null,
  p_jobs jsonb default '[]'::jsonb
) returns numeric
language plpgsql
immutable
as $$
declare
  v_total numeric := 0;
  v_job jsonb;
  v_kind text;
  v_amount numeric;
begin
  if p_comp_type = 'hourly' then
    v_total := coalesce(p_hours, 0) * coalesce(p_rate, 0);

  elsif p_comp_type = 'full_day' then
    -- Hours are recorded for analysis but never change the payout.
    v_total := coalesce(p_rate, 0);

  elsif p_comp_type = 'per_job' then
    for v_job in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
      v_kind := coalesce(v_job->>'amount_kind', 'standard');
      -- A bonus line has no meaning without hourly pay behind it; ignore it
      -- here rather than silently inflating a per-job total.
      if v_kind = 'bonus' then
        continue;
      elsif v_kind = 'custom' then
        v_total := v_total + coalesce((v_job->>'amount')::numeric, 0);
      else
        v_total := v_total + coalesce(p_rate, 0);
      end if;
    end loop;

  elsif p_comp_type = 'hourly_plus_bonus' then
    v_total := coalesce(p_hours, 0) * coalesce(p_rate, 0);
    -- Only explicit bonus lines add money. Counting 'standard' jobs here too
    -- would pay for the same work twice: once via hours, once per job.
    for v_job in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
      if coalesce(v_job->>'amount_kind', 'standard') = 'bonus' then
        v_total := v_total + coalesce((v_job->>'amount')::numeric, 0);
      end if;
    end loop;

  elsif p_comp_type = 'flat' then
    v_total := coalesce(p_flat_amount, 0);

  else
    raise exception 'Unknown compensation type: %', p_comp_type;
  end if;

  return round(v_total, 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a work entry, its job links, and its earning - atomically.
-- ---------------------------------------------------------------------------
create or replace function record_work_entry(
  p_company_id uuid,
  p_employee_id uuid,
  p_work_date date,
  p_comp_type text,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_break_minutes integer default 0,
  p_hours_override numeric default null,
  p_rate numeric default null,
  p_flat_amount numeric default null,
  p_notes text default null,
  p_entry_method text default 'manual',
  p_jobs jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_entry_id uuid;
  v_hours numeric;
  v_rate numeric := p_rate;
  v_rate_source text := 'override';
  v_amount numeric;
  v_job jsonb;
begin
  -- Fall back to the effective-dated rate for the work date, so a raise next
  -- month never restates this entry (migrations 40/41).
  if v_rate is null and p_comp_type <> 'flat' then
    select pay_rate into v_rate from employee_rate_on(p_employee_id, p_work_date);
    v_rate_source := 'history';
  end if;

  v_hours := work_entry_hours(p_start, p_end, p_break_minutes, p_hours_override);
  v_amount := compute_work_entry_amount(p_comp_type, v_rate, v_hours, p_flat_amount, p_jobs);

  insert into employee_work_entries (
    company_id, employee_id, work_date, comp_type,
    start_time, end_time, break_minutes, hours_override,
    rate_snapshot, rate_source, computed_amount, notes, entry_method, created_by
  ) values (
    p_company_id, p_employee_id, p_work_date, p_comp_type,
    p_start, p_end, coalesce(p_break_minutes, 0), p_hours_override,
    v_rate, v_rate_source, v_amount, p_notes, coalesce(p_entry_method, 'manual'), auth.uid()
  )
  returning id into v_entry_id;

  for v_job in select * from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) loop
    insert into work_entry_jobs (company_id, work_entry_id, job_id, job_worker_id, amount_kind, amount)
    values (
      p_company_id,
      v_entry_id,
      (v_job->>'job_id')::uuid,
      nullif(v_job->>'job_worker_id', '')::uuid,
      coalesce(v_job->>'amount_kind', 'standard'),
      case when coalesce(v_job->>'amount_kind','standard') = 'standard'
           then null else (v_job->>'amount')::numeric end
    );
  end loop;

  -- Zero-dollar entries still record hours (e.g. unpaid training), but an
  -- earning row of $0 would clutter the ledger with nothing to pay.
  if v_amount > 0 then
    insert into employee_earnings (company_id, employee_id, amount, earned_on, kind, work_entry_id, created_by)
    values (p_company_id, p_employee_id, v_amount, p_work_date, 'work', v_entry_id, auth.uid());
  end if;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a payment and allocate it across open earnings, oldest first.
--
-- Mirrors planAllocation() in work-pay-math.ts, including the id tiebreak, so
-- the UI preview matches what actually gets written.
-- ---------------------------------------------------------------------------
create or replace function apply_employee_payment(
  p_company_id uuid,
  p_employee_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text default null,
  p_memo text default null,
  p_pay_period_start date default null,
  p_pay_period_end date default null,
  p_expense_id uuid default null,
  p_idempotency_key text default null,
  p_is_opening boolean default false
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_payment_id uuid;
  v_remaining numeric;
  v_earning record;
  v_take numeric;
  v_open numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  -- Retry safety: a double-submitted form returns the original payment instead
  -- of paying twice.
  if p_idempotency_key is not null then
    select id into v_payment_id
      from employee_payments
     where company_id = p_company_id
       and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  insert into employee_payments (
    company_id, employee_id, amount, paid_on, method, memo,
    pay_period_start, pay_period_end, expense_id, idempotency_key, is_opening, created_by
  ) values (
    p_company_id, p_employee_id, round(p_amount, 2), p_paid_on, p_method, p_memo,
    p_pay_period_start, p_pay_period_end, p_expense_id, p_idempotency_key,
    coalesce(p_is_opening, false), auth.uid()
  )
  returning id into v_payment_id;

  v_remaining := round(p_amount, 2);

  -- FOR UPDATE serializes concurrent payments for this employee. Without it two
  -- simultaneous payments can both see the same earning as open.
  for v_earning in
    select e.id,
           e.amount,
           coalesce((select sum(a.amount) from payment_allocations a where a.earning_id = e.id), 0) as allocated
      from employee_earnings e
     where e.employee_id = p_employee_id
       and e.company_id = p_company_id
     order by e.earned_on, e.id
     for update of e
  loop
    exit when v_remaining <= 0;

    v_open := round(v_earning.amount - v_earning.allocated, 2);
    if v_open <= 0 then
      continue;
    end if;

    v_take := least(v_open, v_remaining);

    insert into payment_allocations (company_id, payment_id, earning_id, amount)
    values (p_company_id, v_payment_id, v_earning.id, v_take);

    v_remaining := round(v_remaining - v_take, 2);
  end loop;

  -- Anything left over stays unallocated on the payment. That is a credit
  -- against future work, not an error, and employee_balances() surfaces it.
  return v_payment_id;
end;
$$;

grant execute on function work_entry_hours(timestamptz, timestamptz, integer, numeric) to authenticated;
grant execute on function compute_work_entry_amount(text, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function record_work_entry(uuid, uuid, date, text, timestamptz, timestamptz, integer, numeric, numeric, numeric, text, text, jsonb) to authenticated;
grant execute on function apply_employee_payment(uuid, uuid, numeric, date, text, text, date, date, uuid, text, boolean) to authenticated;

commit;
