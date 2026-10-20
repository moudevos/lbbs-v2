-- LBBS Clientes v2.1: guarded automatic session expiry using existing RouterOS 35.
-- Inert until authorized router config is explicitly enabled.
-- The HotSpot API always invokes v2 snapshot with p_enforce=false.
-- This separate service_role-only RPC evaluates only proven post-activation
-- presence and prolonged absence; enqueues at most one command per poll.
-- Never reinstalls RouterOS scripts, triggers a logout or mutates Staff/POS.

create table if not exists public.hotspot_general_reconcile_config_v21 (
  router_id uuid primary key references public.hotspot_routers(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  last_queued_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hotspot_general_reconcile_enabled_guard_v21
    check (not enabled or enabled_at is not null)
);

alter table public.hotspot_general_reconcile_config_v21 enable row level security;
revoke all on public.hotspot_general_reconcile_config_v21 from public, anon, authenticated;
grant select, insert, update on public.hotspot_general_reconcile_config_v21 to service_role;

create or replace function public.process_hotspot_general_reconcile_v21(
  p_router_id uuid,
  p_active_voucher_ids uuid[]
)
returns table(auto_mode text, auto_queued integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs_general$
declare
  g public.hotspot_general_reconcile_config_v21%rowtype;
  v public.wifi_access_vouchers%rowtype;
  p public.hotspot_client_presence_v2%rowtype;
  v_now timestamptz := clock_timestamp();
  v_last_login timestamptz;
  v_reason text;
  v_command_id uuid;
begin
  if p_router_id is null or p_active_voucher_ids is null
     or cardinality(p_active_voucher_ids) > 256
     or array_position(p_active_voucher_ids, null) is not null
     or (select count(distinct id) from unnest(p_active_voucher_ids) as ids(id))
        <> cardinality(p_active_voucher_ids) then
    raise exception 'Invalid HotSpot general inventory.';
  end if;

  if (select count(*) from public.wifi_access_vouchers v
       where v.id = any(p_active_voucher_ids) and v.router_id = p_router_id)
      <> cardinality(p_active_voucher_ids) then
    raise exception 'Foreign voucher in HotSpot general inventory.';
  end if;

  -- Exclusive router-level gate serializes multiple calls and limits the
  -- operation to ONE confirmed voucher per 30-second polling interval.
  select * into g
  from public.hotspot_general_reconcile_config_v21
  where router_id = p_router_id for update;

  if not found or not g.enabled or g.enabled_at is null then
    return query select 'disabled'::text, 0;
    return;
  end if;

  -- Fail closed if the observing router has stopped sending snapshots.
  -- The current request has already updated v2 presence, but verify
  -- snapshot age again at the point a command is enqueued.
  if g.last_queued_at is not null
      and g.last_queued_at > v_now - interval '30 seconds' then
    return query select 'rate_limited'::text, 0;
    return;
  end if;

  -- Avoid the stale historical active sessions that existed before v2.1.
  -- A REAL positive presence snapshot AFTER enabling is mandatory.
  for v in
    select * from public.wifi_access_vouchers
     where router_id = p_router_id
       and status = 'active'
       and first_used_at is not null
       and device_mac is not null
       and revocation_requested_at is null
     order by session_expires_at asc nulls last, id
     for update
  loop
    select * into p
      from public.hotspot_client_presence_v2
     where voucher_id = v.id and router_id = p_router_id
     for update;

    if not found or p.last_present_at is null
       or p.last_present_at <= g.enabled_at
       or p.last_snapshot_at < v_now - interval '75 seconds'
       or p.last_snapshot_at > v_now + interval '5 seconds' then
      continue;
    end if;

    select max(e.occurred_at) into v_last_login
      from public.hotspot_session_events e
     where e.router_id = p_router_id and e.voucher_id = v.id
       and e.event_type = 'LOGIN';
    if v_last_login is null or v_last_login > p.last_present_at then
      continue;
    end if;

    v_reason := null;

    -- Three-hour deadline: a hard expiration even when still connected.
    if (v.session_expires_at is not null and v.session_expires_at <= v_now)
       or (v.session_expires_at is null
           and v.first_used_at + interval '3 hours' <= v_now) then
      v_reason := 'absolute_deadline';

    -- Disconnect expiry: only if the router's current FULL snapshot
    -- excludes the voucher, and multiple continuously spaced snapshots
    -- have observed it missing for >=3min since first omission.
    elsif v.id <> all(p_active_voucher_ids)
          and p.missing_since is not null
          and p.missing_since > g.enabled_at
          and p.missing_since > p.last_present_at
          and p.missing_count >= 4
          and p.missing_since + interval '3 minutes' <= v_now
          and p.last_present_at + interval '3 minutes' <= v_now
          and v_last_login + interval '3 minutes' <= v_now then
      v_reason := 'presence_grace_elapsed';
    end if;

    if v_reason is null then
      continue;
    end if;

    -- Do not retry previous expirations or override explicit revocations.
    if exists (
      select 1 from public.hotspot_router_commands c
       where c.router_id = p_router_id and c.voucher_id = v.id
         and c.command_type in ('EXPIRE_VOUCHER', 'REVOKE_VOUCHER')
    ) then
      continue;
    end if;

    v_command_id := null;
    insert into public.hotspot_router_commands(
      router_id, voucher_id, command_type, payload, idempotency_key
    ) values (
      p_router_id, v.id, 'EXPIRE_VOUCHER',
      jsonb_build_object('source', 'general_v21', 'reason', v_reason),
      'expire:' || v.id::text
    )
    on conflict (idempotency_key) do nothing
    returning id into v_command_id;

    if v_command_id is not null then
      update public.hotspot_general_reconcile_config_v21
        set last_queued_at = v_now, updated_at = v_now
       where router_id = p_router_id;
      return query select 'enabled'::text, 1;
      return;
    end if;
  end loop;

  return query select 'enabled'::text, 0;
end;
$lbbs_general$;

revoke all on function public.process_hotspot_general_reconcile_v21(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.process_hotspot_general_reconcile_v21(uuid,uuid[])
  to service_role;

notify pgrst, 'reload schema';
