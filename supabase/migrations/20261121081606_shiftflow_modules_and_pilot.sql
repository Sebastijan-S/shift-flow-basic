begin;

-- Pilot access is assigned by the founders through trusted administration,
-- never by client metadata, a public RPC, or a new account's default status.
alter table public.companies drop constraint companies_access_status_check;
alter table public.companies add constraint companies_access_status_check
 check(access_status in ('setup','trial','active','expired','pilot'));
alter table public.companies add constraint companies_pilot_has_no_deadline
 check(access_status<>'pilot' or trial_ends_at is null);

create table public.company_modules (
 company_id uuid not null references public.companies(id) on delete cascade,
 module_id text not null check(module_id in ('schedule','overview','hours','revenue','notes','bar','reports')),
 enabled boolean not null,
 updated_at timestamptz not null default now(),
 primary key(company_id,module_id),
 check(module_id<>'schedule' or enabled)
);
alter table public.company_modules enable row level security;
revoke all on public.company_modules from public,anon,authenticated;
grant select on public.company_modules to authenticated;
create policy company_modules_read on public.company_modules for select to authenticated
 using(public.is_member(company_id));

create table public.company_module_changes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 module_id text not null,
 previous_enabled boolean not null,
 enabled boolean not null,
 changed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index company_module_changes_company on public.company_module_changes(company_id,created_at);
alter table public.company_module_changes enable row level security;
revoke all on public.company_module_changes from public,anon,authenticated;
grant select on public.company_module_changes to authenticated;
create policy company_module_changes_read on public.company_module_changes for select to authenticated
 using(public.is_member(company_id));

create function private.set_company_module(p_company uuid,p_module text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if p_module is null or p_module not in ('schedule','overview','hours','revenue','notes','bar','reports') or p_enabled is null then
  raise exception 'INVALID_MODULE';
 end if;
 if p_module='schedule' and not p_enabled then raise exception 'SCHEDULE_REQUIRED'; end if;
 -- Serialize settings writes per company, including the very first write.
 perform 1 from public.companies where id=p_company for update;
 if exists(select 1 from public.companies where id=p_company and
   (access_status='expired' or (access_status='trial' and trial_ends_at<=now()))) then raise exception 'TRIAL_EXPIRED'; end if;
 select enabled into previous from public.company_modules where company_id=p_company and module_id=p_module;
 previous:=coalesce(previous,p_module in ('schedule','overview'));
 insert into public.company_modules(company_id,module_id,enabled) values(p_company,p_module,p_enabled)
  on conflict(company_id,module_id) do update set enabled=excluded.enabled,updated_at=now();
 if previous is distinct from p_enabled then
  insert into public.company_module_changes(company_id,module_id,previous_enabled,enabled,changed_by)
   values(p_company,p_module,previous,p_enabled,auth.uid());
 end if;
end $$;
revoke all on function private.set_company_module(uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.set_company_module(uuid,text,boolean) to authenticated;
create function public.set_company_module(p_company uuid,p_module text,p_enabled boolean) returns void
language sql security invoker set search_path='' as $$ select private.set_company_module(p_company,p_module,p_enabled) $$;
revoke all on function public.set_company_module(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_company_module(uuid,text,boolean) to authenticated;

create or replace function private.notify_basic_trial() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.access_status is distinct from new.access_status then
  insert into public.notifications(company_id,message) values(new.id,case new.access_status
   when 'pilot' then 'Besplatan pilot je aktivan bez unapred određenog roka.'
   when 'trial' then 'Pokrenut je probni period od 21 dan.'
   when 'active' then 'Basic korišćenje je aktivirano.'
   when 'expired' then 'Probni period je istekao. Podaci ostaju dostupni za pregled i izvoz.'
   else 'Priprema objekta je otvorena.' end);
 end if;
 return new;
end $$;
revoke all on function private.notify_basic_trial() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
