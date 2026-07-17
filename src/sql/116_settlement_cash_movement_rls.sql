-- Iteracion 11: oculta de recepcion los egresos sensibles de liquidaciones.
-- Ejecutar despues de 115_settlement_cash_availability.sql.

drop policy if exists "cash_movements_select_scope" on public.cash_movements;
drop policy if exists "cash_movements_update_scope" on public.cash_movements;

create policy "cash_movements_select_scope"
on public.cash_movements
for select
to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
);

create policy "cash_movements_update_scope"
on public.cash_movements
for update
to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
);

notify pgrst, 'reload schema';

-- Verificacion posterior: las dos politicas existen y mantienen el alcance autenticado.
select
  count(*) filter (where policyname = 'cash_movements_select_scope' and roles = '{authenticated}') as select_policy_count,
  count(*) filter (where policyname = 'cash_movements_update_scope' and roles = '{authenticated}') as update_policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'cash_movements';
