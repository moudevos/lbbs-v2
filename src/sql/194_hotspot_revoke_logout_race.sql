-- Preserve explicit REVOKE_VOUCHER semantics if RouterOS on-logout reports
-- LOGOUT before the command ACK reaches the backend.

create or replace function public.ack_hotspot_router_command(
  p_router_id uuid,
  p_command_id uuid,
  p_success boolean,
  p_result jsonb default null::jsonb,
  p_error_code text default null::text,
  p_error_message text default null::text,
  p_router_user_id text default null::text,
  p_retry_limit integer default 3
)
returns table(outcome text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

revoke execute on function public.ack_hotspot_router_command(
  uuid, uuid, boolean, jsonb, text, text, text, integer
) from public, anon, authenticated;

grant execute on function public.ack_hotspot_router_command(
  uuid, uuid, boolean, jsonb, text, text, text, integer
) to service_role;
