create table if not exists public.cash_movement_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  movement_direction text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_id uuid references public.cash_movement_categories(id) on delete set null,
  movement_type text not null,
  amount numeric(12,2) not null,
  description text not null,
  evidence_url text,
  status text not null default 'active',
  created_by uuid references public.employees(id) on delete set null,
  cancelled_by uuid references public.employees(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movement_categories_direction_check'
      and conrelid = 'public.cash_movement_categories'::regclass
  ) then
    alter table public.cash_movement_categories
      add constraint cash_movement_categories_direction_check
      check (movement_direction in ('income', 'expense', 'adjustment'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movement_categories_sort_order_check'
      and conrelid = 'public.cash_movement_categories'::regclass
  ) then
    alter table public.cash_movement_categories
      add constraint cash_movement_categories_sort_order_check
      check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_type_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_type_check
      check (movement_type in ('income', 'expense', 'adjustment'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_status_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_status_check
      check (status in ('active', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_amount_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_amount_check
      check (amount > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_description_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_description_check
      check (nullif(btrim(description), '') is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_cancelled_at_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_cancelled_at_check
      check (status <> 'cancelled' or cancelled_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_cancelled_reason_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_cancelled_reason_check
      check (status <> 'cancelled' or nullif(btrim(cancelled_reason), '') is not null);
  end if;
end $$;

create index if not exists cash_movement_categories_code_idx
  on public.cash_movement_categories (code);

create index if not exists cash_movements_pos_session_id_idx
  on public.cash_movements (pos_session_id);

create index if not exists cash_movements_branch_id_idx
  on public.cash_movements (branch_id);

create index if not exists cash_movements_status_idx
  on public.cash_movements (status);

create index if not exists cash_movements_created_at_desc_idx
  on public.cash_movements (created_at desc);

create index if not exists cash_movements_movement_type_idx
  on public.cash_movements (movement_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

drop trigger if exists cash_movement_categories_set_updated_at on public.cash_movement_categories;
create trigger cash_movement_categories_set_updated_at
before update on public.cash_movement_categories
for each row execute function public.set_updated_at();

drop trigger if exists cash_movements_set_updated_at on public.cash_movements;
create trigger cash_movements_set_updated_at
before update on public.cash_movements
for each row execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pos_session_events_event_type_check'
      and conrelid = 'public.pos_session_events'::regclass
  ) then
    alter table public.pos_session_events
      drop constraint pos_session_events_event_type_check;
  end if;

  alter table public.pos_session_events
    add constraint pos_session_events_event_type_check
    check (
      event_type in (
        'opened',
        'closed',
        'reopened',
        'sale_completed',
        'sale_cancelled',
        'cash_movement_created',
        'cash_movement_cancelled',
        'note'
      )
    );
exception
  when duplicate_object then
    null;
end $$;

create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_total_sales numeric(12,2) := 0;
  v_total_cash numeric(12,2) := 0;
  v_total_wallet numeric(12,2) := 0;
  v_total_card numeric(12,2) := 0;
  v_total_cancelled numeric(12,2) := 0;
  v_sales_count integer := 0;
  v_cancelled_sales_count integer := 0;
  v_cash_income numeric(12,2) := 0;
  v_cash_expense numeric(12,2) := 0;
  v_cash_adjustment numeric(12,2) := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  select
    coalesce(sum(case when s.status = 'completed' then s.total else 0 end), 0),
    coalesce(sum(case when s.status = 'cancelled' then s.total else 0 end), 0),
    coalesce(count(*) filter (where s.status = 'completed'), 0),
    coalesce(count(*) filter (where s.status = 'cancelled'), 0)
  into
    v_total_sales,
    v_total_cancelled,
    v_sales_count,
    v_cancelled_sales_count
  from public.sales s
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(sp.amount) filter (where pm.code = 'cash' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'card_pos' and s.status = 'completed'), 0)
  into
    v_total_cash,
    v_total_wallet,
    v_total_card
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(case when cm.movement_type = 'income' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'expense' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'adjustment' then cm.amount else 0 end), 0)
  into
    v_cash_income,
    v_cash_expense,
    v_cash_adjustment
  from public.cash_movements cm
  where cm.pos_session_id = p_session_id
    and cm.status = 'active';

  update public.pos_sessions
  set total_sales_amount = v_total_sales,
      total_cash_amount = v_total_cash,
      total_wallet_qr_amount = v_total_wallet,
      total_card_pos_amount = v_total_card,
      total_cancelled_amount = v_total_cancelled,
      sales_count = v_sales_count,
      cancelled_sales_count = v_cancelled_sales_count,
      expected_cash_amount = coalesce(opening_cash_amount, 0)
        + v_total_cash
        + v_cash_income
        - v_cash_expense
        + v_cash_adjustment
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function public.create_cash_movement(
  p_pos_session_id uuid,
  p_category_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text,
  p_evidence_url text default null
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_category public.cash_movement_categories%rowtype;
  v_movement public.cash_movements%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_role public.app_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para registrar movimientos de caja.';
  end if;

  if p_movement_type not in ('income', 'expense', 'adjustment') then
    raise exception 'El tipo de movimiento no es valido.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'La descripcion es obligatoria.';
  end if;

  if p_category_id is null then
    raise exception 'Selecciona una categoria para continuar.';
  end if;

  select *
  into v_category
  from public.cash_movement_categories
  where id = p_category_id;

  if not found or not v_category.is_active then
    raise exception 'La categoria seleccionada no esta disponible.';
  end if;

  if v_category.movement_direction <> p_movement_type then
    raise exception 'La categoria no corresponde al tipo de movimiento seleccionado.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where id = p_pos_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_access_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para registrar movimientos en esta sede.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'No se pueden registrar movimientos en una sesion cerrada.';
  end if;

  insert into public.cash_movements (
    pos_session_id,
    branch_id,
    category_id,
    movement_type,
    amount,
    description,
    evidence_url,
    status,
    created_by
  )
  values (
    v_session.id,
    v_session.branch_id,
    v_category.id,
    p_movement_type,
    round(p_amount::numeric, 2),
    btrim(p_description),
    nullif(btrim(coalesce(p_evidence_url, '')), ''),
    'active',
    v_employee_id
  )
  returning *
  into v_movement;

  perform public.sync_pos_session_totals(v_session.id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'cash_movement_created',
    'Movimiento operativo de caja registrado.',
    jsonb_build_object(
      'cash_movement_id', v_movement.id,
      'movement_type', v_movement.movement_type,
      'amount', v_movement.amount,
      'category_id', v_movement.category_id
    )
  );

  return v_movement;
end;
$$;

create or replace function public.cancel_cash_movement(
  p_cash_movement_id uuid,
  p_cancelled_reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.cash_movements%rowtype;
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_role public.app_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para anular movimientos de caja.';
  end if;

  if nullif(btrim(coalesce(p_cancelled_reason, '')), '') is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  select *
  into v_movement
  from public.cash_movements
  where id = p_cash_movement_id
  for update;

  if not found then
    raise exception 'El movimiento de caja no existe.';
  end if;

  if not public.can_access_branch(v_movement.branch_id) then
    raise exception 'No tienes permisos para anular este movimiento.';
  end if;

  if v_movement.status <> 'active' then
    raise exception 'El movimiento ya fue anulado.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where id = v_movement.pos_session_id
  for update;

  if not found then
    raise exception 'La sesion POS vinculada no existe.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'No se puede anular un movimiento de una sesion cerrada.';
  end if;

  update public.cash_movements
  set status = 'cancelled',
      cancelled_by = v_employee_id,
      cancelled_reason = btrim(p_cancelled_reason),
      cancelled_at = now()
  where id = p_cash_movement_id
  returning *
  into v_movement;

  perform public.sync_pos_session_totals(v_session.id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'cash_movement_cancelled',
    'Movimiento operativo de caja anulado.',
    jsonb_build_object(
      'cash_movement_id', v_movement.id,
      'movement_type', v_movement.movement_type,
      'amount', v_movement.amount
    )
  );

  return v_movement;
end;
$$;

revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.create_cash_movement(uuid, uuid, text, numeric, text, text) from public;
revoke all on function public.cancel_cash_movement(uuid, text) from public;

grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.create_cash_movement(uuid, uuid, text, numeric, text, text) to authenticated, service_role;
grant execute on function public.cancel_cash_movement(uuid, text) to authenticated, service_role;

alter table public.cash_movement_categories enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "cash_movement_categories_select_scope" on public.cash_movement_categories;
drop policy if exists "cash_movement_categories_manage_admin" on public.cash_movement_categories;
drop policy if exists "cash_movement_categories_service_role_all" on public.cash_movement_categories;

create policy "cash_movement_categories_select_scope"
on public.cash_movement_categories
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "cash_movement_categories_manage_admin"
on public.cash_movement_categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "cash_movement_categories_service_role_all"
on public.cash_movement_categories
for all
to service_role
using (true)
with check (true);

drop policy if exists "cash_movements_select_scope" on public.cash_movements;
drop policy if exists "cash_movements_insert_scope" on public.cash_movements;
drop policy if exists "cash_movements_update_scope" on public.cash_movements;
drop policy if exists "cash_movements_service_role_all" on public.cash_movements;

create policy "cash_movements_select_scope"
on public.cash_movements
for select
to authenticated
using (
  (public.is_admin() or public.current_user_role() = 'reception')
  and public.can_access_branch(branch_id)
);

create policy "cash_movements_insert_scope"
on public.cash_movements
for insert
to authenticated
with check (
  (public.is_admin() or public.current_user_role() = 'reception')
  and public.can_access_branch(branch_id)
  and exists (
    select 1
    from public.pos_sessions ps
    where ps.id = pos_session_id
      and ps.branch_id = cash_movements.branch_id
      and ps.status = 'open'
  )
);

create policy "cash_movements_update_scope"
on public.cash_movements
for update
to authenticated
using (
  (public.is_admin() or public.current_user_role() = 'reception')
  and public.can_access_branch(branch_id)
  and exists (
    select 1
    from public.pos_sessions ps
    where ps.id = pos_session_id
      and ps.status = 'open'
  )
)
with check (
  (public.is_admin() or public.current_user_role() = 'reception')
  and public.can_access_branch(branch_id)
  and exists (
    select 1
    from public.pos_sessions ps
    where ps.id = pos_session_id
      and ps.status = 'open'
  )
);

create policy "cash_movements_service_role_all"
on public.cash_movements
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.cash_movement_categories to authenticated;
grant select, insert, update on public.cash_movements to authenticated;

grant all on public.cash_movement_categories to service_role;
grant all on public.cash_movements to service_role;

revoke all on public.cash_movement_categories from public;
revoke all on public.cash_movements from public;

insert into public.cash_movement_categories (
  code,
  name,
  description,
  movement_direction,
  sort_order,
  is_active
)
values
  ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
  ('operational_expense', 'Egreso operativo', 'Egreso manual fuera de ventas.', 'expense', 2, true),
  ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 3, true),
  ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 4, true),
  ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

-- TODO: si se necesita un ajuste que reste sin usar "egreso", agregar un campo explicito de signo u operacion en caja.
