-- Iteracion 11: vincula el egreso financiero canonico con la liquidacion pagada.
-- Ejecutar despues de 115_settlement_cash_availability.sql.

alter table public.finance_manual_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create index if not exists finance_manual_entries_source_idx
  on public.finance_manual_entries (source_type, source_id)
  where source_type is not null and source_id is not null;

create unique index if not exists finance_manual_entries_active_settlement_source_uidx
  on public.finance_manual_entries (source_type, source_id)
  where source_type = 'employee_settlement'
    and source_id is not null
    and status = 'active';

insert into public.finance_categories (
  code,
  name,
  direction,
  is_active,
  sort_order
)
values (
  'employee_settlement_payment',
  'Pago de liquidacion',
  'expense',
  true,
  50
)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

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
  v_cash_category_id uuid;
  v_finance_category_id uuid;
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
    into v_cash_category_id
    from public.cash_movement_categories
    where code = 'employee_settlement_payment'
      and is_active
    limit 1;

    if v_cash_category_id is null then
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
      v_cash_category_id,
      'expense',
      v_row.net_pay_amount,
      'Pago de liquidacion ' || v_row.settlement_number,
      'active',
      v_employee
    ) returning id into v_cash_id;

    perform public.sync_pos_session_totals(v_session.id);
  end if;

  select id
  into v_finance_category_id
  from public.finance_categories
  where code = 'employee_settlement_payment'
    and is_active
  limit 1;

  if v_finance_category_id is null then
    raise exception 'No existe una categoria financiera activa para el pago de liquidacion.';
  end if;

  insert into public.finance_manual_entries (
    branch_id,
    direction,
    category_id,
    amount,
    payment_method_id,
    description,
    reference,
    status,
    created_by,
    source_type,
    source_id
  ) values (
    v_row.branch_id,
    'expense',
    v_finance_category_id,
    v_row.net_pay_amount,
    v_method.id,
    'Pago de liquidacion ' || v_row.settlement_number,
    nullif(btrim(coalesce(p_reference, '')), ''),
    'active',
    v_employee,
    'employee_settlement',
    v_row.id
  );

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

-- Verificacion posterior: categoria y enlace unico para liquidaciones activas.
select
  (select count(*) from public.finance_categories where code = 'employee_settlement_payment' and is_active) as active_finance_category_count,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'finance_manual_entries_active_settlement_source_uidx') as active_source_index_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid::regprocedure::text = 'pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid)') as function_signature_count;
