-- LBBS Staff: operator confirms TWO authorized devices per Staff credential.
-- Follow-up migration because the one-device limit was already applied in DB.
-- No Staff HotSpot, network change, Clientes voucher or preexisting device is touched.
-- Guard against preexisting violations; 2-device slot enforcement serializes on
-- the credential parent row and checks the current count.
do $lbbs$
begin
  if exists (
    select 1 from public.hotspot_staff_devices
    where is_authorized = true
    group by credential_id
    having count(*) > 2
  ) then
    raise exception 'Staff two-device migration blocked: >2 existing authorized devices';
  end if;
end;
$lbbs$;

drop index if exists public.hotspot_staff_one_authorized_device_uidx;

create or replace function public.enforce_hotspot_staff_device_limit()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $lbbs_staff$
declare
  v_authorized integer;
begin
  new.mac_address := upper(new.mac_address);
  if not new.is_authorized then return new; end if;

  -- Prevent parallel requests racing past the 2-device cap.
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

  if v_authorized >= 2 then
    raise exception 'Maximum two authorized devices per Staff credential'
      using errcode='23514';
  end if;
  return new;
end;
$lbbs_staff$;

revoke all on function public.enforce_hotspot_staff_device_limit()
  from public, anon, authenticated;
comment on table public.hotspot_staff_devices is
  'Authorized Staff MAC addresses. Maximum 2 active devices per credential, enforced by trigger with parent-row lock.';
