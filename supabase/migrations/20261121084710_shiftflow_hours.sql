begin;
-- Independent of planner_private_notes; financial data never enters workspace_documents.
create table public.hours_ledgers (
 company_id uuid primary key references public.companies(id) on delete cascade,
 open_period jsonb,
 rates jsonb not null default '{}'
);
create table public.hours_snapshots (
 company_id uuid not null references public.companies(id) on delete cascade,
 period_id uuid not null,
 snapshot jsonb not null,
 closed_by uuid not null references auth.users(id),
 closed_at timestamptz not null default now(),
 primary key(company_id,period_id)
);
create table public.hours_changes (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 period_id uuid not null,
 action text not null,
 previous_period jsonb,
 next_period jsonb,
 previous_rates jsonb,
 next_rates jsonb,
 changed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index hours_changes_company on public.hours_changes(company_id,created_at);
alter table public.hours_ledgers enable row level security;
alter table public.hours_snapshots enable row level security;
alter table public.hours_changes enable row level security;
revoke all on public.hours_ledgers,public.hours_snapshots,public.hours_changes from public,anon,authenticated;
-- Access only through guarded RPCs, including reads, so disabling hides all displays.
create function private.read_hours(p_company uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_modules where company_id=p_company and module_id='hours' and enabled) then raise exception 'MODULE_DISABLED'; end if;
 return jsonb_build_object('workspaceVersion',(select version from public.workspace_documents where company_id=p_company),
  'open',(select open_period from public.hours_ledgers where company_id=p_company),
  'rates',coalesce((select rates from public.hours_ledgers where company_id=p_company),'{}'),
  'history',coalesce((select jsonb_agg(snapshot order by closed_at desc,period_id) from public.hours_snapshots where company_id=p_company),'[]'));
end $$;
create function private.hours_command(p_company uuid,p_action text,p_period uuid,p_version integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<cmd>>
declare ledger public.hours_ledgers; old_period jsonb; old_rates jsonb; p jsonb; rates jsonb; entries jsonb; item jsonb; e record;
 employee text; method text; cents numeric; overtime numeric; monthly numeric; mins bigint; hrs bigint; shifts bigint; base numeric;
 start_date date; end_date date; rows jsonb:='[]'; snap jsonb; full_month boolean; v_period_id uuid; company_name text;
begin
 perform private.read_hours(p_company);
 -- Same lock order as workspace writes: document first; serializes roster/schedule reads.
 perform 1 from public.workspace_documents where company_id=p_company for update;
 perform 1 from public.companies where id=p_company for update;
 -- Recheck authorization/module after waiting for concurrent workspace/settings writes.
 perform private.read_hours(p_company);
 if exists(select 1 from public.companies where id=p_company and (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 if p_action is null or p_action not in ('start','import','entry','rate','extra','close') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_HOURS_ACTION'; end if;
 -- The period itself is the idempotency key; a retry cannot close the new period.
 if p_action='close' and exists(select 1 from public.hours_snapshots where company_id=p_company and period_id=p_period) then return private.read_hours(p_company); end if;
 insert into public.hours_ledgers(company_id) values(p_company) on conflict do nothing;
 select * into ledger from public.hours_ledgers where company_id=p_company for update;
 p:=ledger.open_period; rates:=ledger.rates; old_period:=p; old_rates:=rates;
 if p_action='start' then
  if p is not null or exists(select 1 from public.hours_snapshots where company_id=p_company) then raise exception 'PERIOD_ALREADY_STARTED'; end if;
  start_date:=(p_payload->>'start')::date;
  if start_date is null or start_date>(now() at time zone 'Europe/Belgrade')::date then raise exception 'INVALID_PERIOD'; end if;
  p:=jsonb_build_object('id',gen_random_uuid(),'start',start_date,'end',null,'version',0,'entries','[]'::jsonb,'extras','{}'::jsonb);
 else
  if p is null or p_period is distinct from (p->>'id')::uuid or p_version is distinct from (p->>'version')::integer then raise exception 'VERSION_CONFLICT'; end if;
  start_date:=(p->>'start')::date;
  employee:=p_payload->>'employee';
  if p_action in ('rate','extra') and not exists(select 1 from public.employees where company_id=p_company and id=employee) then raise exception 'INVALID_EMPLOYEE'; end if;
  if p_action='import' then
   end_date:=(p_payload->>'end')::date;
   if end_date is null or end_date<start_date or end_date>(now() at time zone 'Europe/Belgrade')::date then raise exception 'INVALID_PERIOD'; end if;
   select coalesce(jsonb_agg(value),'[]') into entries from jsonb_array_elements(p->'entries') where (value->>'edited')::boolean;
   for e in select a.*,coalesce(a.starts_at,t.starts_at) s,coalesce(a.ends_at,t.ends_at) f from public.assignments a join public.shift_templates t on t.company_id=a.company_id and t.id=a.template_id
    where a.company_id=p_company and a.week+a.weekday between start_date and end_date order by a.week,a.weekday,a.id loop
    if not exists(select 1 from jsonb_array_elements(entries) x where x->>'key'=e.week::text||':'||e.id) then
     mins:=extract(epoch from (e.f-e.s))/60; if mins<=0 then mins:=mins+1440; end if;
     entries:=entries||jsonb_build_array(jsonb_build_object('key',e.week::text||':'||e.id,'employee',e.employee_id,'date',e.week+e.weekday,'minutes',mins,'edited',false));
    end if;
   end loop;
   p:=jsonb_set(p,'{entries}',entries);
  elsif p_action='entry' then
   mins:=(p_payload->>'minutes')::bigint;
   if mins is null or (p_payload->>'minutes')::numeric<>mins or mins<0 or mins>1440 or not exists(select 1 from jsonb_array_elements(p->'entries') x where x->>'key'=p_payload->>'key') then raise exception 'INVALID_MINUTES'; end if;
   select jsonb_agg(case when value->>'key'=p_payload->>'key' then value||jsonb_build_object('minutes',mins,'edited',true) else value end) into entries from jsonb_array_elements(p->'entries');
   p:=jsonb_set(p,'{entries}',entries);
  elsif p_action='rate' then
   method:=p_payload->>'method'; cents:=(p_payload->>'cents')::numeric;
   if method is null or method not in ('hourly','shift','monthly') or cents is null or cents<>trunc(cents) or cents<0 or cents>99999999999 then raise exception 'INVALID_RATE'; end if;
   rates:=jsonb_set(rates,array[employee],jsonb_build_object('method',method,'cents',cents));
  elsif p_action='extra' then
   overtime:=(p_payload->>'overtime')::numeric; monthly:=(p_payload->>'monthly')::numeric;
   if not(p_payload ? 'monthly') or overtime is null or overtime<>trunc(overtime) or overtime<0 or overtime>99999999999 or (monthly is not null and (monthly<>trunc(monthly) or monthly<0 or monthly>99999999999)) then raise exception 'INVALID_AMOUNT'; end if;
   p:=jsonb_set(p,array['extras',employee],jsonb_build_object('overtime',overtime,'monthly',monthly));
  elsif p_action='close' then
   if (p_payload->>'workspaceVersion')::bigint is distinct from (select version from public.workspace_documents where company_id=p_company) then raise exception 'VERSION_CONFLICT'; end if;
   end_date:=(p_payload->>'end')::date;
   if end_date is null or end_date<start_date or end_date>(now() at time zone 'Europe/Belgrade')::date or exists(select 1 from jsonb_array_elements(p->'entries') x where (x->>'date')::date>end_date) then raise exception 'INVALID_PERIOD'; end if;
   full_month:=extract(day from start_date)=1 and end_date=(start_date+interval '1 month'-interval '1 day')::date;
   for e in select id,name from public.employees where company_id=p_company and (active or id in(select x->>'employee' from jsonb_array_elements(p->'entries') x) or p->'extras' ? id) order by id loop
    select coalesce(sum((x->>'minutes')::bigint),0),count(*) filter(where (x->>'minutes')::bigint>0) into mins,shifts from jsonb_array_elements(p->'entries') x where x->>'employee'=e.id;
    hrs:=floor((mins+30)::numeric/60);
    method:=coalesce(rates->e.id->>'method','hourly'); cents:=coalesce((rates->e.id->>'cents')::numeric,0);
    overtime:=coalesce((p->'extras'->e.id->>'overtime')::numeric,0);
    if method='hourly' then base:=hrs*cents;
    elsif method='shift' then base:=shifts*cents;
    elsif full_month then base:=cents;
    else base:=(p->'extras'->e.id->>'monthly')::numeric; if base is null then raise exception 'MONTHLY_AMOUNT_REQUIRED: %',e.name; end if;
    end if;
    rows:=rows||jsonb_build_array(jsonb_build_object('employee',e.id,'name',e.name,'minutes',mins,'hours',hrs,'shifts',shifts,'method',method,'rate',cents,'base',base,'overtime',overtime,'total',base+overtime));
   end loop;
   select name into company_name from public.companies where id=p_company;
   snap:=jsonb_build_object('id',p_period,'start',start_date,'end',end_date,'company',company_name,'closedAt',now(),'rows',rows,'entries',p->'entries','currency','RSD','rounding','period-nearest-hour-half-up');
   insert into public.hours_snapshots(company_id,period_id,snapshot,closed_by) values(p_company,p_period,snap,auth.uid());
   p:=jsonb_build_object('id',gen_random_uuid(),'start',end_date+1,'end',null,'version',0,'entries','[]'::jsonb,'extras','{}'::jsonb);
  end if;
  if p_action<>'close' then p:=jsonb_set(p,'{version}',to_jsonb(p_version+1)); end if;
 end if;
 v_period_id:=coalesce(p_period,(p->>'id')::uuid);
 update public.hours_ledgers set open_period=p,rates=cmd.rates where company_id=p_company;
 insert into public.hours_changes(company_id,period_id,action,previous_period,next_period,previous_rates,next_rates,changed_by)
 values(p_company,v_period_id,p_action,old_period,p,old_rates,rates,auth.uid());
 return private.read_hours(p_company);
end $$;
revoke all on function private.read_hours(uuid),private.hours_command(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.read_hours(uuid),private.hours_command(uuid,text,uuid,integer,jsonb) to authenticated;
create function public.read_hours(p_company uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_hours(p_company) $$;
create function public.hours_command(p_company uuid,p_action text,p_period uuid,p_version integer,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.hours_command(p_company,p_action,p_period,p_version,p_payload) $$;
revoke all on function public.read_hours(uuid),public.hours_command(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.read_hours(uuid),public.hours_command(uuid,text,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
