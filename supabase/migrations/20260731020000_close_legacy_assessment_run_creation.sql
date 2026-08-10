-- Applied only after the application has switched to
-- create_authorized_autopsy_run. This closes the temporary deployment window
-- in which the legacy authenticated function remained callable.

begin;

revoke execute on function public.create_autopsy_run(text,text,text,text,text)
  from authenticated, service_role;

comment on function public.create_autopsy_run(text,text,text,text,text) is
  'Legacy internal function. Candidate assessments must use create_authorized_autopsy_run so payment or preview admission is consumed.';

commit;
