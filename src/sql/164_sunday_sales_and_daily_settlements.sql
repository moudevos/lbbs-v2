-- Registro manual y liquidación diaria de jornadas dominicales.
-- Ejecutar después de 163_employee_supply_effective_status.sql.

create table if not exists public.sunday_sales_settings (
  id boolean primary key default true check (id),
  default_commission_rate numeric(7,4) not null default 60 check (default_commission_rate between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);
insert into public.sunday_sales_settings (id, default_commission_rate) values (true, 60) on conflict (id) do nothing;

create table if not exists public.sunday_sales_days (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  business_date date not null check (extract(isodow from business_date) = 7),
  commission_rate numeric(7,4) not null check (commission_rate between 0 and 100),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_by uuid references public.employees(id) on delete set null,
  closed_at timestamptz,
  unique (branch_id, business_date)
);

create table if not exists public.sunday_sales (
  id uuid primary key default gen_random_uuid(),
  sunday_day_id uuid not null references public.sunday_sales_days(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  barber_id uuid not null references public.employees(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  courtesy_total numeric(12,2) not null default 0 check (courtesy_total >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  paid_total numeric(12,2) not null default 0 check (paid_total >= 0),
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.employees(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text
);

create table if not exists public.sunday_sale_items (
  id uuid primary key default gen_random_uuid(),
  sunday_sale_id uuid not null references public.sunday_sales(id) on delete cascade,
  item_type text not null check (item_type in ('service', 'product')),
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  description_snapshot text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(12,2) not null check (total >= 0),
  cost_snapshot numeric(12,2),
  is_courtesy boolean not null default false,
  courtesy_reason text,
  operational_contribution_amount numeric(12,2) not null default 0 check (operational_contribution_amount >= 0),
  commissionable_amount numeric(12,2) not null default 0 check (commissionable_amount >= 0),
  created_at timestamptz not null default now(),
  check ((item_type = 'service') = (service_id is not null)),
  check ((item_type = 'product') = (product_id is not null)),
  check ((not is_courtesy) or item_type = 'product')
);

create table if not exists public.sunday_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sunday_sale_id uuid not null references public.sunday_sales(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.sunday_barber_settlements (
  id uuid primary key default gen_random_uuid(),
  sunday_day_id uuid not null references public.sunday_sales_days(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'paid', 'cancelled')),
  commission_rate numeric(7,4) not null check (commission_rate between 0 and 100),
  service_gross_total numeric(12,2) not null default 0,
  operational_contribution_total numeric(12,2) not null default 0,
  commissionable_base_total numeric(12,2) not null default 0,
  payout_amount numeric(12,2) not null default 0,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_by uuid references public.employees(id) on delete set null,
  paid_at timestamptz,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_reference text,
  notes text,
  unique (sunday_day_id, employee_id)
);

alter table public.customer_reward_ledger
  add column if not exists sunday_sale_id uuid references public.sunday_sales(id) on delete set null;
create unique index if not exists customer_reward_ledger_sunday_metric_unique
  on public.customer_reward_ledger(sunday_sale_id, metric_type, coalesce(metadata ->> 'service_id', ''))
  where sunday_sale_id is not null and movement_type = 'accrual';

create index if not exists sunday_sales_days_history_idx on public.sunday_sales_days(business_date desc, branch_id);
create index if not exists sunday_sales_day_barber_idx on public.sunday_sales(sunday_day_id, barber_id) where status = 'completed';
create index if not exists sunday_sale_items_sale_idx on public.sunday_sale_items(sunday_sale_id);

alter table public.sunday_sales_settings enable row level security;
alter table public.sunday_sales_days enable row level security;
alter table public.sunday_sales enable row level security;
alter table public.sunday_sale_items enable row level security;
alter table public.sunday_sale_payments enable row level security;
alter table public.sunday_barber_settlements enable row level security;

create or replace function public.can_manage_sunday_sales_branch(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id));
$$;

drop policy if exists "sunday_sales_settings_read" on public.sunday_sales_settings;
create policy "sunday_sales_settings_read" on public.sunday_sales_settings for select to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');
drop policy if exists "sunday_days_read" on public.sunday_sales_days;
create policy "sunday_days_read" on public.sunday_sales_days for select to authenticated
using (public.can_manage_sunday_sales_branch(branch_id));
drop policy if exists "sunday_sales_read" on public.sunday_sales;
create policy "sunday_sales_read" on public.sunday_sales for select to authenticated
using (public.can_manage_sunday_sales_branch(branch_id));
drop policy if exists "sunday_items_read" on public.sunday_sale_items;
create policy "sunday_items_read" on public.sunday_sale_items for select to authenticated
using (exists(select 1 from public.sunday_sales sale where sale.id=sunday_sale_id and public.can_manage_sunday_sales_branch(sale.branch_id)));
drop policy if exists "sunday_payments_read" on public.sunday_sale_payments;
create policy "sunday_payments_read" on public.sunday_sale_payments for select to authenticated
using (exists(select 1 from public.sunday_sales sale where sale.id=sunday_sale_id and public.can_manage_sunday_sales_branch(sale.branch_id)));
drop policy if exists "sunday_settlements_read" on public.sunday_barber_settlements;
create policy "sunday_settlements_read" on public.sunday_barber_settlements for select to authenticated
using (public.can_manage_sunday_sales_branch(branch_id));

create or replace function public.open_sunday_sales_day(p_branch_id uuid, p_business_date date)
returns public.sunday_sales_days language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day public.sunday_sales_days%rowtype; v_actor uuid := public.current_employee_id(); v_rate numeric(7,4);
begin
  if not public.can_manage_sunday_sales_branch(p_branch_id) then raise exception 'No tienes permisos para gestionar domingos en esta sede.'; end if;
  if p_business_date is null or extract(isodow from p_business_date) <> 7 then raise exception 'La jornada debe corresponder a un domingo.'; end if;
  select default_commission_rate into v_rate from public.sunday_sales_settings where id = true;
  insert into public.sunday_sales_days(branch_id,business_date,commission_rate,created_by)
  values(p_branch_id,p_business_date,coalesce(v_rate,60),v_actor)
  on conflict(branch_id,business_date) do update set branch_id = excluded.branch_id
  returning * into v_day;
  return v_day;
end; $$;

create or replace function public.set_sunday_sales_day_commission_rate(p_day_id uuid, p_commission_rate numeric)
returns public.sunday_sales_days language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day public.sunday_sales_days%rowtype;
begin
  select * into v_day from public.sunday_sales_days where id=p_day_id for update;
  if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para esta jornada dominical.'; end if;
  if v_day.status<>'open' then raise exception 'No se puede cambiar una jornada cerrada.'; end if;
  if exists(select 1 from public.sunday_barber_settlements where sunday_day_id=p_day_id and status='paid') then raise exception 'No se puede cambiar el porcentaje después de pagar una liquidación.'; end if;
  if coalesce(p_commission_rate,-1)<0 or p_commission_rate>100 then raise exception 'El porcentaje debe estar entre 0 y 100.'; end if;
  update public.sunday_sales_days set commission_rate=round(p_commission_rate,4) where id=p_day_id returning * into v_day;
  return v_day;
end; $$;

create or replace function public.register_sunday_sale(p_day_id uuid,p_customer_id uuid,p_barber_id uuid,p_items jsonb,p_payments jsonb,p_notes text default null)
returns public.sunday_sales language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day public.sunday_sales_days%rowtype; v_sale public.sunday_sales%rowtype; v_actor uuid:=public.current_employee_id();
  v_item jsonb; v_payment jsonb; v_service public.services%rowtype; v_product public.products%rowtype;
  v_quantity numeric(12,2); v_unit numeric(12,2); v_total numeric(12,2); v_subtotal numeric(12,2):=0; v_courtesy numeric(12,2):=0; v_paid numeric(12,2):=0; v_contribution numeric(12,2);
begin
  select * into v_day from public.sunday_sales_days where id=p_day_id for update;
  if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para esta jornada dominical.'; end if;
  if v_day.status <> 'open' then raise exception 'La jornada dominical ya está cerrada.'; end if;
  if exists(select 1 from public.sunday_barber_settlements where sunday_day_id=p_day_id and status='paid') then raise exception 'No puedes registrar más ventas después de pagar una liquidación dominical.'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and is_active) then raise exception 'Selecciona un cliente activo.'; end if;
  if not exists(select 1 from public.employees where id=p_barber_id and branch_id=v_day.branch_id and status='active') then raise exception 'Selecciona un barbero activo de esta sede.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Registra al menos un servicio o producto.'; end if;
  insert into public.sunday_sales(sunday_day_id,branch_id,customer_id,barber_id,notes,created_by) values(p_day_id,v_day.branch_id,p_customer_id,p_barber_id,nullif(btrim(coalesce(p_notes,'')),''),v_actor) returning * into v_sale;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity:=round(coalesce((v_item->>'quantity')::numeric,0),2); if v_quantity<=0 then raise exception 'Cada ítem necesita una cantidad válida.'; end if;
    if v_item->>'item_type'='service' then
      select * into v_service from public.services where id=(v_item->>'service_id')::uuid and is_active; if not found then raise exception 'Uno de los servicios no está disponible.'; end if;
      v_unit:=round(v_service.base_price,2); v_total:=round(v_unit*v_quantity,2);
      v_contribution:=case when public.is_operational_contribution_service_excluded(v_service.id, v_day.business_date::timestamptz) then 0 else least(v_total,round(v_quantity*public.calculate_operational_contribution(v_unit,v_day.business_date),2)) end;
      insert into public.sunday_sale_items(sunday_sale_id,item_type,service_id,description_snapshot,quantity,unit_price,total,operational_contribution_amount,commissionable_amount)
      values(v_sale.id,'service',v_service.id,v_service.name,v_quantity,v_unit,v_total,v_contribution,greatest(v_total-v_contribution,0)); v_subtotal:=v_subtotal+v_total;
    elsif v_item->>'item_type'='product' then
      select * into v_product from public.products where id=(v_item->>'product_id')::uuid and is_active; if not found then raise exception 'Uno de los productos no está disponible.'; end if;
      if coalesce((v_item->>'is_courtesy')::boolean,false) and not v_product.is_courtesy_allowed then raise exception 'El producto % no está habilitado para cortesía.', v_product.name; end if;
      if v_product.is_stockable and coalesce((select stock_quantity from public.vw_product_stock where product_id=v_product.id and branch_id=v_day.branch_id),0)<v_quantity then raise exception 'Stock insuficiente para %.',v_product.name; end if;
      v_unit:=round(v_product.base_sale_price,2); v_total:=case when coalesce((v_item->>'is_courtesy')::boolean,false) then 0 else round(v_unit*v_quantity,2) end;
      insert into public.sunday_sale_items(sunday_sale_id,item_type,product_id,description_snapshot,quantity,unit_price,total,cost_snapshot,is_courtesy,courtesy_reason)
      values(v_sale.id,'product',v_product.id,v_product.name,v_quantity,v_unit,v_total,v_product.cost_price,coalesce((v_item->>'is_courtesy')::boolean,false),nullif(btrim(coalesce(v_item->>'courtesy_reason','')),''));
      v_subtotal:=v_subtotal+v_unit*v_quantity; if coalesce((v_item->>'is_courtesy')::boolean,false) then v_courtesy:=v_courtesy+v_unit*v_quantity; end if;
    else raise exception 'Tipo de ítem no válido.'; end if;
  end loop;
  if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'Registra el pago de la venta.'; end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_total:=round(coalesce((v_payment->>'amount')::numeric,0),2); if v_total<=0 then raise exception 'Cada pago debe ser mayor a cero.'; end if;
    if not exists(select 1 from public.payment_methods where id=(v_payment->>'payment_method_id')::uuid and is_active and payment_kind<>'internal_credit') then raise exception 'El método de pago no está disponible.'; end if;
    insert into public.sunday_sale_payments(sunday_sale_id,payment_method_id,amount,reference) values(v_sale.id,(v_payment->>'payment_method_id')::uuid,v_total,nullif(btrim(coalesce(v_payment->>'reference','')),'')); v_paid:=v_paid+v_total;
  end loop;
  if round(v_paid,2)<>round(v_subtotal-v_courtesy,2) then raise exception 'El monto pagado no cubre el total de la venta.'; end if;
  insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
  select product_id,v_day.branch_id,case when is_courtesy then 'courtesy' else 'sale' end,quantity*-1,coalesce(cost_snapshot,0),'sunday_sale',v_sale.id,case when is_courtesy then 'Cortesía de venta dominical.' else 'Venta dominical.' end,v_actor from public.sunday_sale_items where sunday_sale_id=v_sale.id and item_type='product' and product_id in(select id from public.products where is_stockable);
  update public.sunday_sales set subtotal=round(v_subtotal,2),courtesy_total=round(v_courtesy,2),total=round(v_subtotal-v_courtesy,2),paid_total=round(v_paid,2) where id=v_sale.id returning * into v_sale;
  if public.is_rewards_customer_eligible(p_customer_id) then
    insert into public.customer_reward_ledger(customer_id,sunday_sale_id,movement_type,metric_type,quantity,amount,description,metadata,created_by)
    values(p_customer_id,v_sale.id,'accrual','sale_count',1,0,'Acumulación por venta dominical.',jsonb_build_object('sunday_day_id',p_day_id),v_actor),
      (p_customer_id,v_sale.id,'accrual','amount_spent',0,v_sale.total,'Acumulación por monto dominical.',jsonb_build_object('sunday_day_id',p_day_id),v_actor);
    if exists(select 1 from public.sunday_sale_items where sunday_sale_id=v_sale.id and item_type='service') then
      insert into public.customer_reward_ledger(customer_id,sunday_sale_id,movement_type,metric_type,quantity,amount,description,metadata,created_by) values(p_customer_id,v_sale.id,'accrual','service_visit_count',1,0,'Acumulación por atención dominical.',jsonb_build_object('sunday_day_id',p_day_id),v_actor);
      insert into public.customer_reward_ledger(customer_id,sunday_sale_id,movement_type,metric_type,quantity,amount,description,metadata,created_by)
      select p_customer_id,v_sale.id,'accrual','specific_service_count',sum(item.quantity),0,'Acumulación por servicio específico.',jsonb_build_object('service_id',item.service_id,'sunday_day_id',p_day_id),v_actor
      from public.sunday_sale_items item where item.sunday_sale_id=v_sale.id and item.item_type='service' group by item.service_id;
    end if;
    if exists(select 1 from public.sunday_sale_items where sunday_sale_id=v_sale.id and item_type='product' and not is_courtesy) then insert into public.customer_reward_ledger(customer_id,sunday_sale_id,movement_type,metric_type,quantity,amount,description,metadata,created_by) values(p_customer_id,v_sale.id,'accrual','product_purchase_count',1,0,'Acumulación por compra dominical.',jsonb_build_object('sunday_day_id',p_day_id),v_actor); end if;
    perform public.recalculate_customer_rewards(p_customer_id);
  end if;
  return v_sale;
end; $$;

create or replace function public.prepare_sunday_settlements(p_day_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day public.sunday_sales_days%rowtype; v_row record; v_actor uuid:=public.current_employee_id(); v_count integer:=0;
begin
 select * into v_day from public.sunday_sales_days where id=p_day_id for update; if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para esta jornada dominical.'; end if; if v_day.status<>'open' then raise exception 'La jornada ya está cerrada.'; end if;
 for v_row in select sale.barber_id,round(sum(item.quantity*item.unit_price) filter(where item.item_type='service'),2) gross,round(sum(item.operational_contribution_amount),2) contribution,round(sum(item.commissionable_amount),2) base from public.sunday_sales sale join public.sunday_sale_items item on item.sunday_sale_id=sale.id where sale.sunday_day_id=p_day_id and sale.status='completed' group by sale.barber_id loop
  insert into public.sunday_barber_settlements(sunday_day_id,employee_id,branch_id,commission_rate,service_gross_total,operational_contribution_total,commissionable_base_total,payout_amount,created_by) values(p_day_id,v_row.barber_id,v_day.branch_id,v_day.commission_rate,v_row.gross,v_row.contribution,v_row.base,round(v_row.base*v_day.commission_rate/100,2),v_actor) on conflict(sunday_day_id,employee_id) do update set commission_rate=excluded.commission_rate,service_gross_total=excluded.service_gross_total,operational_contribution_total=excluded.operational_contribution_total,commissionable_base_total=excluded.commissionable_base_total,payout_amount=excluded.payout_amount where sunday_barber_settlements.status='draft'; v_count:=v_count+1;
 end loop; return v_count;
end; $$;

create or replace function public.pay_sunday_settlement(p_settlement_id uuid,p_payment_method_id uuid,p_reference text default null,p_notes text default null)
returns public.sunday_barber_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.sunday_barber_settlements%rowtype; v_day public.sunday_sales_days%rowtype; v_actor uuid:=public.current_employee_id();
begin
 select * into v_settlement from public.sunday_barber_settlements where id=p_settlement_id for update; select * into v_day from public.sunday_sales_days where id=v_settlement.sunday_day_id for update; if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para pagar esta liquidación.'; end if; if v_settlement.status<>'draft' then raise exception 'Solo una liquidación pendiente puede pagarse.'; end if; if not exists(select 1 from public.payment_methods where id=p_payment_method_id and is_active and payment_kind<>'internal_credit') then raise exception 'Selecciona un método de pago activo.'; end if;
 update public.sunday_barber_settlements set status='paid',paid_by=v_actor,paid_at=now(),payment_method_id=p_payment_method_id,payment_reference=nullif(btrim(coalesce(p_reference,'')),''),notes=nullif(btrim(coalesce(p_notes,'')),'') where id=v_settlement.id returning * into v_settlement; return v_settlement;
end; $$;

create or replace function public.close_sunday_sales_day(p_day_id uuid,p_notes text default null)
returns public.sunday_sales_days language plpgsql security definer set search_path=public,pg_temp as $$
declare v_day public.sunday_sales_days%rowtype; v_actor uuid:=public.current_employee_id();
begin select * into v_day from public.sunday_sales_days where id=p_day_id for update; if not found or not public.can_manage_sunday_sales_branch(v_day.branch_id) then raise exception 'No tienes permisos para cerrar esta jornada.'; end if; if exists(select 1 from public.sunday_barber_settlements where sunday_day_id=p_day_id and status='draft') then raise exception 'Paga todas las liquidaciones antes de cerrar la jornada.'; end if; update public.sunday_sales_days set status='closed',notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),closed_by=v_actor,closed_at=now() where id=p_day_id returning * into v_day; return v_day; end; $$;

create or replace function public.guard_weekend_reward_redemption() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_date date;
begin select accounting_date into v_date from public.sales where id=new.sale_id; if v_date is not null and extract(isodow from v_date) in (6,7) then raise exception 'Los Rewards no se pueden canjear sábados ni domingos.'; end if; return new; end; $$;
drop trigger if exists reward_redemptions_weekend_guard on public.reward_redemptions;
create trigger reward_redemptions_weekend_guard before insert or update of sale_id on public.reward_redemptions for each row execute function public.guard_weekend_reward_redemption();

revoke all on public.sunday_sales_settings,public.sunday_sales_days,public.sunday_sales,public.sunday_sale_items,public.sunday_sale_payments,public.sunday_barber_settlements from public,anon;
grant select on public.sunday_sales_settings,public.sunday_sales_days,public.sunday_sales,public.sunday_sale_items,public.sunday_sale_payments,public.sunday_barber_settlements to authenticated;
revoke all on function public.can_manage_sunday_sales_branch(uuid),public.open_sunday_sales_day(uuid,date),public.register_sunday_sale(uuid,uuid,uuid,jsonb,jsonb,text),public.prepare_sunday_settlements(uuid),public.pay_sunday_settlement(uuid,uuid,text,text),public.close_sunday_sales_day(uuid,text),public.guard_weekend_reward_redemption() from public,anon;
revoke all on function public.set_sunday_sales_day_commission_rate(uuid,numeric) from public,anon;
grant execute on function public.open_sunday_sales_day(uuid,date),public.set_sunday_sales_day_commission_rate(uuid,numeric),public.register_sunday_sale(uuid,uuid,uuid,jsonb,jsonb,text),public.prepare_sunday_settlements(uuid),public.pay_sunday_settlement(uuid,uuid,text,text),public.close_sunday_sales_day(uuid,text) to authenticated,service_role;
grant execute on function public.can_manage_sunday_sales_branch(uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
