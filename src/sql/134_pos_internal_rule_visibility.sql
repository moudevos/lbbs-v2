-- Visibilidad de beneficios internos para todo operador habilitado de POS.
-- Ejecutar despues de 133_pos_atomic_courtesy_checkout.sql.
-- Esta RPC evita depender de RLS de tablas administrativas desde el POS: la
-- visibilidad se define por el EMPLEADO vinculado al cliente, no por el rol de
-- quien opera la caja.

create or replace function public.get_pos_internal_options(
  p_customer_id uuid,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.employee_customer_links%rowtype;
  v_employee public.employees%rowtype;
  v_rules jsonb;
begin
  if public.current_employee_id() is null
     or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para consultar opciones internas de esta sede.';
  end if;

  select * into v_link
  from public.employee_customer_links
  where customer_id = p_customer_id
    and is_active
  limit 1;

  if not found then
    return jsonb_build_object('employee', null, 'canUseCredit', false, 'rules', '[]'::jsonb);
  end if;

  select * into v_employee
  from public.employees
  where id = v_link.employee_id
    and status = 'active';

  if not found then
    return jsonb_build_object('employee', null, 'canUseCredit', false, 'rules', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rule.id,
        'name', rule.name,
        'description', rule.description,
        'applies_to', rule.applies_to,
        'service_id', rule.service_id,
        'product_id', rule.product_id,
        'benefit_type', rule.benefit_type,
        'benefit_value', rule.benefit_value,
        'usage_limit', rule.usage_limit,
        'period_kind', rule.period_kind,
        'production_mode', rule.production_mode,
        'fixed_barber_payout', rule.fixed_barber_payout,
        'operational_contribution', rule.operational_contribution,
        'requires_owner_authorization', rule.requires_owner_authorization,
        'is_internal_complimentary', rule.is_internal_complimentary
      ) order by rule.name
    ),
    '[]'::jsonb
  ) into v_rules
  from public.employee_benefit_rules rule
  where rule.is_active
    and rule.effective_from <= public.pos_business_date()
    and (rule.effective_to is null or rule.effective_to >= public.pos_business_date())
    and (rule.branch_id is null or rule.branch_id = p_branch_id)
    -- Este rol es el del empleado vinculado al cliente. No es el rol del
    -- operador actual del POS: una recepción puede registrar el beneficio de
    -- un barbero si la regla corresponde a barber.
    and (rule.eligible_role is null or rule.eligible_role = v_employee.role::text)
    and (
      not exists (
        select 1
        from public.employee_benefit_rule_employees target
        where target.rule_id = rule.id
      )
      or exists (
        select 1
        from public.employee_benefit_rule_employees target
        where target.rule_id = rule.id
          and target.employee_id = v_employee.id
      )
    );

  return jsonb_build_object(
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'fullName', v_employee.full_name,
      'role', v_employee.role
    ),
    'canUseCredit', v_link.can_use_internal_credit,
    'rules', v_rules
  );
end;
$$;

-- La operación ya valida sesión, sede, vínculo y regla. SECURITY DEFINER
-- impide que RLS del vínculo bloquee el checkout de recepción/admin.
alter function public.checkout_pos_sale(jsonb) security definer;

create or replace function public.guard_internal_pos_benefit_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.benefit_rule_id is not null
     and exists (
       select 1
       from public.employee_benefit_rule_employees target
       where target.rule_id = new.benefit_rule_id
     )
     and not exists (
       select 1
       from public.employee_benefit_rule_employees target
       where target.rule_id = new.benefit_rule_id
         and target.employee_id = new.employee_id
     ) then
    raise exception 'El beneficio no está habilitado para el empleado vinculado al cliente.';
  end if;
  return new;
end;
$$;

drop trigger if exists internal_pos_operations_benefit_target_guard on public.internal_pos_operations;
create trigger internal_pos_operations_benefit_target_guard
before insert or update of benefit_rule_id, employee_id
on public.internal_pos_operations
for each row execute function public.guard_internal_pos_benefit_target();

revoke all on function public.get_pos_internal_options(uuid, uuid) from public, anon;
grant execute on function public.get_pos_internal_options(uuid, uuid) to authenticated, service_role;
revoke all on function public.guard_internal_pos_benefit_target() from public, anon, authenticated;
grant execute on function public.guard_internal_pos_benefit_target() to service_role;

notify pgrst, 'reload schema';
