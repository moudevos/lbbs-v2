begin;

-- ============================================================
-- SQL 113
-- Restaura el alcance global de clientes activos para reception.
--
-- Regla del negocio:
-- - owner/admin: acceso administrativo global.
-- - reception activa: lectura y actualización operativa global.
-- - barber/viewer: sin acceso al panel.
-- - anon: sin acceso.
-- - las entidades transaccionales continúan limitadas por sede.
-- ============================================================

alter table public.customers enable row level security;

-- ------------------------------------------------------------
-- Centraliza el contrato global de lectura.
-- SECURITY DEFINER se utiliza únicamente para devolver un booleano.
-- ------------------------------------------------------------

create or replace function public.can_access_customer(
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and exists (
        select 1
        from public.employees employee
        where employee.id = public.current_employee_id()
          and employee.status = 'active'::public.employee_status
      )
      and exists (
        select 1
        from public.customers customer
        where customer.id = p_customer_id
          and customer.is_active = true
      )
    )
$$;

revoke all
on function public.can_access_customer(uuid)
from public;

grant execute
on function public.can_access_customer(uuid)
to authenticated, service_role;

-- ------------------------------------------------------------
-- Rebaseline controlado de policies de customers.
-- Se eliminan las policies residuales que pudieran conservar
-- restricciones por sede.
-- ------------------------------------------------------------

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
  loop
    execute format(
      'drop policy if exists %I on public.customers',
      policy_record.policyname
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- SELECT
-- Owner/admin: global.
-- Reception activa: clientes activos globales.
-- ------------------------------------------------------------

create policy "customers_select_team"
on public.customers
as permissive
for select
to authenticated
using (
  public.can_access_customer(id)
);

-- ------------------------------------------------------------
-- INSERT
-- Reception solo registra clientes como el empleado autenticado.
-- No puede crear clientes internos con source = system.
-- ------------------------------------------------------------

create policy "customers_insert_team"
on public.customers
as permissive
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and exists (
      select 1
      from public.employees employee
      where employee.id = public.current_employee_id()
        and employee.status = 'active'::public.employee_status
    )
    and created_by = public.current_employee_id()
    and is_active = true
    and coalesce(source, '') <> 'system'
  )
);

-- ------------------------------------------------------------
-- UPDATE
-- Reception activa puede actualizar clientes activos globales.
-- No puede convertirlos en clientes system ni reactivar/inactivar
-- registros mediante acceso directo.
-- ------------------------------------------------------------

create policy "customers_update_team"
on public.customers
as permissive
for update
to authenticated
using (
  public.can_access_customer(id)
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_customer(id)
    and is_active = true
    and coalesce(source, '') <> 'system'
  )
);

-- ------------------------------------------------------------
-- DELETE
-- Exclusivo para owner/admin.
-- ------------------------------------------------------------

create policy "customers_delete_admin"
on public.customers
as permissive
for delete
to authenticated
using (
  public.is_admin()
);

-- Los grants habilitan operaciones de tabla.
-- RLS decide qué filas puede operar cada sesión.

grant select, insert, update, delete
on table public.customers
to authenticated;

revoke all
on table public.customers
from anon;

notify pgrst, 'reload schema';

commit;
