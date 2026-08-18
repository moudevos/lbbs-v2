-- Permite que el saldo final de un beneficio se registre como credito del
-- empleado. El credito sin beneficio sigue limitado a productos.
do $migration$
declare
  v_definition text;
  v_old text := $old$
    else
      v_operation_kind := 'employee_benefit';
    end if;
  elsif v_internal_credit then
$old$;
  v_new text := $new$
    else
      v_operation_kind := case when v_internal_credit then 'employee_credit' else 'employee_benefit' end;
    end if;
  end if;

  if v_internal_credit then
$new$;
begin
  select pg_get_functiondef('public.checkout_pos_sale(jsonb)'::regprocedure)
  into v_definition;

  if position(v_old in v_definition) = 0 then
    if position('case when v_internal_credit then ''employee_credit'' else ''employee_benefit'' end' in v_definition) > 0 then
      return;
    end if;
    raise exception 'No se encontro la version esperada de checkout_pos_sale; ejecuta primero el SQL 135.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  v_definition := replace(v_definition, $old$    if exists (
      select 1 from jsonb_array_elements(p_payload -> 'items') item
$old$, $new$    if v_rule_id is null and exists (
      select 1 from jsonb_array_elements(p_payload -> 'items') item
$new$);
  v_definition := replace(v_definition, $old$    v_operation_kind := 'employee_credit';
  end if;

  if v_operation_kind <> 'customer' and exists (
$old$, $new$    if v_operation_kind = 'customer' then
      v_operation_kind := 'employee_credit';
    end if;
  end if;

  if v_operation_kind <> 'customer' and exists (
$new$);
  v_definition := replace(v_definition, $old$    if v_rule.is_internal_complimentary then
      v_authorized_by := public.authorize_internal_complimentary_sale(v_authorization_pin, v_branch_id);
$old$, $new$    if v_rule.is_internal_complimentary then
      if v_internal_credit then
        raise exception 'Un beneficio gratuito no puede enviarse a credito.';
      end if;
      v_authorized_by := public.authorize_internal_complimentary_sale(v_authorization_pin, v_branch_id);
$new$);

  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
