-- A completed POS sale can only be cancelled while its session is open.
-- Production is not allowed for an open POS session, therefore cancellation
-- must never call the generator (which can attempt an active upsert). It only
-- reverses any residual production/bonus rows that may exist from a legacy
-- state or a previously closed/reopened operational flow.
create or replace function public.sales_production_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and new.status is distinct from old.status then
    update public.employee_service_production
    set status = 'reversed',
        reversed_at = now(),
        reversed_reason = 'Venta anulada.',
        updated_at = now()
    where sale_id = new.id
      and status <> 'reversed';

    update public.employee_product_bonus_entries
    set status = 'reversed',
        reversed_at = now(),
        reversed_reason = 'Venta anulada.'
    where sale_id = new.id
      and status <> 'reversed';
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
