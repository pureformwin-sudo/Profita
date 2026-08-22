-- Let team members read the company they belong to.
--
-- Why this exists
-- ---------------
-- The only SELECT policy on `companies` was effectively "owner_user_id =
-- auth.uid()". That means an invited non-owner (sales_rep / crew / admin) could
-- not read their OWN company row at all.
--
-- That had two visible consequences:
--
--  1. lib/permissions.ts getCompany() looks up the member's company via
--     `companies`. With the row invisible, the lookup returned null, the
--     function fell through to its "brand new user" branch, and called
--     create_company_for_user(...'My Company'). Every invited team member
--     silently got detached from the real company and dropped into an empty
--     one. The 26 stray "My Company" rows in this database are that bug's
--     accumulated output.
--
--  2. Anything reading company settings (e.g. the Quo sending number for
--     outbound texts) saw empty settings for non-owners and reported the
--     feature as unconfigured.
--
-- The fix is a read-only policy scoped through the existing
-- get_user_company_ids() helper, which is the same pattern already used by
-- customers, leads, and job_photos. It grants SELECT only — it does not let a
-- member update or delete the company.

drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
  on public.companies
  for select
  using (
    owner_user_id = auth.uid()
    or id in (select company_id from get_user_company_ids())
  );
