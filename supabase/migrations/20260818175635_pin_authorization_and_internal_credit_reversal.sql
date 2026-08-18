-- PIN-only authorization for free internal sales and auditable rollback of
-- employee credit when its source POS sale is cancelled. Run after 134.

do $$
declare v_constraint text;
begin
  for v_constraint in select conname from pg_constraint
    where conrelid = 'public.internal_pos_operations'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) ilike '%authorization_reason%'
  loop
    execute format('alter table public.internal_pos_operations drop constraint %I', v_constraint);
  end loop;
end;
$$;

alter table public.internal_pos_operations
  drop constraint if exists internal_pos_operations_complimentary_authorization_check;
alter table public.internal_pos_operations
  add constraint internal_pos_operations_complimentary_authorization_check
  check (operation_kind <> 'internal_complimentary' or authorized_by is not null);

-- Any POS operator with branch access can present an active owner's PIN.
create or replace function public.authorize_internal_complimentary_sale(p_pin text, p_branch_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_authorized_by uuid;
begin
  if public.current_employee_id() is null or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para registrar una operacion interna.';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{6,12}$' then
    raise exception 'Ingresa un PIN de autorizacion de 6 a 12 digitos.';
  end if;
  select pin.employee_id into v_authorized_by
  from public.owner_internal_authorization_pins pin
  join public.employees owner_employee on owner_employee.id = pin.employee_id
  where owner_employee.status = 'active'
    and owner_employee.role::text = 'owner'
    and pin.pin_hash = extensions.crypt(p_pin, pin.pin_hash)
  order by pin.updated_at desc limit 1;
  if v_authorized_by is null then raise exception 'El PIN de autorizacion no es valido.'; end if;
  return v_authorized_by;
end;
$$;
revoke all on function public.authorize_internal_complimentary_sale(text, uuid) from public, anon;
grant execute on function public.authorize_internal_complimentary_sale(text, uuid) to authenticated, service_role;

-- Reverse untouched credit only. Paid/deducted credit requires an audited refund.
create or replace function public.rollback_internal_credit_debt_on_sale_cancellation()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_debt public.employee_debts%rowtype; v_debt_id uuid; v_operator_id uuid := public.current_employee_id();
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  select operation.debt_id into v_debt_id from public.internal_pos_operations operation
  where operation.sale_id = new.id and operation.operation_kind = 'employee_credit' and operation.debt_id is not null;
  if v_debt_id is null then return new; end if;
  select * into v_debt from public.employee_debts where id = v_debt_id for update;
  if not found then raise exception 'No se encontro la deuda asociada a esta venta.'; end if;
  if v_debt.outstanding_amount <> v_debt.original_amount or v_debt.status <> 'pending' then
    raise exception 'No se puede anular esta venta: su credito ya tiene pagos o descuentos aplicados. Registra primero la devolucion mediante Finanzas.';
  end if;
  if not exists (select 1 from public.employee_debt_movements movement where movement.debt_id = v_debt.id and movement.movement_type = 'cancellation' and movement.notes = 'Anulacion de venta POS: ' || new.id::text) then
    update public.employee_debts set outstanding_amount = 0, status = 'cancelled', settled_at = now() where id = v_debt.id;
    insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
    values (v_debt.id, 'cancellation', v_debt.original_amount, 'Anulacion de venta POS: ' || new.id::text, v_operator_id);
  end if;
  return new;
end;
$$;
drop trigger if exists sales_internal_credit_cancellation_rollback on public.sales;
create trigger sales_internal_credit_cancellation_rollback after update of status on public.sales
for each row execute function public.rollback_internal_credit_debt_on_sale_cancellation();
revoke all on function public.rollback_internal_credit_debt_on_sale_cancellation() from public;
grant execute on function public.rollback_internal_credit_debt_on_sale_cancellation() to authenticated, service_role;

-- The checkout validates the authorization PIN inside the same transaction.
-- Restaura las cortesias de productos asociadas a servicios dentro del checkout
-- atomico y valida sus pagos contra el total final.
-- Ejecutar despues de 132_accounting_dates_and_period_integrity.sql.

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item jsonb;
  v_payment jsonb;
  v_final_total numeric(12,2);
  v_paid_total numeric(12,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_item_total numeric(12,2);
  v_is_courtesy boolean;
  v_courtesy_reason text;
  v_qualifying_sale_item_id uuid;
  v_pos_session_id uuid := (p_payload ->> 'pos_session_id')::uuid;
  v_branch_id uuid := (p_payload ->> 'branch_id')::uuid;
  v_customer_id uuid := (p_payload ->> 'customer_id')::uuid;
  v_barber_id uuid := nullif(p_payload ->> 'barber_id', '')::uuid;
  v_reservation_id uuid := nullif(p_payload ->> 'reservation_id', '')::uuid;
  v_reward_entitlement_id uuid := nullif(p_payload ->> 'reward_entitlement_id', '')::uuid;
  v_rule public.employee_benefit_rules%rowtype;
  v_link public.employee_customer_links%rowtype;
  v_linked_employee public.employees%rowtype;
  v_debt public.employee_debts%rowtype;
  v_rule_id uuid := nullif(p_payload ->> 'employee_benefit_rule_id', '')::uuid;
  v_internal_credit boolean := coalesce((p_payload ->> 'internal_credit')::boolean, false);
  v_authorization_pin text := nullif(btrim(coalesce(p_payload ->> 'authorization_pin', '')), '');
  v_authorized_by uuid;
  v_operation_kind text := 'customer';
  v_rule_period date;
  v_usage_count integer;
  v_matches boolean;
  v_credit_method_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_courtesy_total numeric(12,2) := 0;
begin
  if v_employee_id is null or not public.can_manage_pos_branch(v_branch_id) then
    raise exception 'No tienes permisos para cerrar ventas en esta sede.';
  end if;

  select * into v_session
  from public.pos_sessions
  where id = v_pos_session_id and branch_id = v_branch_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'La sesion POS ya esta cerrada.';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'items', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item.';
  end if;

  if v_rule_id is not null or v_internal_credit then
    select link.* into v_link
    from public.employee_customer_links link
    where link.customer_id = v_customer_id and link.is_active
    for share;

    if not found then
      raise exception 'El cliente no esta vinculado a un empleado activo autorizado.';
    end if;

    select * into v_linked_employee
    from public.employees
    where id = v_link.employee_id and status = 'active';

    if not found then
      raise exception 'El cliente no esta vinculado a un empleado activo autorizado.';
    end if;
  end if;

  if v_rule_id is not null then
    if v_reward_entitlement_id is not null then
      raise exception 'No puedes combinar un reward de cliente con un beneficio interno.';
    end if;

    select * into v_rule
    from public.employee_benefit_rules
    where id = v_rule_id
      and is_active
      and effective_from <= public.pos_business_date()
      and (effective_to is null or effective_to >= public.pos_business_date())
    for share;

    if not found then raise exception 'El beneficio interno ya no esta disponible.'; end if;
    if v_rule.branch_id is not null and v_rule.branch_id <> v_branch_id then
      raise exception 'El beneficio no aplica para esta sede.';
    end if;
    if v_rule.eligible_role is not null and v_rule.eligible_role <> v_linked_employee.role::text then
      raise exception 'El beneficio no aplica para este empleado.';
    end if;

    v_rule_period := public.internal_benefit_period_start(v_rule.period_kind, public.pos_business_date());
    if v_rule.period_kind <> 'none' then
      select count(*) into v_usage_count
      from public.internal_pos_operations operation
      join public.sales sale on sale.id = operation.sale_id
      where operation.employee_id = v_link.employee_id
        and operation.benefit_rule_id = v_rule.id
        and sale.status = 'completed'
        and sale.closed_at::date >= v_rule_period;

      if v_usage_count >= v_rule.usage_limit then
        raise exception 'El empleado ya alcanzo el limite de este beneficio en el periodo vigente.';
      end if;
    end if;

    if exists (select 1 from public.employee_benefit_rule_employees target where target.rule_id = v_rule.id)
       and not exists (select 1 from public.employee_benefit_rule_employees target where target.rule_id = v_rule.id and target.employee_id = v_link.employee_id) then
      raise exception 'El beneficio no fue asignado a este empleado.';
    end if;

    if v_rule.is_internal_complimentary then
      v_authorized_by := public.authorize_internal_complimentary_sale(v_authorization_pin, v_branch_id);
      v_operation_kind := 'internal_complimentary';
    else
      v_operation_kind := 'employee_benefit';
    end if;
  elsif v_internal_credit then
    if not v_link.can_use_internal_credit then
      raise exception 'Este empleado no tiene credito interno habilitado.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_payload -> 'items') item
      where item ->> 'item_type' <> 'product'
    ) then
      raise exception 'El credito interno solo esta disponible para productos.';
    end if;
    v_operation_kind := 'employee_credit';
  end if;

  if v_operation_kind <> 'customer' and exists (
    select 1 from jsonb_array_elements(p_payload -> 'items') item
    where coalesce((item ->> 'is_courtesy')::boolean, false)
  ) then
    raise exception 'No puedes combinar una cortesia comercial con una operacion interna.';
  end if;

  insert into public.sales (
    pos_session_id, branch_id, customer_id, reservation_id, barber_id, status,
    subtotal, discount_total, courtesy_total, total, paid_total, change_amount,
    checkout_idempotency_key, notes, created_by, operation_kind
  ) values (
    v_pos_session_id, v_branch_id, v_customer_id, v_reservation_id, v_barber_id, 'draft',
    0, 0, 0, 0, 0, 0, nullif(p_payload ->> 'idempotency_key', ''),
    nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''), v_employee_id, v_operation_kind
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    if coalesce((v_item ->> 'quantity')::numeric, 0) <= 0
       or coalesce((v_item ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'Hay items invalidos en la venta.';
    end if;

    v_line_total := round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price')::numeric, 2);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
    v_is_courtesy := coalesce((v_item ->> 'is_courtesy')::boolean, false);
    v_courtesy_reason := nullif(btrim(coalesce(v_item ->> 'courtesy_reason', '')), '');

    if v_is_courtesy then
      if v_item ->> 'item_type' <> 'product' then
        raise exception 'Las cortesias se registran solo para productos.';
      end if;
      if v_discount <> 0 then
        raise exception 'Una cortesia no puede acumular otro descuento.';
      end if;
      if not exists (
        select 1 from public.products
        where id = (v_item ->> 'product_id')::uuid
          and is_courtesy_allowed
      ) then
        raise exception 'Este producto no esta habilitado para cortesia.';
      end if;
    elsif v_rule_id is not null then
      v_matches := v_rule.applies_to = 'all'
        or (
          v_rule.applies_to = (v_item ->> 'item_type')
          and (
            ((v_item ->> 'item_type') = 'service'
              and (v_rule.service_id is null or v_rule.service_id = (v_item ->> 'service_id')::uuid)
              and (v_rule.service_category_id is null or v_rule.service_category_id = (
                select category_id from public.services where id = (v_item ->> 'service_id')::uuid
              )))
            or
            ((v_item ->> 'item_type') = 'product'
              and (v_rule.product_id is null or v_rule.product_id = (v_item ->> 'product_id')::uuid)
              and (v_rule.product_category_id is null or v_rule.product_category_id = (
                select category_id from public.products where id = (v_item ->> 'product_id')::uuid
              )))
          )
        );

      if v_matches then
        v_discount := case v_rule.benefit_type
          when 'free' then v_line_total
          when 'fixed_price' then greatest(
            v_line_total - round(v_rule.benefit_value * (v_item ->> 'quantity')::numeric, 2), 0
          )
          else round(v_line_total * v_rule.benefit_value / 100, 2)
        end;
      end if;
    end if;

    v_discount := least(greatest(v_discount, 0), v_line_total);
    v_item_total := case when v_is_courtesy then 0 else v_line_total - v_discount end;
    v_subtotal := v_subtotal + v_line_total;
    v_discount_total := v_discount_total + v_discount;
    v_courtesy_total := v_courtesy_total + case when v_is_courtesy then v_line_total else 0 end;

    insert into public.sale_items (
      sale_id, item_type, service_id, product_id, description_snapshot, quantity,
      unit_price, discount_amount, total, cost_snapshot, barber_id, is_courtesy,
      courtesy_reason, courtesy_rule_id, courtesy_rule_name_snapshot,
      original_unit_price, original_total, courtesy_amount, courtesy_authorized_by
    ) values (
      v_sale_id, v_item ->> 'item_type', nullif(v_item ->> 'service_id', '')::uuid,
      nullif(v_item ->> 'product_id', '')::uuid,
      coalesce(nullif(v_item ->> 'description_snapshot', ''), 'Item POS'),
      (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric,
      v_discount, v_item_total, nullif(v_item ->> 'cost_snapshot', '')::numeric,
      nullif(v_item ->> 'barber_id', '')::uuid, v_is_courtesy, v_courtesy_reason,
      null, null,
      case when v_is_courtesy then (v_item ->> 'unit_price')::numeric else null end,
      case when v_is_courtesy then v_line_total else null end,
      case when v_is_courtesy then v_line_total else null end,
      case when v_is_courtesy then v_employee_id else null end
    );
  end loop;

  if v_courtesy_total > 0 then
    select item.id into v_qualifying_sale_item_id
    from public.sale_items item
    where item.sale_id = v_sale_id
      and item.item_type = 'service'
      and not item.is_courtesy
    order by item.created_at, item.id
    limit 1;

    if v_qualifying_sale_item_id is null then
      raise exception 'Las cortesias requieren al menos un servicio de pago en la venta.';
    end if;
    if (select coalesce(sum(quantity) filter (where is_courtesy), 0)
        from public.sale_items where sale_id = v_sale_id)
       > (select coalesce(sum(quantity) filter (where item_type = 'service' and not is_courtesy), 0)
          from public.sale_items where sale_id = v_sale_id) then
      raise exception 'Solo puedes registrar una cortesia por cada servicio de pago.';
    end if;

    update public.sale_items
    set qualifying_sale_item_id = v_qualifying_sale_item_id
    where sale_id = v_sale_id and is_courtesy;
  end if;

  update public.sales
  set subtotal = round(v_subtotal, 2),
      discount_total = round(v_discount_total, 2),
      courtesy_total = case
        when v_operation_kind = 'internal_complimentary' then round(v_subtotal, 2)
        else round(v_courtesy_total, 2)
      end,
      total = round(v_subtotal - v_discount_total - v_courtesy_total, 2)
  where id = v_sale_id;

  -- Rewards alteran el total. Deben aplicarse antes de comparar los pagos.
  if v_reward_entitlement_id is not null then
    perform public.apply_reward_to_sale(v_sale_id, v_reward_entitlement_id);
  end if;

  select total into v_final_total from public.sales where id = v_sale_id;

  if v_operation_kind = 'employee_credit' then
    select id into v_credit_method_id
    from public.payment_methods
    where code = 'employee_credit' and is_active;

    if v_credit_method_id is null then
      raise exception 'El metodo Credito de empleado no esta configurado.';
    end if;

    v_debt := public.create_pos_internal_credit_debt(
      v_sale_id, v_link.employee_id, v_branch_id, v_final_total
    );
    insert into public.sale_payments (
      sale_id, payment_method_id, amount, tendered_amount, change_amount
    ) values (v_sale_id, v_credit_method_id, v_final_total, v_final_total, 0);
  else
    select coalesce(sum((value ->> 'amount')::numeric), 0) into v_paid_total
    from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb));

    if round(v_paid_total, 2) <> round(coalesce(v_final_total, 0), 2) then
      raise exception 'El monto pagado no cubre el total final de la venta.';
    end if;

    for v_payment in select value from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb)) loop
      insert into public.sale_payments (
        sale_id, payment_method_id, amount, tendered_amount, change_amount
      ) values (
        v_sale_id, (v_payment ->> 'payment_method_id')::uuid,
        (v_payment ->> 'amount')::numeric, (v_payment ->> 'tendered_amount')::numeric,
        coalesce((v_payment ->> 'change_amount')::numeric, 0)
      );
    end loop;
  end if;

  if v_operation_kind <> 'customer' then
    insert into public.internal_pos_operations (
      sale_id, employee_id, customer_id, benefit_rule_id, debt_id, operation_kind,
      retail_amount, discount_amount, credit_amount, authorization_reason,
      authorized_by, created_by
    ) values (
      v_sale_id, v_link.employee_id, v_customer_id, v_rule_id, v_debt.id,
      v_operation_kind, v_subtotal, v_discount_total,
      case when v_operation_kind = 'employee_credit' then v_final_total else 0 end,
      null,
      case when v_operation_kind = 'internal_complimentary' then v_authorized_by else null end,
      v_employee_id
    );
  end if;

  perform public.complete_sale(v_sale_id);
  return v_sale_id;
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

