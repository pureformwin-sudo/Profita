-- ---------------------------------------------------------------------------
-- 39. Payment method analytics
--
-- Aggregates collected revenue by payment method in SQL instead of shipping
-- every income row to the browser.
--
-- Design notes:
--
-- * Source of truth is `income`, NOT `payments`. recordPayment() mirrors every
--   payment into income, so income is the superset the Finances "Income" card
--   already sums ($55,605 / 169 rows vs $31,230 / 86 rows). Aggregating over
--   payments would under-report collected revenue by ~$24k and would not
--   reconcile with the rest of the Finances page.
--
-- * SECURITY INVOKER (the default) is deliberate. The existing RLS policy
--   `income_company_select` already scopes rows via get_user_company_ids(), so
--   running as the caller reuses that policy verbatim. A SECURITY DEFINER
--   function would bypass RLS and force us to re-implement tenant scoping by
--   hand -- a needless way to leak another company's revenue.
--
-- * Method labels are normalised with lower(btrim(...)) before grouping,
--   because the live data contains both 'Venmo' and 'venmo'. Naive grouping
--   splits one method into two rows. Blank/NULL methods collapse to
--   'unspecified' so their money is never silently dropped from the totals.
--
-- * Only rows whose payment_status is paid-like count as collected. The live
--   data contains both 'Paid' and 'paid', so this is compared case-insensitively
--   too. Rows with a NULL status are treated as collected, matching how
--   getIncome()/the Income card already behave.
-- ---------------------------------------------------------------------------

-- Shared predicate: is this income row actually collected money?
create or replace function public.income_is_collected(p_status text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_status is null
      or lower(btrim(p_status)) in ('paid', 'completed', 'complete', 'received');
$$;

comment on function public.income_is_collected(text) is
  'Case-insensitive paid check for income rows. NULL counts as collected to match getIncome().';

-- Normalised, display-ready method key.
create or replace function public.normalize_payment_method(p_method text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(nullif(lower(btrim(p_method)), ''), 'unspecified');
$$;

comment on function public.normalize_payment_method(text) is
  'Lowercases and trims a payment method so Venmo/venmo group together; blanks become "unspecified".';

-- ---------------------------------------------------------------------------
-- Totals per method for an optional [p_from, p_to] date window.
-- Both bounds are inclusive; NULL means unbounded.
-- ---------------------------------------------------------------------------
create or replace function public.payment_method_totals(
  p_from date default null,
  p_to   date default null
)
returns table (
  method            text,
  transaction_count bigint,
  gross_amount      numeric,
  first_payment     date,
  last_payment      date,
  avg_amount        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.normalize_payment_method(i.payment_method) as method,
    count(*)                                          as transaction_count,
    coalesce(sum(i.amount), 0)                        as gross_amount,
    min(i.date)                                       as first_payment,
    max(i.date)                                       as last_payment,
    coalesce(avg(i.amount), 0)                        as avg_amount
  from public.income i
  where public.income_is_collected(i.payment_status)
    and (p_from is null or i.date >= p_from)
    and (p_to   is null or i.date <= p_to)
  group by 1
  order by gross_amount desc, method asc;
$$;

comment on function public.payment_method_totals(date, date) is
  'Collected revenue grouped by normalised payment method. RLS-scoped via SECURITY INVOKER.';

-- ---------------------------------------------------------------------------
-- Month-by-method trend, for the stacked monthly view.
-- ---------------------------------------------------------------------------
create or replace function public.payment_method_monthly(
  p_from date default null,
  p_to   date default null
)
returns table (
  month             date,
  method            text,
  transaction_count bigint,
  gross_amount      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', i.date)::date                 as month,
    public.normalize_payment_method(i.payment_method) as method,
    count(*)                                          as transaction_count,
    coalesce(sum(i.amount), 0)                        as gross_amount
  from public.income i
  where public.income_is_collected(i.payment_status)
    and (p_from is null or i.date >= p_from)
    and (p_to   is null or i.date <= p_to)
  group by 1, 2
  order by month desc, gross_amount desc;
$$;

comment on function public.payment_method_monthly(date, date) is
  'Collected revenue by month and normalised payment method. RLS-scoped via SECURITY INVOKER.';

-- ---------------------------------------------------------------------------
-- Processing fees, read from `payments` because income has no fee columns and
-- no payment_id to join on.
--
-- Returns one row per method that has a recorded fee. Today every fee is 0 and
-- fee_paid_by is entirely NULL, so this returns no rows and the UI hides the
-- panel entirely rather than rendering a wall of $0.00. It starts producing
-- data automatically once real fees are recorded.
-- ---------------------------------------------------------------------------
create or replace function public.payment_method_fees(
  p_from date default null,
  p_to   date default null
)
returns table (
  method         text,
  payment_count  bigint,
  gross_amount   numeric,
  total_fees     numeric,
  net_amount     numeric,
  fee_rate       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.normalize_payment_method(p.payment_method) as method,
    count(*)                                          as payment_count,
    coalesce(sum(p.amount), 0)                        as gross_amount,
    coalesce(sum(p.processing_fee), 0)                as total_fees,
    -- net_amount can be NULL on older rows; fall back to gross - fee.
    coalesce(sum(coalesce(p.net_amount, p.amount - coalesce(p.processing_fee, 0))), 0) as net_amount,
    case
      when coalesce(sum(p.amount), 0) > 0
        then round(coalesce(sum(p.processing_fee), 0) / sum(p.amount) * 100, 2)
      else 0
    end                                               as fee_rate
  from public.payments p
  where lower(btrim(coalesce(p.status, 'completed'))) in ('completed', 'complete', 'paid', 'succeeded')
    and coalesce(p.processing_fee, 0) > 0
    and (p_from is null or p.payment_date >= p_from)
    and (p_to   is null or p.payment_date <= p_to)
  group by 1
  having coalesce(sum(p.processing_fee), 0) > 0
  order by total_fees desc;
$$;

comment on function public.payment_method_fees(date, date) is
  'Gross/fee/net per method from payments. Returns no rows until real fees exist, so the UI can hide the panel.';

grant execute on function public.income_is_collected(text)          to authenticated;
grant execute on function public.normalize_payment_method(text)      to authenticated;
grant execute on function public.payment_method_totals(date, date)   to authenticated;
grant execute on function public.payment_method_monthly(date, date)  to authenticated;
grant execute on function public.payment_method_fees(date, date)     to authenticated;
