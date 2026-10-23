-- LBBS POS: employee benefit + product courtesy with optional employee credit.
-- Follows 20261023012900_employee_benefit_commercial_courtesy.
-- No schema/table changes or direct changes to historical sales.
--
-- 1. A commercial product courtesy can accompany employee_credit ONLY if a
--    valid employee benefit rule is selected (the rule is checked by the core).
-- 2. With employee_benefit/employee_credit, a service must have a strictly
--    positive price after the benefit discount; ordinary product courtesy rules
--    and stock/cost triggers remain unchanged.
-- 3. The checkout wrapper uses existing SECURITY DEFINER
--    get_pos_internal_options(customer,branch) when the direct employee link
--    lookup is hidden from POS reception by row-level security.
--    This avoids granting general SELECT access to employee_customer_links.

DO $migration$
DECLARE
  v_core text;
  v_wrapper text;
  v_old_guard CONSTANT text :=
    'if v_operation_kind not in (''customer'', ''employee_benefit'') and exists (';
  v_new_guard CONSTANT text :=
    'if (v_operation_kind not in (''customer'', ''employee_benefit'')' ||
    E'\n      and not (v_operation_kind = ''employee_credit'' and v_rule_id is not null)) and exists (';
  v_old_paid_check CONSTANT text :=
    'if v_operation_kind = ''employee_benefit''' ||
    E'\n     and v_courtesy_total > 0';
  v_new_paid_check CONSTANT text :=
    'if v_operation_kind in (''employee_benefit'', ''employee_credit'')' ||
    E'\n     and v_rule_id is not null' ||
    E'\n     and v_courtesy_total > 0';
  v_old_lookup CONSTANT text := $old$
  select link.employee_id
    into v_buyer_employee_id
  from public.employee_customer_links link
  join public.employees employee
    on employee.id = link.employee_id
   and employee.status = 'active'
  where link.customer_id = v_customer_id
    and link.is_active
  limit 1;$old$;
  v_new_lookup CONSTANT text := $new$
  -- LBBS_POS_LINK_VISIBILITY_V2: respect caller's branch authorization via
  -- the existing scoped helper, without widening reception's RLS privileges.
  select nullif(
    public.get_pos_internal_options(v_customer_id, v_branch_id)
      -> 'employee' ->> 'id', ''
  )::uuid into v_buyer_employee_id;$new$;
  v_marker CONSTANT text := 'LBBS_POS_CREDIT_COURTESY_V2';
BEGIN
  IF to_regprocedure('public.checkout_pos_sale_phase0_core(jsonb)') IS NULL
     OR to_regprocedure('public.checkout_pos_sale(jsonb)') IS NULL
     OR to_regprocedure('public.get_pos_internal_options(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan funciones POS requeridas; no se aplicaron cambios.';
  END IF;

  SELECT pg_get_functiondef('public.checkout_pos_sale_phase0_core(jsonb)'::regprocedure)
    INTO v_core;
  SELECT pg_get_functiondef('public.checkout_pos_sale(jsonb)'::regprocedure)
    INTO v_wrapper;

  IF position(v_marker IN v_core) > 0
     AND position('LBBS_POS_LINK_VISIBILITY_V2' IN v_wrapper) > 0 THEN
    RAISE NOTICE 'LBBS POS credit+commercial courtesy v2 already installed.';
    RETURN;
  END IF;
  IF position(v_marker IN v_core) > 0
     OR position('LBBS_POS_LINK_VISIBILITY_V2' IN v_wrapper) > 0 THEN
    RAISE EXCEPTION 'Parche parcial detectado. Revisar antes de repetir.';
  END IF;

  IF position('LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1' IN v_core) = 0
     OR position(v_old_guard IN v_core) = 0
     OR position(v_old_paid_check IN replace(v_core, E'\r\n', E'\n')) = 0
     OR position('perform public.complete_sale(v_sale_id);' IN v_core) = 0
  THEN
    RAISE EXCEPTION 'El nucleo POS no coincide con el parche v1 esperado.';
  END IF;

  IF position(v_old_lookup IN replace(v_wrapper, E'\r\n', E'\n')) = 0
     OR position('return public.checkout_pos_sale_phase0_core(' IN v_wrapper) = 0
     OR position('LANGUAGE plpgsql' IN v_wrapper) = 0
  THEN
    RAISE EXCEPTION 'El wrapper POS cambio; no se reescribio.';
  END IF;

  v_core := replace(v_core, v_old_guard, v_new_guard);
  v_core := replace(v_core, v_old_paid_check, v_new_paid_check);
  v_core := replace(
    v_core,
    '-- LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1',
    '-- LBBS_EMPLOYEE_BENEFIT_COMMERCIAL_COURTESY_V1' || E'\n  -- LBBS_POS_CREDIT_COURTESY_V2'
  );

  -- PostgreSQL preserves the function's privileges and security settings
  -- when replacing the same signature.
  EXECUTE v_core;

  v_wrapper := replace(
    v_wrapper,
    replace(v_old_lookup, E'\n', E'\r\n'),
    replace(v_new_lookup, E'\n', E'\r\n')
  );
  IF position('LBBS_POS_LINK_VISIBILITY_V2' IN v_wrapper) = 0 THEN
    RAISE EXCEPTION 'No se pudo actualizar la consulta RLS del POS.';
  END IF;
  EXECUTE v_wrapper;

  RAISE NOTICE 'LBBS POS: beneficio+credito+cortesia corregidos.';
END;
$migration$;