-- Estado auditable de entregas de insumos cuyo cobro/deuda quedó sin efecto.
-- Ejecutar después de 162_employee_debt_waiver_rpc.sql.
-- Una entrega no se considera devuelta al inventario por dejar su deuda sin
-- efecto: conserva el estado "waived" para distinguirla de una reversión real.

alter table public.employee_supply_delivery_batches
  add column if not exists status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists status_updated_by uuid references public.employees(id) on delete set null;

alter table public.employee_supply_delivery_batches
  drop constraint if exists employee_supply_delivery_batches_status_check;
alter table public.employee_supply_delivery_batches
  add constraint employee_supply_delivery_batches_status_check
  check (status in ('active', 'waived', 'cancelled'));

-- Alinea lotes históricos con deudas que ya fueron dejadas sin efecto.
update public.employee_supply_delivery_batches batch
set status = 'waived',
    status_reason = coalesce(debt.written_off_reason, 'Deuda dejada sin efecto.'),
    status_updated_at = coalesce(debt.written_off_at, debt.settled_at, now()),
    status_updated_by = debt.written_off_by
from public.employee_debts debt
where debt.id = batch.employee_debt_id
  and debt.status = 'written_off'
  and batch.status = 'active';

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
      written_off_at = now(),
      written_off_by = v_actor_id,
      written_off_reason = v_reason
  where id = v_debt.id
  returning * into v_debt;

  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'write_off', v_waived_amount, 'Deuda dejada sin efecto: ' || v_reason, v_actor_id);

  update public.employee_supply_delivery_batches
  set status = 'waived',
      status_reason = v_reason,
      status_updated_at = now(),
      status_updated_by = v_actor_id
  where employee_debt_id = v_debt.id
    and status = 'active';

  return v_debt;
end;
$$;

revoke all on function public.waive_employee_debt(uuid, text) from public, anon;
grant execute on function public.waive_employee_debt(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
