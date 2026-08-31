-- 023: Make contracts generic (any service type, not just Christmas lights)
--
-- 021 hardwired one shape of deal into the schema: price / term_years /
-- install_date / takedown_date. That works for a lights lease and for nothing
-- else — a roof soft wash has a service date and a guarantee period, a window
-- cleaning job has neither a term nor a takedown.
--
-- This migration moves the *shape* of a contract out of the table definition
-- and into the template, so adding a new service type is data entry rather
-- than a migration:
--
--   contract_templates.fields          — the field list this type collects
--   contract_templates.document_title  — the printed heading
--   contract_templates.number_prefix   — 'RSW' → RSW-2026-001
--
-- and gives each contract a frozen copy of that metadata, mirroring the
-- existing body_snapshot pattern.
--
-- ── What this deliberately does NOT do ──────────────────────────────────────
-- The price / term_years / install_date / takedown_date columns are KEPT.
-- There is already a signed contract in production whose frozen body_snapshot
-- resolves {{term_years_words}} from term_years; dropping those columns would
-- irreversibly damage an executed legal document. They simply stop being the
-- *only* possible shape. `price` also stays populated (app-side) because it is
-- the one field worth having as a real numeric column for reporting.
--
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- Template: owns the shape and identity of its contract type
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.contract_templates
  -- The printed heading, e.g. 'ROOF SOFT WASH AGREEMENT'. Distinct from
  -- `name`, which stays the short label used in the template picker.
  add column if not exists document_title text,

  -- Per-template contract number prefix. 'LEC' (lease contract) is a neutral
  -- default for a template created without one.
  add column if not exists number_prefix text not null default 'LEC',

  -- The custom field list:
  --   [{ "key": "...", "label": "...", "type": "text|money|date|number",
  --      "required": bool }]
  -- Stored as jsonb rather than a child table: it is always read and written
  -- whole, never queried by key, and keeping it inline means saving a template
  -- stays a single upsert.
  add column if not exists fields jsonb not null default '[]'::jsonb;

-- Guard against a malformed list breaking the renderer. Only the outer shape is
-- enforced here; per-entry keys are validated in app code where a useful error
-- message can be produced.
alter table public.contract_templates
  drop constraint if exists contract_templates_fields_is_array;
alter table public.contract_templates
  add constraint contract_templates_fields_is_array
  check (jsonb_typeof(fields) = 'array');

-- A prefix becomes part of a contract number, so keep it short and printable.
alter table public.contract_templates
  drop constraint if exists contract_templates_number_prefix_format;
alter table public.contract_templates
  add constraint contract_templates_number_prefix_format
  check (number_prefix ~ '^[A-Z0-9]{1,6}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- Contract: snapshots the template metadata at creation
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.light_contracts
  -- ON DELETE SET NULL: deleting a template must never cascade into executed
  -- agreements. The snapshot columns below keep the document fully renderable
  -- after the template is gone, which is the same reasoning as customer_id.
  add column if not exists template_id uuid
    references public.contract_templates(id) on delete set null,

  -- Frozen copies. Editing a template must not retitle or renumber a contract
  -- that has already been sent or signed.
  add column if not exists document_title text,
  add column if not exists number_prefix text,

  -- Values for the template's custom fields, keyed by field key:
  --   { "price": "1850.00", "service_date": "2026-04-02" }
  -- Always strings — these are raw form values, formatted for display by the
  -- renderer according to the field's declared type.
  add column if not exists field_values jsonb not null default '{}'::jsonb,

  -- Frozen copy of the template's field DEFINITIONS (labels + types).
  --
  -- field_values alone is not enough to render the terms summary: without the
  -- labels and types, "1850.00" has no caption and no $ formatting. Freezing
  -- the defs means editing or deleting a template can never relabel or
  -- reformat the terms on an already-signed agreement.
  add column if not exists field_defs jsonb not null default '[]'::jsonb;

alter table public.light_contracts
  drop constraint if exists light_contracts_field_values_is_object;
alter table public.light_contracts
  add constraint light_contracts_field_values_is_object
  check (jsonb_typeof(field_values) = 'object');

alter table public.light_contracts
  drop constraint if exists light_contracts_field_defs_is_array;
alter table public.light_contracts
  add constraint light_contracts_field_defs_is_array
  check (jsonb_typeof(field_defs) = 'array');

create index if not exists light_contracts_template_idx
  on public.light_contracts (template_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill
--
-- Existing rows predate all of the above and would otherwise render with an
-- empty heading and an empty Terms box. The lights template keeps its exact
-- current title and its 'CL' prefix so existing contract numbers stay
-- consistent, and every existing contract is stamped from its own column
-- values so it renders byte-identically to before this migration.
-- ─────────────────────────────────────────────────────────────────────────────

update public.contract_templates
set
  document_title = coalesce(document_title, 'CHRISTMAS LIGHTS LEASE AGREEMENT'),
  number_prefix = 'CL',
  fields = case
    when fields = '[]'::jsonb then '[
      {"key":"price","label":"Price","type":"money","required":false},
      {"key":"term_years","label":"Term length (years)","type":"number","required":false},
      {"key":"install_date","label":"Install date","type":"date","required":false},
      {"key":"takedown_date","label":"Takedown date","type":"date","required":false}
    ]'::jsonb
    else fields
  end
where contract_type = 'christmas_lights';

-- Any other pre-existing template: give it a title derived from its name so
-- nothing renders headless. Prefix keeps the 'LEC' default.
update public.contract_templates
set document_title = upper(name)
where document_title is null;

-- Link existing contracts to their company's template. Safe because before
-- this migration the app only ever read the single christmas_lights row.
update public.light_contracts c
set template_id = t.id
from public.contract_templates t
where c.template_id is null
  and t.company_id = c.company_id
  and t.contract_type = 'christmas_lights';

-- Stamp title, prefix and field values onto existing contracts from the data
-- they already hold. jsonb_strip_nulls keeps absent values out of the object
-- entirely rather than storing JSON nulls, so "unset" has one representation.
update public.light_contracts c
set
  document_title = coalesce(
    c.document_title,
    (select t.document_title from public.contract_templates t where t.id = c.template_id),
    'CHRISTMAS LIGHTS LEASE AGREEMENT'
  ),
  -- Derive from the number actually on the document ('CL-2026-001' → 'CL')
  -- rather than from the template, so the prefix always matches what is
  -- printed even if the template is later renamed.
  number_prefix = coalesce(
    c.number_prefix,
    nullif(split_part(c.contract_number, '-', 1), ''),
    'LEC'
  ),
  field_values = case
    when c.field_values = '{}'::jsonb then jsonb_strip_nulls(jsonb_build_object(
      'price', case when c.price is null then null
                    else trim(to_char(c.price, 'FM999999999990.00')) end,
      'term_years', case when c.term_years is null then null
                         else c.term_years::text end,
      'install_date', case when c.install_date is null then null
                           else to_char(c.install_date, 'YYYY-MM-DD') end,
      'takedown_date', case when c.takedown_date is null then null
                            else to_char(c.takedown_date, 'YYYY-MM-DD') end
    ))
    else c.field_values
  end
where c.document_title is null
   or c.number_prefix is null
   or c.field_values = '{}'::jsonb;

-- Freeze the field definitions onto existing contracts, preferring the linked
-- template's list and falling back to the lights set for orphans. Without this
-- an existing contract has values with no labels, so its Terms box would be
-- blank even though field_values is populated.
update public.light_contracts c
set field_defs = coalesce(
  (select t.fields from public.contract_templates t where t.id = c.template_id),
  '[
    {"key":"price","label":"Price","type":"money","required":false},
    {"key":"term_years","label":"Term length (years)","type":"number","required":false},
    {"key":"install_date","label":"Install date","type":"date","required":false},
    {"key":"takedown_date","label":"Takedown date","type":"date","required":false}
  ]'::jsonb
)
where c.field_defs = '[]'::jsonb;
