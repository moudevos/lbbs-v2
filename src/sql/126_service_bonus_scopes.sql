-- Sprint 8.16: bonos de venta aplicables a productos y servicios.
-- Ejecutar despues de 125_seed_operational_select_options.sql en bases existentes.

begin;

alter table public.product_bonus_rules
  add column if not exists service_id uuid references public.services(id) on delete cascade,
  add column if not exists service_category_id uuid references public.service_categories(id) on delete cascade;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.product_bonus_rules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%product_id%'
      and pg_get_constraintdef(oid) like '%product_category_id%'
  loop
    execute format('alter table public.product_bonus_rules drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.product_bonus_rules
  drop constraint if exists product_bonus_rules_scope_check;

alter table public.product_bonus_rules
  add constraint product_bonus_rules_scope_check
  check (num_nonnulls(product_id, product_category_id, service_id, service_category_id) = 1);

create index if not exists product_bonus_rules_service_lookup_idx
  on public.product_bonus_rules (is_active, service_id, service_category_id, priority desc);

alter table public.employee_product_bonus_entries
  alter column product_id drop not null,
  add column if not exists service_id uuid references public.services(id) on delete restrict,
  add column if not exists service_category_id uuid references public.service_categories(id) on delete set null;

alter table public.employee_product_bonus_entries
  drop constraint if exists employee_product_bonus_entries_catalog_item_check;

alter table public.employee_product_bonus_entries
  add constraint employee_product_bonus_entries_catalog_item_check
  check (num_nonnulls(product_id, service_id) = 1);

create index if not exists employee_product_bonus_service_period_employee_idx
  on public.employee_product_bonus_entries (service_id, payroll_period_id, employee_id, status);

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

  if not found then
    return;
  end if;

  if v_production.status <> 'active'
    or v_production.production_source not in ('normal', 'commercial_discount')
    or v_production.employee_id is null then
    update public.employee_product_bonus_entries
    set status = 'reversed',
        reversed_at = now(),
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
    and effective_from <= v_production.production_date::date
    and (effective_to is null or effective_to >= v_production.production_date::date)
    and (
      service_id = v_production.service_id
      or (service_id is null and service_category_id = v_service_category_id)
    )
  order by case when service_id is not null then 2 else 1 end desc, priority desc
  limit 1;

  if not found then
    update public.employee_product_bonus_entries
    set status = 'reversed',
        reversed_at = now(),
        reversed_reason = 'No existe una regla activa para este servicio.'
    where sale_item_id = v_production.sale_item_id
      and service_id = v_production.service_id
      and status <> 'reversed';
    return;
  end if;

  insert into public.employee_product_bonus_entries (
    payroll_period_id, employee_id, branch_id, sale_id, sale_item_id,
    product_id, product_category_id, service_id, service_category_id,
    quantity, unit_bonus_amount, total_bonus_amount, bonus_rule_id, status,
    reversed_at, reversed_reason
  ) values (
    v_production.payroll_period_id, v_production.employee_id, v_production.branch_id,
    v_production.sale_id, v_production.sale_item_id,
    null, null, v_production.service_id, v_service_category_id,
    v_production.quantity, v_rule.bonus_value,
    round(v_production.quantity * v_rule.bonus_value, 2), v_rule.id, 'active',
    null, null
  )
  on conflict (sale_item_id) do update set
    payroll_period_id = excluded.payroll_period_id,
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

create or replace function public.employee_service_bonus_sync_trigger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.sync_employee_service_bonus_entry(new.id);
  return new;
end;
$$;

drop trigger if exists employee_service_bonus_sync on public.employee_service_production;
create trigger employee_service_bonus_sync
after insert or update of employee_id, service_id, sale_item_id, production_source, quantity, status, payroll_period_id, production_date
on public.employee_service_production
for each row
execute function public.employee_service_bonus_sync_trigger();

-- Reevalua las lineas vigentes cuando el parche se instala sobre una base existente.
do $$
declare
  v_production_id uuid;
begin
  for v_production_id in
    select id from public.employee_service_production where status = 'active'
  loop
    perform public.sync_employee_service_bonus_entry(v_production_id);
  end loop;
end;
$$;

-- Conserva el detalle de bonos de servicios al recalcular una liquidacion.
create or replace function public.prepare_employee_settlement(
  p_period_id uuid, p_employee_id uuid, p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb, p_notes text default null,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_period public.payroll_periods%rowtype;
  v_employee public.employees%rowtype;
  v_base numeric(12,2);
  v_reward numeric(12,2);
  v_courtesy numeric(12,2);
  v_bonus numeric(12,2);
  v_percentage numeric(12,2);
  v_gross numeric(12,2);
  v_deductions numeric(12,2) := 0;
  v_item jsonb;
  v_debt public.employee_debts%rowtype;
  v_amount numeric(12,2);
  v_creator uuid := public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden preparar liquidaciones.'; end if;
  if coalesce(p_commission_rate, -1) < 0 then raise exception 'El porcentaje no es valido.'; end if;
  if p_commission_rate > 60 and nullif(btrim(coalesce(p_high_rate_note, '')), '') is null then raise exception 'Un porcentaje mayor a 60 requiere observacion de autorizacion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id and status <> 'cancelled'; if not found then raise exception 'El periodo no esta disponible.'; end if;
  select * into v_employee from public.employees where id = p_employee_id; if not found then raise exception 'El empleado no existe.'; end if;

  select coalesce(sum(commissionable_amount), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'reward'), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'courtesy'), 0)
  into v_base, v_reward, v_courtesy from public.employee_service_production where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  select coalesce(sum(total_bonus_amount), 0) into v_bonus from public.employee_product_bonus_entries where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  v_percentage := round(v_base * p_commission_rate / 100, 2); v_gross := v_percentage + v_reward + v_courtesy + v_bonus;

  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid and employee_id = p_employee_id and status in ('pending', 'partial');
    if not found then raise exception 'Una deuda seleccionada ya no esta disponible.'; end if;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_amount <= 0 or v_amount > v_debt.outstanding_amount then raise exception 'Un descuento de deuda no es valido.'; end if;
    v_deductions := v_deductions + v_amount;
  end loop;
  if v_deductions > v_gross then raise exception 'Los descuentos no pueden superar la ganancia disponible.'; end if;

  select * into v_settlement from public.employee_settlements where payroll_period_id = p_period_id and employee_id = p_employee_id and status <> 'cancelled' for update;
  if found and v_settlement.status <> 'draft' then raise exception 'Solo una liquidacion borrador puede recalcularse.'; end if;
  if not found then
    insert into public.employee_settlements (payroll_period_id, employee_id, branch_id, settlement_number, commission_rate, commissionable_base_total, percentage_commission_total, reward_fixed_commission_total, courtesy_fixed_commission_total, product_bonus_total, gross_pay_amount, debt_deduction_total, net_pay_amount, notes, high_rate_authorization_note, high_rate_authorized_by, replacement_of_id, created_by)
    values (p_period_id, p_employee_id, v_employee.branch_id, 'LIQ-' || to_char(v_period.start_date, 'YYYYMMDD') || '-' || upper(left(p_employee_id::text, 6)) || '-' || lpad(((select count(*) from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id)+1)::text,2,'0'), p_commission_rate, v_base, v_percentage, v_reward, v_courtesy, v_bonus, v_gross, v_deductions, greatest(v_gross - v_deductions, 0), nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_high_rate_note, '')), ''), case when p_commission_rate > 60 then v_creator else null end, (select id from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id and status='cancelled' order by cancelled_at desc nulls last limit 1), v_creator)
    returning * into v_settlement;
  else
    update public.employee_settlements set commission_rate = p_commission_rate, commissionable_base_total = v_base, percentage_commission_total = v_percentage, reward_fixed_commission_total = v_reward, courtesy_fixed_commission_total = v_courtesy, product_bonus_total = v_bonus, gross_pay_amount = v_gross, debt_deduction_total = v_deductions, net_pay_amount = greatest(v_gross - v_deductions, 0), notes = nullif(btrim(coalesce(p_notes,'')), ''), high_rate_authorization_note = nullif(btrim(coalesce(p_high_rate_note,'')), ''), high_rate_authorized_by = case when p_commission_rate > 60 then v_creator else null end where id = v_settlement.id returning * into v_settlement;
    delete from public.employee_settlement_service_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_bonus_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_deductions where settlement_id = v_settlement.id;
  end if;

  insert into public.employee_settlement_service_lines (settlement_id, production_entry_id, service_name_snapshot, production_date_snapshot, commissionable_amount, commission_rate, commission_amount, fixed_commission_amount)
  select v_settlement.id, esp.id, s.name, esp.production_date, esp.commissionable_amount, case when esp.production_source in ('reward', 'courtesy') then 0 else p_commission_rate end, case when esp.production_source in ('reward', 'courtesy') then 0 else round(esp.commissionable_amount * p_commission_rate / 100, 2) end, esp.fixed_commission_amount from public.employee_service_production esp join public.services s on s.id = esp.service_id where esp.payroll_period_id = p_period_id and esp.employee_id = p_employee_id and esp.status = 'active';
  insert into public.employee_settlement_bonus_lines (settlement_id, product_bonus_entry_id, product_name_snapshot, bonus_amount)
  select v_settlement.id, epb.id, coalesce(p.name, s.name), epb.total_bonus_amount
  from public.employee_product_bonus_entries epb
  left join public.products p on p.id = epb.product_id
  left join public.services s on s.id = epb.service_id
  where epb.payroll_period_id = p_period_id and epb.employee_id = p_employee_id and epb.status = 'active';
  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid; v_amount := round((v_item ->> 'amount')::numeric, 2);
    insert into public.employee_settlement_deductions (settlement_id, employee_debt_id, amount, balance_before, balance_after) values (v_settlement.id, v_debt.id, v_amount, v_debt.outstanding_amount, v_debt.outstanding_amount - v_amount);
  end loop;
  return v_settlement;
end;
$$;

revoke all on function public.sync_employee_service_bonus_entry(uuid) from public;
revoke all on function public.employee_service_bonus_sync_trigger() from public;

commit;

notify pgrst, 'reload schema';
