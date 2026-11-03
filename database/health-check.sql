-- Install once in the existing Undercover project. No game tables are accessed.
begin;
create function public.uc_pilot_health()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true; $$;

revoke all on function public.uc_pilot_health() from public, anon, authenticated;
grant execute on function public.uc_pilot_health() to anon;
comment on function public.uc_pilot_health() is
  'Undercover pilot: read-only database liveness probe; returns only true, no user data.';
commit;
