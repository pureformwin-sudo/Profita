-- =============================================================================
-- 38 - Atomic job-timer session transitions
-- =============================================================================
-- Fixes the "On the way -> Start Job" bug where the travel segment stayed open,
-- no work segment was created, and the job status never changed - yet the UI
-- reported success.
--
-- The whole transition must be all-or-nothing:
--   1. close the open travel (or other) segment at T
--   2. open a new work segment at exactly the same T
--   3. advance job status to 'In progress'
--
-- A plpgsql function runs inside a single implicit transaction, so either every
-- step commits or none of them do. That is what makes this atomic - the previous
-- version issued 3 separate round trips from the browser, any of which could
-- fail independently and leave the timer in a torn state.
--
-- Idempotent by design: if a work segment is ALREADY running for this job/actor
-- it is returned untouched, so double-tapping "Start Job" can never reset the
-- running timer to 00:00:00 or create a duplicate session.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.start_job_work_session(p_job_id uuid)
returns public.time_entries
language plpgsql
-- SECURITY INVOKER (the default): RLS on time_entries and jobs still applies,
-- so this function can never be used to touch another tenant's data.
security invoker
as $$
declare
  v_user      uuid := auth.uid();
  v_member    uuid;
  v_company   uuid;
  v_now       timestamptz := now();
  v_existing  public.time_entries;
  v_result    public.time_entries;
  v_status    text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Company comes from the job itself, so it is always consistent with the job
  -- being timed (and RLS guarantees the caller can see this job).
  select j.company_id, j.status into v_company, v_status
  from public.jobs j
  where j.id = p_job_id;

  if v_company is null and v_status is null then
    raise exception 'JOB_NOT_FOUND';
  end if;

  -- Owners have no company_members row; member_id stays null and attribution
  -- falls back to user_id (script 37 made member_id nullable for exactly this).
  select cm.id into v_member
  from public.company_members cm
  where cm.user_id = v_user
    and cm.company_id = v_company
  limit 1;

  -- ---------------------------------------------------------------------------
  -- Idempotency: already running WORK on this job -> return it unchanged.
  -- Row is locked so concurrent double-taps serialize instead of racing.
  -- ---------------------------------------------------------------------------
  select * into v_existing
  from public.time_entries te
  where te.job_id = p_job_id
    and te.end_time is null
    and te.entry_type = 'work'
    and (te.user_id = v_user or (v_member is not null and te.member_id = v_member))
  order by te.start_time desc
  limit 1
  for update;

  if v_existing.id is not null then
    return v_existing;
  end if;

  -- ---------------------------------------------------------------------------
  -- Close every other open segment for this actor on this job (travel/break) at
  -- exactly v_now. The duration trigger from script 37 computes the duration.
  -- This MUST happen before the insert: the partial unique index only permits
  -- one open segment per actor per job.
  -- ---------------------------------------------------------------------------
  update public.time_entries te
  set end_time = v_now
  where te.job_id = p_job_id
    and te.end_time is null
    and (te.user_id = v_user or (v_member is not null and te.member_id = v_member));

  -- ---------------------------------------------------------------------------
  -- Open the work segment at the SAME timestamp, so there is no gap or overlap
  -- between travel ending and work beginning.
  -- ---------------------------------------------------------------------------
  insert into public.time_entries (
    company_id, job_id, member_id, user_id, entry_type, start_time, created_by
  )
  values (
    v_company, p_job_id, v_member, v_user, 'work', v_now, v_user
  )
  returning * into v_result;

  -- ---------------------------------------------------------------------------
  -- Advance status, never regressing a billing state.
  -- ---------------------------------------------------------------------------
  if v_status is not null
     and v_status not in ('Completed', 'Invoiced', 'Paid', 'Closed', 'In progress') then
    update public.jobs set status = 'In progress' where id = p_job_id;
  end if;

  return v_result;
end;
$$;

comment on function public.start_job_work_session(uuid) is
  'Atomically closes any open travel/break segment and opens a work segment at the same instant, then advances job status to In progress. Idempotent when work is already running.';

grant execute on function public.start_job_work_session(uuid) to authenticated;

-- =============================================================================
-- Verification
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'start_job_work_session'
  ) then
    raise exception 'start_job_work_session was not created';
  end if;
  raise notice 'OK: start_job_work_session(uuid) is installed';
end $$;
