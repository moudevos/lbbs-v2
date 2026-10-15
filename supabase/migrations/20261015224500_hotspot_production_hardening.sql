-- Hotspot production hardening.
-- Safe to apply before the application deploy: existing production code keeps using
-- the four-argument voucher generator and ignores the new activation RPC.

drop function if exists public.generate_wifi_access_voucher(uuid);

create unique index if not exists hotspot_routers_one_active_per_branch_idx
  on public.hotspot_routers(branch_id)
  where is_active and status = 'active';

create or replace function public.queue_hotspot_voucher_activation(
  p_voucher_id uuid,
  p_router_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_mac text,
  p_ip inet default null
)
returns table(status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_voucher public.wifi_access_vouchers%rowtype;
begin
  if p_mac is null or p_mac !~* '^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$' then
    raise exception 'MAC inválida.';
  end if;

  select *
    into v_voucher
    from public.wifi_access_vouchers
   where id = p_voucher_id
   for update;

  if not found
     or v_voucher.router_id is distinct from p_router_id
     or v_voucher.branch_id is distinct from p_branch_id then
    raise exception 'Voucher no disponible.';
  end if;

  if v_voucher.status not in ('available', 'registration_pending', 'activation_pending') then
    raise exception 'Voucher no disponible.';
  end if;

  if v_voucher.first_used_at is null and v_voucher.unused_expires_at <= now() then
    raise exception 'Voucher expirado.';
  end if;

  if v_voucher.device_mac is not null and lower(v_voucher.device_mac) <> lower(p_mac) then
    raise exception 'Voucher vinculado a otro dispositivo.';
  end if;

  update public.wifi_access_vouchers
     set customer_id = p_customer_id,
         device_mac = p_mac,
         device_ip = p_ip,
         claimed_at = coalesce(claimed_at, now()),
         status = 'activation_pending',
         updated_at = now()
   where id = p_voucher_id;

  insert into public.hotspot_router_commands(
    router_id,
    voucher_id,
    command_type,
    payload,
    idempotency_key
  )
  values(
    p_router_id,
    p_voucher_id,
    'ACTIVATE_VOUCHER',
    jsonb_build_object('mac', p_mac),
    'activate:' || p_voucher_id::text
  )
  on conflict (idempotency_key) do update
     set payload = excluded.payload,
         status = case
           when public.hotspot_router_commands.status = 'failed' then 'pending'
           else public.hotspot_router_commands.status
         end,
         claimed_at = case
           when public.hotspot_router_commands.status = 'failed' then null
           else public.hotspot_router_commands.claimed_at
         end,
         available_at = case
           when public.hotspot_router_commands.status = 'failed' then now()
           else public.hotspot_router_commands.available_at
         end,
         error_code = case
           when public.hotspot_router_commands.status = 'failed' then null
           else public.hotspot_router_commands.error_code
         end,
         error_message = case
           when public.hotspot_router_commands.status = 'failed' then null
           else public.hotspot_router_commands.error_message
         end,
         updated_at = now();

  return query select 'activation_pending'::text;
end;
$function$;

revoke execute on function public.queue_hotspot_voucher_activation(uuid, uuid, uuid, uuid, text, inet)
  from public, anon, authenticated;
grant execute on function public.queue_hotspot_voucher_activation(uuid, uuid, uuid, uuid, text, inet)
  to service_role;

revoke execute on function public.generate_wifi_access_voucher(uuid, text, text, text)
  from public, anon;
grant execute on function public.generate_wifi_access_voucher(uuid, text, text, text)
  to authenticated, service_role;

revoke execute on function public.claim_hotspot_router_commands(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_hotspot_router_commands(uuid, integer, integer)
  to service_role;

revoke execute on function public.ack_hotspot_router_command(uuid, uuid, boolean, jsonb, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.ack_hotspot_router_command(uuid, uuid, boolean, jsonb, text, text, text, integer)
  to service_role;

revoke execute on function public.record_hotspot_session_event(uuid, uuid, text, text, inet, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_hotspot_session_event(uuid, uuid, text, text, inet, jsonb)
  to service_role;
