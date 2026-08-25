-- 020: Lead scoring
--
-- One row per customer holding the AI home-value estimate and any manual
-- override. Lifetime spend is deliberately NOT stored here: it is derived from
-- invoices + jobs at read time, so it can never drift out of sync with the
-- books. Only the expensive, external-API-derived value is cached.

create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,

  -- ── AI estimate ──────────────────────────────────────────────────────────
  -- Nullable on purpose: a customer whose address can't identify a property
  -- gets a row with a null estimate and a reason, NOT a fabricated number.
  estimated_home_value numeric(12,2),
  value_low numeric(12,2),
  value_high numeric(12,2),

  -- 'property' = resolved to a specific address, 'area' = city/ZIP median only,
  -- 'none' = address unusable. Drives the badge in the UI.
  value_basis text check (value_basis in ('property', 'area', 'none')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  confidence_note text,

  -- True when the city/state was assumed from the company service area rather
  -- than present in the customer's own address. Such an estimate describes a
  -- property we *believe* is theirs, so the UI must say so.
  locality_assumed boolean not null default false,

  -- Exact address string sent to the model. Kept so a later estimate can be
  -- compared against a corrected address, and so the number is auditable.
  address_used text,
  model text,
  estimated_at timestamptz,

  -- ── Manual override ──────────────────────────────────────────────────────
  -- Always wins over the AI estimate. Separate column rather than overwriting
  -- the estimate so re-running the AI never silently discards human knowledge.
  override_home_value numeric(12,2),
  override_note text,
  override_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One score row per customer.
  unique (customer_id)
);

comment on table public.lead_scores is
  'Cached AI home-value estimate + manual override per customer. Lifetime spend and the composite score are computed at read time, never stored.';
comment on column public.lead_scores.override_home_value is
  'Human-entered value. Takes precedence over estimated_home_value in all scoring.';

create index if not exists lead_scores_company_idx
  on public.lead_scores (company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Per gotcha 0a: a table with RLS on and only a SELECT policy rejects every
-- write with 42501, silently. This app reads, inserts, updates AND deletes
-- these rows, so every command gets a policy.
--
-- Scoping goes through company_members (not companies.owner_user_id) so invited
-- admins/dispatchers can use the feature, not just the owner.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lead_scores enable row level security;

drop policy if exists lead_scores_select on public.lead_scores;
create policy lead_scores_select on public.lead_scores
  for select using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists lead_scores_insert on public.lead_scores;
create policy lead_scores_insert on public.lead_scores
  for insert with check (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists lead_scores_update on public.lead_scores;
create policy lead_scores_update on public.lead_scores
  for update using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists lead_scores_delete on public.lead_scores;
create policy lead_scores_delete on public.lead_scores
  for delete using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Keep updated_at honest.
create or replace function public.touch_lead_scores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lead_scores_touch_updated_at on public.lead_scores;
create trigger lead_scores_touch_updated_at
  before update on public.lead_scores
  for each row
  execute function public.touch_lead_scores_updated_at();

-- Per gotcha 6: without this, PostgREST reports "Could not find the table in
-- the schema cache" until it happens to reload on its own.
notify pgrst, 'reload schema';
