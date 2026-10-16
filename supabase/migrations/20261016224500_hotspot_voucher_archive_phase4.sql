-- LBBS WiFi / Fase 4: archivo administrativo reversible de vouchers finalizados.
-- Archivado es presentación e historial; nunca revoca ni desconecta el HotSpot.
alter table public.wifi_access_vouchers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.employees(id) on delete set null;

create index if not exists wifi_vouchers_archived_history_idx
  on public.wifi_access_vouchers (branch_id, archived_at desc, id)
  where archived_at is not null;

create table if not exists public.hotspot_voucher_archive_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.wifi_access_vouchers(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  action text not null check (action in ('archive', 'restore')),
  created_at timestamptz not null default now()
);

create index if not exists hotspot_archive_events_voucher_idx
  on public.hotspot_voucher_archive_events (voucher_id, created_at desc);

alter table public.hotspot_voucher_archive_events enable row level security;

create policy hotspot_voucher_archive_events_admin_read
on public.hotspot_voucher_archive_events
for select to authenticated
using (public.is_admin() and public.can_manage_pos_branch(branch_id));

-- Limits: 100 codes per operation, branch-scoped, row-locked and idempotent.
-- Non-finalized/usable codes cannot be hidden accidentally.
create or replace function public.set_hotspot_voucher_archived(
  p_branch_id uuid,
  p_voucher_ids uuid[],
  p_archived boolean
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v_ids uuid[];
  v_matched integer;
  v_changed integer;
  v_actor uuid;
begin
  if not public.is_admin() or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permiso para gestionar el historial de esta sede.';
  end if;
  if p_archived is null or p_voucher_ids is null
    or cardinality(p_voucher_ids) < 1 or cardinality(p_voucher_ids) > 100 then
    raise exception 'Selecciona entre 1 y 100 accesos.';
  end if;
  if array_position(p_voucher_ids,null) is not null then
    raise exception 'La selección contiene identificadores inválidos.';
  end if;

  select array_agg(distinct uid) into v_ids from unnest(p_voucher_ids) as uid;
  select count(*) into v_matched
    from (
      select id from public.wifi_access_vouchers
       where branch_id = p_branch_id and id = any(v_ids)
       order by id for update
    ) locked;
  if v_matched <> cardinality(v_ids) then
    raise exception 'Uno o más accesos no pertenecen a esta sede.';
  end if;

  if p_archived and exists (
    select 1 from public.wifi_access_vouchers v
     where v.id = any(v_ids)
       and (
         (v.revocation_requested_at is not null and v.status <> 'revoked')
         or not (
           v.status in ('expired','revoked')
           or (
             v.status in ('available','registration_pending')
             and v.first_used_at is null
             and v.unused_expires_at <= now()
           )
         )
       )
  ) then
    raise exception 'Solo puedes archivar accesos vencidos o revocados. Espera a que finalicen las operaciones pendientes.';
  end if;

  v_actor := public.current_employee_id();
  if p_archived then
    with changed as (
      update public.wifi_access_vouchers
         set archived_at = now(), archived_by = v_actor, updated_at = now()
       where id = any(v_ids) and archived_at is null
       returning id, branch_id
    ), logged as (
      insert into public.hotspot_voucher_archive_events
        (voucher_id, branch_id, employee_id, action)
      select id, branch_id, v_actor, 'archive' from changed
      returning id
    )
    select count(*) into v_changed from logged;
  else
    with changed as (
      update public.wifi_access_vouchers
         set archived_at = null, archived_by = null, updated_at = now()
       where id = any(v_ids) and archived_at is not null
       returning id, branch_id
    ), logged as (
      insert into public.hotspot_voucher_archive_events
        (voucher_id, branch_id, employee_id, action)
      select id, branch_id, v_actor, 'restore' from changed
      returning id
    )
    select count(*) into v_changed from logged;
  end if;

  return v_changed;
end;
$lbbs$;

-- Archives up to 100 eligible *expired* vouchers per click across the branch,
-- including older items beyond the default 100-row operating list.
create or replace function public.archive_expired_hotspot_vouchers(
  p_branch_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $lbbs$
declare
  v_ids uuid[];
begin
  if not public.is_admin() or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permiso para gestionar el historial de esta sede.';
  end if;

  select array_agg(id) into v_ids
  from (
    select id from public.wifi_access_vouchers
     where branch_id = p_branch_id and archived_at is null
       and revocation_requested_at is null
       and (
         status = 'expired'
         or (
           status in ('available','registration_pending')
           and first_used_at is null and unused_expires_at <= now()
         )
       )
     order by created_at, id limit 100
  ) eligible;

  if coalesce(cardinality(v_ids),0) = 0 then return 0; end if;
  return public.set_hotspot_voucher_archived(p_branch_id, v_ids, true);
end;
$lbbs$;

revoke all on function public.set_hotspot_voucher_archived(uuid,uuid[],boolean) from public;
revoke all on function public.set_hotspot_voucher_archived(uuid,uuid[],boolean) from anon;
grant execute on function public.set_hotspot_voucher_archived(uuid,uuid[],boolean) to authenticated;

revoke all on function public.archive_expired_hotspot_vouchers(uuid) from public;
revoke all on function public.archive_expired_hotspot_vouchers(uuid) from anon;
grant execute on function public.archive_expired_hotspot_vouchers(uuid) to authenticated;
