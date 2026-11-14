begin;

-- One revocable bearer link per company. The token itself never enters a table.
create table public.planner_links (
 company_id uuid primary key references public.companies(id) on delete cascade,
 token_hash bytea not null unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.planner_links enable row level security;
revoke all on public.planner_links from public, anon, authenticated;

create table public.planner_save_receipts (
 company_id uuid not null references public.companies(id) on delete cascade,
 operation_id uuid not null,
 token_hash bytea not null,
 payload_hash bytea not null,
 version bigint not null,
 created_at timestamptz not null default now(),
 primary key(company_id,operation_id)
);
alter table public.planner_save_receipts enable row level security;
revoke all on public.planner_save_receipts from public, anon, authenticated;

create function private.rotate_planner_link(p_company uuid) returns text
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.workspace_documents where company_id=p_company and jsonb_typeof(state->'current'->'employees')='array') then raise exception 'WORKSPACE_NOT_READY'; end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.planner_links(company_id,token_hash,created_by)
 values(p_company,sha256(convert_to(token,'UTF8')),auth.uid())
 on conflict(company_id) do update set token_hash=excluded.token_hash,created_by=excluded.created_by,created_at=now();
 return token;
end $$;

create function private.revoke_planner_link(p_company uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 delete from public.planner_links where company_id=p_company;
end $$;

-- Explicit projection prevents future administrative document fields from leaking via a link.
create function private.planner_visible_state(p_body jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'name',p_body->'name','employees',p_body->'employees','templates',p_body->'templates',
  'rules',p_body->'rules','requirements',p_body->'requirements','schedules',p_body->'schedules',
  'positions',coalesce(p_body->'positions','[]'::jsonb),
  'absences',coalesce(p_body->'absences','[]'::jsonb),
  'dateAvailability',coalesce(p_body->'dateAvailability','[]'::jsonb),
  'replacements',coalesce(p_body->'replacements','[]'::jsonb),
  'requirementOverrides',coalesce(p_body->'requirementOverrides','{}'::jsonb)) $$;

-- The returned document contains planning inputs, never membership, billing or company settings.
-- Rules and requirements are needed by the client-side generator and are read-only here.
create function private.read_planner_workspace(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; doc public.workspace_documents; company public.companies; body jsonb;
begin
 if p_token is null or length(p_token)<>64 then raise exception 'INVALID_PLANNER_LINK' using errcode='42501'; end if;
 select company_id into cid from public.planner_links where token_hash=sha256(convert_to(p_token,'UTF8'));
 if cid is null then raise exception 'INVALID_PLANNER_LINK' using errcode='42501'; end if;
 select * into doc from public.workspace_documents where company_id=cid;
 select * into company from public.companies where id=cid;
 body:=private.planner_visible_state(doc.state->'current');
 return jsonb_build_object('company_id',cid,'version',doc.version,'access_status',company.access_status,
  'trial_ends_at',company.trial_ends_at,'state',jsonb_build_object('schema',2,'revision',coalesce(doc.state->'revision','0'::jsonb),
  'past','[]'::jsonb,'future','[]'::jsonb,'current',body));
end $$;

create function private.save_planner_workspace(p_token text,p_state jsonb,p_expected_version bigint,p_operation uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare cid uuid; old_doc public.workspace_documents; old_full_body jsonb; old_body jsonb; body jsonb; clean jsonb;
 item jsonb; previous jsonb; old_schedule jsonb; sched record; shift jsonb; next_version bigint; receipt public.planner_save_receipts; token_digest bytea;
begin
 if p_token is null or length(p_token)<>64 then raise exception 'INVALID_PLANNER_LINK' using errcode='42501'; end if;
 token_digest:=sha256(convert_to(p_token,'UTF8'));
 select company_id into cid from public.planner_links where token_hash=token_digest;
 if cid is null then raise exception 'INVALID_PLANNER_LINK' using errcode='42501'; end if;
 if p_operation is null or (p_state->>'schema') is distinct from '2' then raise exception 'INVALID_STATE'; end if;
 select * into old_doc from public.workspace_documents where company_id=cid for update;
 select * into receipt from public.planner_save_receipts where company_id=cid and operation_id=p_operation;
 if found then
  if receipt.token_hash<>token_digest or receipt.payload_hash<>sha256(convert_to(p_state::text,'UTF8')) then raise exception 'OPERATION_MISMATCH'; end if;
  return receipt.version;
 end if;
 if old_doc.version<>p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if exists(select 1 from public.companies where id=cid and (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 old_full_body:=old_doc.state->'current'; old_body:=private.planner_visible_state(old_full_body); body:=p_state->'current';
 if jsonb_typeof(body) is distinct from 'object' or jsonb_typeof(body->'employees') is distinct from 'array'
   or jsonb_typeof(body->'schedules') is distinct from 'object' or jsonb_typeof(body->'absences') is distinct from 'array'
   or jsonb_typeof(body->'dateAvailability') is distinct from 'array' then raise exception 'INVALID_STATE'; end if;
 -- Compare every field except the explicitly editable planning fields.
 if (body-'employees'-'schedules'-'absences'-'dateAvailability'-'replacements')
    is distinct from (old_body-'employees'-'schedules'-'absences'-'dateAvailability'-'replacements')
   or jsonb_array_length(body->'employees')<>jsonb_array_length(old_body->'employees') then
  raise exception 'PLANNER_SCOPE_VIOLATION' using errcode='42501';
 end if;
 for item in select value from jsonb_array_elements(body->'employees') loop
  select value into previous from jsonb_array_elements(old_body->'employees') where value->>'id'=item->>'id';
  if previous is null or (item-'daysOff'-'availability') is distinct from (previous-'daysOff'-'availability')
    or jsonb_typeof(item->'daysOff') is distinct from 'array' or jsonb_typeof(coalesce(item->'availability','[]'::jsonb)) is distinct from 'array' then
   raise exception 'PLANNER_SCOPE_VIOLATION' using errcode='42501';
  end if;
 end loop;
 if jsonb_array_length(body->'employees')<>(select count(distinct e->>'id') from jsonb_array_elements(body->'employees') e) then raise exception 'DUPLICATE_IDS'; end if;
 -- Schedule snapshots are server-owned. A link cannot weaken rules to publish an invalid schedule.
 for sched in select key,value from jsonb_each(body->'schedules') loop
  if sched.value->>'week' is distinct from sched.key or jsonb_typeof(sched.value->'assignments') is distinct from 'array' then raise exception 'INVALID_SCHEDULE'; end if;
  if jsonb_array_length(sched.value->'assignments')<>(select count(distinct a->>'id') from jsonb_array_elements(sched.value->'assignments') a) then raise exception 'DUPLICATE_ASSIGNMENT_IDS'; end if;
  old_schedule:=old_body->'schedules'->sched.key;
  if sched.value->>'status'='published' and (old_schedule is null or old_schedule->>'status' is distinct from 'published'
      or sched.value->>'publishedAt' is distinct from old_schedule->>'publishedAt') then
   raise exception 'PLANNER_SCOPE_VIOLATION' using errcode='42501';
  end if;
  if old_schedule is not null and (sched.value-'rules'-'requirements')=(old_schedule-'rules'-'requirements') then
   body:=jsonb_set(body,array['schedules',sched.key],old_schedule);
  else
   if sched.value ? 'rules' and sched.value->'rules' is distinct from old_body->'rules'
      and sched.value->'rules' is distinct from old_schedule->'rules' then raise exception 'PLANNER_SCOPE_VIOLATION' using errcode='42501'; end if;
   if sched.value ? 'requirements' and sched.value->'requirements' is distinct from coalesce(old_body->'requirementOverrides'->sched.key,old_body->'requirements')
      and sched.value->'requirements' is distinct from old_schedule->'requirements' then raise exception 'PLANNER_SCOPE_VIOLATION' using errcode='42501'; end if;
   body:=jsonb_set(body,array['schedules',sched.key],(sched.value-'rules'-'requirements') || jsonb_build_object(
    'rules',old_body->'rules','requirements',coalesce(old_body->'requirementOverrides'->sched.key,old_body->'requirements')));
  end if;
 end loop;
 next_version:=old_doc.version+1;
 -- These tables remain unreadable and unwritable to anon. All changes pass this function.
 delete from public.availability where company_id=cid;
 for item in select value from jsonb_array_elements(body->'employees') loop
  insert into public.availability(company_id,employee_id,weekday)
   select cid,item->>'id',value::integer from jsonb_array_elements_text(item->'daysOff');
  update public.employees set time_availability=coalesce(item->'availability','[]'::jsonb) where company_id=cid and id=item->>'id';
 end loop;
 delete from public.absences where company_id=cid;
 for item in select value from jsonb_array_elements(body->'absences') loop
  insert into public.absences(company_id,id,employee_id,starts_on,ends_on,reason,kind)
   values(cid,(item->>'id')::uuid,item->>'employeeId',(item->>'from')::date,(item->>'to')::date,coalesce(item->>'reason',''),item->>'kind');
 end loop;
 delete from public.date_availability where company_id=cid;
 for item in select value from jsonb_array_elements(body->'dateAvailability') loop
  insert into public.date_availability(company_id,id,employee_id,day,starts_at,ends_at)
   values(cid,(item->>'id')::uuid,item->>'employeeId',(item->>'date')::date,(item->>'start')::time,(item->>'end')::time);
 end loop;
 delete from public.assignments a where a.company_id=cid and not exists(
  select 1 from jsonb_each(body->'schedules') ss cross join lateral jsonb_array_elements(ss.value->'assignments') sh
  where ss.key::date=a.week and sh->>'id'=a.id);
 delete from public.schedules where company_id=cid and week::text not in(select key from jsonb_each(body->'schedules'));
 for sched in select key,value from jsonb_each(body->'schedules') loop
  insert into public.schedules(company_id,week,status,published_at,version,rules_snapshot,requirements_snapshot)
   values(cid,sched.key::date,sched.value->>'status',(sched.value->>'publishedAt')::timestamptz,next_version,
    sched.value->'rules',sched.value->'requirements')
   on conflict(company_id,week) do update set status=excluded.status,published_at=excluded.published_at,
    version=excluded.version,rules_snapshot=excluded.rules_snapshot,requirements_snapshot=excluded.requirements_snapshot;
  for shift in select value from jsonb_array_elements(sched.value->'assignments') loop
   insert into public.assignments(company_id,id,week,employee_id,template_id,weekday,position,locked,internal_note,starts_at,ends_at)
    values(cid,shift->>'id',sched.key::date,shift->>'employeeId',shift->>'templateId',(shift->>'day')::integer,
     shift->>'position',coalesce((shift->>'locked')::boolean,false),coalesce(shift->>'note',''),
     nullif(shift->>'start','')::time,nullif(shift->>'end','')::time)
    on conflict(company_id,id,week) do update set employee_id=excluded.employee_id,template_id=excluded.template_id,
     weekday=excluded.weekday,position=excluded.position,locked=excluded.locked,internal_note=excluded.internal_note,
     starts_at=excluded.starts_at,ends_at=excluded.ends_at;
  end loop;
  if sched.value->>'status'='published' and (old_body->'schedules'->sched.key) is distinct from sched.value then
   perform private.assert_basic_schedule(cid,sched.key::date);
   insert into public.published_schedules(company_id,week,version,payload)
    values(cid,sched.key::date,next_version,private.shiftflow_projection(cid,sched.key::date))
    on conflict(company_id,week) do update set version=excluded.version,payload=excluded.payload,published_at=now();
  end if;
  if sched.value->>'status'='published' and coalesce(old_body#>>array['schedules',sched.key,'status'],'draft')<>'published' then
   insert into public.notifications(company_id,message) values(cid,'Objavljen je raspored za nedelju od '||sched.key||'.');
  end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(body->'replacements','[]'::jsonb)) loop
  if not exists(select 1 from public.employees where company_id=cid and id=item->>'originalEmployeeId')
   or not exists(select 1 from public.employees where company_id=cid and id=item->>'replacementEmployeeId') then raise exception 'INVALID_REPLACEMENT'; end if;
  if exists(select 1 from public.assignments where company_id=cid and week=(item->>'week')::date and id=item->>'assignmentId') then
   insert into public.replacements(company_id,id,week,assignment_id,original_employee_id,replacement_employee_id,note)
    values(cid,(item->>'id')::uuid,(item->>'week')::date,item->>'assignmentId',item->>'originalEmployeeId',item->>'replacementEmployeeId',coalesce(item->>'note','')) on conflict(id) do nothing;
  end if;
 end loop;
 body:=old_full_body||body;
 clean:=jsonb_build_object('schema',2,'revision',p_state->'revision','current',body,'past','[]'::jsonb,'future','[]'::jsonb);
 insert into public.change_history(company_id,version,previous_state,next_state)
  values(cid,next_version,old_doc.state,clean);
 update public.workspace_documents set state=clean,version=next_version,updated_by=null,updated_at=now() where company_id=cid;
 insert into public.planner_save_receipts(company_id,operation_id,token_hash,payload_hash,version)
  values(cid,p_operation,token_digest,sha256(convert_to(p_state::text,'UTF8')),next_version);
 return next_version;
end $$;

revoke all on function private.rotate_planner_link(uuid),private.revoke_planner_link(uuid),private.planner_visible_state(jsonb),
 private.read_planner_workspace(text),private.save_planner_workspace(text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function private.rotate_planner_link(uuid),private.revoke_planner_link(uuid) to authenticated;
grant execute on function private.read_planner_workspace(text),private.save_planner_workspace(text,jsonb,bigint,uuid) to anon,authenticated;

create function public.rotate_planner_link(p_company uuid) returns text language sql security invoker set search_path='' as $$
 select private.rotate_planner_link(p_company) $$;
create function public.revoke_planner_link(p_company uuid) returns void language sql security invoker set search_path='' as $$
 select private.revoke_planner_link(p_company) $$;
create function public.read_planner_workspace(p_token text) returns jsonb language sql stable security invoker set search_path='' as $$
 select private.read_planner_workspace(p_token) $$;
create function public.save_planner_workspace(p_token text,p_state jsonb,p_expected_version bigint,p_operation uuid) returns bigint language sql security invoker set search_path='' as $$
 select private.save_planner_workspace(p_token,p_state,p_expected_version,p_operation) $$;
revoke all on function public.rotate_planner_link(uuid),public.revoke_planner_link(uuid),
 public.read_planner_workspace(text),public.save_planner_workspace(text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.rotate_planner_link(uuid),public.revoke_planner_link(uuid) to authenticated;
grant execute on function public.read_planner_workspace(text),public.save_planner_workspace(text,jsonb,bigint,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
