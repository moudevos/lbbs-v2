-- Sprint 9: preserva el vuelto por pago y totaliza sesiones por propiedades operativas.
-- Ejecutar manualmente en Supabase SQL Editor despues de 105_payment_method_cash_semantics.sql.

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
    coalesce(sum(sp.amount) filter (where pm.counts_as_cash and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.payment_kind = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.payment_kind = 'card' and s.status = 'completed'), 0)
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
      expected_cash_amount = coalesce(opening_cash_amount, 0) + v_total_cash + v_cash_income - v_cash_expense + v_cash_adjustment
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
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

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if not public.can_manage_pos_branch(v_sale.branch_id) then raise exception 'No tienes permisos para completar esta venta.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Solo las ventas en borrador se pueden completar.'; end if;
  if not exists (select 1 from public.pos_sessions ps where ps.id = v_sale.pos_session_id and ps.branch_id = v_sale.branch_id and ps.status = 'open') then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*) into v_item_count from public.sale_items where sale_id = p_sale_id;
  if v_item_count = 0 then raise exception 'La venta debe tener al menos un item.'; end if;
  if v_sale.paid_total < v_sale.total then raise exception 'Los pagos registrados no cubren el total de la venta.'; end if;

  select count(*) into v_service_count from public.sale_items where sale_id = p_sale_id and item_type = 'service';
  if v_service_count > 0 then
    select (v_sale.barber_id is not null or exists (select 1 from public.sale_items si where si.sale_id = p_sale_id and si.item_type = 'service' and si.barber_id is not null)) into v_barber_covered;
    if not v_barber_covered then raise exception 'Las ventas con servicios requieren un barbero asignado.'; end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select si.product_id, sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id and si.item_type = 'product' and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock on stock.product_id = p.id and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;
  if v_stock_issue is not null then raise exception '%', v_stock_issue; end if;

  insert into public.stock_movements (product_id, branch_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
  select si.product_id, v_sale.branch_id, case when si.is_courtesy then 'courtesy' else 'sale' end, si.quantity, coalesce(si.cost_snapshot, p.cost_price), 'sale', v_sale.id,
    case when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.' else 'Descuento de stock por venta completada.' end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id and si.item_type = 'product' and p.is_stockable = true;

  select coalesce(sum(sp.change_amount), 0) into v_change_amount from public.sale_payments sp where sp.sale_id = p_sale_id;

  update public.sales
  set status = 'completed', paid_total = greatest(paid_total, total), change_amount = v_change_amount,
      closed_by = v_employee_id, closed_at = now(), cancelled_by = null, cancelled_at = null, cancelled_reason = null
  where id = p_sale_id
  returning * into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations set status = 'completed', completed_at = now(), updated_by = v_employee_id where id = v_sale.reservation_id;
  end if;

  perform public.process_rewards_for_completed_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (pos_session_id, employee_id, event_type, message, metadata)
  values (v_sale.pos_session_id, v_employee_id, 'sale_completed', 'Venta completada.', jsonb_build_object('sale_id', v_sale.id, 'total', v_sale.total, 'customer_id', v_sale.customer_id));

  return v_sale;
end;
$$;

revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.complete_sale(uuid) from public;
grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.complete_sale(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
