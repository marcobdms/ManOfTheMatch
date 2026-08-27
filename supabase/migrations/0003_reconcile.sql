-- Reconciliation between the frontend and ingest workstreams.
-- Run after 0001 + 0002. Idempotent.

-- 1) The notification bell's "disable" path deletes its own push_subscriptions
--    row by endpoint. 0001 only granted anon INSERT + UPDATE.
drop policy if exists push_delete on push_subscriptions;
create policy push_delete on push_subscriptions for delete using (true);

-- 2) The PWA's useLiveRealtime() subscribes to postgres_changes on these tables
--    so goals appear without waiting for the 60s poll. They must be in the
--    supabase_realtime publication (created by Supabase on project init).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixtures'
    ) then
      execute 'alter publication supabase_realtime add table public.fixtures';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events'
    ) then
      execute 'alter publication supabase_realtime add table public.match_events';
    end if;
  end if;
end $$;
