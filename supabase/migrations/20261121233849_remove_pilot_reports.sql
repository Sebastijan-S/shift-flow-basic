begin;
-- Reports were withdrawn from the pilot. Keep applied migration history intact,
-- remove executable report code without touching any source records or audit.
drop function if exists public.read_reports(uuid,text,text);
drop function if exists private.read_reports(uuid,text,text);
drop function if exists private.report_window(uuid,date,date,boolean,boolean,boolean);
drop index if exists public.revenue_entries_company_date;
drop index if exists public.hours_snapshots_company_start;
drop index if exists public.bar_books_company_date;

-- Old saved flags/audit remain readable for compatibility; new requests cannot
-- enable the retired module. Other module behavior is unchanged.
create or replace function private.set_company_module(p_company uuid,p_module text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if p_module is null or p_module not in ('schedule','overview','hours','revenue','notes','bar') or p_enabled is null then
  raise exception 'INVALID_MODULE';
 end if;
 if p_module='schedule' and not p_enabled then raise exception 'SCHEDULE_REQUIRED'; end if;
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
notify pgrst,'reload schema';
commit;
