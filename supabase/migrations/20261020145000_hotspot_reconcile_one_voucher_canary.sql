-- LBBS WiFi Clientes: explicit ONE-voucher canary expiration only.
-- This migration is inert until a service_role operator selects a test voucher
-- and enables one router-bound canary for <= 45 min. No existing voucher is armed.
-- Does not alter the existing 35 observer, portal, Staff or WAN.

create table if not exists public.hotspot_reconcile_canary_v1 (
  router_id uuid primary key references public.hotspot_routers(id) on delete cascade,
  voucher_id uuid not null unique references public.wifi_access_vouchers(id) on delete cascade,
  enabled boolean not null default false,
  armed_at timestamptz,
  expires_at timestamptz,
  command_queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotspot_reconcile_canary_armed_guard check (
    not enabled or (
      armed_at is not null
      and expires_at is not null
      and expires_at > armed_at
      and expires_at <= armed_at + interval '45 minutes'
      and command_queued_at is null
    )
  )
);

alter table public.hotspot_reconcile_canary_v1 enable row level security;
revoke all on public.hotspot_reconcile_canary_v1 from public, anon, authenticated;
grant select, insert, update on public.hotspot_reconcile_canary_v1 to service_role;

-- A dedicated RPC; the standard observe-only RPC remains unchanged.
-- Never accepts a voucher ID to expire from the router request: its target is
-- selected out-of-band in the private service_role-only canary table.
create or replace function public.process_hotspot_client_canary_v1(
  p_router_id uuid,
  p_active_voucher_ids uuid[]
)
returns table(canary_state text, queued_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $lbbs_canary$
declare
  c public.hotspot_reconcile_canary_v1%rowtype;
  v public.wifi_access_vouchers%rowtype;
  p public.hotspot_client_presence_v2%rowtype;
  v_now timestamptz := clock_timestamp();
  v_last_login timestamptz;
  v_command_id uuid;
begin
  if p_router_id is null or p_active_voucher_ids is null
    or cardinality(p_active_voucher_ids) > 256
    or array_position(p_active_voucher_ids, null) is not null
    or (select count(distinct x) from unnest(p_active_voucher_ids) as ids(x))
       <> cardinality(p_active_voucher_ids) then
    raise exception 'Invalid canary snapshot.';
  end if;

  -- The normal v2 observer validates the entire inventory before this call;
  -- revalidate here as a defense in depth against a future API regression.
  if (
    select count(*) from public.wifi_access_vouchers w
    where w.router_id = p_router_id and w.id = any(p_active_voucher_ids)
  ) <> cardinality(p_active_voucher_ids) then
    raise exception 'Foreign canary voucher in snapshot.';
  end if;

  select * into c
  from public.hotspot_reconcile_canary_v1
  where router_id = p_router_id for update;

  if not found or not c.enabled then
    return query select 'unarmed'::text, 0;
    return;
  end if;

  if c.expires_at <= v_now then
    update public.hotspot_reconcile_canary_v1
       set enabled=false, updated_at=v_now
     where router_id=p_router_id;
    return query select 'arming_expired'::text, 0;
    return;
  end if;

  select * into v from public.wifi_access_vouchers
   where id=c.voucher_id and router_id=p_router_id for update;

  if not found or v.status <> 'active'
     or v.revocation_requested_at is not null or v.device_mac is null then
    update public.hotspot_reconcile_canary_v1
       set enabled=false, updated_at=v_now where router_id=p_router_id;
    return query select 'voucher_not_eligible'::text, 0;
    return;
  end if;

  if c.voucher_id = any(p_active_voucher_ids) then
    return query select 'voucher_present'::text, 0;
    return;
  end if;

  select * into p from public.hotspot_client_presence_v2
   where voucher_id=c.voucher_id and router_id=p_router_id for update;

  -- Must have been positively SEEN after arming. An old stale "active"
  -- DB row cannot be selected and expired from historical absence data.
  if not found or p.last_present_at is null
    or p.last_present_at <= c.armed_at
    or p.missing_since is null
    or p.missing_since <= c.armed_at
    or p.missing_since <= p.last_present_at
    or p.missing_count < 4
    or p.last_snapshot_at < v_now - interval '75 seconds'
    or p.last_snapshot_at > v_now + interval '5 seconds'
    or p.missing_since + interval '3 minutes' > v_now
    or p.last_present_at + interval '3 minutes' > v_now then
    return query select 'not_ready'::text, 0;
    return;
  end if;

  select max(e.occurred_at) into v_last_login
   from public.hotspot_session_events e
   where e.router_id=p_router_id and e.voucher_id=c.voucher_id
     and e.event_type='LOGIN';

  if v_last_login is null or v_last_login > p.last_present_at
    or v_last_login + interval '3 minutes' > v_now then
    return query select 'login_not_confirmed'::text, 0;
    return;
  end if;

  -- Never collide with an older, already pending/failed/applied expiration.
  if exists (
    select 1 from public.hotspot_router_commands q
    where q.voucher_id=c.voucher_id and q.router_id=p_router_id
      and q.command_type='EXPIRE_VOUCHER'
  ) then
    return query select 'prior_expiry_command'::text, 0;
    return;
  end if;

  insert into public.hotspot_router_commands(
    router_id, voucher_id, command_type, payload, idempotency_key
  ) values (
    p_router_id, c.voucher_id, 'EXPIRE_VOUCHER',
    jsonb_build_object('source','canary_v1','reason','presence_grace_elapsed'),
    'expire:' || c.voucher_id::text
  )
  on conflict (idempotency_key) do nothing
  returning id into v_command_id;

  if v_command_id is null then
    return query select 'command_conflict'::text, 0;
    return;
  end if;

  -- One-shot: immediately disarm upon successful queue insertion.
  update public.hotspot_reconcile_canary_v1
    set enabled=false, command_queued_at=v_now, updated_at=v_now
   where router_id=p_router_id and voucher_id=c.voucher_id;

  return query select 'queued'::text, 1;
end;
$lbbs_canary$;

revoke all on function public.process_hotspot_client_canary_v1(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.process_hotspot_client_canary_v1(uuid,uuid[])
  to service_role;

notify pgrst, 'reload schema';
