-- Cierre operativo, penalidades y descuento obligatorio basado en ventas de
-- servicios cobrados a nombre del barbero. Ejecutar después de 153.

alter table public.employee_settlements
  add column if not exists mandatory_discount_base_amount numeric(12,2) not null default 0;

alter table public.employee_debts
  drop constraint if exists employee_debts_debt_type_check;
alter table public.employee_debts
  add constraint employee_debts_debt_type_check
  check (debt_type in ('loan', 'advance', 'supply', 'internal_credit', 'penalty', 'other'));

create or replace function public.apply_settlement_mandatory_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.mandatory_discount_rate := greatest(coalesce(new.mandatory_discount_rate, 1), 0);

  -- Solo servicios realmente cobrados, atribuidos al empleado y procedentes
  -- de una sesión POS cerrada. No incluye productos, bonos, aportes, deudas
  -- ni servicios sin cobro.
  select coalesce(round(sum(production.collected_amount), 2), 0)
  into new.mandatory_discount_base_amount
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = new.payroll_period_id
    and production.employee_id = new.employee_id
    and production.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  new.net_before_mandatory_discount := greatest(
    round(coalesce(new.gross_pay_amount, 0) - coalesce(new.debt_deduction_total, 0), 2),
    0
  );
  new.mandatory_discount_amount := round(
    new.mandatory_discount_base_amount * new.mandatory_discount_rate / 100,
    2
  );
  new.net_pay_amount := greatest(
    new.net_before_mandatory_discount - new.mandatory_discount_amount,
    0
  );
  return new;
end;
$$;

drop trigger if exists employee_settlements_mandatory_discount on public.employee_settlements;
create trigger employee_settlements_mandatory_discount
before insert or update of payroll_period_id, employee_id, gross_pay_amount, debt_deduction_total, mandatory_discount_rate
on public.employee_settlements
for each row execute function public.apply_settlement_mandatory_discount();

create or replace function public.review_employee_settlement(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_adjustment jsonb;
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_bonus numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_before numeric(12,2);
  v_mandatory_base numeric(12,2);
  v_mandatory numeric(12,2);
  v_employee uuid := public.current_employee_id();
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Solo owner o admin pueden revisar liquidaciones.';
  end if;

  select * into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidacion en borrador puede revisarse.';
  end if;

  delete from public.employee_settlement_adjustments where settlement_id = p_settlement_id;
  for v_adjustment in select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) loop
    v_type := v_adjustment ->> 'adjustment_type';
    v_description := nullif(btrim(coalesce(v_adjustment ->> 'description', '')), '');
    v_amount := round(coalesce((v_adjustment ->> 'amount')::numeric, 0), 2);
    if v_type not in ('bonus', 'deduction') or v_description is null or v_amount <= 0 then
      raise exception 'Cada ajuste necesita tipo, motivo y monto mayor a cero.';
    end if;
    insert into public.employee_settlement_adjustments (settlement_id, adjustment_type, description, amount, created_by)
    values (p_settlement_id, v_type, v_description, v_amount, v_employee);
    if v_type = 'bonus' then v_bonus := v_bonus + v_amount; else v_deduction := v_deduction + v_amount; end if;
  end loop;

  select coalesce(round(sum(production.collected_amount), 2), 0)
  into v_mandatory_base
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = v_settlement.payroll_period_id
    and production.employee_id = v_settlement.employee_id
    and production.status = 'active'
    and sale.status = 'completed'
    and session.status = 'closed';

  v_before := greatest(v_settlement.gross_pay_amount + v_bonus - v_settlement.debt_deduction_total - v_deduction, 0);
  v_mandatory := round(v_mandatory_base * coalesce(v_settlement.mandatory_discount_rate, 1) / 100, 2);
  update public.employee_settlements
  set manual_bonus_total = v_bonus,
      other_deduction_total = v_deduction,
      mandatory_discount_base_amount = v_mandatory_base,
      net_before_mandatory_discount = v_before,
      mandatory_discount_amount = v_mandatory,
      net_pay_amount = greatest(v_before - v_mandatory, 0),
      status = 'review',
      reviewed_by = v_employee,
      reviewed_at = now()
  where id = p_settlement_id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.create_employee_debt(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_amount numeric,
  p_description text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_creator uuid := public.current_employee_id();
  v_employee_branch_id uuid;
begin
  if v_creator is null then raise exception 'No se pudo identificar al usuario que registra la deuda.'; end if;
  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'supply', 'penalty', 'other') then raise exception 'El tipo de deuda no se puede registrar manualmente.'; end if;
  if p_debt_type = 'penalty' and not public.is_admin() then raise exception 'Solo owner o admin pueden registrar penalidades.'; end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda.'; end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'Monto y descripcion son obligatorios.'; end if;

  select branch_id into v_employee_branch_id from public.employees where id = p_employee_id and status = 'active';
  if not found or v_employee_branch_id <> p_branch_id then raise exception 'El empleado debe estar activo y pertenecer a la sede de la deuda.'; end if;

  insert into public.employee_debts (employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by)
  values (p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), round(p_amount, 2), btrim(p_description), v_creator)
  returning * into v_debt;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'charge', v_debt.original_amount, 'Registro inicial de deuda.', v_creator);
  return v_debt;
end;
$$;

create or replace function public.waive_employee_debt(
  p_debt_id uuid,
  p_reason text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_employee uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_waived_amount numeric(12,2);
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden dejar sin efecto una deuda.'; end if;
  if v_reason is null then raise exception 'El motivo para dejar sin efecto la deuda es obligatorio.'; end if;

  select * into v_debt from public.employee_debts where id = p_debt_id for update;
  if not found then raise exception 'La deuda no existe.'; end if;
  if v_debt.status not in ('pending', 'partial') or v_debt.outstanding_amount <= 0 then raise exception 'Solo se pueden dejar sin efecto deudas pendientes.'; end if;
  if exists (
    select 1 from public.employee_settlement_deductions deduction
    join public.employee_settlements settlement on settlement.id = deduction.settlement_id
    where deduction.employee_debt_id = v_debt.id
      and settlement.status in ('draft', 'review', 'approved')
  ) then
    raise exception 'La deuda ya está incluida en una liquidacion activa. Anula la liquidacion antes de dejarla sin efecto.';
  end if;

  v_waived_amount := v_debt.outstanding_amount;

  update public.employee_debts
  set outstanding_amount = 0,
      status = 'written_off',
      settled_at = now(),
      written_off_by = v_employee,
      written_off_reason = v_reason
  where id = v_debt.id
  returning * into v_debt;

  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'write_off', v_debt.original_amount - greatest(v_debt.original_amount - 0, 0) + coalesce((select outstanding_amount from public.employee_debts where id = v_debt.id), 0), 'Deuda dejada sin efecto: ' || v_reason, v_employee);
  -- El movimiento conserva exactamente el saldo que fue anulado. La expresión
  -- anterior se reescribe abajo usando el valor bloqueado para evitar depender
  -- de datos posteriores.
  delete from public.employee_debt_movements
  where debt_id = v_debt.id
    and movement_type = 'write_off'
    and created_by = v_employee
    and notes = 'Deuda dejada sin efecto: ' || v_reason
    and created_at >= now() - interval '1 second';
  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'write_off', v_debt.original_amount - (v_debt.original_amount - v_debt.outstanding_amount), 'Deuda dejada sin efecto: ' || v_reason, v_employee);
  return v_debt;
end;
$$;

-- Reemplazo final: conserva el saldo pendiente antes de marcar la deuda como anulada.
create or replace function public.waive_employee_debt(
  p_debt_id uuid,
  p_reason text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_employee uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_waived_amount numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden dejar sin efecto una deuda.';
  end if;
  if v_reason is null then
    raise exception 'El motivo para dejar sin efecto la deuda es obligatorio.';
  end if;

  select * into v_debt
  from public.employee_debts
  where id = p_debt_id
  for update;
  if not found then raise exception 'La deuda no existe.'; end if;
  if v_debt.status not in ('pending', 'partial') or v_debt.outstanding_amount <= 0 then
    raise exception 'Solo se pueden dejar sin efecto deudas pendientes.';
  end if;
  if exists (
    select 1
    from public.employee_settlement_deductions deduction
    join public.employee_settlements settlement on settlement.id = deduction.settlement_id
    where deduction.employee_debt_id = v_debt.id
      and settlement.status in ('draft', 'review', 'approved')
  ) then
    raise exception 'La deuda ya está incluida en una liquidación activa. Anula la liquidación antes de dejarla sin efecto.';
  end if;

  v_waived_amount := v_debt.outstanding_amount;
  update public.employee_debts
  set outstanding_amount = 0,
      status = 'written_off',
      settled_at = now(),
      written_off_by = v_employee,
      written_off_reason = v_reason
  where id = v_debt.id
  returning * into v_debt;

  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'write_off', v_waived_amount, 'Deuda dejada sin efecto: ' || v_reason, v_employee);
  return v_debt;
end;
$$;

revoke all on function public.waive_employee_debt(uuid, text) from public, anon;
grant execute on function public.waive_employee_debt(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
