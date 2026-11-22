begin;
-- Read-only reports over saved source records. No report copies or new input tables.
create index revenue_entries_company_date on public.revenue_entries(company_id,revenue_date);
create index hours_snapshots_company_start on public.hours_snapshots(company_id,((snapshot->>'start')));
create index bar_books_company_date on public.bar_books(company_id,((document->>'date')));

-- Internal helper, intentionally not executable by API roles. Sums travel as decimal
-- integer strings to avoid loss of precision in JavaScript for large aggregates.
create function private.report_window(p_company uuid,p_start date,p_end date,p_revenue boolean,p_hours boolean,p_bar boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare revenue jsonb; hours jsonb; bar jsonb;
begin
 if p_revenue then
  with days as (
   select revenue_date,count(*)::integer count,sum(cash)::text cash,sum(cards)::text cards,
    sum(coalesce(cash,0)::numeric+coalesce(cards,0)::numeric)::text total
   from public.revenue_entries where company_id=p_company and revenue_date between p_start and p_end group by revenue_date
  ) select jsonb_build_object('days',coalesce(jsonb_agg(jsonb_build_object('date',revenue_date,'count',count,'cash',cash,'cards',cards,'total',total) order by revenue_date),'[]')) into revenue from days;
 end if;
 if p_hours then
  select jsonb_build_object('periods',coalesce(jsonb_agg(jsonb_build_object(
   'id',s.period_id,'start',s.snapshot->>'start','end',s.snapshot->>'end',
   'minutes',coalesce((select sum((r->>'minutes')::numeric)::text from jsonb_array_elements(s.snapshot->'rows') r),'0'),
   'hours',coalesce((select sum((r->>'hours')::numeric)::text from jsonb_array_elements(s.snapshot->'rows') r),'0'),
   'total',coalesce((select sum((r->>'total')::numeric)::text from jsonb_array_elements(s.snapshot->'rows') r),'0')
  ) order by s.snapshot->>'start',s.period_id),'[]')) into hours
  from public.hours_snapshots s where s.company_id=p_company and s.snapshot->>'start'<=p_end::text and s.snapshot->>'end'>=p_start::text;
 end if;
 if p_bar then
  with books as (
   select id,document from public.bar_books where company_id=p_company and document->>'date' between p_start::text and p_end::text
  ), items as (
   select r->>'itemId' item_id,r->>'name' name,r->>'unit' unit,sum((r->>'used')::numeric)::text used,count(*)::integer books
   from books b cross join lateral jsonb_array_elements(b.document->'rows') r
   group by r->>'itemId',r->>'name',r->>'unit'
  ) select jsonb_build_object('books',(select count(*)::integer from books),
   'firstDate',(select min(document->>'date') from books),'lastDate',(select max(document->>'date') from books),
   'items',coalesce((select jsonb_agg(jsonb_build_object('itemId',item_id,'name',name,'unit',unit,'used',used,'books',books) order by item_id,name collate "C",unit collate "C") from items),'[]')) into bar;
 end if;
 return jsonb_build_object('start',p_start,'end',p_end,'revenue',revenue,'hours',hours,'bar',bar);
end $$;

create function private.read_reports(p_company uuid,p_mode text,p_date text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d date; first_day date; last_day date; previous_start date; previous_end date;
 revenue boolean; hours boolean; bar boolean;
begin
 if auth.uid() is null or not public.is_member(p_company) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.company_modules where company_id=p_company and module_id='reports' and enabled) then raise exception 'MODULE_DISABLED'; end if;
 if p_mode is null or p_mode not in ('week','month') or p_date is null or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_REPORT_PERIOD'; end if;
 d:=p_date::date;
 if d::text<>p_date or d<date '0001-01-01' then raise exception 'INVALID_REPORT_PERIOD'; end if;
 if p_mode='week' then
  first_day:=d-(extract(isodow from d)::integer-1); last_day:=first_day+6;
  previous_start:=first_day-7; previous_end:=first_day-1;
 else
  first_day:=date_trunc('month',d::timestamp)::date;
  last_day:=(first_day+interval '1 month'-interval '1 day')::date;
  previous_start:=(first_day-interval '1 month')::date; previous_end:=first_day-1;
 end if;
 if previous_start<date '0001-01-01' or last_day>date '9999-12-31' then raise exception 'INVALID_REPORT_PERIOD'; end if;
 revenue:=exists(select 1 from public.company_modules where company_id=p_company and module_id='revenue' and enabled);
 hours:=exists(select 1 from public.company_modules where company_id=p_company and module_id='hours' and enabled);
 bar:=exists(select 1 from public.company_modules where company_id=p_company and module_id='bar' and enabled);
 return jsonb_build_object('asOf',(now() at time zone 'Europe/Belgrade')::date,'mode',p_mode,
  'current',private.report_window(p_company,first_day,last_day,revenue,hours,bar),
  'previous',private.report_window(p_company,previous_start,previous_end,revenue,hours,bar));
end $$;
revoke all on function private.report_window(uuid,date,date,boolean,boolean,boolean),private.read_reports(uuid,text,text) from public,anon,authenticated;
grant execute on function private.read_reports(uuid,text,text) to authenticated;
create function public.read_reports(p_company uuid,p_mode text,p_date text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_reports(p_company,p_mode,p_date) $$;
revoke all on function public.read_reports(uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_reports(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
