-- Sprint 8.8: funciones transaccionales de produccion, cuentas y liquidaciones.

create or replace function public.calculate_operational_contribution(
  p_amount numeric,
  p_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.production_operational_rules%rowtype;
begin
  select * into v_rule
  from public.production_operational_rules
  where is_active
    and coalesce(p_amount, 0) >= minimum_amount
    and (maximum_amount is null or coalesce(p_amount, 0) <= maximum_amount)
    and effective_from <= coalesce(p_date, current_date)
    and (effective_to is null or effective_to >= coalesce(p_date, current_date))
  order by priority desc, minimum_amount desc
  limit 1;

  if not found then return 0; end if;
  return round(case when v_rule.calculation_type = 'percentage'
    then coalesce(p_amount, 0) * v_rule.calculation_value / 100
    else v_rule.calculation_value end, 2);
end;
$$;

create or replace function public.get_service_fixed_commission(
  p_kind text,
  p_service_id uuid,
  p_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(12,2) := 0;
  v_category_id uuid;
begin
  select category_id into v_category_id from public.services where id = p_service_id;

  if p_kind = 'reward' then
    select fixed_commission_amount into v_amount
    from public.reward_service_commission_rules
    where is_active
      and effective_from <= coalesce(p_date, current_date)
      and (effective_to is null or effective_to >= coalesce(p_date, current_date))
      and (service_id = p_service_id or (service_id is null and service_category_id = v_category_id) or (service_id is null and service_category_id is null))
    order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc, priority desc
    limit 1;
  elsif p_kind = 'courtesy' then
    select fixed_commission_amount into v_amount
    from public.courtesy_service_commission_rules
    where is_active
      and effective_from <= coalesce(p_date, current_date)
      and (effective_to is null or effective_to >= coalesce(p_date, current_date))
      and (service_id = p_service_id or (service_id is null and service_category_id = v_category_id) or (service_id is null and service_category_id is null))
    order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc, priority desc
    limit 1;
  end if;

  return coalesce(v_amount, 0);
end;
$$;

create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_period public.payroll_periods%rowtype;
  v_item record;
  v_employee_id uuid;
  v_source text;
  v_reward_discount numeric(12,2);
  v_commercial_discount numeric(12,2);
  v_courtesy_discount numeric(12,2);
  v_collected numeric(12,2);
  v_contribution numeric(12,2);
  v_fixed numeric(12,2);
  v_rule public.product_bonus_rules%rowtype;
  v_services integer := 0;
  v_bonuses integer := 0;
  v_reversed integer := 0;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'La venta no existe.'; end if;

  if not (public.is_admin() or public.can_manage_pos_branch(v_sale.branch_id)) then
    raise exception 'No tienes permisos para generar produccion de esta venta.';
  end if;

  if v_sale.status = 'cancelled' then
    update public.employee_service_production set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.', updated_at = now()
    where sale_id = p_sale_id and status <> 'reversed';
    get diagnostics v_reversed = row_count;
    update public.employee_product_bonus_entries set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.'
    where sale_id = p_sale_id and status <> 'reversed';
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', v_reversed);
  end if;

  if v_sale.status <> 'completed' then
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', 0, 'omitted', 1);
  end if;

  v_period := public.get_or_create_payroll_period(coalesce(v_sale.closed_at, v_sale.created_at)::date);

  for v_item in
    select si.*, s.category_id as service_category_id
    from public.sale_items si
    left join public.services s on s.id = si.service_id
    where si.sale_id = p_sale_id
    order by si.created_at
  loop
    if v_item.item_type = 'service' then
      v_employee_id := coalesce(v_item.barber_id, v_sale.barber_id);
      if v_employee_id is null then continue; end if;

      v_reward_discount := case when exists (
        select 1 from public.reward_redemptions rr
        where rr.sale_id = p_sale_id and rr.status = 'applied'
      ) and v_item.discount_amount > 0 then v_item.discount_amount else 0 end;
      v_courtesy_discount := case when v_item.is_courtesy then v_item.quantity * v_item.unit_price else 0 end;
      v_commercial_discount := case when v_reward_discount = 0 and not v_item.is_courtesy then v_item.discount_amount else 0 end;
      v_collected := greatest(v_item.total, 0);
      v_source := case when v_item.is_courtesy then 'courtesy' when v_reward_discount > 0 then 'reward' when v_commercial_discount > 0 then 'commercial_discount' else 'normal' end;
      v_contribution := case when v_source in ('reward', 'courtesy') then 0 else least(v_collected, public.calculate_operational_contribution(v_collected, v_sale.closed_at::date)) end;
      v_fixed := case when v_source in ('reward', 'courtesy') then public.get_service_fixed_commission(v_source, v_item.service_id, v_sale.closed_at::date) else 0 end;

      insert into public.employee_service_production (
        payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, service_id,
        production_date, production_source, quantity, original_unit_price,
        original_line_total, commercial_discount_amount, reward_discount_amount,
        courtesy_discount_amount, collected_amount, operational_contribution_amount,
        commissionable_amount, fixed_commission_amount, status
      ) values (
        v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id, v_item.service_id,
        coalesce(v_sale.closed_at, v_sale.created_at), v_source, v_item.quantity, v_item.unit_price,
        v_item.quantity * v_item.unit_price, v_commercial_discount, v_reward_discount,
        v_courtesy_discount, v_collected, v_contribution,
        case when v_source in ('reward', 'courtesy') then 0 else greatest(v_collected - v_contribution, 0) end,
        v_fixed, 'active'
      )
      on conflict (sale_item_id) do update set
        payroll_period_id = excluded.payroll_period_id, employee_id = excluded.employee_id,
        production_source = excluded.production_source, commercial_discount_amount = excluded.commercial_discount_amount,
        reward_discount_amount = excluded.reward_discount_amount, courtesy_discount_amount = excluded.courtesy_discount_amount,
        collected_amount = excluded.collected_amount, operational_contribution_amount = excluded.operational_contribution_amount,
        commissionable_amount = excluded.commissionable_amount, fixed_commission_amount = excluded.fixed_commission_amount,
        status = 'active', reversed_at = null, reversed_reason = null, updated_at = now();
      v_services := v_services + 1;
    elsif v_item.item_type = 'product' and not v_item.is_courtesy then
      v_employee_id := case when exists (select 1 from public.sale_items sx where sx.sale_id = p_sale_id and sx.item_type = 'service') then v_sale.barber_id else v_sale.closed_by end;

      select * into v_rule from public.product_bonus_rules
      where is_active
        and effective_from <= v_sale.closed_at::date
        and (effective_to is null or effective_to >= v_sale.closed_at::date)
        and (product_id = v_item.product_id or (product_id is null and product_category_id = (select category_id from public.products where id = v_item.product_id)))
      order by case when product_id is not null then 2 else 1 end desc, priority desc
      limit 1;

      if found then
        insert into public.employee_product_bonus_entries (
          payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, product_id,
          product_category_id, quantity, unit_bonus_amount, total_bonus_amount,
          bonus_rule_id, status
        ) values (
          v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id, v_item.product_id,
          (select category_id from public.products where id = v_item.product_id), v_item.quantity,
          v_rule.bonus_value, round(v_rule.bonus_value * v_item.quantity, 2), v_rule.id,
          case when v_employee_id is null then 'pending_review' else 'active' end
        )
        on conflict (sale_item_id) do update set
          employee_id = excluded.employee_id, quantity = excluded.quantity,
          unit_bonus_amount = excluded.unit_bonus_amount, total_bonus_amount = excluded.total_bonus_amount,
          bonus_rule_id = excluded.bonus_rule_id, status = excluded.status,
          reversed_at = null, reversed_reason = null;
        v_bonuses := v_bonuses + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('services_generated', v_services, 'bonuses_generated', v_bonuses, 'reversed', 0, 'omitted', 0);
end;
$$;

create or replace function public.generate_production_for_period(p_period_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_sale record;
  v_result jsonb;
  v_sales integer := 0; v_services integer := 0; v_bonuses integer := 0; v_reversals integer := 0; v_errors integer := 0;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden generar produccion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id;
  if not found then raise exception 'El periodo no existe.'; end if;

  for v_sale in select id from public.sales where coalesce(closed_at, created_at)::date between v_period.start_date and v_period.end_date and (p_branch_id is null or branch_id = p_branch_id) and status in ('completed', 'cancelled') loop
    begin
      v_result := public.generate_employee_production_for_sale(v_sale.id);
      v_sales := v_sales + 1;
      v_services := v_services + coalesce((v_result ->> 'services_generated')::integer, 0);
      v_bonuses := v_bonuses + coalesce((v_result ->> 'bonuses_generated')::integer, 0);
      v_reversals := v_reversals + coalesce((v_result ->> 'reversed')::integer, 0);
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('sales_reviewed', v_sales, 'services_generated', v_services, 'bonuses_generated', v_bonuses, 'reversed', v_reversals, 'errors', v_errors);
end;
$$;

create or replace function public.sales_production_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('completed', 'cancelled') and new.status is distinct from old.status then
    perform public.generate_employee_production_for_sale(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_production_sync on public.sales;
create trigger sales_production_sync after update of status on public.sales
for each row execute function public.sales_production_sync_trigger();

create or replace function public.create_employee_debt(
  p_employee_id uuid, p_branch_id uuid, p_debt_type text, p_amount numeric, p_description text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_debt public.employee_debts%rowtype; v_creator uuid := public.current_employee_id();
begin
  if not (
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and p_debt_type = 'supply'
      and public.can_access_branch(p_branch_id)
    )
  ) then raise exception 'No tienes permisos para registrar esta deuda.'; end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'Monto y descripcion son obligatorios.'; end if;
  insert into public.employee_debts (employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by)
  values (p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), round(p_amount, 2), btrim(p_description), v_creator) returning * into v_debt;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by) values (v_debt.id, 'charge', v_debt.original_amount, 'Registro inicial de deuda.', v_creator);
  return v_debt;
end;
$$;

create or replace function public.apply_employee_debt_payment(
  p_debt_id uuid, p_amount numeric, p_movement_type text, p_notes text default null,
  p_payment_method_id uuid default null, p_payment_reference text default null
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_debt public.employee_debts%rowtype; v_creator uuid := public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden registrar pagos de deuda.'; end if;
  select * into v_debt from public.employee_debts where id = p_debt_id for update;
  if not found or v_debt.status not in ('pending', 'partial') then raise exception 'La deuda no esta disponible para pago.'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > v_debt.outstanding_amount then raise exception 'El pago no puede superar el saldo pendiente.'; end if;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, payment_method_id, payment_reference, notes, created_by)
  values (p_debt_id, p_movement_type, round(p_amount, 2), p_payment_method_id, nullif(btrim(coalesce(p_payment_reference, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), v_creator);
  update public.employee_debts set outstanding_amount = outstanding_amount - round(p_amount, 2), status = case when outstanding_amount - round(p_amount, 2) = 0 then 'paid' else 'partial' end, settled_at = case when outstanding_amount - round(p_amount, 2) = 0 then now() else null end where id = p_debt_id returning * into v_debt;
  return v_debt;
end;
$$;

create or replace function public.register_employee_benefit_usage(
  p_employee_id uuid, p_branch_id uuid, p_service_id uuid default null,
  p_provider_employee_id uuid default null, p_notes text default null
)
returns public.employee_benefit_usages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_usage public.employee_benefit_usages%rowtype; v_creator uuid := public.current_employee_id(); v_month date := date_trunc('month', current_date)::date;
begin
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar este beneficio.'; end if;
  insert into public.employee_benefit_usages (employee_id, benefit_type, benefit_month, service_id, provider_employee_id, branch_id, notes, created_by)
  values (p_employee_id, 'monthly_free_haircut', v_month, p_service_id, p_provider_employee_id, p_branch_id, nullif(btrim(coalesce(p_notes, '')), ''), v_creator)
  returning * into v_usage;
  return v_usage;
exception when unique_violation then raise exception 'El empleado ya utilizo su corte gratuito de este mes.';
end;
$$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid, p_employee_id uuid, p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb, p_notes text default null,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype; v_period public.payroll_periods%rowtype; v_employee public.employees%rowtype;
  v_base numeric(12,2); v_reward numeric(12,2); v_courtesy numeric(12,2); v_bonus numeric(12,2); v_percentage numeric(12,2); v_gross numeric(12,2); v_deductions numeric(12,2) := 0;
  v_item jsonb; v_debt public.employee_debts%rowtype; v_amount numeric(12,2); v_creator uuid := public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden preparar liquidaciones.'; end if;
  if coalesce(p_commission_rate, -1) < 0 then raise exception 'El porcentaje no es valido.'; end if;
  if p_commission_rate > 60 and nullif(btrim(coalesce(p_high_rate_note, '')), '') is null then raise exception 'Un porcentaje mayor a 60 requiere observacion de autorizacion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id and status <> 'cancelled'; if not found then raise exception 'El periodo no esta disponible.'; end if;
  select * into v_employee from public.employees where id = p_employee_id; if not found then raise exception 'El empleado no existe.'; end if;

  select coalesce(sum(commissionable_amount), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'reward'), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'courtesy'), 0)
  into v_base, v_reward, v_courtesy from public.employee_service_production where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  select coalesce(sum(total_bonus_amount), 0) into v_bonus from public.employee_product_bonus_entries where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  v_percentage := round(v_base * p_commission_rate / 100, 2); v_gross := v_percentage + v_reward + v_courtesy + v_bonus;

  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid and employee_id = p_employee_id and status in ('pending', 'partial');
    if not found then raise exception 'Una deuda seleccionada ya no esta disponible.'; end if;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_amount <= 0 or v_amount > v_debt.outstanding_amount then raise exception 'Un descuento de deuda no es valido.'; end if;
    v_deductions := v_deductions + v_amount;
  end loop;
  if v_deductions > v_gross then raise exception 'Los descuentos no pueden superar la ganancia disponible.'; end if;

  select * into v_settlement from public.employee_settlements where payroll_period_id = p_period_id and employee_id = p_employee_id and status <> 'cancelled' for update;
  if found and v_settlement.status <> 'draft' then raise exception 'Solo una liquidacion borrador puede recalcularse.'; end if;
  if not found then
    insert into public.employee_settlements (payroll_period_id, employee_id, branch_id, settlement_number, commission_rate, commissionable_base_total, percentage_commission_total, reward_fixed_commission_total, courtesy_fixed_commission_total, product_bonus_total, gross_pay_amount, debt_deduction_total, net_pay_amount, notes, high_rate_authorization_note, high_rate_authorized_by, replacement_of_id, created_by)
    values (p_period_id, p_employee_id, v_employee.branch_id, 'LIQ-' || to_char(v_period.start_date, 'YYYYMMDD') || '-' || upper(left(p_employee_id::text, 6)) || '-' || lpad(((select count(*) from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id)+1)::text,2,'0'), p_commission_rate, v_base, v_percentage, v_reward, v_courtesy, v_bonus, v_gross, v_deductions, greatest(v_gross - v_deductions, 0), nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_high_rate_note, '')), ''), case when p_commission_rate > 60 then v_creator else null end, (select id from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id and status='cancelled' order by cancelled_at desc nulls last limit 1), v_creator)
    returning * into v_settlement;
  else
    update public.employee_settlements set commission_rate = p_commission_rate, commissionable_base_total = v_base, percentage_commission_total = v_percentage, reward_fixed_commission_total = v_reward, courtesy_fixed_commission_total = v_courtesy, product_bonus_total = v_bonus, gross_pay_amount = v_gross, debt_deduction_total = v_deductions, net_pay_amount = greatest(v_gross - v_deductions, 0), notes = nullif(btrim(coalesce(p_notes, '')), ''), high_rate_authorization_note = nullif(btrim(coalesce(p_high_rate_note, '')), ''), high_rate_authorized_by = case when p_commission_rate > 60 then v_creator else null end where id = v_settlement.id returning * into v_settlement;
    delete from public.employee_settlement_service_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_bonus_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_deductions where settlement_id = v_settlement.id;
  end if;

  insert into public.employee_settlement_service_lines (settlement_id, production_entry_id, service_name_snapshot, production_date_snapshot, commissionable_amount, commission_rate, commission_amount, fixed_commission_amount)
  select v_settlement.id, esp.id, s.name, esp.production_date, esp.commissionable_amount, case when esp.production_source in ('reward', 'courtesy') then 0 else p_commission_rate end, case when esp.production_source in ('reward', 'courtesy') then 0 else round(esp.commissionable_amount * p_commission_rate / 100, 2) end, esp.fixed_commission_amount from public.employee_service_production esp join public.services s on s.id = esp.service_id where esp.payroll_period_id = p_period_id and esp.employee_id = p_employee_id and esp.status = 'active';
  insert into public.employee_settlement_bonus_lines (settlement_id, product_bonus_entry_id, product_name_snapshot, bonus_amount)
  select v_settlement.id, epb.id, coalesce(p.name, s.name), epb.total_bonus_amount
  from public.employee_product_bonus_entries epb
  left join public.products p on p.id = epb.product_id
  left join public.services s on s.id = epb.service_id
  where epb.payroll_period_id = p_period_id
    and epb.employee_id = p_employee_id
    and epb.status = 'active';
  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid; v_amount := round((v_item ->> 'amount')::numeric, 2);
    insert into public.employee_settlement_deductions (settlement_id, employee_debt_id, amount, balance_before, balance_after) values (v_settlement.id, v_debt.id, v_amount, v_debt.outstanding_amount, v_debt.outstanding_amount - v_amount);
  end loop;
  return v_settlement;
end;
$$;

create or replace function public.transition_employee_settlement(p_settlement_id uuid, p_action text, p_reason text default null)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.employee_settlements%rowtype; v_employee uuid := public.current_employee_id(); v_deduction record;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden gestionar liquidaciones.'; end if;
  select * into v_row from public.employee_settlements where id = p_settlement_id for update; if not found then raise exception 'La liquidacion no existe.'; end if;
  if p_action = 'review' and v_row.status = 'draft' then update public.employee_settlements set status='review', reviewed_by=v_employee, reviewed_at=now() where id=p_settlement_id returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60 and nullif(btrim(coalesce(v_row.high_rate_authorization_note,'')),'') is null then raise exception 'La autorizacion del porcentaje excepcional esta incompleta.'; end if;
    update public.employee_settlements set status='approved', approved_by=v_employee, approved_at=now() where id=p_settlement_id returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft','review','approved','paid') then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'El motivo de anulacion es obligatorio.'; end if;
    if v_row.status = 'paid' then
      for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id loop
        update public.employee_debts set outstanding_amount=least(original_amount,outstanding_amount+v_deduction.amount), status=case when outstanding_amount+v_deduction.amount>=original_amount then 'pending' else 'partial' end, settled_at=null where id=v_deduction.employee_debt_id;
        insert into public.employee_debt_movements (debt_id,movement_type,amount,settlement_id,notes,created_by) values (v_deduction.employee_debt_id,'adjustment',v_deduction.amount,p_settlement_id,'Reversion por anulacion de liquidacion pagada.',v_employee);
      end loop;
      if v_row.cash_movement_id is not null then
        update public.cash_movements set status='cancelled',cancelled_by=v_employee,cancelled_at=now(),cancelled_reason='Liquidacion anulada: '||btrim(p_reason),updated_at=now() where id=v_row.cash_movement_id and status='active';
      end if;
    end if;
    update public.employee_settlements set status='cancelled', cancelled_by=v_employee, cancelled_at=now(), cancellation_reason=btrim(p_reason) where id=p_settlement_id returning * into v_row;
  else raise exception 'La transicion solicitada no esta permitida.'; end if;
  return v_row;
end;
$$;

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
  v_product public.products%rowtype; v_rule public.employee_supply_markup_rules%rowtype;
  v_delivery public.employee_supply_deliveries%rowtype; v_debt public.employee_debts%rowtype;
  v_employee uuid := public.current_employee_id(); v_unit_charge numeric(12,2); v_total numeric(12,2);
  v_stock numeric(12,2); v_stock_id uuid; v_cash_id uuid; v_session public.pos_sessions%rowtype;
  v_method public.payment_methods%rowtype; v_category_id uuid;
begin
  if not (public.is_admin() or (public.current_user_role()='reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para entregar insumos en esta sede.'; end if;
  if coalesce(p_quantity,0)<=0 or p_payment_mode not in ('immediate','credit') then raise exception 'Cantidad o forma de pago no valida.'; end if;
  select * into v_product from public.products where id=p_product_id and is_active for share; if not found then raise exception 'El producto no esta disponible.'; end if;
  select coalesce(stock_quantity,0) into v_stock from public.vw_product_stock where product_id=p_product_id and branch_id=p_branch_id; if coalesce(v_stock,0)<p_quantity then raise exception 'Stock insuficiente para entregar el insumo.'; end if;
  select * into v_rule from public.employee_supply_markup_rules where is_active and (product_id=p_product_id or product_id is null) and effective_from<=current_date and (effective_to is null or effective_to>=current_date) order by case when product_id is not null then 2 else 1 end desc,priority desc limit 1;
  if found then v_unit_charge:=round(v_product.cost_price+case when v_rule.markup_type='percentage' then v_product.cost_price*v_rule.markup_value/100 else v_rule.markup_value end,2); else v_rule.markup_type:='fixed';v_rule.markup_value:=0;v_unit_charge:=v_product.cost_price; end if;
  v_total:=round(v_unit_charge*p_quantity,2);
  if p_payment_mode='immediate' then
    select * into v_method from public.payment_methods where id=p_payment_method_id and is_active; if not found then raise exception 'Selecciona un metodo de pago activo.'; end if;
    select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1; if not found then raise exception 'No existe una sesion POS activa para registrar el ingreso inmediato.'; end if;
  end if;
  insert into public.stock_movements (product_id,branch_id,movement_type,quantity,unit_cost,reference_type,notes,created_by) values (p_product_id,p_branch_id,'adjustment',p_quantity*-1,v_product.cost_price,'employee_supply','Entrega de insumo a empleado.',v_employee) returning id into v_stock_id;
  if p_payment_mode='credit' then v_debt:=public.create_employee_debt(p_employee_id,p_branch_id,'supply',v_total,'Entrega de insumo: '||v_product.name); end if;
  if p_payment_mode='immediate' and v_method.code='cash' then
    select id into v_category_id from public.cash_movement_categories where code='employee_supply_payment' limit 1;
    insert into public.cash_movements (pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by) values (v_session.id,p_branch_id,v_category_id,'income',v_total,'Pago inmediato de insumo de empleado.','active',v_employee) returning id into v_cash_id;
  end if;
  insert into public.employee_supply_deliveries (employee_id,branch_id,product_id,quantity,unit_cost_snapshot,markup_type,markup_value,unit_charge_amount,total_charge_amount,payment_mode,payment_method_id,payment_reference,stock_movement_id,cash_movement_id,employee_debt_id,notes,created_by)
  values (p_employee_id,p_branch_id,p_product_id,p_quantity,v_product.cost_price,v_rule.markup_type,v_rule.markup_value,v_unit_charge,v_total,p_payment_mode,p_payment_method_id,nullif(btrim(coalesce(p_payment_reference,'')),''),v_stock_id,v_cash_id,v_debt.id,nullif(btrim(coalesce(p_notes,'')),''),v_employee) returning * into v_delivery;
  update public.stock_movements set reference_id=v_delivery.id where id=v_stock_id;
  return v_delivery;
end;
$$;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid, p_payment_method_id uuid, p_amount numeric,
  p_reference text default null, p_evidence_path text default null,
  p_notes text default null, p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.employee_settlements%rowtype; v_method public.payment_methods%rowtype; v_employee uuid := public.current_employee_id(); v_deduction record; v_cash_id uuid; v_category_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden pagar liquidaciones.'; end if;
  select * into v_row from public.employee_settlements where id=p_settlement_id for update; if not found or v_row.status <> 'approved' then raise exception 'La liquidacion debe estar aprobada antes de pagar.'; end if;
  if round(coalesce(p_amount,0),2) <> round(v_row.net_pay_amount,2) then raise exception 'El monto debe coincidir con el neto de la liquidacion.'; end if;
  select * into v_method from public.payment_methods where id=p_payment_method_id and is_active; if not found then raise exception 'El metodo de pago no esta disponible.'; end if;
  if v_method.code = 'cash' then
    if p_pos_session_id is null or not exists (select 1 from public.pos_sessions where id=p_pos_session_id and branch_id=v_row.branch_id and status='open') then raise exception 'No existe una sesion POS activa para registrar el pago en efectivo.'; end if;
    select id into v_category_id from public.cash_movement_categories where code='employee_settlement_payment' limit 1;
    insert into public.cash_movements (pos_session_id, branch_id, category_id, movement_type, amount, description, status, created_by)
    values (p_pos_session_id, v_row.branch_id, v_category_id, 'expense', v_row.net_pay_amount, 'Pago de liquidacion ' || v_row.settlement_number, 'active', v_employee) returning id into v_cash_id;
  end if;
  for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id loop
    update public.employee_debts set outstanding_amount=v_deduction.balance_after, status=case when v_deduction.balance_after=0 then 'paid' else 'partial' end, settled_at=case when v_deduction.balance_after=0 then now() else null end where id=v_deduction.employee_debt_id;
    insert into public.employee_debt_movements (debt_id,movement_type,amount,settlement_id,notes,created_by) values (v_deduction.employee_debt_id,'settlement_deduction',v_deduction.amount,p_settlement_id,'Descuento aplicado en liquidacion.',v_employee);
  end loop;
  update public.employee_settlements set status='paid', payment_method_id=p_payment_method_id, payment_reference=nullif(btrim(coalesce(p_reference,'')),''), payment_evidence_path=nullif(btrim(coalesce(p_evidence_path,'')),''), cash_movement_id=v_cash_id, notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes), paid_by=v_employee, paid_at=now() where id=p_settlement_id returning * into v_row;
  return v_row;
end;
$$;

insert into public.cash_movement_categories (code,name,description,movement_direction,sort_order,is_active)
values ('employee_settlement_payment','Pago de liquidacion','Salida de efectivo por liquidacion de empleado.','expense',50,true)
on conflict (code) do update set name=excluded.name, description=excluded.description, movement_direction=excluded.movement_direction;

insert into public.cash_movement_categories (code,name,description,movement_direction,sort_order,is_active)
values ('employee_supply_payment','Pago de insumo','Ingreso en efectivo por insumo entregado a empleado.','income',51,true)
on conflict (code) do update set name=excluded.name, description=excluded.description, movement_direction=excluded.movement_direction;

revoke all on function public.calculate_operational_contribution(numeric,date) from public;
revoke all on function public.get_service_fixed_commission(text,uuid,date) from public;
revoke all on function public.generate_employee_production_for_sale(uuid) from public;
revoke all on function public.generate_production_for_period(uuid,uuid) from public;
revoke all on function public.sales_production_sync_trigger() from public;
revoke all on function public.create_employee_debt(uuid,uuid,text,numeric,text) from public;
revoke all on function public.apply_employee_debt_payment(uuid,numeric,text,text,uuid,text) from public;
revoke all on function public.register_employee_benefit_usage(uuid,uuid,uuid,uuid,text) from public;
revoke all on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) from public;
revoke all on function public.transition_employee_settlement(uuid,text,text) from public;
revoke all on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid) from public;
revoke all on function public.register_employee_supply_delivery(uuid,uuid,uuid,numeric,text,uuid,text,text) from public;

grant execute on function public.generate_production_for_period(uuid,uuid) to authenticated,service_role;
grant execute on function public.create_employee_debt(uuid,uuid,text,numeric,text) to authenticated,service_role;
grant execute on function public.apply_employee_debt_payment(uuid,numeric,text,text,uuid,text) to authenticated,service_role;
grant execute on function public.register_employee_benefit_usage(uuid,uuid,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) to authenticated,service_role;
grant execute on function public.transition_employee_settlement(uuid,text,text) to authenticated,service_role;
grant execute on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid) to authenticated,service_role;
grant execute on function public.register_employee_supply_delivery(uuid,uuid,uuid,numeric,text,uuid,text,text) to authenticated,service_role;
grant execute on function public.generate_employee_production_for_sale(uuid) to service_role;
grant execute on function public.calculate_operational_contribution(numeric,date) to service_role;
grant execute on function public.get_service_fixed_commission(text,uuid,date) to service_role;
