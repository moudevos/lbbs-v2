-- Catálogo de insumos del personal y entregas por lote.
-- Ejecutar después de 158_operational_contribution_exclusions_and_pos_breakdown.sql.
-- El precio que se cobra al empleado vive aquí; nunca llega desde el navegador.

create table if not exists public.employee_supply_catalog_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete restrict,
  employee_unit_price numeric(12,2) not null check (employee_unit_price > 0),
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_supply_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('immediate', 'credit')),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_reference text,
  total_charge_amount numeric(12,2) not null check (total_charge_amount >= 0),
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  employee_debt_id uuid references public.employee_debts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check ((payment_mode = 'credit') = (employee_debt_id is not null))
);

alter table public.employee_supply_deliveries
  add column if not exists batch_id uuid references public.employee_supply_delivery_batches(id) on delete restrict,
  add column if not exists catalog_item_id uuid references public.employee_supply_catalog_items(id) on delete restrict;

create index if not exists employee_supply_catalog_items_active_idx
  on public.employee_supply_catalog_items (is_active, product_id);
create index if not exists employee_supply_delivery_batches_employee_idx
  on public.employee_supply_delivery_batches (employee_id, created_at desc);
create index if not exists employee_supply_deliveries_batch_idx
  on public.employee_supply_deliveries (batch_id);

alter table public.employee_supply_catalog_items enable row level security;
alter table public.employee_supply_delivery_batches enable row level security;

drop policy if exists "employee_supply_catalog_admin_all" on public.employee_supply_catalog_items;
create policy "employee_supply_catalog_admin_all"
on public.employee_supply_catalog_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "employee_supply_catalog_reception_read" on public.employee_supply_catalog_items;
create policy "employee_supply_catalog_reception_read"
on public.employee_supply_catalog_items for select to authenticated
using (public.current_user_role() = 'reception');

drop policy if exists "employee_supply_delivery_batches_admin_all" on public.employee_supply_delivery_batches;
create policy "employee_supply_delivery_batches_admin_all"
on public.employee_supply_delivery_batches for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "employee_supply_delivery_batches_reception_read" on public.employee_supply_delivery_batches;
create policy "employee_supply_delivery_batches_reception_read"
on public.employee_supply_delivery_batches for select to authenticated
using (public.current_user_role() = 'reception' and public.can_access_branch(branch_id));

revoke all on public.employee_supply_catalog_items, public.employee_supply_delivery_batches from public, anon;
grant select, insert, update on public.employee_supply_catalog_items to authenticated;
grant select on public.employee_supply_delivery_batches to authenticated;

create or replace function public.register_employee_supply_delivery_batch(
  p_employee_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_payment_mode text,
  p_payment_method_id uuid default null,
  p_payment_reference text default null,
  p_notes text default null
)
returns public.employee_supply_delivery_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee uuid := public.current_employee_id();
  v_batch public.employee_supply_delivery_batches%rowtype;
  v_debt public.employee_debts%rowtype;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_item jsonb;
  v_catalog public.employee_supply_catalog_items%rowtype;
  v_product public.products%rowtype;
  v_stock numeric(12,2);
  v_total numeric(12,2) := 0;
  v_quantity numeric(12,2);
  v_line_total numeric(12,2);
  v_stock_movement_id uuid;
  v_cash_movement_id uuid;
  v_category_id uuid;
  v_item_count integer;
  v_distinct_item_count integer;
  v_names text;
begin
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then
    raise exception 'No tienes permisos para entregar insumos en esta sede.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un insumo a la entrega.';
  end if;
  if p_payment_mode not in ('immediate', 'credit') then
    raise exception 'La forma de pago no es válida.';
  end if;
  select count(*), count(distinct value ->> 'catalog_item_id')
    into v_item_count, v_distinct_item_count
  from jsonb_array_elements(p_items);
  if v_item_count <> v_distinct_item_count then
    raise exception 'No repitas un producto en la misma entrega; ajusta su cantidad.';
  end if;

  -- Se valida todo antes de tocar stock o crear la deuda.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round(coalesce((v_item ->> 'quantity')::numeric, 0), 2);
    if nullif(v_item ->> 'catalog_item_id', '') is null or v_quantity <= 0 then
      raise exception 'Cada insumo requiere un producto de catálogo y una cantidad válida.';
    end if;
    select * into v_catalog
    from public.employee_supply_catalog_items
    where id = (v_item ->> 'catalog_item_id')::uuid and is_active
    for share;
    if not found then raise exception 'Uno de los insumos ya no está disponible en el catálogo interno.'; end if;
    select * into v_product from public.products where id = v_catalog.product_id and is_active for share;
    if not found then raise exception 'Uno de los productos del catálogo ya no está activo.'; end if;
    select coalesce(stock_quantity, 0) into v_stock
    from public.vw_product_stock where product_id = v_product.id and branch_id = p_branch_id;
    if coalesce(v_stock, 0) < v_quantity then
      raise exception 'Stock insuficiente para entregar %.', v_product.name;
    end if;
    v_total := v_total + round(v_catalog.employee_unit_price * v_quantity, 2);
  end loop;
  v_total := round(v_total, 2);

  if p_payment_mode = 'immediate' then
    select * into v_method from public.payment_methods where id = p_payment_method_id and is_active;
    if not found or v_method.payment_kind = 'internal_credit' then raise exception 'Selecciona un método de pago activo.'; end if;
    select * into v_session from public.pos_sessions where branch_id = p_branch_id and status = 'open' order by opened_at desc limit 1;
    if not found then raise exception 'No existe una sesión POS activa para registrar el ingreso inmediato.'; end if;
  end if;

  select string_agg(product.name, ', ' order by product.name)
    into v_names
  from jsonb_array_elements(p_items) item
  join public.employee_supply_catalog_items catalog on catalog.id = (item.value ->> 'catalog_item_id')::uuid
  join public.products product on product.id = catalog.product_id;
  if p_payment_mode = 'credit' then
    v_debt := public.create_employee_debt(
      p_employee_id, p_branch_id, 'supply', v_total,
      'Entrega de insumos: ' || coalesce(v_names, 'catálogo interno')
    );
  end if;
  if p_payment_mode = 'immediate' and v_method.code = 'cash' then
    select id into v_category_id from public.cash_movement_categories where code = 'employee_supply_payment' limit 1;
    insert into public.cash_movements (pos_session_id, branch_id, category_id, movement_type, amount, description, status, created_by)
    values (v_session.id, p_branch_id, v_category_id, 'income', v_total, 'Pago inmediato de insumos de empleado.', 'active', v_employee)
    returning id into v_cash_movement_id;
  end if;
  insert into public.employee_supply_delivery_batches (
    employee_id, branch_id, payment_mode, payment_method_id, payment_reference,
    total_charge_amount, cash_movement_id, employee_debt_id, notes, created_by
  ) values (
    p_employee_id, p_branch_id, p_payment_mode, p_payment_method_id,
    nullif(btrim(coalesce(p_payment_reference, '')), ''), v_total,
    v_cash_movement_id, v_debt.id, nullif(btrim(coalesce(p_notes, '')), ''), v_employee
  ) returning * into v_batch;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := round((v_item ->> 'quantity')::numeric, 2);
    select * into v_catalog from public.employee_supply_catalog_items where id = (v_item ->> 'catalog_item_id')::uuid;
    select * into v_product from public.products where id = v_catalog.product_id;
    v_line_total := round(v_catalog.employee_unit_price * v_quantity, 2);
    insert into public.stock_movements (product_id, branch_id, movement_type, quantity, unit_cost, reference_type, notes, created_by)
    values (v_product.id, p_branch_id, 'adjustment', v_quantity * -1, v_product.cost_price, 'employee_supply', 'Entrega de insumo a empleado.', v_employee)
    returning id into v_stock_movement_id;
    insert into public.employee_supply_deliveries (
      batch_id, catalog_item_id, employee_id, branch_id, product_id, quantity,
      unit_cost_snapshot, markup_type, markup_value, unit_charge_amount,
      total_charge_amount, payment_mode, payment_method_id, payment_reference,
      stock_movement_id, cash_movement_id, employee_debt_id, notes, created_by
    ) values (
      v_batch.id, v_catalog.id, p_employee_id, p_branch_id, v_product.id, v_quantity,
      v_product.cost_price, 'fixed', 0, v_catalog.employee_unit_price,
      v_line_total, p_payment_mode, p_payment_method_id,
      nullif(btrim(coalesce(p_payment_reference, '')), ''), v_stock_movement_id,
      v_cash_movement_id, v_debt.id, nullif(btrim(coalesce(p_notes, '')), ''), v_employee
    );
    update public.stock_movements set reference_id = v_batch.id where id = v_stock_movement_id;
  end loop;
  return v_batch;
end;
$$;

-- Compatibilidad con el flujo anterior de una sola línea. También queda sujeto
-- al catálogo y usa exactamente el mismo precio interno.
create or replace function public.register_employee_supply_delivery(
  p_employee_id uuid, p_branch_id uuid, p_product_id uuid, p_quantity numeric,
  p_payment_mode text, p_payment_method_id uuid default null,
  p_payment_reference text default null, p_notes text default null
)
returns public.employee_supply_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_catalog_id uuid;
  v_batch public.employee_supply_delivery_batches%rowtype;
  v_delivery public.employee_supply_deliveries%rowtype;
begin
  select id into v_catalog_id from public.employee_supply_catalog_items
  where product_id = p_product_id and is_active;
  if v_catalog_id is null then
    raise exception 'El producto no está habilitado en el catálogo de insumos del personal.';
  end if;
  v_batch := public.register_employee_supply_delivery_batch(
    p_employee_id, p_branch_id,
    jsonb_build_array(jsonb_build_object('catalog_item_id', v_catalog_id, 'quantity', p_quantity)),
    p_payment_mode, p_payment_method_id, p_payment_reference, p_notes
  );
  select * into v_delivery from public.employee_supply_deliveries where batch_id = v_batch.id limit 1;
  return v_delivery;
end;
$$;

revoke all on function public.register_employee_supply_delivery_batch(uuid, uuid, jsonb, text, uuid, text, text) from public, anon;
grant execute on function public.register_employee_supply_delivery_batch(uuid, uuid, jsonb, text, uuid, text, text) to authenticated, service_role;
revoke all on function public.register_employee_supply_delivery(uuid, uuid, uuid, numeric, text, uuid, text, text) from public, anon;
grant execute on function public.register_employee_supply_delivery(uuid, uuid, uuid, numeric, text, uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
