-- Liquidaciones: el descuento obligatorio se calcula sobre la venta bruta de
-- servicios del barbero, antes de descuentos. No modifica pagos históricos.
-- Ejecutar después de 166_sales_control_dashboard.sql.

alter table public.employee_settlements
  add column if not exists mandatory_discount_base_amount numeric(12,2) not null default 0;

create or replace function public.apply_settlement_mandatory_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.mandatory_discount_rate := greatest(coalesce(new.mandatory_discount_rate, 1), 0);
  new.net_before_mandatory_discount := greatest(round(
    coalesce(new.gross_pay_amount, 0)
    - coalesce(new.debt_deduction_total, 0)
    + coalesce(new.manual_bonus_total, 0)
    - coalesce(new.other_deduction_total, 0),
    2
  ), 0);
  new.mandatory_discount_amount := round(
    greatest(coalesce(new.mandatory_discount_base_amount, 0), 0)
    * new.mandatory_discount_rate / 100,
    2
  );
  new.net_pay_amount := greatest(
    new.net_before_mandatory_discount - new.mandatory_discount_amount,
    0
  );
  return new;
end;
$$;

drop trigger if exists employee_settlements_mandatory_discount on public.employee_settlements;
create trigger employee_settlements_mandatory_discount
before insert or update of gross_pay_amount, debt_deduction_total,
  manual_bonus_total, other_deduction_total, mandatory_discount_base_amount,
  mandatory_discount_rate
on public.employee_settlements
for each row execute function public.apply_settlement_mandatory_discount();

-- Ajusta solo liquidaciones aún activas. Las pagadas conservan exactamente
-- el descuento y el neto registrados en su historial.
update public.employee_settlements settlement
set mandatory_discount_base_amount = totals.amount
from (
  select line.settlement_id,
         round(coalesce(sum(line.original_line_total_snapshot), 0), 2) as amount
  from public.employee_settlement_service_lines line
  join public.employee_service_production production
    on production.id = line.production_entry_id
  where production.production_source in ('normal', 'commercial_discount')
  group by line.settlement_id
) totals
where totals.settlement_id = settlement.id
  and settlement.status in ('draft', 'review', 'approved');

-- Revisa ajustes sin volver a calcular el 1 % sobre el pago del barbero.
create or replace function public.review_employee_settlement(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_adjustment jsonb;
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_bonus numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_employee uuid := public.current_employee_id();
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Solo owner o admin pueden revisar liquidaciones.';
  end if;

  select * into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;
  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidación en borrador puede revisarse.';
  end if;

  delete from public.employee_settlement_adjustments
  where settlement_id = p_settlement_id;

  for v_adjustment in select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) loop
    v_type := v_adjustment ->> 'adjustment_type';
    v_description := nullif(btrim(coalesce(v_adjustment ->> 'description', '')), '');
    v_amount := round(coalesce((v_adjustment ->> 'amount')::numeric, 0), 2);
    if v_type not in ('bonus', 'deduction') or v_description is null or v_amount <= 0 then
      raise exception 'Cada ajuste necesita tipo, motivo y monto mayor a cero.';
    end if;
    insert into public.employee_settlement_adjustments (
      settlement_id, adjustment_type, description, amount, created_by
    ) values (
      p_settlement_id, v_type, v_description, v_amount, v_employee
    );
    if v_type = 'bonus' then v_bonus := v_bonus + v_amount;
    else v_deduction := v_deduction + v_amount;
    end if;
  end loop;

  update public.employee_settlements
  set manual_bonus_total = v_bonus,
      other_deduction_total = v_deduction,
      status = 'review',
      reviewed_by = v_employee,
      reviewed_at = now()
  where id = p_settlement_id
  returning * into v_settlement;

  return v_settlement;
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
  v_settlement public.employee_settlements%rowtype;
  v_period public.payroll_periods%rowtype;
  v_employee public.employees%rowtype;
  v_base numeric(12,2);
  v_reward numeric(12,2);
  v_courtesy numeric(12,2);
  v_bonus numeric(12,2);
  v_percentage numeric(12,2);
  v_gross numeric(12,2);
  v_service_sales_gross numeric(12,2);
  v_mandatory numeric(12,2);
  v_deductions numeric(12,2) := 0;
  v_available_for_debt numeric(12,2);
  v_item jsonb;
  v_debt public.employee_debts%rowtype;
  v_amount numeric(12,2);
  v_creator uuid := public.current_employee_id();
  v_is_automatic boolean := jsonb_array_length(coalesce(p_debt_deductions, '[]'::jsonb)) = 0;
  v_has_existing_settlement boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden preparar liquidaciones.';
  end if;
  if coalesce(p_commission_rate, -1) < 0 then
    raise exception 'El porcentaje no es válido.';
  end if;
  if p_commission_rate > 60 and nullif(btrim(coalesce(p_high_rate_note, '')), '') is null then
    raise exception 'Un porcentaje mayor a 60 requiere observación de autorización.';
  end if;

  select * into v_period
  from public.payroll_periods
  where id = p_period_id and status <> 'cancelled';
  if not found then raise exception 'El período no está disponible.'; end if;

  select * into v_employee from public.employees where id = p_employee_id;
  if not found then raise exception 'El empleado no existe.'; end if;

  -- La liquidación solo considera ventas terminadas de sesiones cerradas.
  select
    coalesce(sum(production.commissionable_amount), 0),
    coalesce(sum(production.fixed_commission_amount) filter (
      where production.production_source in ('reward', 'employee_benefit')
    ), 0),
    coalesce(sum(production.fixed_commission_amount) filter (
      where production.production_source = 'courtesy'
    ), 0),
    coalesce(sum(production.original_line_total) filter (
      where production.production_source in ('normal', 'commercial_discount')
    ), 0)
  into v_base, v_reward, v_courtesy, v_service_sales_gross
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

  v_percentage := round(v_base * p_commission_rate / 100, 2);
  v_gross := v_percentage + v_reward + v_courtesy + v_bonus;
  v_mandatory := round(greatest(v_service_sales_gross, 0) / 100, 2);
  v_available_for_debt := greatest(v_gross - v_mandatory, 0);

  select * into v_settlement
  from public.employee_settlements
  where payroll_period_id = p_period_id
    and employee_id = p_employee_id
    and status <> 'cancelled'
  for update;
  v_has_existing_settlement := found;
  if found then
    if v_settlement.status = 'paid' then
      raise exception 'El empleado ya tiene una liquidación pagada en este período y no puede recalcularse.';
    end if;
    raise exception 'El empleado ya tiene una liquidación activa. Anúlala antes de recalcular.';
  end if;

  if not v_is_automatic then
    for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
      select * into v_debt
      from public.employee_debts
      where id = (v_item ->> 'debt_id')::uuid
        and employee_id = p_employee_id
        and status in ('pending', 'partial')
      for update;
      if not found then raise exception 'Una deuda seleccionada ya no está disponible.'; end if;
      if exists (
        select 1
        from public.employee_settlement_deductions deduction
        join public.employee_settlements other_settlement
          on other_settlement.id = deduction.settlement_id
        where deduction.employee_debt_id = v_debt.id
          and other_settlement.id <> coalesce(v_settlement.id, '00000000-0000-0000-0000-000000000000'::uuid)
          and other_settlement.status in ('draft', 'review', 'approved')
      ) then
        raise exception 'La deuda % ya está comprometida en otra liquidación activa.', v_debt.description;
      end if;
      v_amount := round((v_item ->> 'amount')::numeric, 2);
      if v_amount <= 0 or v_amount > v_debt.outstanding_amount then
        raise exception 'Un descuento de deuda no es válido.';
      end if;
      v_deductions := v_deductions + v_amount;
    end loop;
    if v_deductions > v_available_for_debt then
      raise exception 'Las deudas no pueden superar el pago disponible después del descuento obligatorio.';
    end if;
  end if;

  if not v_has_existing_settlement then
    insert into public.employee_settlements (
      payroll_period_id, employee_id, branch_id, settlement_number,
      commission_rate, commissionable_base_total, percentage_commission_total,
      reward_fixed_commission_total, courtesy_fixed_commission_total,
      product_bonus_total, gross_pay_amount, debt_deduction_total,
      mandatory_discount_base_amount, mandatory_discount_rate, notes,
      high_rate_authorization_note, high_rate_authorized_by, replacement_of_id,
      created_by
    ) values (
      p_period_id, p_employee_id, v_employee.branch_id,
      'LIQ-' || to_char(v_period.start_date, 'YYYYMMDD') || '-' ||
        upper(left(p_employee_id::text, 6)) || '-' ||
        lpad((select count(*) + 1 from public.employee_settlements
             where payroll_period_id = p_period_id and employee_id = p_employee_id)::text, 2, '0'),
      p_commission_rate, v_base, v_percentage, v_reward, v_courtesy, v_bonus,
      v_gross, v_deductions, v_service_sales_gross, 1,
      nullif(btrim(coalesce(p_notes, '')), ''),
      nullif(btrim(coalesce(p_high_rate_note, '')), ''),
      case when p_commission_rate > 60 then v_creator else null end,
      (select id from public.employee_settlements
       where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'cancelled'
       order by cancelled_at desc nulls last limit 1),
      v_creator
    ) returning * into v_settlement;
  else
    delete from public.employee_settlement_service_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_bonus_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_deductions where settlement_id = v_settlement.id;

    update public.employee_settlements
    set commission_rate = p_commission_rate,
        commissionable_base_total = v_base,
        percentage_commission_total = v_percentage,
        reward_fixed_commission_total = v_reward,
        courtesy_fixed_commission_total = v_courtesy,
        product_bonus_total = v_bonus,
        gross_pay_amount = v_gross,
        debt_deduction_total = v_deductions,
        mandatory_discount_base_amount = v_service_sales_gross,
        mandatory_discount_rate = 1,
        manual_bonus_total = 0,
        other_deduction_total = 0,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        high_rate_authorization_note = nullif(btrim(coalesce(p_high_rate_note, '')), ''),
        high_rate_authorized_by = case when p_commission_rate > 60 then v_creator else null end
    where id = v_settlement.id
    returning * into v_settlement;
  end if;

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
            and other_settlement.id <> v_settlement.id
            and other_settlement.status in ('draft', 'review', 'approved')
        )
      order by debt.created_at
      for update
    loop
      exit when v_available_for_debt <= 0;
      v_amount := least(v_available_for_debt, v_debt.outstanding_amount);
      if v_amount > 0 then
        insert into public.employee_settlement_deductions (
          settlement_id, employee_debt_id, amount, balance_before, balance_after
        ) values (
          v_settlement.id, v_debt.id, v_amount,
          v_debt.outstanding_amount, v_debt.outstanding_amount - v_amount
        );
        v_deductions := v_deductions + v_amount;
        v_available_for_debt := v_available_for_debt - v_amount;
      end if;
    end loop;

    update public.employee_settlements
    set debt_deduction_total = v_deductions
    where id = v_settlement.id
    returning * into v_settlement;
  else
    for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
      select * into v_debt from public.employee_debts
      where id = (v_item ->> 'debt_id')::uuid;
      v_amount := round((v_item ->> 'amount')::numeric, 2);
      insert into public.employee_settlement_deductions (
        settlement_id, employee_debt_id, amount, balance_before, balance_after
      ) values (
        v_settlement.id, v_debt.id, v_amount,
        v_debt.outstanding_amount, v_debt.outstanding_amount - v_amount
      );
    end loop;
  end if;

  insert into public.employee_settlement_service_lines (
    settlement_id, production_entry_id, service_name_snapshot,
    production_date_snapshot, commissionable_amount, commission_rate,
    commission_amount, fixed_commission_amount
  )
  select v_settlement.id, production.id, service.name, production.production_date,
    production.commissionable_amount,
    case when production.production_source in ('reward', 'courtesy', 'employee_benefit') then 0 else p_commission_rate end,
    case when production.production_source in ('reward', 'courtesy', 'employee_benefit') then 0 else round(production.commissionable_amount * p_commission_rate / 100, 2) end,
    production.fixed_commission_amount
  from public.employee_service_production production
  join public.services service on service.id = production.service_id
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = p_period_id
    and production.employee_id = p_employee_id
    and production.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  insert into public.employee_settlement_bonus_lines (
    settlement_id, product_bonus_entry_id, product_name_snapshot, bonus_amount
  )
  select v_settlement.id, bonus.id, coalesce(product.name, service.name), bonus.total_bonus_amount
  from public.employee_product_bonus_entries bonus
  left join public.products product on product.id = bonus.product_id
  left join public.services service on service.id = bonus.service_id
  join public.sales sale on sale.id = bonus.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where bonus.payroll_period_id = p_period_id
    and bonus.employee_id = p_employee_id
    and bonus.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  return v_settlement;
end;
$$;

-- Al anular una liquidación se liberan sus deducciones para que pueda
-- prepararse un reemplazo. Las deudas no cambian hasta registrar el pago.
create or replace function public.transition_employee_settlement(
  p_settlement_id uuid,
  p_action text,
  p_reason text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_employee uuid := public.current_employee_id();
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden gestionar liquidaciones.';
  end if;
  select * into v_row from public.employee_settlements where id = p_settlement_id for update;
  if not found then raise exception 'La liquidación no existe.'; end if;

  if p_action in ('confirm', 'review') and v_row.status = 'draft' then
    update public.employee_settlements
    set status = 'review', reviewed_by = v_employee, reviewed_at = now()
    where id = p_settlement_id returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60
      and nullif(btrim(coalesce(v_row.high_rate_authorization_note, '')), '') is null then
      raise exception 'La autorización del porcentaje excepcional está incompleta.';
    end if;
    update public.employee_settlements
    set status = 'approved', approved_by = v_employee, approved_at = now()
    where id = p_settlement_id returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft', 'review', 'approved') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'El motivo de anulación es obligatorio.';
    end if;
    update public.employee_settlements
    set status = 'cancelled', cancelled_by = v_employee, cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    where id = p_settlement_id returning * into v_row;
  elsif p_action = 'cancel' and v_row.status = 'paid' then
    raise exception 'Una liquidación pagada no puede anularse. Registra una reversa financiera autorizada.';
  else
    raise exception 'La transición solicitada no está permitida.';
  end if;
  return v_row;
end;
$$;

revoke all on function public.apply_settlement_mandatory_discount() from public;
revoke all on function public.review_employee_settlement(uuid, jsonb) from public;
revoke all on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) from public;
revoke all on function public.transition_employee_settlement(uuid, text, text) from public;
grant execute on function public.review_employee_settlement(uuid, jsonb) to authenticated, service_role;
grant execute on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) to authenticated, service_role;
grant execute on function public.transition_employee_settlement(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
