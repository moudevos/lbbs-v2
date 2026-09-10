-- Repara la RPC usada para dejar una deuda de empleado sin efecto.
-- Ejecutar después de 161_product_visibility_scope.sql.
--
-- Esta operación conserva la auditoría financiera: no borra la deuda ni sus
-- movimientos previos. Registra el saldo pendiente como write_off y la marca
-- como written_off. No revierte físicamente una entrega de inventario.

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
  v_actor_id uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_waived_amount numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden dejar sin efecto una deuda.';
  end if;
  if v_reason is null then
    raise exception 'El motivo para dejar sin efecto la deuda es obligatorio.';
  end if;

  select *
  into v_debt
  from public.employee_debts
  where id = p_debt_id
  for update;

  if not found then
    raise exception 'La deuda no existe.';
  end if;
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
      written_off_at = now(),
      written_off_by = v_actor_id,
      written_off_reason = v_reason
  where id = v_debt.id
  returning * into v_debt;

  insert into public.employee_debt_movements (
    debt_id, movement_type, amount, notes, created_by
  ) values (
    v_debt.id,
    'write_off',
    v_waived_amount,
    'Deuda dejada sin efecto: ' || v_reason,
    v_actor_id
  );

  return v_debt;
end;
$$;

revoke all on function public.waive_employee_debt(uuid, text) from public, anon;
grant execute on function public.waive_employee_debt(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
