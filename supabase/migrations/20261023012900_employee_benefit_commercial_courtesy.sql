-- LBBS: cortesias comerciales de producto compatibles con beneficios internos
-- de empleado que mantengan un servicio efectivamente cobrado.
--
-- Alcance estricto:
--   employee_benefit   -> permite cortesia si queda servicio con total > 0.
--   employee_credit    -> sigue bloqueado.
--   internal_complimentary -> sigue bloqueado.
--   socio_benefit      -> mantiene su motor y restricciones independientes.
--   customer           -> comportamiento anterior, sin cambios.
--
-- Por que un parche quirurgico: checkout_pos_sale_phase0_core es el nucleo
-- transaccional y tiene otras correcciones vigentes. Recuperar su definicion
-- instalada y reemplazar SOLO el guard evita sobrescribir esas correcciones.
-- Si cambia el contrato esperado, la migracion FALLA en vez de tocar otra logica.
-- No actualiza ventas anteriores, tablas, precios, inventario ni configuracion.

DO $migration$
DECLARE
  v_proc regprocedure := to_regprocedure('public.checkout_pos_sale_phase0_core(jsonb)');
  v_definition text;
  v_old_guard CONSTANT text := 'if v_operation_kind <> ''customer'' and exists (';
  v_new_guard CONSTANT text := 'if v_operation_kind not in (''customer'', ''employee_benefit'') and exists (';
  v_anchor CONSTANT text := 'if v_courtesy_total > 0 then';
  v_marker CONSTANT text := 'LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1';
  v_postcheck CONSTANT text := $postcheck$
  -- LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1
  -- La cortesia comercial no puede ser financiada por un servicio gratuito.
  -- Se comprueba el total real de la linea DESPUES del descuento interno.
  if v_operation_kind = 'employee_benefit'
     and v_courtesy_total > 0
     and not exists (
       select 1
       from public.sale_items item
       where item.sale_id = v_sale_id
         and item.item_type = 'service'
         and not item.is_courtesy
         and round(coalesce(item.total, 0), 2) > 0
     )
  then
    raise exception 'Una cortesia comercial con beneficio interno requiere un servicio con importe positivo a pagar.';
  end if;

  if v_courtesy_total > 0 then$postcheck$;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'Se requiere public.checkout_pos_sale_phase0_core(jsonb).';
  END IF;

  SELECT pg_get_functiondef(v_proc) INTO v_definition;

  IF position(v_marker IN v_definition) > 0 THEN
    IF position(v_new_guard IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Parche ya identificado, pero el guard no coincide. Revisar manualmente.';
    END IF;
    RAISE NOTICE 'LBBS: compatibilidad beneficio/cortesia ya instalada.';
    RETURN;
  END IF;

  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontro el guard original. No se cambio la funcion.';
  END IF;

  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontro el punto de validacion de cortesias. No se cambio la funcion.';
  END IF;

  -- Evita parcheo silencioso de una firma modificada.
  IF position('v_item_total := case when v_is_courtesy then 0 else v_line_total - v_discount end;' IN v_definition) = 0
     OR position('perform public.complete_sale(v_sale_id);' IN v_definition) = 0
  THEN
    RAISE EXCEPTION 'El contrato del checkout atomico cambio. Revisar antes de aplicar.';
  END IF;

  v_definition := replace(v_definition, v_old_guard, v_new_guard);
  v_definition := replace(v_definition, v_anchor, v_postcheck);

  -- Conserva SECURITY DEFINER, search_path, firma y permisos al redefinir
  -- la misma funcion. No cambia la funcion wrapper checkout_pos_sale.
  EXECUTE v_definition;

  RAISE NOTICE 'LBBS: se habilito cortesia comercial para employee_benefit con servicio cobrado.';
END;
$migration$;