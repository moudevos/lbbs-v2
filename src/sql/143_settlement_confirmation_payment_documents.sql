-- Flujo final de liquidaciones: borrador -> confirmada -> aprobada -> pagada.
-- Ejecutar despues de 142_courtesy_empty_unit_cap_as_null.sql.
-- El pago se registra en el libro financiero con la fecha operativa de Lima;
-- no depende de una sesion POS, incluso cuando el metodo es efectivo.

alter table public.employee_settlement_service_lines
  add column if not exists original_line_total_snapshot numeric(12,2) not null default 0,
  add column if not exists operational_contribution_snapshot numeric(12,2) not null default 0;

update public.employee_settlement_service_lines line
set original_line_total_snapshot = production.original_line_total,
    operational_contribution_snapshot = production.operational_contribution_amount
from public.employee_service_production production
where production.id = line.production_entry_id
  and (line.original_line_total_snapshot = 0 or line.operational_contribution_snapshot = 0);

create or replace function public.set_settlement_service_financial_snapshots()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select original_line_total, operational_contribution_amount
  into new.original_line_total_snapshot, new.operational_contribution_snapshot
  from public.employee_service_production
  where id = new.production_entry_id;

  if new.original_line_total_snapshot is null then
    raise exception 'La linea de liquidacion requiere una produccion valida.';
  end if;
  return new;
end;
$$;

drop trigger if exists settlement_service_financial_snapshot_guard on public.employee_settlement_service_lines;
create trigger settlement_service_financial_snapshot_guard
before insert or update of production_entry_id
on public.employee_settlement_service_lines
for each row execute function public.set_settlement_service_financial_snapshots();

create or replace function public.transition_employee_settlement(
  p_settlement_id uuid,
  p_action text,
  p_reason text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_employee uuid := public.current_employee_id();
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden gestionar liquidaciones.';
  end if;

  select * into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception 'La liquidacion no existe.';
  end if;

  -- Se conserva "review" como estado interno por compatibilidad, pero la
  -- accion y la interfaz lo presentan como Confirmada.
  if p_action in ('confirm', 'review') and v_row.status = 'draft' then
    update public.employee_settlements
    set status = 'review', reviewed_by = v_employee, reviewed_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60
      and nullif(btrim(coalesce(v_row.high_rate_authorization_note, '')), '') is null then
      raise exception 'La autorizacion del porcentaje excepcional esta incompleta.';
    end if;

    update public.employee_settlements
    set status = 'approved', approved_by = v_employee, approved_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft', 'review', 'approved') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'El motivo de anulacion es obligatorio.';
    end if;

    update public.employee_settlements
    set status = 'cancelled',
        cancelled_by = v_employee,
        cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status = 'paid' then
    raise exception 'Una liquidacion pagada no puede anularse. Registra una reversa financiera autorizada.';
  else
    raise exception 'La transicion solicitada no esta permitida.';
  end if;

  return v_row;
end;
$$;

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
  v_employee uuid := public.current_employee_id();
  v_deduction record;
  v_finance_category_id uuid;
  v_business_date date := public.pos_business_date();
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select * into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_row.status <> 'approved' then
    raise exception 'La liquidacion debe estar aprobada antes de pagar.';
  end if;

  if round(coalesce(p_amount, 0), 2) <> round(v_row.net_pay_amount, 2) then
    raise exception 'El monto debe coincidir con el neto de la liquidacion.';
  end if;

  select * into v_method
  from public.payment_methods
  where id = p_payment_method_id
    and is_active;

  if not found or v_method.payment_kind = 'internal_credit' then
    raise exception 'El metodo de pago no esta disponible para liquidaciones.';
  end if;

  select id into v_finance_category_id
  from public.finance_categories
  where code = 'employee_settlement_payment'
    and is_active
  limit 1;

  if v_finance_category_id is null then
    raise exception 'No existe una categoria financiera activa para el pago de liquidacion.';
  end if;

  -- El efectivo puede salir de caja fisica, pero no se fuerza a enlazar una
  -- sesion POS. El egreso queda siempre conciliable en finanzas por fecha.
  insert into public.finance_manual_entries (
    branch_id, entry_date, direction, category_id, amount, payment_method_id,
    description, reference, evidence_url, status, created_by, source_type, source_id
  ) values (
    v_row.branch_id, v_business_date, 'expense', v_finance_category_id,
    v_row.net_pay_amount, v_method.id,
    'Pago de liquidacion ' || v_row.settlement_number,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_evidence_path, '')), ''),
    'active', v_employee, 'employee_settlement', v_row.id
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
      debt_id, movement_type, amount, settlement_id, notes, created_by
    ) values (
      v_deduction.employee_debt_id, 'settlement_deduction', v_deduction.amount,
      p_settlement_id, 'Descuento aplicado en liquidacion.', v_employee
    );
  end loop;

  update public.employee_settlements
  set status = 'paid',
      payment_method_id = p_payment_method_id,
      payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
      payment_evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
      cash_movement_id = null,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      paid_by = v_employee,
      paid_at = now()
  where id = p_settlement_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.transition_employee_settlement(uuid, text, text) from public;
grant execute on function public.transition_employee_settlement(uuid, text, text) to authenticated, service_role;
revoke all on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) from public;
grant execute on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) to authenticated, service_role;
revoke all on function public.set_settlement_service_financial_snapshots() from public;

notify pgrst, 'reload schema';
