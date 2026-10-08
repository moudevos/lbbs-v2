-- Blindaje de unicidad de liquidaciones.
--
-- Regla canónica:
-- - Para un mismo employee_id + payroll_period_id solo puede existir UNA
--   liquidación cuyo estado no sea cancelled.
-- - cancelled conserva el historial y libera el par para crear un reemplazo.
-- - paid ocupa el período definitivamente y no puede convivir con un nuevo
--   draft/review/approved/paid del mismo empleado y período.
--
-- No modifica liquidaciones históricas ni fórmulas de cálculo.

do $$
begin
  if exists (
    select 1
    from public.employee_settlements
    where status <> 'cancelled'
    group by employee_id, payroll_period_id
    having count(*) > 1
  ) then
    raise exception
      'No se puede reforzar la unicidad: existen liquidaciones no canceladas duplicadas para un mismo empleado y período.';
  end if;
end
$$;

-- Crear primero el índice nuevo. Si apareciera una carrera o un dato inválido,
-- la migración falla aquí sin retirar la protección anterior.
create unique index if not exists employee_settlements_one_non_cancelled_employee_period
  on public.employee_settlements(employee_id, payroll_period_id)
  where status <> 'cancelled';

-- El índice anterior no incluía paid, por lo que una liquidación pagada podía
-- quedar fuera del candado de unicidad.
drop index if exists public.employee_settlements_one_active_employee_period;

comment on index public.employee_settlements_one_non_cancelled_employee_period is
  'Solo una liquidación no cancelada por empleado y período; cancelled permite reemplazo histórico.';
