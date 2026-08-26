-- 021: Christmas lights lease contracts
--
-- Already applied to the live Supabase project. Kept here as the source of
-- record and for provisioning a fresh environment.
--
-- Two tables:
--   contract_templates — reusable boilerplate wording, one row per company
--   light_contracts    — one row per customer agreement

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_type text not null default 'christmas_lights',
  name text not null default 'Christmas Lights Lease',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contract_type)
);

create index if not exists contract_templates_company_idx
  on public.contract_templates (company_id);

create table if not exists public.light_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- SET NULL, not CASCADE: a signed lease must survive customer deletion.
  customer_id uuid references public.customers(id) on delete set null,
  contract_number text not null,
  -- Snapshots: the legal facts of the deal, copied not joined.
  customer_name text not null,
  service_address text,
  customer_email text,
  customer_phone text,
  price numeric(12,2),
  term_years integer check (term_years is null or (term_years >= 1 and term_years <= 25)),
  install_date date,
  takedown_date date,
  notes text,
  -- Frozen wording at finalize time.
  body_snapshot text,
  status text not null default 'draft' check (status in ('draft', 'final')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contract_number)
);

create index if not exists light_contracts_company_idx
  on public.light_contracts (company_id, created_at desc);
create index if not exists light_contracts_customer_idx
  on public.light_contracts (customer_id);

drop trigger if exists contract_templates_set_updated_at on public.contract_templates;
create trigger contract_templates_set_updated_at
  before update on public.contract_templates
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists light_contracts_set_updated_at on public.light_contracts;
create trigger light_contracts_set_updated_at
  before update on public.light_contracts
  for each row
  execute function public.update_updated_at_column();

-- RLS via get_user_company_ids() (covers owners AND active members).
alter table public.contract_templates enable row level security;

drop policy if exists contract_templates_select on public.contract_templates;
create policy contract_templates_select on public.contract_templates
  for select using (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists contract_templates_insert on public.contract_templates;
create policy contract_templates_insert on public.contract_templates
  for insert with check (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists contract_templates_update on public.contract_templates;
create policy contract_templates_update on public.contract_templates
  for update using (
    company_id in (select company_id from public.get_user_company_ids())
  ) with check (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists contract_templates_delete on public.contract_templates;
create policy contract_templates_delete on public.contract_templates
  for delete using (
    company_id in (select company_id from public.get_user_company_ids())
  );

alter table public.light_contracts enable row level security;

drop policy if exists light_contracts_select on public.light_contracts;
create policy light_contracts_select on public.light_contracts
  for select using (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists light_contracts_insert on public.light_contracts;
create policy light_contracts_insert on public.light_contracts
  for insert with check (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists light_contracts_update on public.light_contracts;
create policy light_contracts_update on public.light_contracts
  for update using (
    company_id in (select company_id from public.get_user_company_ids())
  ) with check (
    company_id in (select company_id from public.get_user_company_ids())
  );

drop policy if exists light_contracts_delete on public.light_contracts;
create policy light_contracts_delete on public.light_contracts
  for delete using (
    company_id in (select company_id from public.get_user_company_ids())
  );
