-- Fase 2: tarjeta digital de cliente, QR revocable y proyección Google Wallet.
-- Ejecutar después de 150_customer_portal_state_history_realtime.sql.

create table if not exists public.customer_public_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  public_token text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  rotated_at timestamptz,
  last_used_at timestamptz,
  check ((status = 'active' and revoked_at is null) or status = 'revoked')
);
create unique index if not exists customer_public_tokens_one_active_idx
  on public.customer_public_tokens(customer_id) where status = 'active';
create index if not exists customer_public_tokens_active_lookup_idx
  on public.customer_public_tokens(public_token) where status = 'active';

create table if not exists public.wallet_passes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider text not null check (provider in ('google_wallet')),
  external_object_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  last_synced_at timestamptz,
  last_sync_hash text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(customer_id, provider)
);

create table if not exists public.customer_wallet_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_wallet_sync_outbox_pending_customer_idx
  on public.customer_wallet_sync_outbox(customer_id) where status in ('pending', 'processing');
create index if not exists customer_wallet_sync_outbox_ready_idx
  on public.customer_wallet_sync_outbox(status, available_at, created_at);

alter table public.customer_public_tokens enable row level security;
alter table public.wallet_passes enable row level security;
alter table public.customer_wallet_sync_outbox enable row level security;
revoke all on public.customer_public_tokens, public.wallet_passes, public.customer_wallet_sync_outbox from public, anon, authenticated;

create or replace function public.queue_customer_wallet_sync(p_customer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.customer_wallet_sync_outbox(customer_id, reason, status, available_at)
  values(p_customer_id, left(coalesce(nullif(btrim(p_reason), ''), 'customer_change'), 80), 'pending', now())
  on conflict (customer_id) where status in ('pending', 'processing') do update
    set reason = excluded.reason,
        available_at = least(customer_wallet_sync_outbox.available_at, now()),
        updated_at = now();
end;
$$;

create or replace function public.ensure_customer_public_token()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid; v_token public.customer_public_tokens%rowtype; v_value text;
begin
  select customer_id into v_customer_id from public.customer_accounts where auth_user_id = auth.uid() and status = 'active';
  if v_customer_id is null then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  select * into v_token from public.customer_public_tokens where customer_id = v_customer_id and status = 'active' for update;
  if found then return jsonb_build_object('token', v_token.public_token, 'status', v_token.status); end if;
  loop
    v_value := 'rw_' || upper(encode(extensions.gen_random_bytes(18), 'hex'));
    begin
      insert into public.customer_public_tokens(customer_id, public_token) values(v_customer_id, v_value) returning * into v_token;
      exit;
    exception when unique_violation then
      -- Una colisión criptográfica es improbable; se intenta un valor nuevo.
    end;
  end loop;
  perform public.queue_customer_wallet_sync(v_customer_id, 'qr_created');
  return jsonb_build_object('token', v_token.public_token, 'status', v_token.status);
end;
$$;

create or replace function public.rotate_customer_public_token()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid; v_token jsonb;
begin
  select customer_id into v_customer_id from public.customer_accounts where auth_user_id = auth.uid() and status = 'active';
  if v_customer_id is null then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  update public.customer_public_tokens set status = 'revoked', revoked_at = now(), rotated_at = now(), updated_at = now()
  where customer_id = v_customer_id and status = 'active';
  select public.ensure_customer_public_token() into v_token;
  perform public.queue_customer_wallet_sync(v_customer_id, 'qr_rotated');
  return v_token;
end;
$$;

create or replace function public.get_customer_digital_card()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid; v_token jsonb; v_summary jsonb; v_pass record;
begin
  select customer_id into v_customer_id from public.customer_accounts where auth_user_id = auth.uid() and status = 'active';
  if v_customer_id is null then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  select public.ensure_customer_public_token() into v_token;
  select status, last_synced_at into v_pass from public.wallet_passes where customer_id = v_customer_id and provider = 'google_wallet';
  select public.get_customer_loyalty_summary() into v_summary;
  return jsonb_build_object('summary', v_summary, 'publicToken', v_token->>'token', 'walletStatus', coalesce(v_pass.status, 'not_prepared'), 'walletLastSyncedAt', v_pass.last_synced_at);
end;
$$;

create or replace function public.resolve_customer_public_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_rewards record;
begin
  if not public.is_admin() then raise exception 'No tienes permisos para resolver tarjetas digitales.'; end if;
  select c.* into v_customer from public.customer_public_tokens t join public.customers c on c.id = t.customer_id
  where t.public_token = p_token and t.status = 'active';
  if not found then return jsonb_build_object('found', false); end if;
  update public.customer_public_tokens set last_used_at = now(), updated_at = now() where customer_id = v_customer.id and status = 'active';
  select * into v_rewards from public.vw_customer_rewards_summary where customer_id = v_customer.id;
  return jsonb_build_object('found', true, 'customerId', v_customer.id, 'name', v_customer.full_name,
    'documentMasked', case when length(coalesce(v_customer.document_number, '')) > 4 then repeat('*', length(v_customer.document_number)-4) || right(v_customer.document_number, 4) else v_customer.document_number end,
    'attentions', coalesce(v_rewards.total_service_visits, 0), 'availableRewards', coalesce(v_rewards.available_rewards_count, 0));
end;
$$;

create or replace function public.get_customer_wallet_projection(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_rewards record; v_token text; v_visits jsonb;
begin
  select * into v_customer from public.customers where id = p_customer_id;
  if not found then raise exception 'El cliente no existe.'; end if;
  select public_token into v_token from public.customer_public_tokens where customer_id = p_customer_id and status = 'active';
  if v_token is null then raise exception 'El cliente no tiene una tarjeta digital activa.'; end if;
  select * into v_rewards from public.vw_customer_rewards_summary where customer_id = p_customer_id;
  select coalesce(jsonb_agg(jsonb_build_object('date', occurred_at::date, 'services', services) order by occurred_at desc), '[]'::jsonb)
  into v_visits
  from (
    select l.created_at as occurred_at,
      coalesce(string_agg(distinct s.name, ', '), 'Atención de servicio') as services
    from public.customer_reward_ledger l
    left join public.sale_items si on si.sale_id = l.sale_id and si.item_type = 'service'
    left join public.services s on s.id = si.service_id
    where l.customer_id = p_customer_id and l.movement_type not in ('manual_migration', 'manual_adjustment', 'reversal')
    group by l.sale_id, l.created_at
    order by l.created_at desc
    limit 3
  ) visits;
  return jsonb_build_object('customerName', v_customer.full_name, 'publicToken', v_token,
    'memberId', 'LBBS-' || right(v_token, 8), 'attentions', coalesce(v_rewards.total_service_visits, 0),
    'availableRewards', coalesce(v_rewards.available_rewards_count, 0),
    'nextRewardName', v_rewards.next_reward_name, 'remaining', v_rewards.next_reward_remaining,
    'lastVisits', v_visits);
end;
$$;

create or replace function public.admin_rotate_customer_public_token(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_value text;
begin
  if not public.is_admin() then raise exception 'No tienes permisos para regenerar tarjetas digitales.'; end if;
  if not exists(select 1 from public.customers where id = p_customer_id) then raise exception 'El cliente no existe.'; end if;
  update public.customer_public_tokens set status = 'revoked', revoked_at = now(), rotated_at = now(), updated_at = now()
  where customer_id = p_customer_id and status = 'active';
  loop
    v_value := 'rw_' || upper(encode(extensions.gen_random_bytes(18), 'hex'));
    begin
      insert into public.customer_public_tokens(customer_id, public_token) values(p_customer_id, v_value);
      exit;
    exception when unique_violation then end;
  end loop;
  perform public.queue_customer_wallet_sync(p_customer_id, 'admin_qr_rotated');
  return jsonb_build_object('token', v_value);
end;
$$;

create or replace function public.get_customer_digital_wallet_status(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token record; v_pass record;
begin
  if not public.is_admin() then raise exception 'No tienes permisos para ver tarjeta digital.'; end if;
  select status, created_at into v_token from public.customer_public_tokens where customer_id = p_customer_id and status = 'active';
  select status, last_synced_at, last_error into v_pass from public.wallet_passes where customer_id = p_customer_id and provider = 'google_wallet';
  return jsonb_build_object('qrStatus', coalesce(v_token.status, 'not_created'), 'walletStatus', coalesce(v_pass.status, 'not_prepared'), 'walletLastSyncedAt', v_pass.last_synced_at, 'walletLastError', v_pass.last_error);
end;
$$;

create or replace function public.queue_customer_wallet_sync_from_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid;
begin
  v_customer_id := case when tg_op = 'DELETE' then old.customer_id else new.customer_id end;
  if v_customer_id is not null then perform public.queue_customer_wallet_sync(v_customer_id, tg_table_name || '_' || lower(tg_op)); end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists customer_reward_ledger_wallet_sync on public.customer_reward_ledger;
create trigger customer_reward_ledger_wallet_sync after insert or update or delete on public.customer_reward_ledger for each row execute function public.queue_customer_wallet_sync_from_event();
drop trigger if exists customer_reward_entitlements_wallet_sync on public.customer_reward_entitlements;
create trigger customer_reward_entitlements_wallet_sync after insert or update or delete on public.customer_reward_entitlements for each row execute function public.queue_customer_wallet_sync_from_event();
drop trigger if exists customer_reward_redemptions_wallet_sync on public.reward_redemptions;
create trigger customer_reward_redemptions_wallet_sync after insert or update or delete on public.reward_redemptions for each row execute function public.queue_customer_wallet_sync_from_event();
drop trigger if exists customer_public_tokens_wallet_sync on public.customer_public_tokens;
create trigger customer_public_tokens_wallet_sync after insert or update on public.customer_public_tokens for each row execute function public.queue_customer_wallet_sync_from_event();

revoke all on function public.queue_customer_wallet_sync(uuid, text), public.queue_customer_wallet_sync_from_event() from public, anon, authenticated;
revoke all on function public.ensure_customer_public_token(), public.rotate_customer_public_token(), public.get_customer_digital_card(), public.resolve_customer_public_token(text) from public, anon;
revoke all on function public.get_customer_wallet_projection(uuid) from public, anon, authenticated;
revoke all on function public.admin_rotate_customer_public_token(uuid), public.get_customer_digital_wallet_status(uuid) from public, anon;
grant execute on function public.ensure_customer_public_token(), public.rotate_customer_public_token(), public.get_customer_digital_card(), public.resolve_customer_public_token(text) to authenticated, service_role;
grant execute on function public.queue_customer_wallet_sync(uuid, text) to service_role;
grant execute on function public.get_customer_wallet_projection(uuid) to service_role;
grant execute on function public.admin_rotate_customer_public_token(uuid), public.get_customer_digital_wallet_status(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
