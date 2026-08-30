-- No bloquear el checkout: al completar una venta la sesión POS todavía está
-- abierta. La producción se difiere al generador del período, que solo toma
-- sesiones cerradas (144). Las anulaciones sí se sincronizan de inmediato.

create or replace function public.sales_production_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and new.status is distinct from old.status then
    perform public.generate_employee_production_for_sale(new.id);
  elsif new.status = 'completed'
    and new.status is distinct from old.status
    and exists (
      select 1 from public.pos_sessions session
      where session.id = new.pos_session_id
        and session.status = 'closed'
    ) then
    perform public.generate_employee_production_for_sale(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sales_production_sync_trigger() from public;

notify pgrst, 'reload schema';
