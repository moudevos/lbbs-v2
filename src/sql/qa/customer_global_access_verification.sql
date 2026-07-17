-- Verificacion de la regla definitiva: los clientes activos son globales.
-- Ejecutar como consulta de diagnostico; no modifica datos.

select
  policyname,
  permissive,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'customers'
order by cmd, policyname;

select
  has_table_privilege('authenticated', 'public.customers', 'SELECT') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.customers', 'DELETE') as authenticated_has_delete_grant,
  has_table_privilege('anon', 'public.customers', 'SELECT') as anon_can_select;

select
  count(*) filter (where is_active) as active_customers,
  count(*) filter (where not is_active) as inactive_customers
from public.customers;
