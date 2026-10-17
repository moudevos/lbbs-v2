begin;

CREATE OR REPLACE FUNCTION public.get_live_production_preview(p_period_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_period public.payroll_periods%rowtype;
  v_role text := coalesce(public.current_user_role()::text, '');
  v_user_branch uuid := public.current_branch_id();
  v_sale record;
  v_item record;
  v_employee_id uuid;
  v_employee_name text;
  v_source text;
  v_reward_discount numeric(12,2);
  v_commercial_discount numeric(12,2);
  v_courtesy_discount numeric(12,2);
  v_collected numeric(12,2);
  v_unit_collected numeric(12,2);
  v_contribution numeric(12,2);
  v_fixed numeric(12,2);
  v_internal public.internal_pos_operations%rowtype;
  v_benefit public.employee_benefit_rules%rowtype;
  v_rule public.product_bonus_rules%rowtype;
  v_product_category_id uuid;
  v_compensation_mode text;
  v_attribution_start timestamptz;
  v_services jsonb := '[]'::jsonb;
  v_bonuses jsonb := '[]'::jsonb;
  v_pending_sales integer := 0;
  v_sale_has_pending boolean;
begin
  if v_role not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para consultar producción en vivo.';
  end if;

  if v_role = 'reception' then
    if v_user_branch is null then
      raise exception 'La cuenta de recepción no tiene una sede asignada.';
    end if;
    if p_branch_id is not null and p_branch_id <> v_user_branch then
      raise exception 'Recepción solo puede consultar producción de su sede.';
    end if;
    p_branch_id := v_user_branch;
  end if;

  select *
    into v_period
  from public.payroll_periods
  where id = p_period_id;

  if not found then
    raise exception 'El periodo no existe.';
  end if;

  select production_attribution_starts_at
    into v_attribution_start
  from public.employee_compensation_engine_settings
  where singleton;

  for v_sale in
    select
      sale.id,
      sale.branch_id,
      sale.barber_id,
      sale.closed_by,
      sale.accounting_date,
      sale.created_at,
      sale.closed_at,
      branch.name as branch_name,
      session.status as pos_session_status
    from public.sales sale
    join public.branches branch on branch.id = sale.branch_id
    left join public.pos_sessions session on session.id = sale.pos_session_id
    where sale.status = 'completed'
      and sale.accounting_date between v_period.start_date and v_period.end_date
      and (p_branch_id is null or sale.branch_id = p_branch_id)
    order by sale.accounting_date, sale.created_at, sale.id
  loop
    v_sale_has_pending := false;
    v_internal := null;
    v_benefit := null;

    select *
      into v_internal
    from public.internal_pos_operations
    where sale_id = v_sale.id
    limit 1;

    if v_internal.benefit_rule_id is not null then
      select *
        into v_benefit
      from public.employee_benefit_rules
      where id = v_internal.benefit_rule_id;
    end if;

    for v_item in
      select
        item.*,
        service.name as service_name
      from public.sale_items item
      left join public.services service on service.id = item.service_id
      where item.sale_id = v_sale.id
      order by item.created_at, item.id
    loop
      if v_item.item_type = 'service' then
        if exists (
          select 1
          from public.employee_service_production production
          where production.sale_item_id = v_item.id
        ) then
          continue;
        end if;

        v_employee_id := coalesce(v_item.barber_id, v_sale.barber_id);
        if v_employee_id is null then
          continue;
        end if;

        if p_employee_id is not null and v_employee_id <> p_employee_id then
          continue;
        end if;

        select employee.full_name
          into v_employee_name
        from public.employees employee
        where employee.id = v_employee_id;

        v_reward_discount := case
          when exists (
            select 1
            from public.reward_redemptions redemption
            where redemption.sale_id = v_sale.id
              and redemption.status = 'applied'
          ) and coalesce(v_item.discount_amount, 0) > 0
            then coalesce(v_item.discount_amount, 0)
          else 0
        end;

        v_courtesy_discount := case
          when coalesce(v_item.is_courtesy, false)
            then round(coalesce(v_item.quantity, 0) * coalesce(v_item.unit_price, 0), 2)
          else 0
        end;

        v_commercial_discount := case
          when v_reward_discount = 0
            and not coalesce(v_item.is_courtesy, false)
            then coalesce(v_item.discount_amount, 0)
          else 0
        end;

        v_collected := greatest(coalesce(v_item.total, 0), 0);

        if v_internal.benefit_rule_id is not null and v_benefit.id is not null then
          v_source := 'employee_benefit';
          v_contribution := least(v_collected, greatest(coalesce(v_benefit.operational_contribution, 0), 0));
          v_fixed := greatest(coalesce(v_benefit.fixed_barber_payout, 0), 0);
        else
          v_source := case
            when coalesce(v_item.is_courtesy, false) then 'courtesy'
            when v_reward_discount > 0 then 'reward'
            when v_commercial_discount > 0 then 'commercial_discount'
            else 'normal'
          end;

          v_unit_collected := case
            when coalesce(v_item.quantity, 0) > 0
              then round(v_collected / v_item.quantity, 2)
            else 0
          end;

          v_contribution := case
            when v_source in ('reward', 'courtesy') then 0
            when coalesce(v_item.quantity, 0) <= 0 then 0
            else least(
              v_collected,
              round(
                v_item.quantity
                * public.calculate_operational_contribution(v_unit_collected, v_sale.accounting_date),
                2
              )
            )
          end;

          v_fixed := case
            when v_source in ('reward', 'courtesy')
              then public.get_service_fixed_commission(v_source, v_item.service_id, v_sale.accounting_date)
            else 0
          end;
        end if;

        if p_source is not null and p_source <> '' and v_source <> p_source then
          continue;
        end if;

        v_services := v_services || jsonb_build_array(
          jsonb_build_object(
            'id', 'live-' || v_item.id::text,
            'payroll_period_id', v_period.id,
            'employee_id', v_employee_id,
            'branch_id', v_sale.branch_id,
            'sale_id', v_sale.id,
            'production_date', coalesce(v_sale.closed_at, v_sale.created_at),
            'accounting_date', v_sale.accounting_date,
            'production_source', v_source,
            'quantity', coalesce(v_item.quantity, 0),
            'original_unit_price', coalesce(v_item.unit_price, 0),
            'original_line_total', round(coalesce(v_item.quantity, 0) * coalesce(v_item.unit_price, 0), 2),
            'commercial_discount_amount', v_commercial_discount,
            'reward_discount_amount', v_reward_discount,
            'courtesy_discount_amount', v_courtesy_discount,
            'collected_amount', v_collected,
            'operational_contribution_amount', v_contribution,
            'commissionable_amount', case
              when v_source in ('reward', 'courtesy', 'employee_benefit') then 0
              else greatest(v_collected - v_contribution, 0)
            end,
            'fixed_commission_amount', v_fixed,
            'status', 'active',
            'reversed_at', null,
            'reversed_reason', null,
            'is_live_preview', true,
            'pos_session_status', coalesce(v_sale.pos_session_status, 'sin_sesion'),
            'employee', jsonb_build_object('full_name', coalesce(v_employee_name, 'Sin registro')),
            'branch', jsonb_build_object('name', v_sale.branch_name),
            'service', jsonb_build_object('name', coalesce(v_item.service_name, v_item.description_snapshot, 'Servicio')),
            'sale', jsonb_build_object(
              'status', 'completed',
              'cancelled_at', null,
              'cancelled_reason', null,
              'pos_session', jsonb_build_object('status', coalesce(v_sale.pos_session_status, 'sin_sesion'))
            )
          )
        );
        v_sale_has_pending := true;

      elsif v_item.item_type = 'product'
        and not coalesce(v_item.is_courtesy, false)
        and coalesce(v_internal.operation_kind, '') not in ('employee_credit', 'internal_complimentary')
      then
        if exists (
          select 1
          from public.employee_product_bonus_entries bonus
          where bonus.sale_item_id = v_item.id
        ) then
          continue;
        end if;

        v_employee_id := coalesce(
          v_item.attributed_employee_id,
          case
            when exists (
              select 1
              from public.sale_items service_item
              where service_item.sale_id = v_sale.id
                and service_item.item_type = 'service'
            ) then v_sale.barber_id
            else v_sale.closed_by
          end
        );

        if v_employee_id is null then
          continue;
        end if;

        if p_employee_id is not null and v_employee_id <> p_employee_id then
          continue;
        end if;

        if v_attribution_start is not null
           and coalesce(v_sale.closed_at, v_sale.created_at) >= v_attribution_start
        then
          select term.compensation_mode
            into v_compensation_mode
          from public.employee_compensation_terms term
          where term.employee_id = v_employee_id
            and term.is_active
            and term.effective_from <= v_sale.accounting_date
            and (term.effective_to is null or term.effective_to >= v_sale.accounting_date)
          order by term.effective_from desc, term.created_at desc
          limit 1;

          if v_compensation_mode in ('fixed', 'commission_only') then
            continue;
          end if;
        end if;

        select product.category_id
          into v_product_category_id
        from public.products product
        where product.id = v_item.product_id;

        v_rule := null;
        select *
          into v_rule
        from public.product_bonus_rules rule
        where rule.is_active
          and rule.effective_from <= v_sale.accounting_date
          and (rule.effective_to is null or rule.effective_to >= v_sale.accounting_date)
          and (
            rule.product_id = v_item.product_id
            or (
              rule.product_id is null
              and rule.product_category_id = v_product_category_id
            )
          )
        order by
          case when rule.product_id is not null then 2 else 1 end desc,
          rule.priority desc
        limit 1;

        if v_rule.id is null then
          continue;
        end if;

        select employee.full_name
          into v_employee_name
        from public.employees employee
        where employee.id = v_employee_id;

        v_bonuses := v_bonuses || jsonb_build_array(
          jsonb_build_object(
            'id', 'live-' || v_item.id::text,
            'payroll_period_id', v_period.id,
            'employee_id', v_employee_id,
            'branch_id', v_sale.branch_id,
            'sale_id', v_sale.id,
            'sale_item_id', v_item.id,
            'accounting_date', v_sale.accounting_date,
            'quantity', coalesce(v_item.quantity, 0),
            'unit_bonus_amount', coalesce(v_rule.bonus_value, 0),
            'total_bonus_amount', round(coalesce(v_rule.bonus_value, 0) * coalesce(v_item.quantity, 0), 2),
            'status', 'active',
            'is_live_preview', true,
            'pos_session_status', coalesce(v_sale.pos_session_status, 'sin_sesion'),
            'employee', jsonb_build_object('full_name', coalesce(v_employee_name, 'Sin registro')),
            'branch', jsonb_build_object('name', v_sale.branch_name),
            'product', (
              select jsonb_build_object('name', coalesce(product.name, v_item.description_snapshot, 'Producto'))
              from public.products product
              where product.id = v_item.product_id
            ),
            'sale_item', jsonb_build_object(
              'description_snapshot', v_item.description_snapshot,
              'total', coalesce(v_item.total, 0)
            ),
            'sale', jsonb_build_object(
              'pos_session', jsonb_build_object('status', coalesce(v_sale.pos_session_status, 'sin_sesion'))
            )
          )
        );
        v_sale_has_pending := true;
      end if;
    end loop;

    if v_sale_has_pending then
      v_pending_sales := v_pending_sales + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'services', v_services,
    'bonuses', v_bonuses,
    'pending_sales', v_pending_sales,
    'period_start', v_period.start_date,
    'period_end', v_period.end_date
  );
end;
$function$;

revoke execute on function public.get_live_production_preview(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.get_live_production_preview(uuid, uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
