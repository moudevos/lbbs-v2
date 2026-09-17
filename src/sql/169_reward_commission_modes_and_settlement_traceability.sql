-- Rewards: una regla puede pagar un monto fijo o una base sometida al
-- porcentaje de comision del empleado. Ejecutar despues de 168.
-- No altera liquidaciones pagadas ni anuladas.

alter table public.reward_service_commission_rules
  add column if not exists commission_mode text not null default 'fixed',
  add column if not exists commission_basis_amount numeric(12,2);

alter table public.reward_service_commission_rules
  drop constraint if exists reward_service_commission_rules_commission_mode_check;
alter table public.reward_service_commission_rules
  add constraint reward_service_commission_rules_commission_mode_check
  check (commission_mode in ('fixed', 'percentage'));
update public.reward_service_commission_rules
set commission_basis_amount = fixed_commission_amount
where commission_basis_amount is null;
alter table public.reward_service_commission_rules
  alter column commission_basis_amount set not null;
alter table public.reward_service_commission_rules
  alter column commission_basis_amount set default 0;

alter table public.employee_service_production
  add column if not exists reward_commission_mode text,
  add column if not exists reward_commission_basis_amount numeric(12,2) not null default 0,
  add column if not exists reward_commission_rule_id uuid references public.reward_service_commission_rules(id) on delete set null;
alter table public.employee_service_production
  drop constraint if exists employee_service_production_reward_commission_mode_check;
alter table public.employee_service_production
  add constraint employee_service_production_reward_commission_mode_check
  check (reward_commission_mode is null or reward_commission_mode in ('fixed', 'percentage'));

alter table public.employee_settlements
  add column if not exists reward_percentage_commission_total numeric(12,2) not null default 0,
  add column if not exists total_service_count integer not null default 0,
  add column if not exists total_product_count integer not null default 0,
  add column if not exists total_reward_count integer not null default 0,
  add column if not exists total_production_amount numeric(12,2) not null default 0;

alter table public.employee_settlement_service_lines
  add column if not exists production_source_snapshot text,
  add column if not exists original_line_total_snapshot numeric(12,2) not null default 0,
  add column if not exists operational_contribution_snapshot numeric(12,2) not null default 0,
  add column if not exists reward_commission_mode_snapshot text,
  add column if not exists reward_commission_basis_snapshot numeric(12,2) not null default 0;

alter table public.employee_settlement_deductions
  add column if not exists debt_type_snapshot text,
  add column if not exists debt_description_snapshot text,
  add column if not exists debt_created_at_snapshot timestamptz;

-- La regla se aplica al snapshot de produccion, no cuando se imprime o paga
-- una liquidacion. Asi, una modificacion posterior nunca reescribe historia.
create or replace function public.apply_reward_commission_configuration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_category_id uuid;
  v_mode text := 'fixed';
  v_basis numeric(12,2) := 0;
  v_rule_id uuid;
  v_contribution numeric(12,2) := 0;
begin
  if new.production_source <> 'reward' then
    return new;
  end if;

  select category_id into v_category_id from public.services where id = new.service_id;
  select id, commission_mode, commission_basis_amount
  into v_rule_id, v_mode, v_basis
  from public.reward_service_commission_rules
  where is_active
    and effective_from <= new.production_date::date
    and (effective_to is null or effective_to >= new.production_date::date)
    and (service_id = new.service_id
      or (service_id is null and service_category_id = v_category_id)
      or (service_id is null and service_category_id is null))
  order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc,
           priority desc
  limit 1;

  v_basis := greatest(coalesce(v_basis, 0), 0);
  if v_mode = 'percentage' and not public.is_operational_contribution_service_excluded(new.service_id, new.production_date) then
    v_contribution := least(v_basis, public.calculate_operational_contribution(v_basis, new.production_date::date));
  end if;

  new.reward_commission_rule_id := v_rule_id;
  new.reward_commission_mode := coalesce(v_mode, 'fixed');
  new.reward_commission_basis_amount := v_basis;
  new.operational_contribution_amount := case when v_mode = 'percentage' then v_contribution else 0 end;
  new.commissionable_amount := case when v_mode = 'percentage' then greatest(v_basis - v_contribution, 0) else 0 end;
  new.fixed_commission_amount := case when v_mode = 'fixed' then v_basis else 0 end;
  return new;
end;
$$;

drop trigger if exists employee_service_production_reward_commission_configuration on public.employee_service_production;
create trigger employee_service_production_reward_commission_configuration
before insert or update of production_source, service_id, production_date
on public.employee_service_production
for each row execute function public.apply_reward_commission_configuration();

-- Produccion total atribuida: ventas comerciales de servicios y productos,
-- mas los bonos y el valor asignado por Rewards. Un Reward no suma su precio
-- retail (el cliente no lo paga); suma la asignacion configurada al barbero.
create or replace function public.get_employee_mandatory_sales_base(
  p_period_id uuid,
  p_employee_id uuid
)
returns numeric(12,2)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_services numeric(12,2) := 0;
  v_products numeric(12,2) := 0;
  v_product_bonuses numeric(12,2) := 0;
  v_rewards numeric(12,2) := 0;
begin
  select coalesce(sum(production.original_line_total), 0)
  into v_services
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = p_period_id and production.employee_id = p_employee_id
    and production.status = 'active' and production.production_source in ('normal', 'commercial_discount')
    and sale.status = 'completed' and session.status = 'closed';

  select coalesce(sum(greatest(coalesce(item.original_total, item.quantity * item.unit_price, 0), 0)), 0),
         coalesce(sum(bonus.total_bonus_amount), 0)
  into v_products, v_product_bonuses
  from public.employee_product_bonus_entries bonus
  join public.sale_items item on item.id = bonus.sale_item_id
  join public.sales sale on sale.id = bonus.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where bonus.payroll_period_id = p_period_id and bonus.employee_id = p_employee_id
    and bonus.status = 'active' and bonus.product_id is not null and item.item_type = 'product'
    and not item.is_courtesy and sale.status = 'completed' and session.status = 'closed';

  select coalesce(sum(production.reward_commission_basis_amount), 0)
  into v_rewards
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id
  join public.pos_sessions session on session.id = sale.pos_session_id
  where production.payroll_period_id = p_period_id and production.employee_id = p_employee_id
    and production.status = 'active' and production.production_source = 'reward'
    and sale.status = 'completed' and session.status = 'closed';

  return round(greatest(v_services, 0) + greatest(v_products, 0) + greatest(v_product_bonuses, 0) + greatest(v_rewards, 0), 2);
end;
$$;

-- La envoltura de 168 conserva sus validaciones de deuda. Despues de crear
-- snapshots, completa el detalle que se usara tanto en revision como PDF.
do $$
begin
  if to_regprocedure('public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)') is not null
    and to_regprocedure('public.prepare_employee_settlement_v168(uuid,uuid,numeric,jsonb,text,text)') is null then
    alter function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)
      rename to prepare_employee_settlement_v168;
  end if;
end;
$$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid,
  p_employee_id uuid,
  p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb,
  p_notes text default null,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_mandatory_base numeric(12,2);
  v_reward_percentage numeric(12,2);
  v_service_count integer;
  v_product_count integer;
  v_reward_count integer;
begin
  -- 168 reserva deudas usando get_employee_mandatory_sales_base; se conserva
  -- como la capa inmediatamente anterior para no perder esas validaciones.
  select * into v_settlement from public.prepare_employee_settlement_v168(
    p_period_id, p_employee_id, p_commission_rate, p_debt_deductions, p_notes, p_high_rate_note
  );

  v_mandatory_base := public.get_employee_mandatory_sales_base(p_period_id, p_employee_id);

  update public.employee_settlement_service_lines line
  set production_source_snapshot = production.production_source,
      original_line_total_snapshot = production.original_line_total,
      operational_contribution_snapshot = production.operational_contribution_amount,
      reward_commission_mode_snapshot = production.reward_commission_mode,
      reward_commission_basis_snapshot = production.reward_commission_basis_amount
  from public.employee_service_production production
  where line.settlement_id = v_settlement.id and production.id = line.production_entry_id;

  update public.employee_settlement_deductions deduction
  set debt_type_snapshot = debt.debt_type,
      debt_description_snapshot = debt.description,
      debt_created_at_snapshot = debt.created_at
  from public.employee_debts debt
  where deduction.settlement_id = v_settlement.id and debt.id = deduction.employee_debt_id;

  select count(*) filter (where production.production_source <> 'reward'),
         count(*) filter (where production.production_source = 'reward'),
         coalesce(sum(line.commission_amount) filter (where production.production_source = 'reward' and production.reward_commission_mode = 'percentage'), 0)
  into v_service_count, v_reward_count, v_reward_percentage
  from public.employee_settlement_service_lines line
  join public.employee_service_production production on production.id = line.production_entry_id
  where line.settlement_id = v_settlement.id;
  select count(*) into v_product_count from public.employee_settlement_bonus_lines where settlement_id = v_settlement.id;

  update public.employee_settlements
  set mandatory_discount_base_amount = v_mandatory_base,
      reward_percentage_commission_total = round(v_reward_percentage, 2),
      total_service_count = coalesce(v_service_count, 0),
      total_product_count = coalesce(v_product_count, 0),
      total_reward_count = coalesce(v_reward_count, 0),
      total_production_amount = v_mandatory_base
  where id = v_settlement.id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

revoke all on function public.apply_reward_commission_configuration() from public, anon;
revoke all on function public.get_employee_mandatory_sales_base(uuid, uuid) from public, anon;
revoke all on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) from public, anon;
grant execute on function public.prepare_employee_settlement(uuid, uuid, numeric, jsonb, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
