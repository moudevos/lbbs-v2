-- Fecha contable y consistencia de periodos.
-- Ejecutar despues de 131_employee_benefit_targets_and_owner_pin.sql.
--
-- Los timestamps conservan el instante real en UTC. La fecha contable de una
-- venta proviene de la jornada POS (America/Lima) y no de un cast UTC.

begin;

alter table public.sales
  add column if not exists accounting_date date;

update public.sales sale
set accounting_date = coalesce(
  session.business_date,
  timezone('America/Lima', coalesce(sale.closed_at, sale.created_at))::date
)
from public.pos_sessions session
where session.id = sale.pos_session_id
  and sale.accounting_date is null;

update public.sales
set accounting_date = timezone('America/Lima', coalesce(closed_at, created_at))::date
where accounting_date is null;

alter table public.sales
  alter column accounting_date set not null;

create index if not exists sales_accounting_date_branch_status_idx
  on public.sales (accounting_date, branch_id, status);

create or replace function public.set_sale_accounting_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
begin
  select * into v_session
  from public.pos_sessions
  where id = new.pos_session_id;

  if not found then
    raise exception 'La venta requiere una sesion POS valida.';
  end if;
  if v_session.branch_id <> new.branch_id then
    raise exception 'La venta y la sesion POS deben pertenecer a la misma sede.';
  end if;

  if tg_op = 'UPDATE' and (
    new.pos_session_id is distinct from old.pos_session_id
    or new.branch_id is distinct from old.branch_id
    or new.accounting_date is distinct from old.accounting_date
  ) then
    raise exception 'La jornada contable de una venta no se puede modificar directamente.';
  end if;

  new.accounting_date := v_session.business_date;
  return new;
end;
$$;

drop trigger if exists sales_accounting_date_guard on public.sales;
create trigger sales_accounting_date_guard
before insert or update of pos_session_id, branch_id, accounting_date
on public.sales
for each row execute function public.set_sale_accounting_date();

-- Los limites quincenales son deterministas. Un lookup nunca vuelve a escribir
-- las fechas de un periodo existente.
create or replace function public.get_or_create_payroll_period(p_date date)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := coalesce(p_date, public.pos_business_date());
  v_half integer := case when extract(day from v_date) <= 15 then 1 else 2 end;
  v_start date;
  v_end date;
  v_period public.payroll_periods%rowtype;
begin
  if public.current_user_role() not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para consultar periodos de produccion.';
  end if;

  v_start := make_date(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    case when v_half = 1 then 1 else 16 end
  );
  v_end := case
    when v_half = 1 then make_date(extract(year from v_date)::integer, extract(month from v_date)::integer, 15)
    else (date_trunc('month', v_date) + interval '1 month - 1 day')::date
  end;

  insert into public.payroll_periods (
    period_year, period_month, period_half, start_date, end_date, created_by
  ) values (
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    v_half,
    v_start,
    v_end,
    public.current_employee_id()
  )
  on conflict (period_year, period_month, period_half) do nothing;

  select * into strict v_period
  from public.payroll_periods
  where period_year = extract(year from v_date)::integer
    and period_month = extract(month from v_date)::integer
    and period_half = v_half;

  if v_period.start_date <> v_start or v_period.end_date <> v_end then
    raise exception 'El periodo % no tiene los limites quincenales esperados.', v_period.id;
  end if;

  return v_period;
end;
$$;

revoke all on function public.get_or_create_payroll_period(date) from public;
grant execute on function public.get_or_create_payroll_period(date) to authenticated, service_role;

-- Asegura que existan los periodos requeridos por el historico antes de reparar
-- snapshots derivados. No modifica periodos ya creados.
insert into public.payroll_periods (
  period_year, period_month, period_half, start_date, end_date, created_by
)
select distinct
  extract(year from sale.accounting_date)::integer,
  extract(month from sale.accounting_date)::integer,
  case when extract(day from sale.accounting_date) <= 15 then 1 else 2 end,
  make_date(
    extract(year from sale.accounting_date)::integer,
    extract(month from sale.accounting_date)::integer,
    case when extract(day from sale.accounting_date) <= 15 then 1 else 16 end
  ),
  case
    when extract(day from sale.accounting_date) <= 15 then
      make_date(extract(year from sale.accounting_date)::integer, extract(month from sale.accounting_date)::integer, 15)
    else (date_trunc('month', sale.accounting_date) + interval '1 month - 1 day')::date
  end,
  null::uuid
from public.sales sale
on conflict (period_year, period_month, period_half) do nothing;

alter table public.employee_service_production
  add column if not exists accounting_date date;
alter table public.employee_product_bonus_entries
  add column if not exists accounting_date date;

update public.employee_service_production production
set accounting_date = sale.accounting_date
from public.sales sale
where sale.id = production.sale_id
  and production.accounting_date is null;

update public.employee_product_bonus_entries bonus
set accounting_date = sale.accounting_date
from public.sales sale
where sale.id = bonus.sale_id
  and bonus.accounting_date is null;

-- Evita que el trigger de bonos replique cambios durante la reparacion masiva.
alter table public.employee_service_production disable trigger employee_service_bonus_sync;

update public.employee_service_production production
set payroll_period_id = period.id,
    accounting_date = sale.accounting_date,
    updated_at = now()
from public.sales sale
join public.payroll_periods period
  on sale.accounting_date between period.start_date and period.end_date
where sale.id = production.sale_id
  and (production.payroll_period_id <> period.id or production.accounting_date <> sale.accounting_date)
  and not exists (
    select 1
    from public.employee_settlement_service_lines line
    join public.employee_settlements settlement on settlement.id = line.settlement_id
    where line.production_entry_id = production.id
      and settlement.status <> 'cancelled'
  );

alter table public.employee_service_production enable trigger employee_service_bonus_sync;

update public.employee_product_bonus_entries bonus
set payroll_period_id = period.id,
    accounting_date = sale.accounting_date
from public.sales sale
join public.payroll_periods period
  on sale.accounting_date between period.start_date and period.end_date
where sale.id = bonus.sale_id
  and (bonus.payroll_period_id <> period.id or bonus.accounting_date <> sale.accounting_date)
  and not exists (
    select 1
    from public.employee_settlement_bonus_lines line
    join public.employee_settlements settlement on settlement.id = line.settlement_id
    where line.product_bonus_entry_id = bonus.id
      and settlement.status <> 'cancelled'
  );

alter table public.employee_service_production
  alter column accounting_date set not null;
alter table public.employee_product_bonus_entries
  alter column accounting_date set not null;

alter table public.employee_settlement_service_lines
  add column if not exists accounting_date_snapshot date;

update public.employee_settlement_service_lines line
set accounting_date_snapshot = production.accounting_date
from public.employee_service_production production
where production.id = line.production_entry_id
  and line.accounting_date_snapshot is null;

alter table public.employee_settlement_service_lines
  alter column accounting_date_snapshot set not null;

create or replace function public.set_settlement_service_accounting_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select accounting_date into new.accounting_date_snapshot
  from public.employee_service_production
  where id = new.production_entry_id;
  if new.accounting_date_snapshot is null then
    raise exception 'La linea de liquidacion requiere una fecha contable valida.';
  end if;
  return new;
end;
$$;

drop trigger if exists settlement_service_accounting_date_guard on public.employee_settlement_service_lines;
create trigger settlement_service_accounting_date_guard
before insert or update of production_entry_id
on public.employee_settlement_service_lines
for each row execute function public.set_settlement_service_accounting_date();

create index if not exists employee_service_production_accounting_date_idx
  on public.employee_service_production (accounting_date, employee_id, status);
create index if not exists employee_product_bonus_accounting_date_idx
  on public.employee_product_bonus_entries (accounting_date, employee_id, status);

create or replace function public.guard_production_accounting_period()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sale_date date;
  v_period public.payroll_periods%rowtype;
begin
  select accounting_date into v_sale_date from public.sales where id = new.sale_id;
  if not found then raise exception 'La produccion requiere una venta valida.'; end if;

  select * into v_period from public.payroll_periods where id = new.payroll_period_id;
  if not found or v_sale_date not between v_period.start_date and v_period.end_date then
    raise exception 'La fecha contable de la venta no pertenece al periodo de produccion.';
  end if;
  if v_period.status in ('closed', 'cancelled') then
    raise exception 'No se puede registrar o mover produccion en un periodo cerrado.';
  end if;

  new.accounting_date := v_sale_date;
  return new;
end;
$$;

drop trigger if exists employee_service_production_period_guard on public.employee_service_production;
create trigger employee_service_production_period_guard
before insert or update of sale_id, payroll_period_id, accounting_date
on public.employee_service_production
for each row execute function public.guard_production_accounting_period();

drop trigger if exists employee_product_bonus_period_guard on public.employee_product_bonus_entries;
create trigger employee_product_bonus_period_guard
before insert or update of sale_id, payroll_period_id, accounting_date
on public.employee_product_bonus_entries
for each row execute function public.guard_production_accounting_period();

create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype; v_period public.payroll_periods%rowtype; v_item record;
  v_employee_id uuid; v_source text; v_reward_discount numeric(12,2); v_commercial_discount numeric(12,2);
  v_courtesy_discount numeric(12,2); v_collected numeric(12,2); v_contribution numeric(12,2); v_fixed numeric(12,2);
  v_rule public.product_bonus_rules%rowtype; v_internal public.internal_pos_operations%rowtype;
  v_benefit public.employee_benefit_rules%rowtype; v_services integer := 0; v_bonuses integer := 0; v_reversed integer := 0;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'La venta no existe.'; end if;
  if not (public.is_admin() or public.can_manage_pos_branch(v_sale.branch_id)) then raise exception 'No tienes permisos para generar produccion de esta venta.'; end if;
  select * into v_internal from public.internal_pos_operations where sale_id = p_sale_id;
  if found and v_internal.benefit_rule_id is not null then select * into v_benefit from public.employee_benefit_rules where id = v_internal.benefit_rule_id; end if;
  if v_sale.status = 'cancelled' then
    update public.employee_service_production set status='reversed',reversed_at=now(),reversed_reason='Venta anulada.',updated_at=now() where sale_id=p_sale_id and status<>'reversed'; get diagnostics v_reversed=row_count;
    update public.employee_product_bonus_entries set status='reversed',reversed_at=now(),reversed_reason='Venta anulada.' where sale_id=p_sale_id and status<>'reversed';
    return jsonb_build_object('services_generated',0,'bonuses_generated',0,'reversed',v_reversed);
  end if;
  if v_sale.status <> 'completed' then return jsonb_build_object('services_generated',0,'bonuses_generated',0,'reversed',0,'omitted',1); end if;
  v_period := public.get_or_create_payroll_period(v_sale.accounting_date);
  if v_period.status in ('closed','cancelled') then raise exception 'El periodo contable de esta venta esta cerrado.'; end if;
  for v_item in select si.* from public.sale_items si where si.sale_id=p_sale_id order by si.created_at loop
    if v_item.item_type='service' then
      v_employee_id:=coalesce(v_item.barber_id,v_sale.barber_id); if v_employee_id is null then continue; end if;
      v_reward_discount:=case when exists(select 1 from public.reward_redemptions rr where rr.sale_id=p_sale_id and rr.status='applied') and v_item.discount_amount>0 then v_item.discount_amount else 0 end;
      v_courtesy_discount:=case when v_item.is_courtesy then v_item.quantity*v_item.unit_price else 0 end;
      v_commercial_discount:=case when v_reward_discount=0 and not v_item.is_courtesy then v_item.discount_amount else 0 end;
      v_collected:=greatest(v_item.total,0);
      if v_internal.benefit_rule_id is not null and v_benefit.id is not null then
        v_source:='employee_benefit'; v_contribution:=least(v_collected,v_benefit.operational_contribution); v_fixed:=v_benefit.fixed_barber_payout;
      else
        v_source:=case when v_item.is_courtesy then 'courtesy' when v_reward_discount>0 then 'reward' when v_commercial_discount>0 then 'commercial_discount' else 'normal' end;
        v_contribution:=case when v_source in ('reward','courtesy') then 0 else least(v_collected,public.calculate_operational_contribution(v_collected,v_sale.accounting_date)) end;
        v_fixed:=case when v_source in ('reward','courtesy') then public.get_service_fixed_commission(v_source,v_item.service_id,v_sale.accounting_date) else 0 end;
      end if;
      insert into public.employee_service_production (payroll_period_id,employee_id,branch_id,sale_id,sale_item_id,service_id,production_date,accounting_date,production_source,quantity,original_unit_price,original_line_total,commercial_discount_amount,reward_discount_amount,courtesy_discount_amount,collected_amount,operational_contribution_amount,commissionable_amount,fixed_commission_amount,status)
      values(v_period.id,v_employee_id,v_sale.branch_id,v_sale.id,v_item.id,v_item.service_id,coalesce(v_sale.closed_at,v_sale.created_at),v_sale.accounting_date,v_source,v_item.quantity,v_item.unit_price,v_item.quantity*v_item.unit_price,v_commercial_discount,v_reward_discount,v_courtesy_discount,v_collected,v_contribution,case when v_source in ('reward','courtesy','employee_benefit') then 0 else greatest(v_collected-v_contribution,0) end,v_fixed,'active')
      on conflict(sale_item_id) do update set payroll_period_id=excluded.payroll_period_id,accounting_date=excluded.accounting_date,employee_id=excluded.employee_id,production_source=excluded.production_source,commercial_discount_amount=excluded.commercial_discount_amount,reward_discount_amount=excluded.reward_discount_amount,courtesy_discount_amount=excluded.courtesy_discount_amount,collected_amount=excluded.collected_amount,operational_contribution_amount=excluded.operational_contribution_amount,commissionable_amount=excluded.commissionable_amount,fixed_commission_amount=excluded.fixed_commission_amount,status='active',reversed_at=null,reversed_reason=null,updated_at=now();
      v_services:=v_services+1;
    elsif v_item.item_type='product' and not v_item.is_courtesy and coalesce(v_internal.operation_kind,'') not in ('employee_credit','internal_complimentary') then
      v_employee_id:=case when exists(select 1 from public.sale_items sx where sx.sale_id=p_sale_id and sx.item_type='service') then v_sale.barber_id else v_sale.closed_by end;
      select * into v_rule from public.product_bonus_rules where is_active and effective_from<=v_sale.accounting_date and (effective_to is null or effective_to>=v_sale.accounting_date) and (product_id=v_item.product_id or (product_id is null and product_category_id=(select category_id from public.products where id=v_item.product_id))) order by case when product_id is not null then 2 else 1 end desc,priority desc limit 1;
      if found then insert into public.employee_product_bonus_entries(payroll_period_id,employee_id,branch_id,sale_id,sale_item_id,product_id,product_category_id,accounting_date,quantity,unit_bonus_amount,total_bonus_amount,bonus_rule_id,status) values(v_period.id,v_employee_id,v_sale.branch_id,v_sale.id,v_item.id,v_item.product_id,(select category_id from public.products where id=v_item.product_id),v_sale.accounting_date,v_item.quantity,v_rule.bonus_value,round(v_rule.bonus_value*v_item.quantity,2),v_rule.id,case when v_employee_id is null then 'pending_review' else 'active' end) on conflict(sale_item_id) do update set payroll_period_id=excluded.payroll_period_id,accounting_date=excluded.accounting_date,employee_id=excluded.employee_id,quantity=excluded.quantity,unit_bonus_amount=excluded.unit_bonus_amount,total_bonus_amount=excluded.total_bonus_amount,bonus_rule_id=excluded.bonus_rule_id,status=excluded.status,reversed_at=null,reversed_reason=null; v_bonuses:=v_bonuses+1; end if;
    end if;
  end loop;
  return jsonb_build_object('services_generated',v_services,'bonuses_generated',v_bonuses,'reversed',0,'omitted',0);
end;
$$;

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
  if not public.is_admin() then raise exception 'Solo owner o admin pueden generar produccion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id;
  if not found then raise exception 'El periodo no existe.'; end if;
  if v_period.status in ('closed','cancelled') then raise exception 'El periodo esta cerrado y no admite regeneracion.'; end if;

  for v_sale in
    select id from public.sales
    where accounting_date between v_period.start_date and v_period.end_date
      and (p_branch_id is null or branch_id = p_branch_id)
      and status in ('completed', 'cancelled')
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

-- Los bonos por servicio tambien usan la fecha contable, no el dia UTC del
-- timestamp de produccion.
create or replace function public.sync_employee_service_bonus_entry(p_production_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_production public.employee_service_production%rowtype;
  v_service_category_id uuid;
  v_rule public.product_bonus_rules%rowtype;
begin
  select * into v_production
  from public.employee_service_production
  where id = p_production_id;

  if not found then return; end if;

  if v_production.status <> 'active'
    or v_production.production_source not in ('normal', 'commercial_discount')
    or v_production.employee_id is null then
    update public.employee_product_bonus_entries
    set status = 'reversed', reversed_at = now(),
        reversed_reason = 'La produccion de servicio no es bonificable.'
    where sale_item_id = v_production.sale_item_id
      and service_id = v_production.service_id
      and status <> 'reversed';
    return;
  end if;

  select category_id into v_service_category_id
  from public.services
  where id = v_production.service_id;

  select * into v_rule
  from public.product_bonus_rules
  where is_active
    and effective_from <= v_production.accounting_date
    and (effective_to is null or effective_to >= v_production.accounting_date)
    and (
      service_id = v_production.service_id
      or (service_id is null and service_category_id = v_service_category_id)
    )
  order by case when service_id is not null then 2 else 1 end desc, priority desc
  limit 1;

  if not found then
    update public.employee_product_bonus_entries
    set status = 'reversed', reversed_at = now(),
        reversed_reason = 'No existe una regla activa para este servicio.'
    where sale_item_id = v_production.sale_item_id
      and service_id = v_production.service_id
      and status <> 'reversed';
    return;
  end if;

  insert into public.employee_product_bonus_entries (
    payroll_period_id, employee_id, branch_id, sale_id, sale_item_id,
    product_id, product_category_id, service_id, service_category_id,
    accounting_date, quantity, unit_bonus_amount, total_bonus_amount,
    bonus_rule_id, status, reversed_at, reversed_reason
  ) values (
    v_production.payroll_period_id, v_production.employee_id, v_production.branch_id,
    v_production.sale_id, v_production.sale_item_id,
    null, null, v_production.service_id, v_service_category_id,
    v_production.accounting_date, v_production.quantity, v_rule.bonus_value,
    round(v_production.quantity * v_rule.bonus_value, 2), v_rule.id, 'active', null, null
  )
  on conflict (sale_item_id) do update set
    payroll_period_id = excluded.payroll_period_id,
    accounting_date = excluded.accounting_date,
    employee_id = excluded.employee_id,
    branch_id = excluded.branch_id,
    sale_id = excluded.sale_id,
    product_id = null,
    product_category_id = null,
    service_id = excluded.service_id,
    service_category_id = excluded.service_category_id,
    quantity = excluded.quantity,
    unit_bonus_amount = excluded.unit_bonus_amount,
    total_bonus_amount = excluded.total_bonus_amount,
    bonus_rule_id = excluded.bonus_rule_id,
    status = 'active',
    reversed_at = null,
    reversed_reason = null;
end;
$$;

-- Reporte para los pocos casos que no se mueven automaticamente porque ya
-- forman parte de una liquidacion no cancelada.
create or replace function public.get_accounting_period_integrity_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_admin() then jsonb_build_object(
    'service_mismatches', (
      select count(*) from public.employee_service_production production
      join public.payroll_periods period on period.id = production.payroll_period_id
      where production.accounting_date not between period.start_date and period.end_date
    ),
    'bonus_mismatches', (
      select count(*) from public.employee_product_bonus_entries bonus
      join public.payroll_periods period on period.id = bonus.payroll_period_id
      where bonus.accounting_date not between period.start_date and period.end_date
    ),
    'details', coalesce((
      select jsonb_agg(detail order by detail ->> 'accounting_date')
      from (
        select jsonb_build_object('kind','service','entry_id',production.id,'sale_id',production.sale_id,'accounting_date',production.accounting_date,'period_start',period.start_date,'period_end',period.end_date) detail
        from public.employee_service_production production
        join public.payroll_periods period on period.id = production.payroll_period_id
        where production.accounting_date not between period.start_date and period.end_date
        union all
        select jsonb_build_object('kind','bonus','entry_id',bonus.id,'sale_id',bonus.sale_id,'accounting_date',bonus.accounting_date,'period_start',period.start_date,'period_end',period.end_date)
        from public.employee_product_bonus_entries bonus
        join public.payroll_periods period on period.id = bonus.payroll_period_id
        where bonus.accounting_date not between period.start_date and period.end_date
      ) mismatches
    ), '[]'::jsonb)
  ) else (select jsonb_build_object('error','forbidden')) end;
$$;

revoke all on function public.set_sale_accounting_date() from public;
revoke all on function public.set_settlement_service_accounting_date() from public;
revoke all on function public.guard_production_accounting_period() from public;
revoke all on function public.generate_employee_production_for_sale(uuid) from public;
revoke all on function public.generate_production_for_period(uuid, uuid) from public;
revoke all on function public.sync_employee_service_bonus_entry(uuid) from public;
revoke all on function public.get_accounting_period_integrity_report() from public, anon;
grant execute on function public.generate_employee_production_for_sale(uuid) to authenticated, service_role;
grant execute on function public.generate_production_for_period(uuid, uuid) to authenticated, service_role;
grant execute on function public.sync_employee_service_bonus_entry(uuid) to authenticated, service_role;
grant execute on function public.get_accounting_period_integrity_report() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
