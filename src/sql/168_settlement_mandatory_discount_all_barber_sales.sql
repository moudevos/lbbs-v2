-- El descuento obligatorio se calcula sobre las ventas brutas atribuibles al
-- barbero: servicios (incluidos los atendidos con Reward) y productos que le
-- generaron un registro de bono. Los bonos no se suman otra vez: son la
-- comisión de una venta ya incluida en la base.
-- Ejecutar después de 167_settlement_sales_discount_and_debt_reservation.sql.

alter table public.employee_settlement_bonus_lines
  add column if not exists sales_gross_snapshot numeric(12,2) not null default 0;

-- Conserva el retail bruto del producto que originó cada bono. Es un snapshot
-- para que una liquidación no cambie si luego se edita el catálogo o el item.
update public.employee_settlement_bonus_lines line
set sales_gross_snapshot = round(
  greatest(coalesce(item.original_total, item.quantity * item.unit_price, 0), 0),
  2
)
from public.employee_product_bonus_entries bonus
join public.sale_items item on item.id = bonus.sale_item_id
join public.employee_settlements settlement on settlement.id = line.settlement_id
where bonus.id = line.product_bonus_entry_id
  and settlement.status in ('draft', 'review', 'approved');

create or replace function public.get_employee_mandatory_sales_base(
  p_period_id uuid,
  p_employee_id uuid
)
returns numeric(12,2)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_sales numeric(12,2) := 0;
  v_product_sales numeric(12,2) := 0;
begin
  -- Reward conserva el precio retail del servicio; una cortesía o beneficio
  -- interno no es una venta facturable y por eso no se incluye.
  select coalesce(sum(production.original_line_total), 0)
  into v_service_sales
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = p_period_id
    and production.employee_id = p_employee_id
    and production.status = 'active'
    and production.production_source in ('normal', 'commercial_discount', 'reward')
    and sale.status = 'completed'
    and session.status = 'closed';

  -- Un producto se atribuye al barbero únicamente si existe su entrada de
  -- producción/bono. Así no se asignan a un barbero ventas de recepción.
  select coalesce(sum(greatest(coalesce(item.original_total, item.quantity * item.unit_price, 0), 0)), 0)
  into v_product_sales
  from public.employee_product_bonus_entries bonus
  join public.sale_items item on item.id = bonus.sale_item_id
  join public.sales sale on sale.id = bonus.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where bonus.payroll_period_id = p_period_id
    and bonus.employee_id = p_employee_id
    and bonus.status = 'active'
    and bonus.product_id is not null
    and item.item_type = 'product'
    and not item.is_courtesy
    and sale.status = 'completed'
    and session.status = 'closed';

  return round(greatest(v_service_sales, 0) + greatest(v_product_sales, 0), 2);
end;
$$;

-- Corrige solo borradores/revisiones/aprobadas: pagadas y anuladas son
-- documentos históricos y no se reescriben.
update public.employee_settlements settlement
set mandatory_discount_base_amount = totals.amount
from (
  select settlement.id,
    round(
      coalesce((
        select sum(service_line.original_line_total_snapshot)
        from public.employee_settlement_service_lines service_line
        join public.employee_service_production production
          on production.id = service_line.production_entry_id
        where service_line.settlement_id = settlement.id
          and production.production_source in ('normal', 'commercial_discount', 'reward')
      ), 0)
      + coalesce((
        select sum(bonus_line.sales_gross_snapshot)
        from public.employee_settlement_bonus_lines bonus_line
        where bonus_line.settlement_id = settlement.id
      ), 0),
      2
    ) as amount
  from public.employee_settlements settlement
  where settlement.status in ('draft', 'review', 'approved')
) totals
where totals.id = settlement.id
  and settlement.status in ('draft', 'review', 'approved');

-- Se conserva la implementación anterior como detalle interno y se expone un
-- wrapper que prepara las deducciones automáticas contra la base ampliada.
do $$
begin
  if to_regprocedure('public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)') is not null
    and to_regprocedure('public.prepare_employee_settlement_service_base_legacy(uuid,uuid,numeric,jsonb,text,text)') is null then
    alter function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)
      rename to prepare_employee_settlement_service_base_legacy;
  end if;
end;
$$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid,
  p_employee_id uuid,
  p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb,
  p_notes text default null,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.employee_settlements%rowtype;
  v_debt public.employee_debts%rowtype;
  v_item jsonb;
  v_settlement public.employee_settlements%rowtype;
  v_base numeric(12,2) := 0;
  v_reward numeric(12,2) := 0;
  v_courtesy numeric(12,2) := 0;
  v_bonus numeric(12,2) := 0;
  v_gross numeric(12,2) := 0;
  v_mandatory_base numeric(12,2) := 0;
  v_mandatory numeric(12,2) := 0;
  v_available_for_debt numeric(12,2) := 0;
  v_deductions numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_planned_deductions jsonb := '[]'::jsonb;
  v_is_automatic boolean := jsonb_array_length(coalesce(p_debt_deductions, '[]'::jsonb)) = 0;
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden preparar liquidaciones.';
  end if;

  select * into v_existing
  from public.employee_settlements
  where payroll_period_id = p_period_id
    and employee_id = p_employee_id
    and status <> 'cancelled'
  for update;
  if found then
    if v_existing.status = 'paid' then
      raise exception 'El empleado ya tiene una liquidación pagada en este período y no puede recalcularse.';
    end if;
    raise exception 'El empleado ya tiene una liquidación activa. Anúlala antes de recalcular.';
  end if;

  select
    coalesce(sum(production.commissionable_amount), 0),
    coalesce(sum(production.fixed_commission_amount) filter (
      where production.production_source in ('reward', 'employee_benefit')
    ), 0),
    coalesce(sum(production.fixed_commission_amount) filter (
      where production.production_source = 'courtesy'
    ), 0)
  into v_base, v_reward, v_courtesy
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = p_period_id
    and production.employee_id = p_employee_id
    and production.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  select coalesce(sum(bonus.total_bonus_amount), 0)
  into v_bonus
  from public.employee_product_bonus_entries bonus
  join public.sales sale on sale.id = bonus.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where bonus.payroll_period_id = p_period_id
    and bonus.employee_id = p_employee_id
    and bonus.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  v_gross := round(v_base * p_commission_rate / 100, 2) + v_reward + v_courtesy + v_bonus;
  v_mandatory_base := public.get_employee_mandatory_sales_base(p_period_id, p_employee_id);
  v_mandatory := round(v_mandatory_base / 100, 2);
  v_available_for_debt := greatest(v_gross - v_mandatory, 0);

  if v_is_automatic then
    for v_debt in
      select debt.*
      from public.employee_debts debt
      where debt.employee_id = p_employee_id
        and debt.status in ('pending', 'partial')
        and debt.outstanding_amount > 0
        and not exists (
          select 1
          from public.employee_settlement_deductions deduction
          join public.employee_settlements other_settlement
            on other_settlement.id = deduction.settlement_id
          where deduction.employee_debt_id = debt.id
            and other_settlement.status in ('draft', 'review', 'approved')
        )
      order by debt.created_at
      for update
    loop
      exit when v_available_for_debt <= 0;
      v_amount := least(v_available_for_debt, v_debt.outstanding_amount);
      v_planned_deductions := v_planned_deductions || jsonb_build_array(
        jsonb_build_object('debt_id', v_debt.id, 'amount', v_amount)
      );
      v_available_for_debt := v_available_for_debt - v_amount;
    end loop;
  else
    for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
      select * into v_debt
      from public.employee_debts
      where id = (v_item ->> 'debt_id')::uuid
        and employee_id = p_employee_id
        and status in ('pending', 'partial')
      for update;
      if not found then raise exception 'Una deuda seleccionada ya no está disponible.'; end if;
      v_amount := round((v_item ->> 'amount')::numeric, 2);
      if v_amount <= 0 or v_amount > v_debt.outstanding_amount then
        raise exception 'Un descuento de deuda no es válido.';
      end if;
      v_deductions := v_deductions + v_amount;
      v_planned_deductions := v_planned_deductions || jsonb_build_array(
        jsonb_build_object('debt_id', v_debt.id, 'amount', v_amount)
      );
    end loop;
    if v_deductions > v_available_for_debt then
      raise exception 'Las deudas no pueden superar el pago disponible después del descuento obligatorio.';
    end if;
  end if;

  select * into v_settlement
  from public.prepare_employee_settlement_service_base_legacy(
    p_period_id,
    p_employee_id,
    p_commission_rate,
    v_planned_deductions,
    p_notes,
    p_high_rate_note
  );

  update public.employee_settlement_bonus_lines line
  set sales_gross_snapshot = round(
    greatest(coalesce(item.original_total, item.quantity * item.unit_price, 0), 0),
    2
  )
  from public.employee_product_bonus_entries bonus
  join public.sale_items item on item.id = bonus.sale_item_id
  where line.settlement_id = v_settlement.id
    and line.product_bonus_entry_id = bonus.id;

  update public.employee_settlements
  set mandatory_discount_base_amount = v_mandatory_base
  where id = v_settlement.id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function public.get_employee_mandatory_sales_base(uuid, uuid) from public, anon, authenticated;
revoke all on function public.prepare_employee_settlement_service_base_legacy(uuid, uuid, numeric, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
