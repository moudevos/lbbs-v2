-- El checkout completa una venta mientras la sesión POS sigue abierta. La
-- producción se difiere hasta el cierre auditado de la sesión (o hasta la
-- regeneración del período); de lo contrario, el guard de sesión cerrada
-- bloquearía una venta válida antes de terminar.

create or replace function public.sales_production_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and new.status is distinct from old.status then
    perform public.generate_employee_production_for_sale(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists sales_production_sync on public.sales;
create trigger sales_production_sync
after update of status on public.sales
for each row execute function public.sales_production_sync_trigger();

revoke all on function public.sales_production_sync_trigger() from public;

notify pgrst, 'reload schema';
