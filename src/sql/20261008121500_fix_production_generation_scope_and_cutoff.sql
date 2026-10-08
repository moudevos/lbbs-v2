-- Corrige la generación acumulada de producción sin crear un flujo paralelo.
-- Reglas:
-- 1) cada generación de una venta solo puede recalcular bonos de ESA venta;
-- 2) ventas canceladas se revierten y no vuelven a pasar por atribución;
-- 3) ventas completed de una sesión POS abierta se omiten;
-- 4) el generador del período consolida únicamente hasta AYER (America/Lima);
-- 5) la tabla existente sigue siendo la vista de producción acumulada.

do $$
begin
  if to_regprocedure('public.generate_employee_production_for_sale_v175(uuid)') is null then
    raise exception 'LBBS requiere generate_employee_production_for_sale_v175(uuid) antes de aplicar esta migración.';
  end if;
  if to_regprocedure('public.generate_production_for_period(uuid,uuid)') is null then
    raise exception 'LBBS requiere generate_production_for_period(uuid,uuid) antes de aplicar esta migración.';
  end if;
end
$$;

create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_start timestamptz;
  v_sale_status text;
  v_branch_id uuid;
  v_session_status text;
  v_sale_event_at timestamptz;
begin
  select
    sale.status,
    sale.branch_id,
    session.status,
    coalesce(sale.closed_at, sale.created_at)
  into
    v_sale_status,
    v_branch_id,
    v_session_status,
    v_sale_event_at
  from public.sales sale
  left join public.pos_sessions session on session.id = sale.pos_session_id
  where sale.id = p_sale_id;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not (public.is_admin() or public.can_manage_pos_branch(v_branch_id)) then
    raise exception 'No tienes permisos para generar produccion de esta venta.';
  end if;

  -- Una venta completada todavía perteneciente a una sesión POS abierta no es
  -- producción consolidable. Se omite sin intentar insertar/actualizar filas.
  if v_sale_status = 'completed' and coalesce(v_session_status, '') <> 'closed' then
    return jsonb_build_object(
      'services_generated', 0,
      'bonuses_generated', 0,
      'reversed', 0,
      'omitted', 1,
      'reason', 'open_pos_session'
    );
  end if;

  -- El core histórico conserva el cálculo canónico de servicios, bonos y
  -- reversas. En ventas canceladas revierte y retorna inmediatamente.
  v_result := public.generate_employee_production_for_sale_v175(p_sale_id);

  if v_sale_status <> 'completed' then
    return v_result;
  end if;

  select production_attribution_starts_at
    into v_start
  from public.employee_compensation_engine_settings
  where singleton;

  if v_sale_event_at >= v_start then
    update public.employee_product_bonus_entries bonus
    set
      employee_id = item.attributed_employee_id,
      status = case
        when item.attributed_employee_id is null then 'pending_review'
        when exists (
          select 1
          from public.employee_compensation_terms term
          where term.employee_id = item.attributed_employee_id
            and term.is_active
            and term.effective_from <= bonus.accounting_date
            and (term.effective_to is null or term.effective_to >= bonus.accounting_date)
            and term.compensation_mode in ('fixed','commission_only')
        ) then 'reversed'
        else 'active'
      end,
      reversed_at = case
        when item.attributed_employee_id is not null
          and exists (
            select 1
            from public.employee_compensation_terms term
            where term.employee_id = item.attributed_employee_id
              and term.is_active
              and term.effective_from <= bonus.accounting_date
              and (term.effective_to is null or term.effective_to >= bonus.accounting_date)
              and term.compensation_mode in ('fixed','commission_only')
          )
        then now()
        else null
      end,
      reversed_reason = case
        when item.attributed_employee_id is not null
          and exists (
            select 1
            from public.employee_compensation_terms term
            where term.employee_id = item.attributed_employee_id
              and term.is_active
              and term.effective_from <= bonus.accounting_date
              and (term.effective_to is null or term.effective_to >= bonus.accounting_date)
              and term.compensation_mode in ('fixed','commission_only')
          )
        then 'Perfil sin bonos remunerativos: venta atribuida solo para producción.'
        else null
      end
    from public.sale_items item
    where bonus.sale_item_id = item.id
      and bonus.sale_id = p_sale_id
      and item.sale_id = p_sale_id
      and item.item_type = 'product';

    perform public.sync_employee_sale_item_attributions(p_sale_id);
  end if;

  return v_result;
end;
$$;

create or replace function public.generate_production_for_period(
  p_period_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_sale record;
  v_result jsonb;
  v_business_date date := public.pos_business_date();
  v_cutoff date;
  v_sales integer := 0;
  v_services integer := 0;
  v_bonuses integer := 0;
  v_reversals integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden generar producción.';
  end if;

  select *
    into v_period
  from public.payroll_periods
  where id = p_period_id;

  if not found then
    raise exception 'El periodo no existe.';
  end if;

  if v_period.status in ('closed','cancelled') then
    raise exception 'El periodo está cerrado y no admite regeneración.';
  end if;

  -- Producción es una consolidación al cierre del día anterior. Aun si una
  -- sesión de hoy ya fue cerrada, entra recién al generar mañana.
  v_cutoff := least(v_period.end_date, v_business_date - 1);

  if v_cutoff < v_period.start_date then
    return jsonb_build_object(
      'sales_reviewed', 0,
      'services_generated', 0,
      'bonuses_generated', 0,
      'reversed', 0,
      'errors', 0,
      'business_date', v_business_date,
      'cutoff_date', v_cutoff
    );
  end if;

  for v_sale in
    select sale.id
    from public.sales sale
    left join public.pos_sessions session on session.id = sale.pos_session_id
    where sale.accounting_date between v_period.start_date and v_cutoff
      and (p_branch_id is null or sale.branch_id = p_branch_id)
      and (
        sale.status = 'cancelled'
        or (
          sale.status = 'completed'
          and session.status = 'closed'
        )
      )
    order by sale.accounting_date, sale.id
  loop
    v_result := public.generate_employee_production_for_sale(v_sale.id);
    v_sales := v_sales + 1;
    v_services := v_services
      + coalesce((v_result ->> 'services_generated')::integer, 0);
    v_bonuses := v_bonuses
      + coalesce((v_result ->> 'bonuses_generated')::integer, 0);
    v_reversals := v_reversals
      + coalesce((v_result ->> 'reversed')::integer, 0);
  end loop;

  return jsonb_build_object(
    'sales_reviewed', v_sales,
    'services_generated', v_services,
    'bonuses_generated', v_bonuses,
    'reversed', v_reversals,
    'errors', 0,
    'business_date', v_business_date,
    'cutoff_date', v_cutoff
  );
end;
$$;

revoke all on function public.generate_employee_production_for_sale(uuid)
  from public, anon;
revoke all on function public.generate_production_for_period(uuid, uuid)
  from public, anon;

grant execute on function public.generate_employee_production_for_sale(uuid)
  to authenticated, service_role;
grant execute on function public.generate_production_for_period(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
