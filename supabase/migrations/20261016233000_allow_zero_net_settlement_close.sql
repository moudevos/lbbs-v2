begin;

create or replace function public.pay_employee_settlement_v194(
  p_settlement_id uuid,
  p_payment_parts jsonb,
  p_notes text default null::text
)
returns public.employee_settlements
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_settlement public.employee_settlements%rowtype;
  v_part jsonb;
  v_method public.payment_methods%rowtype;
  v_payment public.employee_settlement_payments%rowtype;
  v_debt public.employee_debts%rowtype;
  v_deduction record;
  v_actor uuid := public.current_employee_id();
  v_amount numeric(12,2);
  v_total numeric(12,2) := 0;
  v_reference text;
  v_new_outstanding numeric(12,2);
  v_zero_net boolean;
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select *
    into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_settlement.status <> 'approved' then
    raise exception 'La liquidación debe estar aprobada antes de pagar.';
  end if;

  if round(coalesce(v_settlement.net_pay_amount, 0), 2) < 0 then
    raise exception 'El neto de la liquidación no puede ser negativo.';
  end if;

  v_zero_net := round(coalesce(v_settlement.net_pay_amount, 0), 2) = 0;

  if p_payment_parts is null or jsonb_typeof(p_payment_parts) <> 'array' then
    raise exception 'Las partes de pago deben enviarse como una lista.';
  end if;

  if v_zero_net then
    if jsonb_array_length(p_payment_parts) <> 0 then
      raise exception 'Una liquidación con neto cero no requiere métodos de pago.';
    end if;
  elsif jsonb_array_length(p_payment_parts) = 0 then
    raise exception 'Registra al menos un método de pago.';
  end if;

  for v_part in
    select value
    from jsonb_array_elements(p_payment_parts)
  loop
    v_amount := round(coalesce((v_part ->> 'amount')::numeric, 0), 2);

    if v_amount <= 0 or nullif(v_part ->> 'paymentMethodId', '') is null then
      raise exception 'Cada parte requiere método y monto mayor a cero.';
    end if;

    select *
      into v_method
    from public.payment_methods
    where id = (v_part ->> 'paymentMethodId')::uuid
      and is_active;

    if not found or v_method.payment_kind = 'internal_credit' then
      raise exception 'El método de pago no está disponible para liquidaciones.';
    end if;

    v_reference := nullif(btrim(coalesce(v_part ->> 'reference', '')), '');

    if v_method.payment_kind in ('wallet_qr', 'bank_transfer')
       and v_reference is null then
      raise exception 'La referencia es obligatoria para el método digital %.', v_method.name;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_payment_parts) other
      where other <> v_part
        and other ->> 'paymentMethodId' = v_part ->> 'paymentMethodId'
    ) then
      raise exception 'Cada método de pago puede aparecer una sola vez.';
    end if;

    v_total := v_total + v_amount;
  end loop;

  if round(v_total, 2) <> round(v_settlement.net_pay_amount, 2) then
    raise exception 'La suma de las partes debe coincidir exactamente con el neto de la liquidación.';
  end if;

  for v_part in
    select value
    from jsonb_array_elements(p_payment_parts)
  loop
    select *
      into v_method
    from public.payment_methods
    where id = (v_part ->> 'paymentMethodId')::uuid
    for share;

    v_amount := round((v_part ->> 'amount')::numeric, 2);
    v_reference := nullif(btrim(coalesce(v_part ->> 'reference', '')), '');

    insert into public.employee_settlement_payments(
      settlement_id,
      employee_id,
      payment_method_id,
      amount,
      reference,
      notes,
      created_by
    )
    values (
      p_settlement_id,
      v_settlement.employee_id,
      v_method.id,
      v_amount,
      v_reference,
      nullif(btrim(coalesce(v_part ->> 'notes', '')), ''),
      v_actor
    )
    returning *
      into v_payment;
  end loop;

  for v_deduction in
    select *
    from public.employee_settlement_deductions
    where settlement_id = p_settlement_id
    order by id
  loop
    if exists (
      select 1
      from public.employee_debt_movements movement
      where movement.debt_id = v_deduction.employee_debt_id
        and movement.settlement_id = p_settlement_id
        and movement.movement_type = 'settlement_deduction'
    ) then
      continue;
    end if;

    select *
      into v_debt
    from public.employee_debts
    where id = v_deduction.employee_debt_id
    for update;

    if not found
       or v_debt.status not in ('pending', 'partial')
       or round(v_debt.outstanding_amount, 2) < round(v_deduction.amount, 2) then
      raise exception 'La deuda reservada ya no tiene saldo suficiente para esta liquidación.';
    end if;

    v_new_outstanding := round(v_debt.outstanding_amount - v_deduction.amount, 2);

    update public.employee_debts
    set
      outstanding_amount = v_new_outstanding,
      status = case when v_new_outstanding = 0 then 'paid' else 'partial' end,
      settled_at = case when v_new_outstanding = 0 then now() else null end
    where id = v_debt.id;

    insert into public.employee_debt_movements(
      debt_id,
      movement_type,
      amount,
      settlement_id,
      notes,
      created_by
    )
    values (
      v_debt.id,
      'settlement_deduction',
      v_deduction.amount,
      p_settlement_id,
      'Descuento aplicado en liquidación ' || v_settlement.settlement_number || '.',
      v_actor
    );
  end loop;

  update public.employee_settlements
  set
    status = 'paid',
    payment_method_id = null,
    payment_reference = null,
    payment_evidence_path = null,
    cash_movement_id = null,
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
    paid_by = v_actor,
    paid_at = now()
  where id = p_settlement_id
  returning *
    into v_settlement;

  return v_settlement;
end;
$function$;

revoke execute on function public.pay_employee_settlement_v194(uuid, jsonb, text) from public, anon;
grant execute on function public.pay_employee_settlement_v194(uuid, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
