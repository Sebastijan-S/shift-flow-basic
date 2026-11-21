begin;

-- Independent of the schedule document. One tenant lock/version covers catalogue,
-- persisted draft, completion order and inventory; books have immutable identity/order.
create table public.bar_state (
 company_id uuid primary key references public.companies(id) on delete cascade,
 version integer not null default 0 check(version>=0),
 sequence integer not null default 0 check(sequence>=0),
 items jsonb not null default '[]',
 deleted_ids uuid[] not null default '{}',
 draft jsonb,
 inventory jsonb
);
create table public.bar_books (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null,
 sequence integer not null check(sequence>0),
 revision integer not null default 0 check(revision>=0),
 completed_at timestamptz not null default clock_timestamp(),
 document jsonb not null,
 primary key(company_id,id), unique(company_id,sequence)
);
create table public.bar_changes (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null,
 payload jsonb not null,
 previous_data jsonb not null,
 next_data jsonb not null,
 changed_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(company_id,request_id)
);
create index bar_changes_author on public.bar_changes(changed_by);
alter table public.bar_state enable row level security;
alter table public.bar_books enable row level security;
alter table public.bar_changes enable row level security;
revoke all on public.bar_state,public.bar_books,public.bar_changes from public,anon,authenticated;

create function private.read_bar(p_company uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.bar_state;
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_modules where company_id=p_company and module_id='bar' and enabled) then raise exception 'MODULE_DISABLED'; end if;
 select * into s from public.bar_state where company_id=p_company;
 return jsonb_build_object('version',coalesce(s.version,0),'sequence',coalesce(s.sequence,0),'items',coalesce(s.items,'[]'),
  'draft',s.draft,'inventory',s.inventory,'books',coalesce((select jsonb_agg(b.document || jsonb_build_object(
    'sequence',b.sequence,'revision',b.revision,'completedAt',b.completed_at) order by b.sequence desc)
   from (select * from public.bar_books where company_id=p_company order by sequence desc limit 5) b),'[]'));
end $$;

-- Quantities are integer hundredths, never numeric(…,2) coercions that round input.
create function private.bar_quantity(v jsonb) returns bigint
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'INVALID_QUANTITY'; end if;
 n:=v::text::numeric;
 if n<0 or n>999999999 or n<>trunc(n) then raise exception 'INVALID_QUANTITY'; end if;
 return n::bigint;
end $$;

create function private.bar_validate_document(v jsonb,template jsonb,min_date text default null) returns void
language plpgsql set search_path='' as $$
declare r jsonb; source jsonb; previous bigint; acquired bigint; total bigint; closing bigint; used bigint; d date;
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['id','date','shift','rows']) or (v-array['id','date','shift','rows'])<>'{}'::jsonb
  or jsonb_typeof(v->'id') is distinct from 'string' or (v->>'id')::uuid is null
  or jsonb_typeof(v->'date') is distinct from 'string' or (v->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or jsonb_typeof(v->'shift') is distinct from 'string' or char_length(v->>'shift')>80
  or jsonb_typeof(v->'rows') is distinct from 'array' then raise exception 'INVALID_DOCUMENT'; end if;
 d:=(v->>'date')::date;
 if d<date '0001-01-01' or d::text<>v->>'date' or (min_date is not null and d<min_date::date) then raise exception 'INVALID_DATE'; end if;
 if jsonb_array_length(v->'rows')<>jsonb_array_length(template)
  or (select count(distinct x->>'itemId') from jsonb_array_elements(v->'rows') x)<>jsonb_array_length(template) then raise exception 'INVALID_ROWS'; end if;
 for r in select * from jsonb_array_elements(v->'rows') loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['itemId','name','unit','previous','acquired','total','closing','used','anchor'])
   or (r-array['itemId','name','unit','previous','acquired','total','closing','used','anchor'])<>'{}'::jsonb then raise exception 'INVALID_ROWS'; end if;
  select x into source from jsonb_array_elements(template) x where x->>'itemId'=r->>'itemId';
  if source is null or r->'name' is distinct from source->'name' or r->'unit' is distinct from source->'unit'
   or coalesce(r->>'anchor','') not in ('closing','used') then raise exception 'INVALID_ROWS'; end if;
  previous:=private.bar_quantity(r->'previous'); acquired:=private.bar_quantity(r->'acquired'); total:=private.bar_quantity(r->'total');
  closing:=private.bar_quantity(r->'closing'); used:=private.bar_quantity(r->'used');
  if total<>previous+acquired or closing<>total-used then raise exception 'INCONSISTENT_ROW'; end if;
 end loop;
end $$;

create function private.bar_command(p_company uuid,p_request uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.bar_state; receipt public.bar_changes; b public.bar_books; old_data jsonb; next_data jsonb;
 action text; p jsonb; item_id uuid; v_date date; rows jsonb; item jsonb; previous bigint; doc jsonb;
begin
 perform private.read_bar(p_company);
 -- Same lock as module switching and other tenant mutations. No external work while locked.
 perform 1 from public.companies where id=p_company for update;
 old_data:=private.read_bar(p_company);
 if exists(select 1 from public.companies where id=p_company and (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 if p_request is null then raise exception 'INVALID_REQUEST'; end if;
 select * into receipt from public.bar_changes where company_id=p_company and request_id=p_request;
 if receipt.request_id is not null then
  if receipt.payload is distinct from p_command or receipt.changed_by<>auth.uid() then raise exception 'REQUEST_CONFLICT'; end if;
  return old_data;
 end if;
 if jsonb_typeof(p_command) is distinct from 'object' or not(p_command ?& array['version','action','payload'])
  or (p_command-array['version','action','payload'])<>'{}'::jsonb or jsonb_typeof(p_command->'version') is distinct from 'number'
  or jsonb_typeof(p_command->'action') is distinct from 'string' or jsonb_typeof(p_command->'payload') is distinct from 'object' then raise exception 'INVALID_COMMAND'; end if;
 insert into public.bar_state(company_id) values(p_company) on conflict do nothing;
 select * into s from public.bar_state where company_id=p_company for update;
 if (p_command->>'version')::numeric<>s.version then raise exception 'VERSION_CONFLICT'; end if;
 action:=p_command->>'action'; p:=p_command->'payload';
 if jsonb_typeof(p->'id') is distinct from 'string' then raise exception 'INVALID_ID'; end if;
 item_id:=(p->>'id')::uuid;
 if action='item' then
  if not(p ?& array['id','name','unit','initial']) or (p-array['id','name','unit','initial'])<>'{}'::jsonb
   or jsonb_typeof(p->'name') is distinct from 'string' or char_length(btrim(p->>'name')) not between 1 and 120
   or jsonb_typeof(p->'unit') is distinct from 'string' or char_length(btrim(p->>'unit')) not between 1 and 20 then raise exception 'INVALID_ITEM'; end if;
  perform private.bar_quantity(p->'initial');
  if item_id=any(s.deleted_ids) then raise exception 'ITEM_DELETED'; end if;
  p:=jsonb_build_object('id',item_id,'name',btrim(p->>'name'),'unit',btrim(p->>'unit'),'initial',p->'initial');
  if exists(select 1 from jsonb_array_elements(s.items) x where x->>'id'=item_id::text) then
   select jsonb_agg(case when x->>'id'=item_id::text then p else x end order by ord) into s.items from jsonb_array_elements(s.items) with ordinality t(x,ord);
  else s.items:=s.items || jsonb_build_array(p); end if;
 elsif action='deleteItem' then
  if (p-'id')<>'{}'::jsonb or not exists(select 1 from jsonb_array_elements(s.items) x where x->>'id'=item_id::text) then raise exception 'ITEM_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(x order by ord),'[]') into s.items from jsonb_array_elements(s.items) with ordinality t(x,ord) where x->>'id'<>item_id::text;
  s.deleted_ids:=array_append(s.deleted_ids,item_id);
 elsif action='open' then
  if not(p ?& array['id','date']) or (p-array['id','date'])<>'{}'::jsonb or s.draft is not null or jsonb_array_length(s.items)=0 then raise exception 'DRAFT_EXISTS_OR_EMPTY'; end if;
  if exists(select 1 from public.bar_books where company_id=p_company and id=item_id) then raise exception 'BOOK_EXISTS'; end if;
  rows:='[]';
  for item in select * from jsonb_array_elements(s.items) loop
   select (x->>'closing')::bigint into previous from jsonb_array_elements(coalesce(s.inventory->'rows','[]')) x where x->>'itemId'=item->>'id';
   previous:=coalesce(previous,(item->>'initial')::bigint);
   rows:=rows || jsonb_build_array(jsonb_build_object('itemId',item->>'id','name',item->>'name','unit',item->>'unit',
    'previous',previous,'acquired',0,'total',previous,'closing',previous,'used',0,'anchor','used'));
  end loop;
  doc:=jsonb_build_object('id',item_id,'date',p->'date','shift','','rows',rows);
  perform private.bar_validate_document(doc,rows,s.inventory->>'date'); s.draft:=doc;
 elsif action in ('draft','finish') then
  if s.draft is null or s.draft->>'id'<>item_id::text then raise exception 'DRAFT_CHANGED'; end if;
  perform private.bar_validate_document(p,s.draft->'rows',s.inventory->>'date');
  s.draft:=p;
  if action='finish' then
   s.sequence:=s.sequence+1;
   insert into public.bar_books(company_id,id,sequence,document) values(p_company,item_id,s.sequence,p);
   s.inventory:=jsonb_build_object('bookId',item_id,'date',p->'date','sequence',s.sequence,'rows',p->'rows');
   s.draft:=null;
  end if;
 elsif action='cancel' then
  if (p-'id')<>'{}'::jsonb or s.draft is null or s.draft->>'id'<>item_id::text then raise exception 'DRAFT_CHANGED'; end if;
  s.draft:=null;
 elsif action='edit' then
  select * into b from public.bar_books where company_id=p_company and id=item_id for update;
  if b.id is null or b.sequence<=s.sequence-5 then raise exception 'BOOK_OUTSIDE_LAST_FIVE'; end if;
  if p->'date' is distinct from b.document->'date' then raise exception 'HISTORICAL_DATE_LOCKED'; end if;
  perform private.bar_validate_document(p,b.document->'rows');
  update public.bar_books set document=p,revision=revision+1 where company_id=p_company and id=item_id;
  -- Deliberately do not update inventory, open draft or any later book.
 else raise exception 'INVALID_ACTION'; end if;
 update public.bar_state set version=version+1,sequence=s.sequence,items=s.items,deleted_ids=s.deleted_ids,draft=s.draft,inventory=s.inventory where company_id=p_company;
 next_data:=private.read_bar(p_company);
 insert into public.bar_changes(company_id,request_id,payload,previous_data,next_data,changed_by) values(p_company,p_request,p_command,old_data,next_data,auth.uid());
 return next_data;
end $$;
revoke all on function private.bar_quantity(jsonb),private.bar_validate_document(jsonb,jsonb,text),private.read_bar(uuid),private.bar_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.read_bar(uuid),private.bar_command(uuid,uuid,jsonb) to authenticated;
create function public.read_bar(p_company uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_bar(p_company) $$;
create function public.bar_command(p_company uuid,p_request uuid,p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.bar_command(p_company,p_request,p_command) $$;
revoke all on function public.read_bar(uuid),public.bar_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_bar(uuid),public.bar_command(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
