-- LBBS HotSpot phase 3: atomic per-branch manual revocation, awaiting RouterOS ACK.
alter table public.wifi_access_vouchers
  add column if not exists revocation_requested_at timestamptz,
  add column if not exists revocation_requested_by uuid references public.employees(id) on delete set null;

create index if not exists wifi_vouchers_revocation_pending_idx
  on public.wifi_access_vouchers (router_id, revocation_requested_at)
  where revocation_requested_at is not null and status <> 'revoked';

create or replace function public.request_hotspot_voucher_revocation(
  p_voucher_id uuid, p_branch_id uuid, p_reason text default 'manual_revoke'
) returns table(outcome text, command_id uuid)
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v public.wifi_access_vouchers%rowtype;
  c public.hotspot_router_commands%rowtype;
  v_command_id uuid;
  v_key text;
begin
  if not public.is_admin() or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para administrar los accesos de esta sede.';
  end if;
  if p_reason not in ('manual_revoke','manual_disconnect') then
    raise exception 'Motivo de revocación inválido.';
  end if;
  select * into v from public.wifi_access_vouchers
   where id=p_voucher_id and branch_id=p_branch_id for update;
  if not found then raise exception 'Acceso WiFi no encontrado en esta sede.'; end if;
  if v.status='revoked' then
    return query select 'revoked'::text, null::uuid; return;
  end if;
  if v.status='expired' then raise exception 'El acceso ya está expirado.'; end if;

  v_key:='revoke:' || v.id::text;
  select * into c from public.hotspot_router_commands where idempotency_key=v_key;
  if found and c.status='applied' then
    return query select 'revoked'::text,c.id; return;
  end if;
  if found and c.status in ('pending','processing') then
    return query select 'already_queued'::text,c.id; return;
  end if;

  update public.wifi_access_vouchers
     set revocation_requested_at=coalesce(revocation_requested_at,now()),
         revocation_requested_by=coalesce(revocation_requested_by,public.current_employee_id()),
         updated_at=now()
   where id=v.id;

  if c.status='failed' then
    update public.hotspot_router_commands
       set status='pending',attempts=0,claimed_at=null,processed_at=null,
           acknowledged_at=null,available_at=now(),error_code=null,
           error_message=null,updated_at=now()
     where id=c.id;
    v_command_id:=c.id;
  else
    insert into public.hotspot_router_commands
      (router_id,voucher_id,command_type,payload,idempotency_key)
    values
      (v.router_id,v.id,'REVOKE_VOUCHER',
       jsonb_build_object('source','dashboard','reason',p_reason),v_key)
    returning id into v_command_id;
  end if;
  return query select 'queued'::text,v_command_id;
end;
$lbbs$;

revoke all on function public.request_hotspot_voucher_revocation(uuid,uuid,text) from public;
revoke all on function public.request_hotspot_voucher_revocation(uuid,uuid,text) from anon;
grant execute on function public.request_hotspot_voucher_revocation(uuid,uuid,text) to authenticated;

-- Prevent activation and new registrations after a revoke request.
CREATE OR REPLACE FUNCTION public.queue_hotspot_voucher_activation(p_voucher_id uuid, p_router_id uuid, p_branch_id uuid, p_customer_id uuid, p_mac text, p_ip inet DEFAULT NULL::inet)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
     or v_voucher.branch_id is distinct from p_branch_id
     or v_voucher.revocation_requested_at is not null then
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
$function$
;

-- The RouterOS LOGOUT hook may fire before REVOKE_VOUCHER ACK.
CREATE OR REPLACE FUNCTION public.record_hotspot_session_event(p_router_id uuid, p_voucher_id uuid, p_event text, p_mac text, p_ip inet, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(status text, session_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v public.wifi_access_vouchers%rowtype;
begin
 if p_event not in ('LOGIN','LOGOUT') then raise exception 'Evento no permitido.'; end if;
 select * into v from public.wifi_access_vouchers where id=p_voucher_id and router_id=p_router_id for update;
 if not found then raise exception 'Voucher no encontrado.'; end if;
 if p_event='LOGIN' then
   if v.status not in ('activation_ready','active') or (v.device_mac is not null and lower(v.device_mac)<>lower(p_mac)) then raise exception 'Acceso no permitido.'; end if;
   update public.wifi_access_vouchers set status='active',device_mac=coalesce(device_mac,p_mac),device_ip=p_ip,first_used_at=coalesce(first_used_at,now()),session_expires_at=coalesce(session_expires_at,now()+interval '3 hours'),updated_at=now() where id=v.id returning * into v;
 else
   if v.revocation_requested_at is null then update public.wifi_access_vouchers set status='expired',expired_at=now(),updated_at=now() where id=v.id and status<>'revoked' returning * into v; end if;
 end if;
 insert into public.hotspot_session_events(router_id,voucher_id,event_type,device_mac,device_ip,payload) values(p_router_id,p_voucher_id,p_event,p_mac,p_ip,coalesce(p_payload,'{}'::jsonb));
 return query select v.status,v.session_expires_at;
end; $function$
;

-- ACK marks the final revoked state and wipes recoverable ciphertext.
CREATE OR REPLACE FUNCTION public.ack_hotspot_router_command(p_router_id uuid, p_command_id uuid, p_success boolean, p_result jsonb DEFAULT NULL::jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_router_user_id text DEFAULT NULL::text, p_retry_limit integer DEFAULT 3)
 RETURNS TABLE(outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.hotspot_router_commands%rowtype;
  ecode text := nullif(left(regexp_replace(coalesce(p_error_code,''),'[[:cntrl:]]','','g'),100),'');
  emessage text := nullif(left(regexp_replace(coalesce(p_error_message,''),'[[:cntrl:]]','','g'),500),'');
begin
  select *
    into c
    from public.hotspot_router_commands
   where id = p_command_id
     and router_id = p_router_id
   for update;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;

  if c.status = 'applied' then
    return query select 'applied'::text;
    return;
  end if;

  if c.status <> 'processing' then
    return query select 'not_processing'::text;
    return;
  end if;

  if not p_success then
    if c.attempts < greatest(p_retry_limit,1) then
      update public.hotspot_router_commands
         set status='pending',
             claimed_at=null,
             error_code=ecode,
             error_message=emessage,
             updated_at=now()
       where id=c.id;
      return query select 'retrying'::text;
      return;
    end if;

    update public.hotspot_router_commands
       set status='failed',
           processed_at=now(),
           error_code=ecode,
           error_message=emessage,
           updated_at=now()
     where id=c.id;

    if c.command_type='CREATE_VOUCHER' then
      update public.wifi_access_vouchers
         set status='sync_error',
             router_sync_status='error',
             updated_at=now()
       where id=c.voucher_id
         and status='pending_sync';
    end if;

    return query select 'failed'::text;
    return;
  end if;

  update public.hotspot_router_commands
     set status='applied',
         processed_at=now(),
         result=p_result,
         error_code=null,
         error_message=null,
         updated_at=now()
   where id=c.id;

  if c.command_type='CREATE_VOUCHER' then
    update public.wifi_access_vouchers
       set status='available',
           router_sync_status='synced',
           router_synced_at=now(),
           code_ciphertext=null,
           mikrotik_user_id=coalesce(nullif(left(p_router_user_id,255),''),mikrotik_user_id),
           updated_at=now()
     where id=c.voucher_id
       and status='pending_sync';
  end if;

  if c.command_type='ACTIVATE_VOUCHER' then
    update public.wifi_access_vouchers
       set status='activation_ready',
           updated_at=now()
     where id=c.voucher_id
       and status='activation_pending';
  end if;

  -- An explicit revoke wins over the LOGOUT event caused by disconnecting the
  -- active HotSpot user as part of the revoke command.
  if c.command_type='REVOKE_VOUCHER' then
    update public.wifi_access_vouchers
       set status='revoked',
           code_ciphertext=null,
           revoked_at=coalesce(revoked_at,now()),
           updated_at=now()
     where id=c.voucher_id
       and status<>'revoked';
  end if;

  -- Expiry must never overwrite an explicitly revoked voucher.
  if c.command_type='EXPIRE_VOUCHER' then
    update public.wifi_access_vouchers
       set status='expired',
           expired_at=coalesce(expired_at,now()),
           updated_at=now()
     where id=c.voucher_id
       and status<>'revoked';
  end if;

  return query select 'applied'::text;
end;
$function$
;
