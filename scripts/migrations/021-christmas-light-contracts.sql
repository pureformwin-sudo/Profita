-- 021: Christmas lights lease contracts
--
-- Two tables, because the wording and the deal are different kinds of data:
--
--   contract_templates — the boilerplate lease language, one editable body per
--     company. Paste it once, reuse it for every customer.
--   light_contracts    — one row per customer agreement: the money, the term,
--     the install/takedown dates, plus a frozen copy of the wording.
--
-- The split is what makes "edit the template" safe. If the language lived on
-- each contract row there would be no canonical version to edit; if contracts
-- only *referenced* the template, fixing a typo would silently rewrite the
-- terms of every agreement already sent to a customer.

-- ─────────────────────────────────────────────────────────────────────────────
-- Template: the pasteable boilerplate
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Room for 'gutter_cleaning', 'holiday_lighting_commercial', etc. later
  -- without another migration. UNIQUE below is on (company, type).
  contract_type text not null default 'christmas_lights',

  -- Display name shown in the picker, e.g. "Residential Lease 2026".
  name text not null default 'Christmas Lights Lease',

  -- The actual lease language, with {{tokens}} where per-customer values go.
  -- Starts empty on purpose: the owner supplies the legal wording.
  body text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, contract_type)
);

create index if not exists contract_templates_company_idx
  on public.contract_templates (company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Contracts: one per customer agreement
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.light_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- ON DELETE SET NULL, not CASCADE. A signed lease is a financial record and
  -- must survive the customer being removed from the CRM. The snapshot columns
  -- below keep the document readable after the link is gone.
  customer_id uuid references public.customers(id) on delete set null,

  -- Sequential per company, e.g. 'XL-2026-014'. Generated in app code.
  contract_number text not null,

  -- ── Snapshots, captured when the contract is created ──────────────────────
  -- Deliberately copied rather than joined. The contract must always show the
  -- name and address it was agreed for: if the customer later moves house or
  -- corrects a typo, a live join would retroactively alter a document the
  -- customer has already been sent. These are the legal facts of the deal.
  customer_name text not null,
  service_address text,
  customer_email text,
  customer_phone text,

  -- ── Editable per contract ────────────────────────────────────────────────
  -- All nullable so a contract can be saved half-filled and finished later.
  -- Completeness is enforced at finalize time, not on every keystroke.
  price numeric(12,2),
  term_years integer check (term_years is null or (term_years >= 1 and term_years <= 25)),
  install_date date,
  takedown_date date,

  -- Free-text rider for one-off arrangements (extra strands, gate codes).
  notes text,

  -- ── The document itself ──────────────────────────────────────────────────
  -- Frozen copy of the template body at finalize time. This is the whole point
  -- of the two-table split: once a contract is final, editing the company
  -- template must not change what this customer agreed to.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (reuse the shared function from 019)
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Scoped with public.get_user_company_ids(), the helper every other
-- company-scoped table uses. Do NOT hand-roll a company_members subquery here:
-- lead_scores did, and because company OWNERS have no company_members row the
-- owner could read but never insert — every write failed with a 403.
-- The helper covers owners and active members both.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- `using` AND `with check`: `using` alone would allow a row to be updated into
-- another company.
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
