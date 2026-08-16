-- Operaciones internas desde POS: beneficios de empleados, crédito interno y
-- consumos sin cobro del owner. Ejecutar después de 126_pos_atomic_checkout.sql.
-- Ninguna regla se confía al navegador: se valida dentro del checkout atómico.

alter table public.sales
  add column if not exists operation_kind text not null default 'customer';

alter table public.sales
  drop constraint if exists sales_operation_kind_check;
alter table public.sales
  add constraint sales_operation_kind_check
  check (operation_kind in ('customer', 'employee_benefit', 'employee_credit', 'internal_complimentary'));

create table if not exists public.employee_customer_links (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete restrict,
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  can_use_internal_credit boolean not null default true,
  is_active boolean not null default true,
  linked_by uuid references public.employees(id) on delete set null,
  linked_at timestamptz not null default now(),
  notes text
);

create table if not exists public.employee_benefit_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  applies_to text not null check (applies_to in ('service', 'product', 'all')),
  service_id uuid references public.services(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_category_id uuid references public.product_categories(id) on delete restrict,
  benefit_type text not null check (benefit_type in ('free', 'fixed_price', 'discount_percent')),
  benefit_value numeric(12,2) not null default 0 check (benefit_value >= 0),
  period_kind text not null default 'calendar_month' check (period_kind in ('calendar_month', 'payroll_period', 'none')),
  usage_limit integer not null default 1 check (usage_limit > 0),
  eligible_role text,
  branch_id uuid references public.branches(id) on delete restrict,
  fixed_barber_payout numeric(12,2) not null default 0 check (fixed_barber_payout >= 0),
  operational_contribution numeric(12,2) not null default 0 check (operational_contribution >= 0),
  requires_owner_authorization boolean not null default false,
  is_internal_complimentary boolean not null default false,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check ((benefit_type <> 'discount_percent') or benefit_value <= 100),
  check ((is_internal_complimentary = false) or (benefit_type = 'free' and requires_owner_authorization = true))
);

create index if not exists employee_benefit_rules_active_lookup_idx
  on public.employee_benefit_rules (is_active, effective_from, effective_to, branch_id);

create table if not exists public.internal_pos_operations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  benefit_rule_id uuid references public.employee_benefit_rules(id) on delete restrict,
  debt_id uuid references public.employee_debts(id) on delete restrict,
  operation_kind text not null check (operation_kind in ('employee_benefit', 'employee_credit', 'internal_complimentary')),
  retail_amount numeric(12,2) not null default 0 check (retail_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  credit_amount numeric(12,2) not null default 0 check (credit_amount >= 0),
  authorization_reason text,
  authorized_by uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((operation_kind = 'employee_credit') = (debt_id is not null)),
  check ((operation_kind = 'internal_complimentary') = (authorized_by is not null and authorization_reason is not null))
);

create index if not exists internal_pos_operations_employee_created_idx
  on public.internal_pos_operations (employee_id, created_at desc);

alter table public.employee_debts
  drop constraint if exists employee_debts_debt_type_check;
alter table public.employee_debts
  add constraint employee_debts_debt_type_check
  check (debt_type in ('loan', 'advance', 'supply', 'internal_credit', 'other'));

alter table public.employee_service_production
  drop constraint if exists employee_service_production_production_source_check;
alter table public.employee_service_production
  add constraint employee_service_production_production_source_check
  check (production_source in ('normal', 'reward', 'courtesy', 'commercial_discount', 'employee_benefit'));

alter table public.payment_methods
  drop constraint if exists payment_methods_payment_kind_check;
alter table public.payment_methods
  add constraint payment_methods_payment_kind_check
  check (payment_kind in ('cash', 'wallet_qr', 'card', 'bank_transfer', 'other_digital', 'internal_credit'));
alter table public.payment_methods
  drop constraint if exists payment_methods_operational_flags_check;
alter table public.payment_methods
  add constraint payment_methods_operational_flags_check
  check ((payment_kind = 'cash' and allows_change and counts_as_cash) or (payment_kind <> 'cash' and not allows_change and not counts_as_cash));

insert into public.payment_methods (code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash)
values ('employee_credit', 'Crédito de empleado', 'Cuenta por cobrar interna; no ingresa a caja.', 999, true, 'internal_credit', false, false)
on conflict (code) do update set
  name = excluded.name, description = excluded.description, payment_kind = excluded.payment_kind,
  allows_change = false, counts_as_cash = false, updated_at = now();

create or replace function public.internal_benefit_period_start(p_kind text, p_date date)
returns date language sql stable set search_path = public, pg_temp as $$
  select case p_kind
    when 'calendar_month' then date_trunc('month', p_date)::date
    when 'payroll_period' then coalesce((select start_date from public.payroll_periods where p_date between start_date and end_date order by start_date desc limit 1), date_trunc('month', p_date)::date)
    else date '2000-01-01'
  end;
$$;

create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
  v_period := public.get_or_create_payroll_period(coalesce(v_sale.closed_at,v_sale.created_at)::date);
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
        v_contribution:=case when v_source in ('reward','courtesy') then 0 else least(v_collected,public.calculate_operational_contribution(v_collected,v_sale.closed_at::date)) end;
        v_fixed:=case when v_source in ('reward','courtesy') then public.get_service_fixed_commission(v_source,v_item.service_id,v_sale.closed_at::date) else 0 end;
      end if;
      insert into public.employee_service_production (payroll_period_id,employee_id,branch_id,sale_id,sale_item_id,service_id,production_date,production_source,quantity,original_unit_price,original_line_total,commercial_discount_amount,reward_discount_amount,courtesy_discount_amount,collected_amount,operational_contribution_amount,commissionable_amount,fixed_commission_amount,status)
      values(v_period.id,v_employee_id,v_sale.branch_id,v_sale.id,v_item.id,v_item.service_id,coalesce(v_sale.closed_at,v_sale.created_at),v_source,v_item.quantity,v_item.unit_price,v_item.quantity*v_item.unit_price,v_commercial_discount,v_reward_discount,v_courtesy_discount,v_collected,v_contribution,case when v_source in ('reward','courtesy','employee_benefit') then 0 else greatest(v_collected-v_contribution,0) end,v_fixed,'active')
      on conflict(sale_item_id) do update set payroll_period_id=excluded.payroll_period_id,employee_id=excluded.employee_id,production_source=excluded.production_source,commercial_discount_amount=excluded.commercial_discount_amount,reward_discount_amount=excluded.reward_discount_amount,courtesy_discount_amount=excluded.courtesy_discount_amount,collected_amount=excluded.collected_amount,operational_contribution_amount=excluded.operational_contribution_amount,commissionable_amount=excluded.commissionable_amount,fixed_commission_amount=excluded.fixed_commission_amount,status='active',reversed_at=null,reversed_reason=null,updated_at=now();
      v_services:=v_services+1;
    elsif v_item.item_type='product' and not v_item.is_courtesy and coalesce(v_internal.operation_kind,'') not in ('employee_credit','internal_complimentary') then
      v_employee_id:=case when exists(select 1 from public.sale_items sx where sx.sale_id=p_sale_id and sx.item_type='service') then v_sale.barber_id else v_sale.closed_by end;
      select * into v_rule from public.product_bonus_rules where is_active and effective_from<=v_sale.closed_at::date and (effective_to is null or effective_to>=v_sale.closed_at::date) and (product_id=v_item.product_id or (product_id is null and product_category_id=(select category_id from public.products where id=v_item.product_id))) order by case when product_id is not null then 2 else 1 end desc,priority desc limit 1;
      if found then insert into public.employee_product_bonus_entries(payroll_period_id,employee_id,branch_id,sale_id,sale_item_id,product_id,product_category_id,quantity,unit_bonus_amount,total_bonus_amount,bonus_rule_id,status) values(v_period.id,v_employee_id,v_sale.branch_id,v_sale.id,v_item.id,v_item.product_id,(select category_id from public.products where id=v_item.product_id),v_item.quantity,v_rule.bonus_value,round(v_rule.bonus_value*v_item.quantity,2),v_rule.id,case when v_employee_id is null then 'pending_review' else 'active' end) on conflict(sale_item_id) do update set employee_id=excluded.employee_id,quantity=excluded.quantity,unit_bonus_amount=excluded.unit_bonus_amount,total_bonus_amount=excluded.total_bonus_amount,bonus_rule_id=excluded.bonus_rule_id,status=excluded.status,reversed_at=null,reversed_reason=null; v_bonuses:=v_bonuses+1; end if;
    end if;
  end loop;
  return jsonb_build_object('services_generated',v_services,'bonuses_generated',v_bonuses,'reversed',0,'omitted',0);
end;
$$;

create or replace function public.prepare_employee_settlement(p_period_id uuid,p_employee_id uuid,p_commission_rate numeric,p_debt_deductions jsonb default '[]'::jsonb,p_notes text default null,p_high_rate_note text default null)
returns public.employee_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.employee_settlements%rowtype; v_period public.payroll_periods%rowtype; v_employee public.employees%rowtype; v_base numeric(12,2); v_reward numeric(12,2); v_courtesy numeric(12,2); v_bonus numeric(12,2); v_percentage numeric(12,2); v_gross numeric(12,2); v_deductions numeric(12,2):=0; v_item jsonb; v_debt public.employee_debts%rowtype; v_amount numeric(12,2); v_creator uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden preparar liquidaciones.'; end if;
  if coalesce(p_commission_rate,-1)<0 then raise exception 'El porcentaje no es valido.'; end if;
  if p_commission_rate>60 and nullif(btrim(coalesce(p_high_rate_note,'')),'') is null then raise exception 'Un porcentaje mayor a 60 requiere observacion de autorizacion.'; end if;
  select * into v_period from public.payroll_periods where id=p_period_id and status<>'cancelled'; if not found then raise exception 'El periodo no esta disponible.'; end if;
  select * into v_employee from public.employees where id=p_employee_id; if not found then raise exception 'El empleado no existe.'; end if;
  select coalesce(sum(commissionable_amount),0),coalesce(sum(fixed_commission_amount) filter(where production_source in ('reward','employee_benefit')),0),coalesce(sum(fixed_commission_amount) filter(where production_source='courtesy'),0) into v_base,v_reward,v_courtesy from public.employee_service_production where payroll_period_id=p_period_id and employee_id=p_employee_id and status='active';
  select coalesce(sum(total_bonus_amount),0) into v_bonus from public.employee_product_bonus_entries where payroll_period_id=p_period_id and employee_id=p_employee_id and status='active'; v_percentage:=round(v_base*p_commission_rate/100,2); v_gross:=v_percentage+v_reward+v_courtesy+v_bonus;
  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions,'[]'::jsonb)) loop select * into v_debt from public.employee_debts where id=(v_item->>'debt_id')::uuid and employee_id=p_employee_id and status in ('pending','partial'); if not found then raise exception 'Una deuda seleccionada ya no esta disponible.'; end if; v_amount:=round((v_item->>'amount')::numeric,2); if v_amount<=0 or v_amount>v_debt.outstanding_amount then raise exception 'Un descuento de deuda no es valido.'; end if; v_deductions:=v_deductions+v_amount; end loop;
  if v_deductions>v_gross then raise exception 'Los descuentos no pueden superar la ganancia disponible.'; end if;
  select * into v_settlement from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id and status<>'cancelled' for update;
  if found and v_settlement.status<>'draft' then raise exception 'Solo una liquidacion borrador puede recalcularse.'; end if;
  if not found then insert into public.employee_settlements(payroll_period_id,employee_id,branch_id,settlement_number,commission_rate,commissionable_base_total,percentage_commission_total,reward_fixed_commission_total,courtesy_fixed_commission_total,product_bonus_total,gross_pay_amount,debt_deduction_total,net_pay_amount,notes,high_rate_authorization_note,high_rate_authorized_by,replacement_of_id,created_by) values(p_period_id,p_employee_id,v_employee.branch_id,'LIQ-'||to_char(v_period.start_date,'YYYYMMDD')||'-'||upper(left(p_employee_id::text,6))||'-'||lpad(((select count(*) from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id)+1)::text,2,'0'),p_commission_rate,v_base,v_percentage,v_reward,v_courtesy,v_bonus,v_gross,v_deductions,greatest(v_gross-v_deductions,0),nullif(btrim(coalesce(p_notes,'')),''),nullif(btrim(coalesce(p_high_rate_note,'')),''),case when p_commission_rate>60 then v_creator else null end,(select id from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id and status='cancelled' order by cancelled_at desc nulls last limit 1),v_creator) returning * into v_settlement; else update public.employee_settlements set commission_rate=p_commission_rate,commissionable_base_total=v_base,percentage_commission_total=v_percentage,reward_fixed_commission_total=v_reward,courtesy_fixed_commission_total=v_courtesy,product_bonus_total=v_bonus,gross_pay_amount=v_gross,debt_deduction_total=v_deductions,net_pay_amount=greatest(v_gross-v_deductions,0),notes=nullif(btrim(coalesce(p_notes,'')),''),high_rate_authorization_note=nullif(btrim(coalesce(p_high_rate_note,'')),''),high_rate_authorized_by=case when p_commission_rate>60 then v_creator else null end where id=v_settlement.id returning * into v_settlement; delete from public.employee_settlement_service_lines where settlement_id=v_settlement.id; delete from public.employee_settlement_bonus_lines where settlement_id=v_settlement.id; delete from public.employee_settlement_deductions where settlement_id=v_settlement.id; end if;
  insert into public.employee_settlement_service_lines(settlement_id,production_entry_id,service_name_snapshot,production_date_snapshot,commissionable_amount,commission_rate,commission_amount,fixed_commission_amount) select v_settlement.id,esp.id,s.name,esp.production_date,esp.commissionable_amount,case when esp.production_source in ('reward','courtesy','employee_benefit') then 0 else p_commission_rate end,case when esp.production_source in ('reward','courtesy','employee_benefit') then 0 else round(esp.commissionable_amount*p_commission_rate/100,2) end,esp.fixed_commission_amount from public.employee_service_production esp join public.services s on s.id=esp.service_id where esp.payroll_period_id=p_period_id and esp.employee_id=p_employee_id and esp.status='active';
  insert into public.employee_settlement_bonus_lines(settlement_id,product_bonus_entry_id,product_name_snapshot,bonus_amount) select v_settlement.id,epb.id,coalesce(p.name,s.name),epb.total_bonus_amount from public.employee_product_bonus_entries epb left join public.products p on p.id=epb.product_id left join public.services s on s.id=epb.service_id where epb.payroll_period_id=p_period_id and epb.employee_id=p_employee_id and epb.status='active';
  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions,'[]'::jsonb)) loop select * into v_debt from public.employee_debts where id=(v_item->>'debt_id')::uuid; v_amount:=round((v_item->>'amount')::numeric,2); insert into public.employee_settlement_deductions(settlement_id,employee_debt_id,amount,balance_before,balance_after) values(v_settlement.id,v_debt.id,v_amount,v_debt.outstanding_amount,v_debt.outstanding_amount-v_amount); end loop; return v_settlement;
end; $$;

-- RLS: los usuarios operativos sólo consumen las RPC; owner/admin administra reglas y enlaces.
alter table public.employee_customer_links enable row level security;
alter table public.employee_benefit_rules enable row level security;
alter table public.internal_pos_operations enable row level security;
drop policy if exists "employee_customer_links_admin" on public.employee_customer_links;
create policy "employee_customer_links_admin" on public.employee_customer_links for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "employee_benefit_rules_team_read" on public.employee_benefit_rules;
create policy "employee_benefit_rules_team_read" on public.employee_benefit_rules for select to authenticated using (public.is_admin() or public.current_user_role()='reception');
drop policy if exists "employee_benefit_rules_admin_write" on public.employee_benefit_rules;
create policy "employee_benefit_rules_admin_write" on public.employee_benefit_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "internal_pos_operations_team_read" on public.internal_pos_operations;
create policy "internal_pos_operations_team_read" on public.internal_pos_operations for select to authenticated using (public.is_admin() or public.can_manage_pos_branch((select branch_id from public.sales where id=sale_id)));
drop policy if exists "internal_pos_operations_checkout_insert" on public.internal_pos_operations;
create policy "internal_pos_operations_checkout_insert" on public.internal_pos_operations for insert to authenticated
with check (
  created_by = public.current_employee_id()
  and public.can_manage_pos_branch((select branch_id from public.sales where id = sale_id))
  and exists (
    select 1
    from public.sales sale
    join public.employee_customer_links link on link.customer_id = sale.customer_id
    where sale.id = internal_pos_operations.sale_id
      and sale.status = 'draft'
      and sale.operation_kind = internal_pos_operations.operation_kind
      and link.employee_id = internal_pos_operations.employee_id
      and link.customer_id = internal_pos_operations.customer_id
      and link.is_active
  )
);
revoke all on public.employee_customer_links, public.employee_benefit_rules, public.internal_pos_operations from public, anon;
grant select, insert, update, delete on public.employee_customer_links, public.employee_benefit_rules, public.internal_pos_operations to authenticated;

-- Único punto privilegiado para crear la deuda desde el checkout. Evita abrir
-- la RPC genérica de préstamos/adelantos a recepción para deudas arbitrarias.
create or replace function public.create_pos_internal_credit_debt(
  p_sale_id uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_amount numeric
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_creator uuid := public.current_employee_id();
begin
  if v_creator is null or not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para registrar este crédito interno.';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'El monto de crédito debe ser mayor que cero.';
  end if;
  if not exists (
    select 1
    from public.sales sale
    join public.employee_customer_links link on link.customer_id = sale.customer_id
    where sale.id = p_sale_id
      and sale.branch_id = p_branch_id
      and sale.status = 'draft'
      and link.employee_id = p_employee_id
      and link.is_active
  ) then
    raise exception 'La venta no corresponde al empleado vinculado.';
  end if;
  insert into public.employee_debts (
    employee_id, branch_id, debt_type, original_amount, outstanding_amount,
    description, created_by
  ) values (
    p_employee_id, p_branch_id, 'internal_credit', round(p_amount, 2), round(p_amount, 2),
    'Compra a crédito desde POS: ' || p_sale_id::text, v_creator
  ) returning * into v_debt;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by)
  values (v_debt.id, 'charge', v_debt.original_amount, 'Registro de crédito interno desde POS.', v_creator);
  return v_debt;
end;
$$;

revoke all on function public.create_pos_internal_credit_debt(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.create_pos_internal_credit_debt(uuid, uuid, uuid, numeric) to authenticated, service_role;

-- Reabre únicamente la interfaz operativa de una sesión de la jornada actual
-- marcada como pendiente por error. No reabre cierres financieros ni jornadas anteriores.
create or replace function public.resume_pos_session(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  select * into v_session from public.pos_sessions where id = p_session_id for update;
  if not found or not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para reabrir esta sesión POS.';
  end if;
  if v_session.status <> 'pending_close' or v_session.business_date <> public.pos_business_date() then
    raise exception 'Solo se puede reabrir una sesión pendiente de la jornada actual.';
  end if;
  update public.pos_sessions set status = 'open', updated_at = now() where id = p_session_id returning * into v_session;
  insert into public.pos_session_events (pos_session_id, employee_id, event_type, message, metadata)
  values (v_session.id, v_employee_id, 'reopened', 'Interfaz POS reabierta para la jornada actual.', jsonb_build_object('previous_status', 'pending_close'));
  return v_session;
end;
$$;

revoke all on function public.resume_pos_session(uuid) from public, anon;
grant execute on function public.resume_pos_session(uuid) to authenticated, service_role;

-- Recupera solo sesiones de la fecha operativa actual que una versión previa
-- haya dejado como pending_close. Las fechas anteriores no se tocan.
update public.pos_sessions
set status = 'open', updated_at = now()
where status = 'pending_close'
  and business_date = public.pos_business_date();

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_sale_id uuid; v_session public.pos_sessions%rowtype; v_employee_id uuid:=public.current_employee_id();
  v_item jsonb; v_payment jsonb; v_final_total numeric(12,2); v_paid_total numeric(12,2); v_discount numeric(12,2); v_line_total numeric(12,2);
  v_pos_session_id uuid:=(p_payload->>'pos_session_id')::uuid; v_branch_id uuid:=(p_payload->>'branch_id')::uuid; v_customer_id uuid:=(p_payload->>'customer_id')::uuid;
  v_barber_id uuid:=nullif(p_payload->>'barber_id','')::uuid; v_reservation_id uuid:=nullif(p_payload->>'reservation_id','')::uuid; v_reward_entitlement_id uuid:=nullif(p_payload->>'reward_entitlement_id','')::uuid;
  v_rule public.employee_benefit_rules%rowtype; v_link public.employee_customer_links%rowtype; v_linked_employee public.employees%rowtype; v_debt public.employee_debts%rowtype;
  v_rule_id uuid:=nullif(p_payload->>'employee_benefit_rule_id','')::uuid; v_internal_credit boolean:=coalesce((p_payload->>'internal_credit')::boolean,false); v_authorization_reason text:=nullif(btrim(coalesce(p_payload->>'authorization_reason','')),'');
  v_operation_kind text:='customer'; v_rule_period date; v_usage_count integer; v_matches boolean; v_credit_method_id uuid; v_subtotal numeric(12,2):=0; v_discount_total numeric(12,2):=0;
begin
  if v_employee_id is null or not public.can_manage_pos_branch(v_branch_id) then raise exception 'No tienes permisos para cerrar ventas en esta sede.'; end if;
  select * into v_session from public.pos_sessions where id=v_pos_session_id and branch_id=v_branch_id for update;
  if not found or v_session.status<>'open' then raise exception 'La sesion POS ya esta cerrada.'; end if;
  if jsonb_typeof(coalesce(p_payload->'items','null'::jsonb))<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'La venta debe incluir al menos un item.'; end if;
  if v_rule_id is not null or v_internal_credit then
    select l.* into v_link from public.employee_customer_links l where l.customer_id=v_customer_id and l.is_active for share;
    if not found then raise exception 'El cliente no esta vinculado a un empleado activo autorizado.'; end if;
    select * into v_linked_employee from public.employees where id=v_link.employee_id and status='active';
    if not found then raise exception 'El cliente no esta vinculado a un empleado activo autorizado.'; end if;
  end if;
  if v_rule_id is not null then
    if v_reward_entitlement_id is not null then raise exception 'No puedes combinar un reward de cliente con un beneficio interno.'; end if;
    select * into v_rule from public.employee_benefit_rules where id=v_rule_id and is_active and effective_from<=public.pos_business_date() and (effective_to is null or effective_to>=public.pos_business_date()) for share;
    if not found then raise exception 'El beneficio interno ya no esta disponible.'; end if;
    if v_rule.branch_id is not null and v_rule.branch_id<>v_branch_id then raise exception 'El beneficio no aplica para esta sede.'; end if;
    if v_rule.eligible_role is not null and v_rule.eligible_role<>v_linked_employee.role then raise exception 'El beneficio no aplica para este empleado.'; end if;
    v_rule_period:=public.internal_benefit_period_start(v_rule.period_kind,public.pos_business_date());
    if v_rule.period_kind<>'none' then select count(*) into v_usage_count from public.internal_pos_operations io join public.sales s on s.id=io.sale_id where io.employee_id=v_link.employee_id and io.benefit_rule_id=v_rule.id and s.status='completed' and s.closed_at::date>=v_rule_period; if v_usage_count>=v_rule.usage_limit then raise exception 'El empleado ya alcanzo el límite de este beneficio en el periodo vigente.'; end if; end if;
    if v_rule.is_internal_complimentary then
      if public.current_user_role()<>'owner' or v_authorization_reason is null then raise exception 'El consumo sin cobro requiere owner activo y motivo obligatorio.'; end if;
      v_operation_kind:='internal_complimentary';
    else v_operation_kind:='employee_benefit'; end if;
  elsif v_internal_credit then
    if not v_link.can_use_internal_credit then raise exception 'Este empleado no tiene crédito interno habilitado.'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'items') x where x->>'item_type'<>'product') then raise exception 'El crédito interno sólo está disponible para productos.'; end if;
    v_operation_kind:='employee_credit';
  end if;
  insert into public.sales(pos_session_id,branch_id,customer_id,reservation_id,barber_id,status,subtotal,discount_total,courtesy_total,total,paid_total,change_amount,checkout_idempotency_key,notes,created_by,operation_kind)
  values(v_pos_session_id,v_branch_id,v_customer_id,v_reservation_id,v_barber_id,'draft',0,0,0,0,0,0,nullif(p_payload->>'idempotency_key',''),nullif(btrim(coalesce(p_payload->>'notes','')),''),v_employee_id,v_operation_kind) returning id into v_sale_id;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_line_total:=round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2); v_discount:=coalesce((v_item->>'discount_amount')::numeric,0);
    if v_rule_id is not null then
      v_matches := v_rule.applies_to = 'all'
        or (
          v_rule.applies_to = (v_item ->> 'item_type')
          and (
            (
              (v_item ->> 'item_type') = 'service'
              and (v_rule.service_id is null or v_rule.service_id = (v_item ->> 'service_id')::uuid)
              and (
                v_rule.service_category_id is null
                or v_rule.service_category_id = (
                  select category_id from public.services where id = (v_item ->> 'service_id')::uuid
                )
              )
            )
            or (
              (v_item ->> 'item_type') = 'product'
              and (v_rule.product_id is null or v_rule.product_id = (v_item ->> 'product_id')::uuid)
              and (
                v_rule.product_category_id is null
                or v_rule.product_category_id = (
                  select category_id from public.products where id = (v_item ->> 'product_id')::uuid
                )
              )
            )
          )
        );
      if v_matches then v_discount:=case v_rule.benefit_type when 'free' then v_line_total when 'fixed_price' then greatest(v_line_total-round(v_rule.benefit_value*(v_item->>'quantity')::numeric,2),0) else round(v_line_total*v_rule.benefit_value/100,2) end; end if;
    end if;
    v_discount:=least(greatest(v_discount,0),v_line_total); v_subtotal:=v_subtotal+v_line_total; v_discount_total:=v_discount_total+v_discount;
    insert into public.sale_items(sale_id,item_type,service_id,product_id,description_snapshot,quantity,unit_price,discount_amount,total,cost_snapshot,barber_id,is_courtesy,courtesy_reason,original_unit_price,original_total,courtesy_amount,courtesy_authorized_by)
    values(v_sale_id,v_item->>'item_type',nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'product_id','')::uuid,coalesce(nullif(v_item->>'description_snapshot',''),'Item POS'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,v_discount,v_line_total-v_discount,nullif(v_item->>'cost_snapshot','')::numeric,nullif(v_item->>'barber_id','')::uuid,false,null,v_line_total/(v_item->>'quantity')::numeric,v_line_total,case when v_operation_kind='internal_complimentary' then v_line_total else null end,case when v_operation_kind='internal_complimentary' then v_employee_id else null end);
  end loop;
  update public.sales set subtotal=round(v_subtotal,2),discount_total=round(v_discount_total,2),courtesy_total=case when v_operation_kind='internal_complimentary' then round(v_subtotal,2) else 0 end,total=round(v_subtotal-v_discount_total,2) where id=v_sale_id;
  select total into v_final_total from public.sales where id=v_sale_id;
  if v_operation_kind='employee_credit' then
    select id into v_credit_method_id from public.payment_methods where code='employee_credit' and is_active; if v_credit_method_id is null then raise exception 'El método Crédito de empleado no está configurado.'; end if;
    v_debt:=public.create_pos_internal_credit_debt(v_sale_id,v_link.employee_id,v_branch_id,v_final_total);
    insert into public.sale_payments(sale_id,payment_method_id,amount,tendered_amount,change_amount) values(v_sale_id,v_credit_method_id,v_final_total,v_final_total,0);
  else
    select coalesce(sum((value->>'amount')::numeric),0) into v_paid_total from jsonb_array_elements(coalesce(p_payload->'payments','[]'::jsonb));
    if round(v_paid_total,2)<>round(coalesce(v_final_total,0),2) then raise exception 'El monto pagado no cubre el total final de la venta.'; end if;
    for v_payment in select value from jsonb_array_elements(coalesce(p_payload->'payments','[]'::jsonb)) loop insert into public.sale_payments(sale_id,payment_method_id,amount,tendered_amount,change_amount) values(v_sale_id,(v_payment->>'payment_method_id')::uuid,(v_payment->>'amount')::numeric,(v_payment->>'tendered_amount')::numeric,coalesce((v_payment->>'change_amount')::numeric,0)); end loop;
  end if;
  if v_operation_kind<>'customer' then insert into public.internal_pos_operations(sale_id,employee_id,customer_id,benefit_rule_id,debt_id,operation_kind,retail_amount,discount_amount,credit_amount,authorization_reason,authorized_by,created_by) values(v_sale_id,v_link.employee_id,v_customer_id,v_rule_id,v_debt.id,v_operation_kind,v_subtotal,v_discount_total,case when v_operation_kind='employee_credit' then v_final_total else 0 end,v_authorization_reason,case when v_operation_kind='internal_complimentary' then v_employee_id else null end,v_employee_id); end if;
  if v_reward_entitlement_id is not null then perform public.apply_reward_to_sale(v_sale_id,v_reward_entitlement_id); end if;
  perform public.complete_sale(v_sale_id); return v_sale_id;
end; $$;

-- El crédito interno no es dinero de caja: se excluye de lo que el operador
-- debe contar al cerrar, aunque permanece en la venta y en la deuda auditada.
create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_payments jsonb;
begin
  v_summary := public.get_pos_session_closure_summary_raw(p_session_id);

  if not public.is_admin() and exists (
    select 1 from public.pos_session_legacy_closure_authorizations
    where pos_session_id = p_session_id
  ) then
    raise exception 'No tienes permisos para ver el cierre historico auditado.';
  end if;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_payments
  from jsonb_array_elements(v_summary -> 'payment_methods') with ordinality as payments(item, ordinal)
  join public.payment_methods method
    on method.id = (item ->> 'payment_method_id')::uuid
  where method.payment_kind <> 'internal_credit';

  return jsonb_set(v_summary, '{payment_methods}', v_payments, true);
end;
$$;

-- Las operaciones internas no son elegibles para Rewards de clientes. Se
-- conserva el mismo cierre, inventario y producción de la venta normal.
create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
  v_change_amount numeric(12,2) := 0;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if not public.can_manage_pos_branch(v_sale.branch_id) then raise exception 'No tienes permisos para completar esta venta.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Solo las ventas en borrador se pueden completar.'; end if;
  if not exists (select 1 from public.pos_sessions ps where ps.id = v_sale.pos_session_id and ps.branch_id = v_sale.branch_id and ps.status = 'open') then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;
  select count(*) into v_item_count from public.sale_items where sale_id = p_sale_id;
  if v_item_count = 0 then raise exception 'La venta debe tener al menos un item.'; end if;
  if v_sale.paid_total < v_sale.total then raise exception 'Los pagos registrados no cubren el total de la venta.'; end if;
  select count(*) into v_service_count from public.sale_items where sale_id = p_sale_id and item_type = 'service';
  if v_service_count > 0 then
    select (v_sale.barber_id is not null or exists (select 1 from public.sale_items si where si.sale_id = p_sale_id and si.item_type = 'service' and si.barber_id is not null)) into v_barber_covered;
    if not v_barber_covered then raise exception 'Las ventas con servicios requieren un barbero asignado.'; end if;
  end if;
  select concat('Stock insuficiente para ', p.name) into v_stock_issue
  from (select si.product_id, sum(si.quantity) as required_quantity from public.sale_items si join public.products p0 on p0.id = si.product_id where si.sale_id = p_sale_id and si.item_type = 'product' and p0.is_stockable = true group by si.product_id) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock on stock.product_id = p.id and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity limit 1;
  if v_stock_issue is not null then raise exception '%', v_stock_issue; end if;
  insert into public.stock_movements (product_id, branch_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
  select si.product_id, v_sale.branch_id, case when si.is_courtesy then 'courtesy' else 'sale' end, si.quantity, coalesce(si.cost_snapshot, p.cost_price), 'sale', v_sale.id,
    case when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.' else 'Descuento de stock por venta completada.' end, v_employee_id
  from public.sale_items si join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id and si.item_type = 'product' and p.is_stockable = true;
  select coalesce(sum(sp.change_amount), 0) into v_change_amount from public.sale_payments sp where sp.sale_id = p_sale_id;
  update public.sales set status = 'completed', paid_total = greatest(paid_total, total), change_amount = v_change_amount,
    closed_by = v_employee_id, closed_at = now(), cancelled_by = null, cancelled_at = null, cancelled_reason = null
  where id = p_sale_id returning * into v_sale;
  if v_sale.reservation_id is not null then
    update public.reservations set status = 'completed', completed_at = now(), updated_by = v_employee_id where id = v_sale.reservation_id;
  end if;
  if v_sale.operation_kind = 'customer' then
    perform public.process_rewards_for_completed_sale(v_sale.id);
  end if;
  perform public.sync_pos_session_totals(v_sale.pos_session_id);
  insert into public.pos_session_events (pos_session_id, employee_id, event_type, message, metadata)
  values (v_sale.pos_session_id, v_employee_id, 'sale_completed', 'Venta completada.', jsonb_build_object('sale_id', v_sale.id, 'total', v_sale.total, 'customer_id', v_sale.customer_id, 'operation_kind', v_sale.operation_kind));
  return v_sale;
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;
revoke all on function public.resume_pos_session(uuid) from public, anon;
grant execute on function public.resume_pos_session(uuid) to authenticated, service_role;
revoke all on function public.complete_sale(uuid) from public;
grant execute on function public.complete_sale(uuid) to authenticated, service_role;
revoke all on function public.get_pos_session_closure_summary(uuid) from public;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
