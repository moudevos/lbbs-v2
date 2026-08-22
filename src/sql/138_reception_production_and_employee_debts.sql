-- Recepción: consulta de producción de su sede y alta de deudas manuales.
-- No concede generación, liquidación, cobro, edición ni anulación.

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
  if v_creator is null then
    raise exception 'No se pudo identificar al usuario que registra la deuda.';
  end if;

  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'supply', 'other') then
    raise exception 'El tipo de deuda no se puede registrar manualmente.';
  end if;

  if not (
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(p_branch_id)
    )
  ) then
    raise exception 'No tienes permisos para registrar esta deuda.';
  end if;

  if coalesce(p_amount, 0) <= 0
    or nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Monto y descripción son obligatorios.';
  end if;

  select branch_id into v_employee_branch_id
  from public.employees
  where id = p_employee_id
    and status = 'active';

  if not found or v_employee_branch_id <> p_branch_id then
    raise exception 'El empleado debe estar activo y pertenecer a la sede de la deuda.';
  end if;

  insert into public.employee_debts (
    employee_id, branch_id, debt_type, original_amount, outstanding_amount,
    description, created_by
  ) values (
    p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), round(p_amount, 2),
    btrim(p_description), v_creator
  ) returning * into v_debt;

  insert into public.employee_debt_movements (
    debt_id, movement_type, amount, notes, created_by
  ) values (
    v_debt.id, 'charge', v_debt.original_amount, 'Registro inicial de deuda.', v_creator
  );

  return v_debt;
end;
$$;

drop policy if exists "payroll_periods_reception_read" on public.payroll_periods;
create policy "payroll_periods_reception_read"
on public.payroll_periods for select to authenticated
using (public.current_user_role() = 'reception');

drop policy if exists "employee_service_production_reception_scope" on public.employee_service_production;
create policy "employee_service_production_reception_scope"
on public.employee_service_production for select to authenticated
using (public.current_user_role() = 'reception' and public.can_access_branch(branch_id));

drop policy if exists "employee_product_bonus_entries_reception_scope" on public.employee_product_bonus_entries;
create policy "employee_product_bonus_entries_reception_scope"
on public.employee_product_bonus_entries for select to authenticated
using (public.current_user_role() = 'reception' and public.can_access_branch(branch_id));

drop policy if exists "employee_debts_reception_scope" on public.employee_debts;
create policy "employee_debts_reception_scope"
on public.employee_debts for select to authenticated
using (public.current_user_role() = 'reception' and public.can_access_branch(branch_id));

drop policy if exists "employee_debt_movements_reception_scope" on public.employee_debt_movements;
create policy "employee_debt_movements_reception_scope"
on public.employee_debt_movements for select to authenticated
using (
  public.current_user_role() = 'reception'
  and exists (
    select 1
    from public.employee_debts debt
    where debt.id = employee_debt_movements.debt_id
      and public.can_access_branch(debt.branch_id)
  )
);

drop policy if exists "employee_settlements_reception_scope" on public.employee_settlements;
create policy "employee_settlements_reception_scope"
on public.employee_settlements for select to authenticated
using (public.current_user_role() = 'reception' and public.can_access_branch(branch_id));

notify pgrst, 'reload schema';
