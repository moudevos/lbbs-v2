-- Iteracion 11: evita que un pago de liquidacion en efectivo deje una sesion POS con saldo negativo.
-- Ejecutar despues de 114_iteration_11_settlement_review_runtime.sql.

insert into public.cash_movement_categories (
  code,
  name,
  description,
  movement_direction,
  sort_order,
  is_active
)
values (
  'employee_settlement_payment',
  'Pago de liquidacion',
  'Salida de efectivo por liquidacion de empleado.',
  'expense',
  50,
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_reference text default null,
  p_evidence_path text default null,
  p_notes text default null,
  p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_employee uuid := public.current_employee_id();
  v_deduction record;
  v_cash_id uuid;
  v_category_id uuid;
  v_available_cash numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select *
  into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_row.status <> 'approved' then
    raise exception 'La liquidacion debe estar aprobada antes de pagar.';
  end if;

  if round(coalesce(p_amount, 0), 2) <> round(v_row.net_pay_amount, 2) then
    raise exception 'El monto debe coincidir con el neto de la liquidacion.';
  end if;

  select *
  into v_method
  from public.payment_methods
  where id = p_payment_method_id
    and is_active;

  if not found then
    raise exception 'El metodo de pago no esta disponible.';
  end if;

  if v_method.counts_as_cash then
    select *
    into v_session
    from public.pos_sessions
    where id = p_pos_session_id
      and branch_id = v_row.branch_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'No existe una sesion POS activa para registrar el pago en efectivo.';
    end if;

    perform public.sync_pos_session_totals(v_session.id);

    select expected_cash_amount
    into v_available_cash
    from public.pos_sessions
    where id = v_session.id;

    if coalesce(v_available_cash, 0) < v_row.net_pay_amount then
      raise exception 'El efectivo disponible en la sesion no cubre esta liquidacion.';
    end if;

    select id
    into v_category_id
    from public.cash_movement_categories
    where code = 'employee_settlement_payment'
      and is_active
    limit 1;

    if v_category_id is null then
      raise exception 'No existe una categoria activa para el pago de liquidacion.';
    end if;

    insert into public.cash_movements (
      pos_session_id,
      branch_id,
      category_id,
      movement_type,
      amount,
      description,
      status,
      created_by
    ) values (
      v_session.id,
      v_row.branch_id,
      v_category_id,
      'expense',
      v_row.net_pay_amount,
      'Pago de liquidacion ' || v_row.settlement_number,
      'active',
      v_employee
    ) returning id into v_cash_id;

    perform public.sync_pos_session_totals(v_session.id);
  end if;

  for v_deduction in
    select * from public.employee_settlement_deductions where settlement_id = p_settlement_id
  loop
    update public.employee_debts
    set outstanding_amount = v_deduction.balance_after,
        status = case when v_deduction.balance_after = 0 then 'paid' else 'partial' end,
        settled_at = case when v_deduction.balance_after = 0 then now() else null end
    where id = v_deduction.employee_debt_id;

    insert into public.employee_debt_movements (
      debt_id,
      movement_type,
      amount,
      settlement_id,
      notes,
      created_by
    ) values (
      v_deduction.employee_debt_id,
      'settlement_deduction',
      v_deduction.amount,
      p_settlement_id,
      'Descuento aplicado en liquidacion.',
      v_employee
    );
  end loop;

  update public.employee_settlements
  set status = 'paid',
      payment_method_id = p_payment_method_id,
      payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
      payment_evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
      cash_movement_id = v_cash_id,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      paid_by = v_employee,
      paid_at = now()
  where id = p_settlement_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) from public;
grant execute on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion posterior: la categoria debe existir y la funcion debe conservar la firma exacta.
select
  (select count(*) from public.cash_movement_categories where code = 'employee_settlement_payment' and is_active) as active_category_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid::regprocedure::text = 'pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid)') as function_signature_count;
