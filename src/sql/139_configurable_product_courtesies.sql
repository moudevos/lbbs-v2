-- Política única de cortesías de productos por servicio pagado.
-- La regla específica de servicio prevalece sobre la regla general.

create or replace function public.validate_completed_sale_courtesies()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_item record;
  v_capacity numeric;
  v_item_capacity numeric;
  v_total_capacity numeric;
  v_total_amount_cap numeric;
  v_total_amount numeric;
  v_rule_id uuid;
  v_rule_name text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  if not exists (
    select 1 from public.sale_items
    where sale_id = new.id and item_type = 'product' and is_courtesy
  ) then
    return new;
  end if;

  -- Cada servicio pagado selecciona una única regla: específica primero,
  -- luego general. La capacidad y el tope se multiplican por su cantidad.
  with matched_services as (
    select si.id, si.quantity, si.total,
      rule.id as rule_id, rule.name as rule_name,
      rule.maximum_courtesy_items, rule.maximum_courtesy_amount
    from public.sale_items si
    cross join lateral (
      select r.*
      from public.courtesy_rules r
      where r.is_active
        and (r.branch_id is null or r.branch_id = new.branch_id)
        and (r.starts_at is null or r.starts_at <= new.closed_at)
        and (r.ends_at is null or r.ends_at >= new.closed_at)
        and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id)
        and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id))
        and coalesce(si.total / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount
      order by
        case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc,
        r.minimum_unit_amount desc, r.priority desc, r.created_at desc
      limit 1
    ) rule
    where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
  )
  select coalesce(sum(quantity * maximum_courtesy_items), 0),
         case
           when bool_or(maximum_courtesy_amount is null) then null
           else sum(quantity * maximum_courtesy_amount)
         end
  into v_total_capacity, v_total_amount_cap
  from matched_services;

  select coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_price), 0)
  into v_capacity, v_total_amount
  from public.sale_items
  where sale_id = new.id and item_type = 'product' and is_courtesy;

  if v_total_capacity = 0 or v_capacity > v_total_capacity then
    raise exception 'La cantidad de productos en cortesía supera el cupo configurado para los servicios pagados.';
  end if;
  if v_total_amount_cap is not null and v_total_amount > v_total_amount_cap then
    raise exception 'El importe de productos en cortesía supera el tope configurado.';
  end if;

  for v_product_item in
    select * from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy
  loop
    with matched_services as (
      select si.id, si.quantity, rule.id as rule_id, rule.name as rule_name
      from public.sale_items si
      cross join lateral (
        select r.* from public.courtesy_rules r
        where r.is_active and (r.branch_id is null or r.branch_id = new.branch_id)
          and (r.starts_at is null or r.starts_at <= new.closed_at) and (r.ends_at is null or r.ends_at >= new.closed_at)
          and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id)
          and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id))
          and coalesce(si.total / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount
        order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc, r.minimum_unit_amount desc, r.priority desc, r.created_at desc limit 1
      ) rule
      where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
    )
    select ms.rule_id, ms.rule_name, coalesce(sum(ms.quantity * benefit.max_quantity), 0)
    into v_rule_id, v_rule_name, v_item_capacity
    from matched_services ms
    join public.courtesy_rule_benefits benefit on benefit.rule_id = ms.rule_id and benefit.is_active
    where benefit.benefit_item_type = 'product'
      and benefit.product_id = v_product_item.product_id
      and (benefit.max_unit_amount is null or v_product_item.unit_price <= benefit.max_unit_amount)
    group by ms.rule_id, ms.rule_name
    order by sum(ms.quantity * benefit.max_quantity) desc
    limit 1;

    if not found or v_product_item.quantity > v_item_capacity then
      raise exception 'El producto en cortesía no está permitido o supera su máximo configurado.';
    end if;
    update public.sale_items
    set courtesy_rule_id = v_rule_id,
        courtesy_rule_name_snapshot = v_rule_name
    where id = v_product_item.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists sales_validate_configurable_courtesies on public.sales;
create trigger sales_validate_configurable_courtesies
after update of status on public.sales
for each row execute function public.validate_completed_sale_courtesies();

-- El checkout histórico tenía un límite fijo de una cortesía por servicio.
-- Se retira para que la política configurable sea la única fuente de verdad.
do $$
declare
  v_definition text;
  v_legacy_guard text := $guard$
    if (select coalesce(sum(quantity) filter (where is_courtesy), 0)
        from public.sale_items where sale_id = v_sale_id)
       > (select coalesce(sum(quantity) filter (where item_type = 'service' and not is_courtesy), 0)
          from public.sale_items where sale_id = v_sale_id) then
      raise exception 'Solo puedes registrar una cortesia por cada servicio de pago.';
    end if;$guard$;
begin
  select pg_get_functiondef('public.checkout_pos_sale(jsonb)'::regprocedure) into v_definition;
  if position(v_legacy_guard in v_definition) > 0 then
    execute replace(v_definition, v_legacy_guard, E'\n    -- Validado por sales_validate_configurable_courtesies.');
  end if;
end;
$$;

revoke all on function public.validate_completed_sale_courtesies() from public;
grant execute on function public.validate_completed_sale_courtesies() to authenticated, service_role;
notify pgrst, 'reload schema';
