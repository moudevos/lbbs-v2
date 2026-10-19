create table if not exists public.hotspot_staff_auth_limits (
 router_id uuid not null references public.hotspot_routers(id) on delete cascade,
 subject_hash text not null,
 failures integer not null default 0,
 window_started_at timestamptz not null default now(),
 locked_until timestamptz,
 primary key(router_id,subject_hash)
);
alter table public.hotspot_staff_auth_limits enable row level security;
revoke all on public.hotspot_staff_auth_limits from anon,authenticated;
create or replace function public.staff_auth_attempt(p_router uuid,p_subject text,p_valid boolean)
returns boolean language plpgsql security invoker set search_path=public as $$
declare r public.hotspot_staff_auth_limits%rowtype;
begin
 insert into public.hotspot_staff_auth_limits(router_id,subject_hash)
 values(p_router,p_subject) on conflict do nothing;
 select * into r from public.hotspot_staff_auth_limits
 where router_id=p_router and subject_hash=p_subject for update;
 if r.locked_until > clock_timestamp() then return false; end if;
 if p_valid then
  update public.hotspot_staff_auth_limits set failures=0,locked_until=null,window_started_at=now()
  where router_id=p_router and subject_hash=p_subject;
  return true;
 end if;
 update public.hotspot_staff_auth_limits set
 failures=case when r.window_started_at<now()-interval '15 minutes' then 1 else r.failures+1 end,
 window_started_at=case when r.window_started_at<now()-interval '15 minutes' then now() else r.window_started_at end,
 locked_until=case when r.failures>=4 and r.window_started_at>=now()-interval '15 minutes' then now()+interval '15 minutes' else null end
 where router_id=p_router and subject_hash=p_subject;
 return false;
end $$;
revoke all on function public.staff_auth_attempt(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_auth_attempt(uuid,text,boolean) to service_role;