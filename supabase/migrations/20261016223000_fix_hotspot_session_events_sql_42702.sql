-- LBBS WiFi: hotfix PostgreSQL 42702 on RouterOS LOGIN/LOGOUT.
-- The prior RETURNS TABLE(status, session_expires_at) conflicted with
-- unqualified column references in the SQL UPDATE statements.
-- Keep the existing API signature and never fabricate session events.

create or replace function public.record_hotspot_session_event(
  p_router_id uuid,
  p_voucher_id uuid,
  p_event text,
  p_mac text,
  p_ip inet,
  p_payload jsonb default '{}'::jsonb
)
returns table(status text, session_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v_voucher public.wifi_access_vouchers%rowtype;
begin
  if p_event not in ('LOGIN','LOGOUT') then
    raise exception 'Evento no permitido.';
  end if;

  select w.* into v_voucher
    from public.wifi_access_vouchers as w
   where w.id = p_voucher_id
     and w.router_id = p_router_id
   for update;

  if not found then
    raise exception 'Voucher no encontrado.';
  end if;

  if p_event = 'LOGIN' then
    if v_voucher.status not in ('activation_ready','active')
       or v_voucher.revocation_requested_at is not null
       or (v_voucher.device_mac is not null
           and lower(v_voucher.device_mac) <> lower(p_mac))
       or (v_voucher.session_expires_at is not null
           and v_voucher.session_expires_at <= now()) then
      raise exception 'Acceso no permitido.';
    end if;

    update public.wifi_access_vouchers as w
       set status = 'active',
           device_mac = coalesce(w.device_mac, p_mac),
           device_ip = coalesce(p_ip, w.device_ip),
           first_used_at = coalesce(w.first_used_at, now()),
           session_expires_at = coalesce(w.session_expires_at, now() + interval '3 hours'),
           updated_at = now()
     where w.id = v_voucher.id
     returning w.* into v_voucher;
  else
    if v_voucher.revocation_requested_at is null
       and v_voucher.status not in ('revoked','expired') then
      update public.wifi_access_vouchers as w
         set status = 'expired',
             expired_at = coalesce(w.expired_at, now()),
             updated_at = now()
       where w.id = v_voucher.id
       returning w.* into v_voucher;
    end if;
  end if;

  insert into public.hotspot_session_events
    (router_id,voucher_id,event_type,device_mac,device_ip,payload)
  values
    (p_router_id,p_voucher_id,p_event,p_mac,p_ip,coalesce(p_payload,'{}'::jsonb));

  return query select v_voucher.status, v_voucher.session_expires_at;
end;
$lbbs$;
