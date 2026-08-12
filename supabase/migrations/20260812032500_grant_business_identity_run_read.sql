-- The authenticated Business Details endpoint uses its server-only client to
-- confirm that the requested run belongs to the caller and has a qualifying
-- completed verdict. RLS remains enabled; this restores only the table read
-- privilege required by that owner-bound lookup.
grant select on public.autopsy_runs to service_role;
