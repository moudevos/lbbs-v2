-- El aporte operativo normal se calcula por cada unidad de servicio, no por
-- el total consolidado de la línea de venta. Así una boleta con 4 cortes de
-- S/ 35 aplica la regla de S/ 35 cuatro veces, sin depender del carrito.

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
  v_unit_collected numeric(12,2);
  v_contribution numeric(12,2);
  v_fixed numeric(12,2);
  v_rule public.product_bonus_rules%rowtype;
  v_internal public.internal_pos_operations%rowtype;
  v_benefit public.employee_benefit_rules%rowtype;
  v_services integer := 0;
  v_bonuses integer := 0;
  v_reversed integer := 0;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'La venta no existe.'; end if;
  if not (public.is_admin() or public.can_manage_pos_branch(v_sale.branch_id)) then
    raise exception 'No tienes permisos para generar produccion de esta venta.';
  end if;

  select * into v_internal from public.internal_pos_operations where sale_id = p_sale_id;
  if found and v_internal.benefit_rule_id is not null then
    select * into v_benefit from public.employee_benefit_rules where id = v_internal.benefit_rule_id;
  end if;

  if v_sale.status = 'cancelled' then
    update public.employee_service_production
    set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.', updated_at = now()
    where sale_id = p_sale_id and status <> 'reversed';
    get diagnostics v_reversed = row_count;
    update public.employee_product_bonus_entries
    set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.'
    where sale_id = p_sale_id and status <> 'reversed';
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', v_reversed);
  end if;

  if v_sale.status <> 'completed' then
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', 0, 'omitted', 1);
  end if;

  v_period := public.get_or_create_payroll_period(v_sale.accounting_date);
  if v_period.status in ('closed', 'cancelled') then
    raise exception 'El periodo contable de esta venta esta cerrado.';
  end if;

  for v_item in select si.* from public.sale_items si where si.sale_id = p_sale_id order by si.created_at loop
    if v_item.item_type = 'service' then
      v_employee_id := coalesce(v_item.barber_id, v_sale.barber_id);
      if v_employee_id is null then continue; end if;

      v_reward_discount := case when exists (
        select 1 from public.reward_redemptions rr where rr.sale_id = p_sale_id and rr.status = 'applied'
      ) and v_item.discount_amount > 0 then v_item.discount_amount else 0 end;
      v_courtesy_discount := case when v_item.is_courtesy then v_item.quantity * v_item.unit_price else 0 end;
      v_commercial_discount := case when v_reward_discount = 0 and not v_item.is_courtesy then v_item.discount_amount else 0 end;
      v_collected := greatest(v_item.total, 0);

      if v_internal.benefit_rule_id is not null and v_benefit.id is not null then
        v_source := 'employee_benefit';
        v_contribution := least(v_collected, v_benefit.operational_contribution);
        v_fixed := v_benefit.fixed_barber_payout;
      else
        v_source := case
          when v_item.is_courtesy then 'courtesy'
          when v_reward_discount > 0 then 'reward'
          when v_commercial_discount > 0 then 'commercial_discount'
          else 'normal'
        end;
        v_unit_collected := case when v_item.quantity > 0 then round(v_collected / v_item.quantity, 2) else 0 end;
        v_contribution := case
          when v_source in ('reward', 'courtesy') then 0
          when v_item.quantity <= 0 then 0
          else least(
            v_collected,
            round(v_item.quantity * public.calculate_operational_contribution(v_unit_collected, v_sale.accounting_date), 2)
          )
        end;
        v_fixed := case when v_source in ('reward', 'courtesy')
          then public.get_service_fixed_commission(v_source, v_item.service_id, v_sale.accounting_date)
          else 0
        end;
      end if;

      insert into public.employee_service_production (
        payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, service_id,
        production_date, accounting_date, production_source, quantity, original_unit_price,
        original_line_total, commercial_discount_amount, reward_discount_amount,
        courtesy_discount_amount, collected_amount, operational_contribution_amount,
        commissionable_amount, fixed_commission_amount, status
      ) values (
        v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id, v_item.service_id,
        coalesce(v_sale.closed_at, v_sale.created_at), v_sale.accounting_date, v_source,
        v_item.quantity, v_item.unit_price, v_item.quantity * v_item.unit_price,
        v_commercial_discount, v_reward_discount, v_courtesy_discount, v_collected,
        v_contribution,
        case when v_source in ('reward', 'courtesy', 'employee_benefit') then 0 else greatest(v_collected - v_contribution, 0) end,
        v_fixed, 'active'
      ) on conflict (sale_item_id) do update set
        payroll_period_id = excluded.payroll_period_id,
        accounting_date = excluded.accounting_date,
        employee_id = excluded.employee_id,
        production_source = excluded.production_source,
        commercial_discount_amount = excluded.commercial_discount_amount,
        reward_discount_amount = excluded.reward_discount_amount,
        courtesy_discount_amount = excluded.courtesy_discount_amount,
        collected_amount = excluded.collected_amount,
        operational_contribution_amount = excluded.operational_contribution_amount,
        commissionable_amount = excluded.commissionable_amount,
        fixed_commission_amount = excluded.fixed_commission_amount,
        status = 'active', reversed_at = null, reversed_reason = null, updated_at = now();
      v_services := v_services + 1;

    elsif v_item.item_type = 'product'
      and not v_item.is_courtesy
      and coalesce(v_internal.operation_kind, '') not in ('employee_credit', 'internal_complimentary') then
      v_employee_id := case when exists (
        select 1 from public.sale_items sx where sx.sale_id = p_sale_id and sx.item_type = 'service'
      ) then v_sale.barber_id else v_sale.closed_by end;
      select * into v_rule from public.product_bonus_rules
      where is_active
        and effective_from <= v_sale.accounting_date
        and (effective_to is null or effective_to >= v_sale.accounting_date)
        and (product_id = v_item.product_id or (product_id is null and product_category_id = (
          select category_id from public.products where id = v_item.product_id
        )))
      order by case when product_id is not null then 2 else 1 end desc, priority desc
      limit 1;
      if found then
        insert into public.employee_product_bonus_entries (
          payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, product_id,
          product_category_id, accounting_date, quantity, unit_bonus_amount,
          total_bonus_amount, bonus_rule_id, status
        ) values (
          v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id,
          v_item.product_id, (select category_id from public.products where id = v_item.product_id),
          v_sale.accounting_date, v_item.quantity, v_rule.bonus_value,
          round(v_rule.bonus_value * v_item.quantity, 2), v_rule.id,
          case when v_employee_id is null then 'pending_review' else 'active' end
        ) on conflict (sale_item_id) do update set
          payroll_period_id = excluded.payroll_period_id,
          accounting_date = excluded.accounting_date,
          employee_id = excluded.employee_id,
          quantity = excluded.quantity,
          unit_bonus_amount = excluded.unit_bonus_amount,
          total_bonus_amount = excluded.total_bonus_amount,
          bonus_rule_id = excluded.bonus_rule_id,
          status = excluded.status,
          reversed_at = null,
          reversed_reason = null;
        v_bonuses := v_bonuses + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('services_generated', v_services, 'bonuses_generated', v_bonuses, 'reversed', 0, 'omitted', 0);
end;
$$;

notify pgrst, 'reload schema';
