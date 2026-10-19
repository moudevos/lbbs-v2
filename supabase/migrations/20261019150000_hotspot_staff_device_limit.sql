-- Enforce two authorized devices per staff credential at database level.
create or replace function public.enforce_hotspot_staff_device_limit()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare active_count integer;
begin
  new.mac_address := upper(new.mac_address);
  if not new.is_authorized then return new; end if;
  -- Lock the parent credential: concurrent inserts serialize on this row.
  perform 1 from public.hotspot_staff_credentials
    where id = new.credential_id and is_enabled = true for update;
  if not found then raise exception 'Staff credential is disabled or missing' using errcode='23514'; end if;
  select count(*) into active_count
  from public.hotspot_staff_devices d
  where d.credential_id = new.credential_id and d.is_authorized = true
    and (tg_op = 'INSERT' or d.id <> new.id);
  if active_count >= 2 then
    raise exception 'Maximum two authorized devices per Staff credential' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hotspot_staff_device_limit on public.hotspot_staff_devices;
create trigger trg_hotspot_staff_device_limit
before insert or update of credential_id, is_authorized, mac_address on public.hotspot_staff_devices
for each row execute function public.enforce_hotspot_staff_device_limit();
revoke all on function public.enforce_hotspot_staff_device_limit() from public, anon, authenticated;