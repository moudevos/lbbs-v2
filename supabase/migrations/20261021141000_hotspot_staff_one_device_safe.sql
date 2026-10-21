-- LBBS Staff: harden the existing device slot contract to ONE device.
-- Safe for current deployment (zero authorized Staff devices).
-- No Staff HotSpot, profile, WAN gate or client voucher is modified.
-- Fail loudly on conflicting production data instead of silently revoking devices.
do $$
begin
  if exists (
    select 1 from public.hotspot_staff_devices
    where is_authorized=true
    group by credential_id having count(*) > 1
  ) then
    raise exception 'Staff one-device migration blocked: review existing multi-device credentials first';
  end if;
end $$;

create unique index if not exists hotspot_staff_one_authorized_device_uidx
  on public.hotspot_staff_devices (credential_id)
  where is_authorized = true;

create or replace function public.enforce_hotspot_staff_device_limit()
returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $lbbs_staff$
declare v_authorized integer;
begin
  new.mac_address := upper(new.mac_address);
  if not new.is_authorized then
    return new;
  end if;
  perform 1
  from public.hotspot_staff_credentials c
  where c.id = new.credential_id and c.is_enabled = true
  for update;
  if not found then
    raise exception 'Staff credential disabled or missing' using errcode='23514';
  end if;
  select count(*) into v_authorized
  from public.hotspot_staff_devices d
  where d.credential_id = new.credential_id
    and d.is_authorized = true
    and (tg_op = 'INSERT' or d.id <> new.id);
  if v_authorized >= 1 then
    raise exception 'Maximum one authorized device per Staff credential' using errcode='23514';
  end if;
  return new;
end;
$lbbs_staff$;

revoke all on function public.enforce_hotspot_staff_device_limit() from public,anon,authenticated;
