-- Red Hotspot LBBS end-to-end hardening. Execute this timestamped migration once.
-- Mirror: src/sql/20261006120000_hotspot_end_to_end.sql. Do not edit Release 170.
alter table public.hotspot_routers add column if not exists uptime text;
alter table public.wifi_access_vouchers add column if not exists expired_at timestamptz;

create or replace function public.generate_wifi_access_voucher(
  p_branch_id uuid, p_code_hash text, p_code_last4 text, p_code_ciphertext text
) returns table(id uuid, code_last4 text, unused_expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_router uuid; v_id uuid; v_expiry timestamptz := now() + interval '30 minutes';
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede generar accesos WiFi.'; end if;
  if not public.can_manage_pos_branch(p_branch_id) then raise exception 'No tienes acceso a esta sede.'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' or p_code_last4 !~ '^[0-9]{4}$' or nullif(p_code_ciphertext,'') is null then raise exception 'Solicitud de voucher invÃ¡lida.'; end if;
  select id into v_router from public.hotspot_routers where branch_id=p_branch_id and is_active and status='active' limit 1 for share;
  if v_router is null then raise exception 'La sede no tiene un router Hotspot activo.'; end if;
  insert into public.wifi_access_vouchers(branch_id,router_id,code_hash,code_last4,code_ciphertext,created_by,unused_expires_at,status,router_sync_status)
  values(p_branch_id,v_router,p_code_hash,p_code_last4,p_code_ciphertext,public.current_employee_id(),v_expiry,'pending_sync','pending') returning wifi_access_vouchers.id into v_id;
  insert into public.hotspot_router_commands(router_id,voucher_id,command_type,payload,idempotency_key)
  values(v_router,v_id,'CREATE_VOUCHER','{}'::jsonb,'create:'||v_id::text);
  return query select v_id,p_code_last4,v_expiry;
end; $$;

create or replace function public.ack_hotspot_router_command(
  p_router_id uuid,p_command_id uuid,p_success boolean,p_result jsonb default null,p_error_code text default null,p_error_message text default null,p_router_user_id text default null,p_retry_limit integer default 3
) returns table(outcome text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.hotspot_router_commands%rowtype; ecode text:=nullif(left(regexp_replace(coalesce(p_error_code,''),'[[:cntrl:]]','','g'),100),''); emessage text:=nullif(left(regexp_replace(coalesce(p_error_message,''),'[[:cntrl:]]','','g'),500),'');
begin
 select * into c from public.hotspot_router_commands where id=p_command_id and router_id=p_router_id for update;
 if not found then return query select 'not_found'::text; return; end if;
 if c.status='applied' then return query select 'applied'::text; return; end if;
 if c.status<>'processing' then return query select 'not_processing'::text; return; end if;
 if not p_success then
   if c.attempts < greatest(p_retry_limit,1) then update public.hotspot_router_commands set status='pending',claimed_at=null,error_code=ecode,error_message=emessage,updated_at=now() where id=c.id; return query select 'retrying'::text; return; end if;
   update public.hotspot_router_commands set status='failed',processed_at=now(),error_code=ecode,error_message=emessage,updated_at=now() where id=c.id;
   if c.command_type='CREATE_VOUCHER' then update public.wifi_access_vouchers set status='sync_error',router_sync_status='error',updated_at=now() where id=c.voucher_id and status='pending_sync'; end if;
   return query select 'failed'::text; return;
 end if;
 update public.hotspot_router_commands set status='applied',processed_at=now(),result=p_result,error_code=null,error_message=null,updated_at=now() where id=c.id;
 if c.command_type='CREATE_VOUCHER' then update public.wifi_access_vouchers set status='available',router_sync_status='synced',router_synced_at=now(),code_ciphertext=null,mikrotik_user_id=coalesce(nullif(left(p_router_user_id,255),''),mikrotik_user_id),updated_at=now() where id=c.voucher_id and status='pending_sync'; end if;
 if c.command_type='ACTIVATE_VOUCHER' then update public.wifi_access_vouchers set status='activation_ready',updated_at=now() where id=c.voucher_id and status='activation_pending'; end if;
 if c.command_type='REVOKE_VOUCHER' then update public.wifi_access_vouchers set status='revoked',revoked_at=now(),updated_at=now() where id=c.voucher_id and status<>'expired'; end if;
 if c.command_type='EXPIRE_VOUCHER' then update public.wifi_access_vouchers set status='expired',expired_at=now(),updated_at=now() where id=c.voucher_id and status<>'revoked'; end if;
 return query select 'applied'::text;
end; $$;

create or replace function public.record_hotspot_session_event(p_router_id uuid,p_voucher_id uuid,p_event text,p_mac text,p_ip inet,p_payload jsonb default '{}'::jsonb)
returns table(status text, session_expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.wifi_access_vouchers%rowtype;
begin
 if p_event not in ('LOGIN','LOGOUT') then raise exception 'Evento no permitido.'; end if;
 select * into v from public.wifi_access_vouchers where id=p_voucher_id and router_id=p_router_id for update;
 if not found then raise exception 'Voucher no encontrado.'; end if;
 if p_event='LOGIN' then
   if v.status not in ('activation_ready','active') or (v.device_mac is not null and lower(v.device_mac)<>lower(p_mac)) then raise exception 'Acceso no permitido.'; end if;
   update public.wifi_access_vouchers set status='active',device_mac=coalesce(device_mac,p_mac),device_ip=p_ip,first_used_at=coalesce(first_used_at,now()),session_expires_at=coalesce(session_expires_at,now()+interval '3 hours'),updated_at=now() where id=v.id returning * into v;
 else
   update public.wifi_access_vouchers set status='expired',expired_at=now(),updated_at=now() where id=v.id and status<>'revoked' returning * into v;
 end if;
 insert into public.hotspot_session_events(router_id,voucher_id,event_type,device_mac,device_ip,payload) values(p_router_id,p_voucher_id,p_event,p_mac,p_ip,coalesce(p_payload,'{}'::jsonb));
 return query select v.status,v.session_expires_at;
end; $$;

revoke all on function public.generate_wifi_access_voucher(uuid),public.generate_wifi_access_voucher(uuid,text,text,text),public.consume_wifi_access_voucher(text,text),public.claim_hotspot_router_commands(uuid,integer,integer),public.ack_hotspot_router_command(uuid,uuid,boolean,jsonb,text,text,text,integer),public.record_hotspot_session_event(uuid,uuid,text,text,inet,jsonb) from public,anon,authenticated;
grant execute on function public.generate_wifi_access_voucher(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.claim_hotspot_router_commands(uuid,integer,integer),public.ack_hotspot_router_command(uuid,uuid,boolean,jsonb,text,text,text,integer),public.record_hotspot_session_event(uuid,uuid,text,text,inet,jsonb) to service_role;
notify pgrst,'reload schema';
