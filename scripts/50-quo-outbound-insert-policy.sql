-- quo_outbound_messages had RLS enabled but ONLY a SELECT policy.
-- With RLS on and no INSERT policy, Postgres denies every insert (42501), so the
-- outbound audit log could never be written by anyone -- owner or member. The
-- table sat at 0 rows while sends were actually being attempted.
--
-- This adds the missing INSERT policy. A row may only be written when:
--   * it is attributed to the caller (user_id = auth.uid()), so a user cannot
--     forge audit rows on behalf of someone else, AND
--   * it belongs to a company the caller is actually a member of.
--
-- SELECT policy is left exactly as-is.

create policy quo_outbound_insert_own_company
  on public.quo_outbound_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and company_id in (
      select company_id from get_user_company_ids()
    )
  );
