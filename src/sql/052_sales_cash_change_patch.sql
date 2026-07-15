alter table public.sale_payments
  add column if not exists tendered_amount numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0;

update public.sale_payments
set tendered_amount = amount
where tendered_amount is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_tendered_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_tendered_amount_check
      check (tendered_amount is null or tendered_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_change_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_change_amount_check
      check (change_amount >= 0);
  end if;
end $$;

create or replace function public.recalculate_sale_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_courtesy_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_change_amount numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(si.quantity * si.unit_price), 0),
    coalesce(sum(si.discount_amount), 0),
    coalesce(sum(case when si.is_courtesy then si.quantity * si.unit_price else 0 end), 0),
    coalesce(sum(si.total), 0)
  into
    v_subtotal,
    v_discount_total,
    v_courtesy_total,
    v_total
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(sum(sp.change_amount), 0)
  into v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_discount_total,
      courtesy_total = v_courtesy_total,
      total = v_total,
      change_amount = v_change_amount
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.recalculate_sale_payment_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_change_amount numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(sp.amount), 0),
    coalesce(sum(sp.change_amount), 0)
  into
    v_paid_total,
    v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set paid_total = v_paid_total,
      change_amount = v_change_amount
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
  v_change_amount numeric(12,2) := 0;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  select coalesce(sum(sp.change_amount), 0)
  into v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = v_change_amount,
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;
