-- Employee credit eligibility belongs to the employee/customer link, not to the product.
-- Product visibility controls who can see/buy an item; employee_supply_catalog_items
-- only supplies an optional special price. Missing employee pricing falls back to
-- the current retail price for every product an employee is allowed to buy.
--
-- This migration is intentionally non-destructive:
-- - no table/data changes
-- - no historical sale rewrites
-- - no changes to can_use_internal_credit
-- - no changes to stock, production, debt creation, or accounting
-- - keeps checkout_pos_sale_phase0_core as the atomic source of truth

do $$
begin
  if to_regprocedure('public.checkout_pos_sale_phase0_core(jsonb)') is null then
    raise exception 'checkout_pos_sale_phase0_core(jsonb) is required before applying this migration.';
  end if;
end
$$;

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := (p_payload ->> 'customer_id')::uuid;
  v_branch_id uuid := (p_payload ->> 'branch_id')::uuid;
  v_buyer_employee_id uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_product record;
  v_retail_price numeric;
  v_employee_price numeric;
  v_line text;
  v_responsible uuid;
  v_inherited_service_executor uuid;
begin
  select link.employee_id
    into v_buyer_employee_id
  from public.employee_customer_links link
  join public.employees employee
    on employee.id = link.employee_id
   and employee.status = 'active'
  where link.customer_id = v_customer_id
    and link.is_active
  limit 1;

  select (
    array_agg(
      distinct coalesce(
        nullif(value ->> 'responsible_employee_id', '')::uuid,
        nullif(value ->> 'attributed_employee_id', '')::uuid,
        nullif(value ->> 'barber_id', '')::uuid
      )
    )
  )[1]
    into v_inherited_service_executor
  from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb))
  where value ->> 'item_type' = 'service'
    and coalesce(
      nullif(value ->> 'responsible_employee_id', '')::uuid,
      nullif(value ->> 'attributed_employee_id', '')::uuid,
      nullif(value ->> 'barber_id', '')::uuid
    ) is not null
  having count(
    distinct coalesce(
      nullif(value ->> 'responsible_employee_id', '')::uuid,
      nullif(value ->> 'attributed_employee_id', '')::uuid,
      nullif(value ->> 'barber_id', '')::uuid
    )
  ) = 1;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb))
  loop
    if v_item ->> 'item_type' = 'product' then
      select
        product.id,
        coalesce(product.visibility_scope, 'pos') as visibility_scope,
        coalesce(category.business_line, 'other') as business_line
      into v_product
      from public.products product
      left join public.product_categories category
        on category.id = product.category_id
      where product.id = (v_item ->> 'product_id')::uuid
        and product.is_active;

      if not found then
        raise exception 'El producto no está disponible.';
      end if;

      -- visibility_scope is only a visibility/access rule. It does not decide
      -- whether a product can be purchased with employee credit.
      if v_product.visibility_scope = 'internal' and v_buyer_employee_id is null then
        raise exception 'Este producto está disponible únicamente para empleados.';
      end if;

      select stock.final_sale_price
        into v_retail_price
      from public.vw_product_stock stock
      where stock.product_id = v_product.id
        and stock.branch_id = v_branch_id;

      v_retail_price := coalesce(
        v_retail_price,
        (select product.base_sale_price from public.products product where product.id = v_product.id)
      );

      v_employee_price := null;
      select catalog.employee_unit_price
        into v_employee_price
      from public.employee_supply_catalog_items catalog
      where catalog.product_id = v_product.id
        and catalog.is_active
      limit 1;

      -- Employee price is optional. When absent, use the normal retail price.
      v_item := jsonb_set(
        v_item,
        '{unit_price}',
        to_jsonb(
          case
            when v_buyer_employee_id is not null and v_employee_price is not null
              then v_employee_price
            else v_retail_price
          end
        ),
        true
      );

      v_responsible := coalesce(
        nullif(v_item ->> 'responsible_employee_id', '')::uuid,
        nullif(v_item ->> 'attributed_employee_id', '')::uuid,
        nullif(v_item ->> 'barber_id', '')::uuid,
        v_inherited_service_executor
      );

      if v_product.business_line = 'barbershop_products' and v_responsible is null then
        raise exception 'Los productos de barbería requieren responsable o vendedor.';
      end if;

      if v_responsible is not null then
        if not exists (
          select 1
          from public.employees employee
          where employee.id = v_responsible
            and employee.status = 'active'
            and (employee.branch_id is null or employee.branch_id = v_branch_id)
        ) then
          raise exception 'El responsable seleccionado no está activo.';
        end if;

        v_item := jsonb_set(v_item, '{responsible_employee_id}', to_jsonb(v_responsible::text), true);
        v_item := jsonb_set(v_item, '{attributed_employee_id}', to_jsonb(v_responsible::text), true);
        v_item := jsonb_set(v_item, '{barber_id}', to_jsonb(v_responsible::text), true);
      end if;
    end if;

    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  if coalesce((p_payload ->> 'internal_credit')::boolean, false)
     and v_buyer_employee_id is null then
    raise exception 'El crédito de empleado requiere un cliente vinculado.';
  end if;

  -- The atomic core still validates:
  -- * employee_customer_links.can_use_internal_credit
  -- * credit contains products only
  -- * stock
  -- * debt creation
  -- * payment method
  -- * sale completion and accounting side effects
  return public.checkout_pos_sale_phase0_core(
    jsonb_set(p_payload, '{items}', v_items, true)
  );
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
