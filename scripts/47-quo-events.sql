-- 47-quo-events.sql
-- Raw event log for Quo (openphone-style) call/message webhooks.
--
-- Design notes:
--  * This table is the SYSTEM OF RECORD for every delivery. We persist first and
--    resolve/link second, so a webhook is never lost because a phone number or org
--    could not be matched. Unlinked rows are queryable, not dropped.
--  * Idempotent on Quo's own event id (`quo_event_id` unique). Quo retries on
--    non-2xx, so a retry must not create duplicate rows.
--  * `company_id` is NULLABLE on purpose: an event whose orgId is not yet mapped to
--    a company still gets stored (flagged unlinked) rather than discarded or, worse,
--    attributed to the wrong tenant.
--  * Phone matching uses last-10-digits normalization because this DB contains both
--    '(559) 930-5181' and '5599602286' formats, plus '' empty strings on leads.

create table if not exists public.quo_events (
  id                uuid primary key default gen_random_uuid(),

  -- Idempotency: Quo's event id. Unique so retries are no-ops.
  quo_event_id      text not null unique,

  -- Tenancy. Nullable so unmapped orgs are still recorded (see notes above).
  company_id        uuid references public.companies(id) on delete cascade,
  quo_org_id        text,

  -- Event classification
  event_type        text not null,                -- e.g. 'message.received', 'call.completed'
  kind              text not null                 -- coarse bucket for UI/filtering
                      check (kind in ('call', 'message', 'other')),
  direction         text
                      check (direction is null or direction in ('incoming', 'outgoing')),
  status            text,                         -- provider status (completed, missed, delivered, ...)

  -- Participants
  from_number       text,
  to_number         text,
  -- Normalized last-10-digits of the counterparty number, used for matching.
  contact_number    text,

  -- Payload details
  body              text,                         -- message text (null for calls)
  duration_seconds  integer,                      -- call duration (null for messages)
  recording_url     text,
  occurred_at       timestamptz,                  -- provider timestamp
  raw               jsonb not null,               -- full original payload, always kept

  -- Best-effort links to existing CRM rows. Both nullable.
  lead_id           uuid references public.leads(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,
  lead_activity_id  uuid references public.lead_activities(id) on delete set null,

  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists quo_events_company_idx     on public.quo_events (company_id, occurred_at desc);
create index if not exists quo_events_contact_idx     on public.quo_events (contact_number);
create index if not exists quo_events_lead_idx        on public.quo_events (lead_id);
create index if not exists quo_events_customer_idx    on public.quo_events (customer_id);
create index if not exists quo_events_unlinked_idx    on public.quo_events (received_at desc)
  where company_id is null;

-- RLS: mirrors the established pattern in this database (set-returning helper,
-- not unnest). Rows with a null company_id are intentionally invisible to tenant
-- reads; they are operator/debug surface reached via the service role.
alter table public.quo_events enable row level security;

drop policy if exists quo_events_company_access on public.quo_events;
create policy quo_events_company_access on public.quo_events
  for all
  using (company_id in (select company_id from public.get_user_company_ids()))
  with check (company_id in (select company_id from public.get_user_company_ids()));

comment on table public.quo_events is
  'Raw Quo webhook deliveries (calls/messages). Persist-first, link-second: rows may have null company_id/lead_id when unmatched.';
comment on column public.quo_events.quo_event_id is
  'Provider event id. Unique — makes webhook retries idempotent.';
comment on column public.quo_events.contact_number is
  'Counterparty phone normalized to last 10 digits, for matching against inconsistent lead/customer formats.';

-- Map a Quo organization to a Profita company via the existing settings jsonb.
-- Usage: update public.companies set settings = coalesce(settings,'{}'::jsonb)
--          || jsonb_build_object('quo_org_id','<orgId>') where id = '<company-uuid>';
create index if not exists companies_quo_org_idx
  on public.companies ((settings ->> 'quo_org_id'));
