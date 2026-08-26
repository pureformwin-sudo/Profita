-- 022: Customer e-signature for light contracts
--
-- Already applied to the live Supabase project. Recorded here so a fresh
-- environment gets the signing columns — without this file the /sign route
-- 500s on a new database, because every column below is missing.
--
-- Adds a customer-facing signing flow to light_contracts. The customer never
-- logs in: they open /sign/<share_token>, where the unguessable token IS the
-- authorization. Reads and writes on that route go through the service-role
-- client, so no anon RLS policy is added here on purpose — see the note at the
-- bottom.

-- ─────────────────────────────────────────────────────────────────────────────
-- Share link
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.light_contracts
  -- The capability URL. Nullable because a contract has no link until it is
  -- shared, and UNIQUE below is partial for exactly that reason.
  add column if not exists share_token text,
  add column if not exists shared_at timestamptz;

-- Partial unique index: many contracts legitimately have share_token IS NULL,
-- and in Postgres NULLs don't collide under UNIQUE — but the partial predicate
-- keeps the index small and makes the intent explicit. Token lookup on the
-- public route hits this index.
create unique index if not exists light_contracts_share_token_key
  on public.light_contracts (share_token)
  where share_token is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Signature payload
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.light_contracts
  -- 'typed' (rendered in a script face) or 'drawn' (a PNG data URL).
  add column if not exists signature_kind text,
  add column if not exists signature_name text,
  -- data:image/png;base64,... Only populated when kind = 'drawn'.
  add column if not exists signature_image text,
  add column if not exists signed_at timestamptz,

  -- Signing evidence, captured server-side from the request. Never accepted
  -- from the client — a self-reported IP would be worthless.
  add column if not exists signer_ip text,
  add column if not exists signer_user_agent text,

  -- The company's countersignature, applied when the contract is finalized so
  -- the customer sees an already-executed document rather than a blank line.
  add column if not exists company_signature_name text,
  add column if not exists company_signed_at timestamptz;

alter table public.light_contracts
  drop constraint if exists light_contracts_signature_kind_check;
alter table public.light_contracts
  add constraint light_contracts_signature_kind_check
  check (signature_kind is null or signature_kind in ('typed', 'drawn'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 'signed' status
-- ─────────────────────────────────────────────────────────────────────────────

-- Widen the status domain: draft → final → signed.
alter table public.light_contracts
  drop constraint if exists light_contracts_status_check;
alter table public.light_contracts
  add constraint light_contracts_status_check
  check (status in ('draft', 'final', 'signed'));

-- The real backstop. Application code enforces all of this too, but a bug or a
-- stray SQL UPDATE must not be able to mark a contract signed without the
-- evidence that makes it a signature. Requires, when status = 'signed':
--   • a timestamp, a kind, and a non-blank name
--   • body_snapshot — the frozen wording the customer actually agreed to;
--     a signature against mutable terms is meaningless
--   • an image whenever kind = 'drawn'
alter table public.light_contracts
  drop constraint if exists light_contracts_signed_requires_evidence;
alter table public.light_contracts
  add constraint light_contracts_signed_requires_evidence
  check (
    status <> 'signed'
    or (
      signed_at is not null
      and signature_kind is not null
      and signature_name is not null
      and length(btrim(signature_name)) > 0
      and body_snapshot is not null
      and (signature_kind <> 'drawn' or signature_image is not null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS note
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No policy is added for the anonymous signer. An unauthenticated visitor has
-- no session for get_user_company_ids() to key off, so the existing owner/member
-- policies would reject them; lib/contract-signing.ts therefore uses the
-- service-role client, which bypasses RLS entirely.
--
-- The consequence worth remembering: the share token is the ONLY thing guarding
-- a contract on that route. Treat these URLs as secrets — anyone holding one can
-- read the contract and sign it once. Signing is deliberately one-shot (a second
-- attempt returns the original signature rather than overwriting it), so a
-- leaked link cannot be used to replace a signature that already exists.
