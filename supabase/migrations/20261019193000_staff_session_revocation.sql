create or replace function public.close_staff_sessions_on_revoke()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='hotspot_staff_credentials' then
  if old.is_enabled and not new.is_enabled then
   update public.hotspot_staff_sessions set ended_at=now(),end_reason='CREDENTIAL_DISABLED'
   where credential_id=new.id and ended_at is null;
  end if;
 else
  if old.is_authorized and not new.is_authorized then
   update public.hotspot_staff_sessions set ended_at=now(),end_reason='DEVICE_REVOKED'
   where device_id=new.id and ended_at is null;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists staff_credential_close_sessions on public.hotspot_staff_credentials;
create trigger staff_credential_close_sessions after update of is_enabled on public.hotspot_staff_credentials
for each row execute function public.close_staff_sessions_on_revoke();
drop trigger if exists staff_device_close_sessions on public.hotspot_staff_devices;
create trigger staff_device_close_sessions after update of is_authorized on public.hotspot_staff_devices
for each row execute function public.close_staff_sessions_on_revoke();
revoke all on function public.close_staff_sessions_on_revoke() from public,anon,authenticated;