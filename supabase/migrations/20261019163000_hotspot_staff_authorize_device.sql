-- Atomic Staff device authorization for captive access.
create or replace function public.authorize_hotspot_staff_device(p_credential_id uuid, p_mac text)
returns table(device_id uuid, device_count integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_mac text := upper(trim(p_mac)); v_id uuid; v_count integer;
begin
 if v_mac !~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$' then raise exception 'Invalid MAC' using errcode='22023'; end if;
 perform 1 from public.hotspot_staff_credentials c join public.employees e on e.id=c.employee_id
 where c.id=p_credential_id and c.is_enabled and e.status='active' and e.branch_id=c.branch_id for update of c;
 if not found then raise exception 'Staff access unavailable' using errcode='23514'; end if;
 select d.id into v_id from public.hotspot_staff_devices d where d.credential_id=p_credential_id and d.mac_address=v_mac;
 if v_id is null then
  insert into public.hotspot_staff_devices(credential_id,mac_address) values(p_credential_id,v_mac) returning id into v_id;
 else
  update public.hotspot_staff_devices set is_authorized=true,revoked_at=null where id=v_id;
 end if;
 select count(*) into v_count from public.hotspot_staff_devices d where d.credential_id=p_credential_id and d.is_authorized;
 return query select v_id,v_count;
end $$;
revoke all on function public.authorize_hotspot_staff_device(uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_hotspot_staff_device(uuid,text) to service_role;