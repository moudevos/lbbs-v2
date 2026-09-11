-- Compatibilidad y validación de cortesías para ventas dominicales.
-- Ejecutar después de 164_sunday_sales_and_daily_settlements.sql.

-- Algunas instalaciones anteriores a 158 no tienen esta función. Se conserva
-- la misma firma y se consulta la tabla dinámicamente para no bloquear ventas.
create or replace function public.is_operational_contribution_service_excluded(
  p_service_id uuid,
  p_occurred_at timestamptz
) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result boolean := false;
begin
  if to_regclass('public.operational_contribution_service_exclusions') is null then return false; end if;
  execute 'select exists (select 1 from public.operational_contribution_service_exclusions where service_id=$1 and effective_from <= coalesce($2,now()) and (effective_to is null or effective_to > coalesce($2,now())))'
  into v_result using p_service_id,p_occurred_at;
  return coalesce(v_result,false);
end; $$;

create or replace function public.validate_sunday_sale_courtesies(p_sunday_sale_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.sunday_sales%rowtype; v_qty numeric; v_cap numeric; v_amount numeric; v_amount_cap numeric; v_product record;
begin
  select * into v_sale from public.sunday_sales where id=p_sunday_sale_id;
  if not found or not exists(select 1 from public.sunday_sale_items where sunday_sale_id=p_sunday_sale_id and item_type='product' and is_courtesy) then return; end if;
  with services as (
    select item.quantity,item.unit_price,rule.id rule_id,rule.maximum_courtesy_items,rule.maximum_courtesy_amount
    from public.sunday_sale_items item
    join public.sunday_sales_days day on day.id=v_sale.sunday_day_id
    cross join lateral (select r.* from public.courtesy_rules r where r.is_active and (r.branch_id is null or r.branch_id=v_sale.branch_id) and (r.starts_at is null or r.starts_at<=day.business_date::timestamptz) and (r.ends_at is null or r.ends_at>=day.business_date::timestamptz) and (r.qualifying_service_id is null or r.qualifying_service_id=item.service_id) and (r.qualifying_service_category_id is null or r.qualifying_service_category_id=(select category_id from public.services where id=item.service_id)) and item.unit_price>=r.minimum_unit_amount order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc,r.minimum_unit_amount desc,r.priority desc limit 1) rule
    where item.sunday_sale_id=p_sunday_sale_id and item.item_type='service'
  ) select coalesce(sum(quantity*maximum_courtesy_items),0),case when bool_or(maximum_courtesy_amount is null) then null else sum(quantity*maximum_courtesy_amount) end into v_cap,v_amount_cap from services;
  select coalesce(sum(quantity),0),coalesce(sum(quantity*unit_price),0) into v_qty,v_amount from public.sunday_sale_items where sunday_sale_id=p_sunday_sale_id and item_type='product' and is_courtesy;
  if v_cap=0 or v_qty>v_cap then raise exception 'La cantidad de productos en cortesía supera el cupo configurado para los servicios.'; end if;
  if v_amount_cap is not null and v_amount>v_amount_cap then raise exception 'El importe de productos en cortesía supera el tope configurado.'; end if;
  for v_product in select * from public.sunday_sale_items where sunday_sale_id=p_sunday_sale_id and item_type='product' and is_courtesy loop
    if not exists (
      select 1 from public.sunday_sale_items service_item join public.sunday_sales_days day on day.id=v_sale.sunday_day_id cross join lateral (select r.* from public.courtesy_rules r where r.is_active and (r.branch_id is null or r.branch_id=v_sale.branch_id) and (r.starts_at is null or r.starts_at<=day.business_date::timestamptz) and (r.ends_at is null or r.ends_at>=day.business_date::timestamptz) and (r.qualifying_service_id is null or r.qualifying_service_id=service_item.service_id) and (r.qualifying_service_category_id is null or r.qualifying_service_category_id=(select category_id from public.services where id=service_item.service_id)) and service_item.unit_price>=r.minimum_unit_amount order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc,r.minimum_unit_amount desc,r.priority desc limit 1) rule join public.courtesy_rule_benefits benefit on benefit.rule_id=rule.id and benefit.is_active where service_item.sunday_sale_id=p_sunday_sale_id and service_item.item_type='service' and benefit.benefit_item_type='product' and benefit.product_id=v_product.product_id and benefit.max_quantity>=v_product.quantity and (benefit.max_unit_amount is null or v_product.unit_price<=benefit.max_unit_amount)
    ) then raise exception 'El producto en cortesía no está permitido por la regla aplicable.'; end if;
  end loop;
end; $$;

create or replace function public.sunday_sale_payment_courtesy_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.validate_sunday_sale_courtesies(new.sunday_sale_id); return new; end; $$;
drop trigger if exists sunday_sale_payments_validate_courtesies on public.sunday_sale_payments;
create trigger sunday_sale_payments_validate_courtesies before insert on public.sunday_sale_payments for each row execute function public.sunday_sale_payment_courtesy_guard();

revoke all on function public.is_operational_contribution_service_excluded(uuid,timestamptz),public.validate_sunday_sale_courtesies(uuid),public.sunday_sale_payment_courtesy_guard() from public,anon;
grant execute on function public.is_operational_contribution_service_excluded(uuid,timestamptz),public.validate_sunday_sale_courtesies(uuid) to authenticated,service_role;
grant execute on function public.can_manage_sunday_sales_branch(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
