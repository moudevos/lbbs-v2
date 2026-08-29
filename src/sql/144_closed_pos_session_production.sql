-- La producción y los bonos se hacen liquidables únicamente después del
-- cierre auditado de su sesión POS. Evita incluir ventas que todavía pueden
-- cambiar o anularse durante una sesión abierta.

create or replace function public.guard_closed_pos_session_production()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('active', 'pending_review') and not exists (
    select 1
    from public.sales sale
    join public.pos_sessions session on session.id = sale.pos_session_id
    where sale.id = new.sale_id
      and sale.status = 'completed'
      and session.status = 'closed'
  ) then
    raise exception 'La producción solo puede registrarse cuando la sesión POS de la venta esté cerrada.';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_service_production_closed_session_guard on public.employee_service_production;
create trigger employee_service_production_closed_session_guard
before insert or update of sale_id, status on public.employee_service_production
for each row execute function public.guard_closed_pos_session_production();

drop trigger if exists employee_product_bonus_closed_session_guard on public.employee_product_bonus_entries;
create trigger employee_product_bonus_closed_session_guard
before insert or update of sale_id, status on public.employee_product_bonus_entries
for each row execute function public.guard_closed_pos_session_production();

-- Reversa solo registros heredados que aún no pertenecen a una liquidación
-- activa. Al cerrar la sesión, una regeneración los vuelve a crear.
update public.employee_service_production production
set status = 'reversed',
    reversed_at = now(),
    reversed_reason = 'La sesión POS aún no está cerrada.',
    updated_at = now()
from public.sales sale
join public.pos_sessions session on session.id = sale.pos_session_id
where production.sale_id = sale.id
  and production.status = 'active'
  and session.status <> 'closed'
  and not exists (
    select 1
    from public.employee_settlement_service_lines line
    join public.employee_settlements settlement on settlement.id = line.settlement_id
    where line.production_entry_id = production.id
      and settlement.status <> 'cancelled'
  );

update public.employee_product_bonus_entries bonus
set status = 'reversed',
    reversed_at = now(),
    reversed_reason = 'La sesión POS aún no está cerrada.'
from public.sales sale
join public.pos_sessions session on session.id = sale.pos_session_id
where bonus.sale_id = sale.id
  and bonus.status in ('active', 'pending_review')
  and session.status <> 'closed'
  and not exists (
    select 1
    from public.employee_settlement_bonus_lines line
    join public.employee_settlements settlement on settlement.id = line.settlement_id
    where line.product_bonus_entry_id = bonus.id
      and settlement.status <> 'cancelled'
  );

create or replace function public.generate_production_for_period(p_period_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_sale record;
  v_result jsonb;
  v_sales integer := 0; v_services integer := 0; v_bonuses integer := 0; v_reversals integer := 0;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden generar producción.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id;
  if not found then raise exception 'El periodo no existe.'; end if;
  if v_period.status in ('closed','cancelled') then raise exception 'El periodo está cerrado y no admite regeneración.'; end if;

  for v_sale in
    select sale.id
    from public.sales sale
    join public.pos_sessions session on session.id = sale.pos_session_id
    where sale.accounting_date between v_period.start_date and v_period.end_date
      and (p_branch_id is null or sale.branch_id = p_branch_id)
      and (
        sale.status = 'cancelled'
        or (sale.status = 'completed' and session.status = 'closed')
      )
  loop
    v_result := public.generate_employee_production_for_sale(v_sale.id);
    v_sales := v_sales + 1;
    v_services := v_services + coalesce((v_result ->> 'services_generated')::integer, 0);
    v_bonuses := v_bonuses + coalesce((v_result ->> 'bonuses_generated')::integer, 0);
    v_reversals := v_reversals + coalesce((v_result ->> 'reversed')::integer, 0);
  end loop;
  return jsonb_build_object('sales_reviewed',v_sales,'services_generated',v_services,'bonuses_generated',v_bonuses,'reversed',v_reversals,'errors',0);
end;
$$;

revoke all on function public.guard_closed_pos_session_production() from public;
revoke all on function public.generate_production_for_period(uuid, uuid) from public;
grant execute on function public.generate_production_for_period(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
