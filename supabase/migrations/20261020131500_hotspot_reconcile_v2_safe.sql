-- LBBS Clientes: persistent observation-only session reconciliation v2.
-- Does not change finance, Staff, POS, existing vouchers or RouterOS.
-- Enforce requires BOTH trusted API environment flag and request flag.
-- Call only as service_role; authenticated/anon cannot run the function.

create table if not exists public.hotspot_client_presence_v2 (
  voucher_id uuid primary key references public.wifi_access_vouchers(id) on delete cascade,
  router_id uuid not null references public.hotspot_routers(id) on delete cascade,
  last_present_at timestamptz,
  missing_since timestamptz,
  missing_count integer not null default 0 check (missing_count >= 0),
  last_snapshot_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hotspot_client_presence_v2_router_idx
  on public.hotspot_client_presence_v2(router_id, last_snapshot_at desc);

create index if not exists hotspot_client_login_event_last_idx
  on public.hotspot_session_events(voucher_id, occurred_at desc)
  where event_type = 'LOGIN';

alter table public.hotspot_client_presence_v2 enable row level security;
revoke all on public.hotspot_client_presence_v2 from public, anon, authenticated;
grant select, insert, update on public.hotspot_client_presence_v2 to service_role;
-- No authenticated/anon policies; private RouterOS presence telemetry.

create or replace function public.reconcile_hotspot_client_sessions_v2(
  p_router_id uuid,
  p_active_voucher_ids uuid[],
  p_enforce boolean default false
)
returns table(
  seen_count integer,
  missing_count integer,
  grace_count integer,
  queued_count integer,
  would_queue_count integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v public.wifi_access_vouchers%rowtype;
  p public.hotspot_client_presence_v2%rowtype;
  v_now timestamptz := clock_timestamp();
  v_last_login timestamptz;
  v_reason text;
  v_due boolean;
  v_valid_ids integer;
  n_seen integer := 0;
  n_missing integer := 0;
  n_grace integer := 0;
  n_queued integer := 0;
  n_would integer := 0;
begin
  if p_router_id is null or p_active_voucher_ids is null
     or cardinality(p_active_voucher_ids) > 256
     or array_position(p_active_voucher_ids, null) is not null
     or (select count(distinct id) from unnest(p_active_voucher_ids) as ids(id))
        <> cardinality(p_active_voucher_ids) then
    raise exception 'Invalid HotSpot snapshot.';
  end if;

  -- A partial or foreign inventory must never cause a disconnect.
  select count(*) into v_valid_ids
  from public.wifi_access_vouchers as w
  where w.id = any(p_active_voucher_ids) and w.router_id = p_router_id;
  if v_valid_ids <> cardinality(p_active_voucher_ids) then
    raise exception 'Snapshot contains unknown or foreign voucher IDs.';
  end if;
  if (select count(*) from public.wifi_access_vouchers
      where router_id = p_router_id and status = 'active') > 256 then
    raise exception 'HotSpot reconciliation active voucher limit exceeded.';
  end if;

  -- Serializes with the existing LOGIN transaction by voucher row lock.
  for v in
    select * from public.wifi_access_vouchers
    where router_id = p_router_id and status = 'active'
    order by id for update
  loop
    v_due := false;
    v_last_login := null;
    insert into public.hotspot_client_presence_v2(voucher_id, router_id)
    values (v.id, p_router_id)
    on conflict (voucher_id) do nothing;

    select * into p from public.hotspot_client_presence_v2
    where voucher_id = v.id and router_id = p_router_id for update;

    if v.id = any(p_active_voucher_ids) then
      update public.hotspot_client_presence_v2
         set last_present_at = v_now,
             missing_since = null,
             missing_count = 0,
             last_snapshot_at = v_now,
             updated_at = v_now
       where voucher_id = v.id;
      n_seen := n_seen + 1;
    else
      n_missing := n_missing + 1;
      select max(e.occurred_at) into v_last_login
        from public.hotspot_session_events as e
       where e.voucher_id = v.id and e.router_id = p_router_id
         and e.event_type = 'LOGIN';

      if p.last_present_at is null
         or (v_last_login is not null and v_last_login > p.last_present_at) then
        -- Do not infer logout from a voucher never positively observed,
        -- or after a newer LOGIN than the last verified presence.
        update public.hotspot_client_presence_v2
           set last_present_at = null, missing_since = null,
               missing_count = 0, last_snapshot_at = v_now, updated_at = v_now
         where voucher_id = v.id;
      elsif p.missing_since is null
         or p.last_snapshot_at < v_now - interval '90 seconds' then
        -- Network gaps reset the missing timer; they don't advance it.
        update public.hotspot_client_presence_v2
           set missing_since = v_now, missing_count = 1,
               last_snapshot_at = v_now, updated_at = v_now
         where voucher_id = v.id;
        n_grace := n_grace + 1;
      else
        update public.hotspot_client_presence_v2
           set missing_count = p.missing_count + 1,
               last_snapshot_at = v_now, updated_at = v_now
         where voucher_id = v.id;

        if v_now >= p.missing_since + interval '3 minutes'
           and v_now >= p.last_present_at + interval '3 minutes'
           and (v_last_login is null or v_now >= v_last_login + interval '3 minutes')
           and p.missing_count + 1 >= 4 then
          v_due := true;
        else
          n_grace := n_grace + 1;
        end if;
      end if;
    end if;

    v_reason := null;
    -- Absolute expiration is anchored at first LOGIN; reconnections never reset it.
    if v.session_expires_at is not null and v.session_expires_at <= v_now then
      v_reason := 'absolute_deadline';
    elsif v.session_expires_at is null and v.first_used_at is not null
          and v.first_used_at + interval '3 hours' <= v_now then
      v_reason := 'absolute_deadline';
    elsif v.id <> all(p_active_voucher_ids)
          and coalesce(v_due,false)
          and v_last_login is not null then
      v_reason := 'presence_grace_elapsed';
    end if;

    if v_reason is not null and v.revocation_requested_at is null then
      n_would := n_would + 1;
      if coalesce(p_enforce,false) then
        insert into public.hotspot_router_commands(
          router_id, voucher_id, command_type, payload, idempotency_key
        ) values (
          p_router_id, v.id, 'EXPIRE_VOUCHER',
          jsonb_build_object('source','reconcile_v2','reason',v_reason),
          'expire:' || v.id::text
        ) on conflict (idempotency_key) do nothing;
        if found then n_queued := n_queued + 1; end if;
      end if;
    end if;
  end loop;

  return query select n_seen,n_missing,n_grace,n_queued,n_would;
end;
$lbbs$;

revoke all on function public.reconcile_hotspot_client_sessions_v2(uuid,uuid[],boolean)
  from public, anon, authenticated;
grant execute on function public.reconcile_hotspot_client_sessions_v2(uuid,uuid[],boolean)
  to service_role;

-- The Dashboard must reflect expiry only AFTER actual RouterOS EXPIRE ACK.
create or replace function public.hotspot_client_expire_ack_v2()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v public.wifi_access_vouchers%rowtype;
begin
  if new.command_type <> 'EXPIRE_VOUCHER'
     or new.status <> 'applied'
     or old.status = 'applied'
     or new.voucher_id is null then
    return new;
  end if;

  update public.wifi_access_vouchers
     set status = 'expired', expired_at = coalesce(expired_at, now()),
         updated_at = now()
   where id = new.voucher_id and router_id = new.router_id
     and status = 'active' and revocation_requested_at is null
   returning * into v;

  if found then
    insert into public.hotspot_session_events(
      router_id,voucher_id,event_type,device_mac,device_ip,payload
    ) values (
      new.router_id, v.id, 'SESSION_EXPIRED', v.device_mac, v.device_ip,
      jsonb_build_object('source','reconcile_v2',
                         'reason',coalesce(new.payload->>'reason','unknown'))
    );
  end if;
  return new;
end;
$lbbs$;

revoke all on function public.hotspot_client_expire_ack_v2() from public, anon, authenticated;
drop trigger if exists hotspot_client_expire_ack_v2 on public.hotspot_router_commands;
create trigger hotspot_client_expire_ack_v2
  after update of status on public.hotspot_router_commands
  for each row
  when (new.command_type = 'EXPIRE_VOUCHER' and new.status = 'applied')
  execute function public.hotspot_client_expire_ack_v2();

notify pgrst, 'reload schema';
