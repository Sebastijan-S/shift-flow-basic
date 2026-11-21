begin;

-- Separate from workspace_documents and the legacy planner private notes.
create table public.notes_entries (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null,
 body text not null check(char_length(btrim(body)) between 1 and 10000),
 due_date date check(due_date between date '0001-01-01' and date '9999-12-31'),
 due_time time check(due_time < time '24:00' and extract(second from due_time)=0),
 completed boolean not null default false,
 version integer not null default 0 check(version>=0),
 deleted_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(company_id,id),
 check(due_time is null or due_date is not null)
);
create table public.notes_changes (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null,
 entry_id uuid not null,
 payload jsonb not null,
 previous_entry jsonb,
 next_entry jsonb not null,
 changed_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(company_id,request_id)
);
create index notes_changes_author on public.notes_changes(changed_by);
alter table public.notes_entries enable row level security;
alter table public.notes_changes enable row level security;
revoke all on public.notes_entries,public.notes_changes from public,anon,authenticated;

create function private.read_notes(p_company uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_modules where company_id=p_company and module_id='notes' and enabled) then raise exception 'MODULE_DISABLED'; end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'text',body,'date',due_date,'time',case when due_time is null then null else to_char(due_time,'HH24:MI') end,
  'completed',completed,'version',version,'createdAt',created_at,'updatedAt',updated_at) order by created_at,id)
  from public.notes_entries where company_id=p_company and deleted_at is null),'[]'));
end $$;

create function private.notes_command(p_company uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_entry public.notes_entries; new_entry public.notes_entries; receipt public.notes_changes;
 v jsonb; entry_id uuid; expected integer; action text; v_body text; d date; t time; done boolean; local_due timestamp;
begin
 perform private.read_notes(p_company);
 perform 1 from public.companies where id=p_company for update;
 perform private.read_notes(p_company);
 if exists(select 1 from public.companies where id=p_company and (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 if p_request is null then raise exception 'INVALID_REQUEST'; end if;
 select * into receipt from public.notes_changes where company_id=p_company and request_id=p_request;
 if receipt.request_id is not null then
  if receipt.payload is distinct from p_command or receipt.changed_by<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
  return private.read_notes(p_company);
 end if;
 if jsonb_typeof(p_command) is distinct from 'object' or not(p_command ?& array['id','version','action','values']) or (p_command-array['id','version','action','values'])<>'{}'::jsonb then raise exception 'INVALID_NOTE'; end if;
 entry_id:=(p_command->>'id')::uuid;
 if entry_id is null or jsonb_typeof(p_command->'version') not in ('null','number') then raise exception 'INVALID_NOTE'; end if;
 if jsonb_typeof(p_command->'version')='number' and ((p_command->>'version')::numeric<>trunc((p_command->>'version')::numeric) or (p_command->>'version')::numeric<0) then raise exception 'INVALID_VERSION'; end if;
 expected:=(p_command->>'version')::integer; action:=p_command->>'action'; v:=p_command->'values';
 if action='save' then
  if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['text','date','time','completed']) or (v-array['text','date','time','completed'])<>'{}'::jsonb then raise exception 'INVALID_NOTE'; end if;
  if jsonb_typeof(v->'text') is distinct from 'string' or jsonb_typeof(v->'completed') is distinct from 'boolean' then raise exception 'INVALID_NOTE'; end if;
  v_body:=btrim(v->>'text',E' \t\r\n'); done:=(v->>'completed')::boolean;
  if char_length(v_body) not between 1 and 10000 then raise exception 'INVALID_TEXT'; end if;
  if jsonb_typeof(v->'date')='string' then
   if (v->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_DATE'; end if;
   d:=(v->>'date')::date;
   if d::text<>v->>'date' or d<date '0001-01-01' then raise exception 'INVALID_DATE'; end if;
  elsif jsonb_typeof(v->'date') is distinct from 'null' then raise exception 'INVALID_DATE'; end if;
  if jsonb_typeof(v->'time')='string' then
   if d is null or (v->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TIME'; end if;
   t:=(v->>'time')::time; local_due:=d+t;
   -- PostgreSQL chooses the later (standard-time) instant in an autumn fold.
   if ((local_due at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade')<>local_due then raise exception 'INVALID_DST_TIME'; end if;
  elsif jsonb_typeof(v->'time') is distinct from 'null' then raise exception 'INVALID_TIME'; end if;
 elsif action='delete' then
  if expected is null or v<>'null'::jsonb then raise exception 'INVALID_NOTE'; end if;
 else raise exception 'INVALID_ACTION'; end if;
 select * into old_entry from public.notes_entries where company_id=p_company and id=entry_id for update;
 if expected is null then
  if old_entry.id is not null then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.notes_entries(company_id,id,body,due_date,due_time,completed) values(p_company,entry_id,v_body,d,t,done) returning * into new_entry;
 else
  if old_entry.id is null or old_entry.deleted_at is not null or old_entry.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
  update public.notes_entries set body=case when action='save' then v_body else old_entry.body end,
   due_date=case when action='save' then d else old_entry.due_date end,due_time=case when action='save' then t else old_entry.due_time end,
   completed=case when action='save' then done else old_entry.completed end,
   deleted_at=case when action='delete' then clock_timestamp() else null end,version=version+1,updated_at=clock_timestamp()
   where company_id=p_company and id=entry_id returning * into new_entry;
 end if;
 insert into public.notes_changes(company_id,request_id,entry_id,payload,previous_entry,next_entry,changed_by)
 values(p_company,p_request,entry_id,p_command,case when old_entry.id is null then null else to_jsonb(old_entry) end,to_jsonb(new_entry),auth.uid());
 return private.read_notes(p_company);
end $$;
revoke all on function private.read_notes(uuid),private.notes_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.read_notes(uuid),private.notes_command(uuid,uuid,jsonb) to authenticated;
create function public.read_notes(p_company uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_notes(p_company) $$;
create function public.notes_command(p_company uuid,p_request uuid,p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.notes_command(p_company,p_request,p_command) $$;
revoke all on function public.read_notes(uuid),public.notes_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_notes(uuid),public.notes_command(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
