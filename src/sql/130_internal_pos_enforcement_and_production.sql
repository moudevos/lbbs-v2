-- Refuerzos para operaciones internas POS. Ejecutar después de 129.
-- La interfaz ayuda al operador, pero estas reglas impiden que una petición
-- directa convierta un crédito interno en un pago de caja o aplique Rewards.

alter table public.employee_benefit_rules
  add column if not exists production_mode text not null default 'fixed';

alter table public.employee_benefit_rules
  drop constraint if exists employee_benefit_rules_production_mode_check;
alter table public.employee_benefit_rules
  add constraint employee_benefit_rules_production_mode_check
  check (production_mode in ('fixed', 'percentage', 'none'));

create or replace function public.guard_internal_credit_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_kind text;
  v_operation_kind text;
begin
  select payment_kind into v_payment_kind
  from public.payment_methods
  where id = new.payment_method_id;

  select operation_kind into v_operation_kind
  from public.sales
  where id = new.sale_id;

  if v_payment_kind = 'internal_credit' and v_operation_kind <> 'employee_credit' then
    raise exception 'Crédito de empleado solo puede usarse en una venta de crédito interno.';
  end if;

  if v_operation_kind = 'employee_credit' and v_payment_kind <> 'internal_credit' then
    raise exception 'Una venta de crédito interno debe usar únicamente Crédito de empleado.';
  end if;

  return new;
end;
$$;

drop trigger if exists sale_payments_internal_credit_guard on public.sale_payments;
create trigger sale_payments_internal_credit_guard
before insert or update of sale_id, payment_method_id on public.sale_payments
for each row execute function public.guard_internal_credit_payment();

-- Un cliente identificado como empleado no participa en Rewards. Esto evita
-- mezclar beneficios de fidelización de clientes con beneficios internos.
create or replace function public.guard_internal_customer_reward_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.sales sale
    join public.employee_customer_links link
      on link.customer_id = sale.customer_id
     and link.is_active
    where sale.id = new.sale_id
  ) then
    raise exception 'Los clientes vinculados a empleados no pueden usar Rewards.';
  end if;

  return new;
end;
$$;

drop trigger if exists reward_redemptions_internal_customer_guard on public.reward_redemptions;
create trigger reward_redemptions_internal_customer_guard
before insert or update of sale_id on public.reward_redemptions
for each row execute function public.guard_internal_customer_reward_redemption();

-- Para una regla de empleado, la producción puede liquidarse como monto fijo,
-- como base sometida al porcentaje de la liquidación, o no liquidarse.
-- El trigger ocurre después de que la producción base se haya generado.
create or replace function public.apply_employee_benefit_production_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_fixed_payout numeric(12,2);
begin
  if new.production_source <> 'employee_benefit' then
    return new;
  end if;

  select rule.production_mode, rule.fixed_barber_payout
  into v_mode, v_fixed_payout
  from public.internal_pos_operations operation
  join public.employee_benefit_rules rule on rule.id = operation.benefit_rule_id
  where operation.sale_id = new.sale_id;

  if not found then
    return new;
  end if;

  update public.employee_service_production
  set fixed_commission_amount = case when v_mode = 'fixed' then coalesce(v_fixed_payout, 0) else 0 end,
      commissionable_amount = case
        when v_mode = 'percentage' then greatest(coalesce(new.collected_amount, 0) - coalesce(new.operational_contribution_amount, 0), 0)
        else 0
      end,
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists employee_service_production_benefit_mode_trigger on public.employee_service_production;
create trigger employee_service_production_benefit_mode_trigger
after insert or update of production_source on public.employee_service_production
for each row execute function public.apply_employee_benefit_production_mode();

revoke all on function public.guard_internal_credit_payment() from public;
grant execute on function public.guard_internal_credit_payment() to authenticated, service_role;
revoke all on function public.guard_internal_customer_reward_redemption() from public;
grant execute on function public.guard_internal_customer_reward_redemption() to authenticated, service_role;
revoke all on function public.apply_employee_benefit_production_mode() from public;
grant execute on function public.apply_employee_benefit_production_mode() to authenticated, service_role;

notify pgrst, 'reload schema';
