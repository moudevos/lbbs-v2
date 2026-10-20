-- POS product checkout: preserve authorized custom prices and retain branch/employee catalog prices for non-custom items.
-- Product data: set Bandido Blanco Fiber Wax at Ricardo Palma to S/ 33 (base S/ 30 is unchanged).
CREATE OR REPLACE FUNCTION public.checkout_pos_sale(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        coalesce(product.allow_custom_price, false) as allow_custom_price,
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

      -- visibility_scope controla acceso, no elegibilidad de crédito.
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
        (
          select product.base_sale_price
          from public.products product
          where product.id = v_product.id
        )
      );

      v_employee_price := null;

      select catalog.employee_unit_price
        into v_employee_price
      from public.employee_supply_catalog_items catalog
      where catalog.product_id = v_product.id
        and catalog.is_active
      limit 1;

      -- No cambiar precios manuales autorizados: deben coincidir con el total enviado por POS.
      if v_product.allow_custom_price then
        if coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0) <= 0 then
          raise exception 'Ingresa el precio del item personalizado.';
        end if;
      else
        v_item := jsonb_set(
          v_item,
          '{unit_price}',
          to_jsonb(
            case
              when v_buyer_employee_id is not null
               and v_employee_price is not null
                then v_employee_price
              else v_retail_price
            end
          ),
          true
        );
      end if;

      v_responsible := coalesce(
        nullif(v_item ->> 'responsible_employee_id', '')::uuid,
        nullif(v_item ->> 'attributed_employee_id', '')::uuid,
        nullif(v_item ->> 'barber_id', '')::uuid,
        v_inherited_service_executor
      );

      if v_product.business_line = 'barbershop_products'
         and v_responsible is null then
        raise exception 'Los productos de barbería requieren responsable o vendedor.';
      end if;

      if v_responsible is not null then
        if not exists (
          select 1
          from public.employees employee
          where employee.id = v_responsible
            and employee.status = 'active'
            and (
              employee.branch_id is null
              or employee.branch_id = v_branch_id
            )
        ) then
          raise exception 'El responsable seleccionado no está activo.';
        end if;

        v_item := jsonb_set(
          v_item,
          '{responsible_employee_id}',
          to_jsonb(v_responsible::text),
          true
        );

        v_item := jsonb_set(
          v_item,
          '{attributed_employee_id}',
          to_jsonb(v_responsible::text),
          true
        );

        v_item := jsonb_set(
          v_item,
          '{barber_id}',
          to_jsonb(v_responsible::text),
          true
        );
      end if;
    end if;

    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  if coalesce((p_payload ->> 'internal_credit')::boolean, false)
     and v_buyer_employee_id is null then
    raise exception 'El crédito de empleado requiere un cliente vinculado.';
  end if;

  -- El núcleo atómico sigue validando:
  -- * employee_customer_links.can_use_internal_credit
  -- * crédito compuesto únicamente por productos
  -- * stock
  -- * creación de deuda
  -- * método de pago
  -- * cierre de venta
  -- * efectos contables
  return public.checkout_pos_sale_phase0_core(
    jsonb_set(
      p_payload,
      '{items}',
      v_items,
      true
    )
  );
end;
$function$;

INSERT INTO public.product_branch_prices (product_id, branch_id, sale_price, is_active)
SELECT p.id, b.id, 33.00, true
FROM public.products p
JOIN public.branches b ON b.id = 'e7fcd513-e5ef-492b-afdb-057b8712e707'::uuid
WHERE p.id = '84572860-8b04-4a79-8f40-3956c695214c'::uuid
  AND p.name = 'Bandido Blanco Fiber Wax'
ON CONFLICT (product_id, branch_id)
DO UPDATE SET sale_price = EXCLUDED.sale_price, is_active = true, updated_at = now();
