begin;

-- Financial records are never part of workspace_documents or planner projections.
create table public.revenue_entries (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null,
 sequence bigint generated always as identity unique,
 revenue_date date not null check(revenue_date between date '0001-01-01' and date '9999-12-31'),
 shift text not null default '' check(char_length(shift)<=80),
 cash bigint check(cash between 0 and 99999999999),
 cards bigint check(cards between 0 and 99999999999),
 version integer not null default 0 check(version>=0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 primary key(company_id,id),
 check(cash is not null or cards is not null)
);
create index revenue_entries_company_created on public.revenue_entries(company_id,created_at desc,sequence desc);
create table public.revenue_changes (
 sequence bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 entry_id uuid not null,
 previous_entry jsonb,
 next_entry jsonb not null,
 changed_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp()
);
create index revenue_changes_company on public.revenue_changes(company_id,created_at);
alter table public.revenue_entries enable row level security;
alter table public.revenue_changes enable row level security;
revoke all on public.revenue_entries,public.revenue_changes from public,anon,authenticated;
revoke all on sequence public.revenue_entries_sequence_seq,public.revenue_changes_sequence_seq from public,anon,authenticated;

create function private.read_revenue(p_company uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_modules where company_id=p_company and module_id='revenue' and enabled) then raise exception 'MODULE_DISABLED'; end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'date',revenue_date,'shift',shift,'cash',cash,'cards',cards,'version',version,
  'sequence',sequence,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc,sequence desc)
  from public.revenue_entries where company_id=p_company),'[]'));
end $$;

create function private.save_revenue(p_company uuid,p_id uuid,p_version integer,p_values jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_entry public.revenue_entries; new_entry public.revenue_entries; d date; s text; c numeric; k numeric; field text;
begin
 perform private.read_revenue(p_company);
 -- Same company lock as module toggles; creation order is assigned after waiting.
 perform 1 from public.companies where id=p_company for update;
 perform private.read_revenue(p_company);
 if exists(select 1 from public.companies where id=p_company and (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 if p_id is null or jsonb_typeof(p_values) is distinct from 'object' or not(p_values ?& array['date','shift','cash','cards'])
  or (p_values-array['date','shift','cash','cards'])<>'{}'::jsonb then raise exception 'INVALID_REVENUE'; end if;
 if jsonb_typeof(p_values->'date') is distinct from 'string' or (p_values->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_DATE'; end if;
 begin d:=(p_values->>'date')::date; exception when others then raise exception 'INVALID_DATE'; end;
 if d::text<>p_values->>'date' or d<date '0001-01-01' then raise exception 'INVALID_DATE'; end if;
 if jsonb_typeof(p_values->'shift') is distinct from 'string' then raise exception 'INVALID_SHIFT'; end if;
 s:=btrim(p_values->>'shift'); if char_length(s)>80 then raise exception 'INVALID_SHIFT'; end if;
 foreach field in array array['cash','cards'] loop
  if jsonb_typeof(p_values->field) not in ('null','number') then raise exception 'INVALID_AMOUNT'; end if;
  c:=(p_values->>field)::numeric;
  if c is not null and (c<>trunc(c) or c<0 or c>99999999999) then raise exception 'INVALID_AMOUNT'; end if;
 end loop;
 c:=(p_values->>'cash')::numeric; k:=(p_values->>'cards')::numeric;
 if c is null and k is null then raise exception 'AMOUNT_REQUIRED'; end if;
 select * into old_entry from public.revenue_entries where company_id=p_company and id=p_id for update;
 if p_version is null then
  if old_entry.id is not null then
   -- A retried create with its original ID cannot create a second record.
   if old_entry.version<>0 or old_entry.revenue_date<>d or old_entry.shift<>s or old_entry.cash is distinct from c or old_entry.cards is distinct from k then raise exception 'VERSION_CONFLICT'; end if;
   return private.read_revenue(p_company);
  end if;
  insert into public.revenue_entries(company_id,id,revenue_date,shift,cash,cards,created_by,updated_by)
   values(p_company,p_id,d,s,c,k,auth.uid(),auth.uid()) returning * into new_entry;
 else
  if old_entry.id is null or old_entry.version<>p_version then raise exception 'VERSION_CONFLICT'; end if;
  update public.revenue_entries set revenue_date=d,shift=s,cash=c,cards=k,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid()
   where company_id=p_company and id=p_id returning * into new_entry;
 end if;
 insert into public.revenue_changes(company_id,entry_id,previous_entry,next_entry,changed_by)
  values(p_company,p_id,case when old_entry.id is null then null else to_jsonb(old_entry) end,to_jsonb(new_entry),auth.uid());
 return private.read_revenue(p_company);
end $$;
revoke all on function private.read_revenue(uuid),private.save_revenue(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.read_revenue(uuid),private.save_revenue(uuid,uuid,integer,jsonb) to authenticated;
create function public.read_revenue(p_company uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_revenue(p_company) $$;
create function public.save_revenue(p_company uuid,p_id uuid,p_version integer,p_values jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_revenue(p_company,p_id,p_version,p_values) $$;
revoke all on function public.read_revenue(uuid),public.save_revenue(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.read_revenue(uuid),public.save_revenue(uuid,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
