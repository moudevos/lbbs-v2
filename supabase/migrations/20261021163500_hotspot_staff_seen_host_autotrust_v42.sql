-- Staff V42. Only router-attested HotSpot hosts can claim the first two MAC slots.
-- Service-role only. A revoked MAC cannot silently reclaim a slot.
create table if not exists public.hotspot_staff_seen_hosts_v42 (
  router_id uuid not null references public.hotspot_routers(id) on delete cascade,
  mac_address text not null check (mac_address ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  ip_address inet not null,
  observed_at timestamptz not null default now(),
  primary key (router_id, mac_address, ip_address)
);
create index if not exists hotspot_staff_seen_hosts_v42_recent_idx
  on public.hotspot_staff_seen_hosts_v42(router_id, observed_at desc);
alter table public.hotspot_staff_seen_hosts_v42 enable row level security;
revoke all on public.hotspot_staff_seen_hosts_v42 from public,anon,authenticated;
grant select,insert,update,delete on public.hotspot_staff_seen_hosts_v42 to service_role;

create or replace function public.enroll_hotspot_staff_seen_device_v42(
  p_router_id uuid, p_credential_id uuid, p_mac text, p_ip inet
) returns table(device_id uuid, device_count integer, was_registered boolean)
language plpgsql security invoker
set search_path=public,pg_temp as $staff$
declare
 v_mac text:=upper(trim(p_mac));
 v_id uuid;
 v_enabled boolean;
 v_count integer;
 v_existing boolean:=false;
begin
 if v_mac !~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'
    or p_ip << inet '10.10.20.0/24' is not true then
    raise exception 'Invalid Staff host' using errcode='22023';
 end if;

 -- Parent-row lock serializes parallel first/second device enrollment,
 -- and the existing trigger independently blocks >2 active devices.
 select c.is_enabled into v_enabled
 from public.hotspot_staff_credentials c
 join public.employees e on e.id=c.employee_id
 join public.hotspot_routers r on r.branch_id=c.branch_id
 where c.id=p_credential_id and r.id=p_router_id and r.is_active
   and r.status='active' and e.status='active'
   and e.branch_id=c.branch_id
 for update of c;
 if not found or not coalesce(v_enabled,false) then
   raise exception 'Staff credential inactive' using errcode='23514';
 end if;

 -- MAC and IP must be observed by the router itself within 75 seconds,
 -- not just self-reported by the browser. Router API Bearer controls writes.
 if not exists (
   select 1 from public.hotspot_staff_seen_hosts_v42 h
   where h.router_id=p_router_id and h.mac_address=v_mac
     and h.ip_address=p_ip and h.observed_at > clock_timestamp()-interval '75 seconds'
 ) then
   raise exception 'Device not observed on Staff AP' using errcode='23514';
 end if;

 select d.id,d.is_authorized into v_id,v_enabled
 from public.hotspot_staff_devices d
 where d.credential_id=p_credential_id and d.mac_address=v_mac
 for update;
 if found then
   -- Never silently reactivate an administratively revoked MAC.
   if not v_enabled then
     raise exception 'Device revoked by administrator' using errcode='23514';
   end if;
   v_existing:=true;
 else
   insert into public.hotspot_staff_devices(credential_id,mac_address)
   values(p_credential_id,v_mac)
   returning id into v_id;
 end if;

 select count(*) into v_count from public.hotspot_staff_devices d
 where d.credential_id=p_credential_id and d.is_authorized;
 if v_count>2 then raise exception 'Staff two-device limit' using errcode='23514'; end if;
 return query select v_id,v_count,v_existing;
end;
$staff$;
revoke all on function public.enroll_hotspot_staff_seen_device_v42(uuid,uuid,text,inet)
 from public,anon,authenticated;
grant execute on function public.enroll_hotspot_staff_seen_device_v42(uuid,uuid,text,inet)
 to service_role;

notify pgrst,'reload schema';
