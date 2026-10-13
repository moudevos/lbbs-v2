-- Historical total POS sale reversals. This migration is prospective and never
-- reopens a POS session, mutates its closing figures, deletes a sale, or changes
-- original payment rows.

create table public.sale_reversals (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  reversal_type text not null default 'historical_total' check (reversal_type = 'historical_total'),
  original_accounting_date date not null,
  reversal_accounting_date date not null,
  original_total numeric(12,2) not null check (original_total >= 0),
  reason_id uuid references public.sale_cancellation_reasons(id) on delete restrict,
  reason_snapshot text not null,
  notes text,
  status text not null default 'completed' check (status = 'completed'),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index sale_reversals_created_at_idx on public.sale_reversals(created_at desc);
alter table public.sale_reversals enable row level security;
create policy "sale_reversals_read_admin" on public.sale_reversals for select to authenticated using (public.is_admin());
revoke all on public.sale_reversals from public, anon, authenticated;
grant select on public.sale_reversals to authenticated;
grant all on public.sale_reversals to service_role;

create table public.sale_reversal_payments (
  id uuid primary key default gen_random_uuid(),
  sale_reversal_id uuid not null references public.sale_reversals(id) on delete restrict,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now()
);
alter table public.sale_reversal_payments enable row level security;
create policy "sale_reversal_payments_read_admin" on public.sale_reversal_payments for select to authenticated using (public.is_admin());
revoke all on public.sale_reversal_payments from public, anon, authenticated;
grant select on public.sale_reversal_payments to authenticated;
grant all on public.sale_reversal_payments to service_role;

alter table public.sale_document_snapshots drop constraint if exists sale_document_snapshots_document_type_check;
alter table public.sale_document_snapshots add constraint sale_document_snapshots_document_type_check
  check (document_type in ('internal_ticket','internal_credit_note'));

create or replace function public.get_historical_sale_reversal_preview(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sale public.sales%rowtype;
  v_session public.pos_sessions%rowtype;
  v_today date := public.pos_business_date();
  v_age integer;
  v_block text := null;
  v_reason text := null;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden revisar una reversa historica.'; end if;
  select * into v_sale from public.sales where id=p_sale_id;
  if not found then raise exception 'La venta no existe.'; end if;
  select * into v_session from public.pos_sessions where id=v_sale.pos_session_id;
  if not found then raise exception 'La sesion POS no existe.'; end if;
  v_age := v_today - v_sale.accounting_date;
  if v_sale.status <> 'completed' then v_block := 'SALE_NOT_COMPLETED'; v_reason := 'La venta no esta completada.';
  elsif v_session.status = 'open' then v_block := 'USE_POS_CANCELLATION'; v_reason := 'La sesion sigue abierta; usa la anulacion operacional del POS.';
  elsif v_session.status <> 'closed' then v_block := 'POS_SESSION_NOT_CLOSED'; v_reason := 'La sesion POS debe estar cerrada para una reversa historica.';
  elsif v_age < 0 or v_age > 15 then v_block := 'OUTSIDE_REVERSAL_WINDOW'; v_reason := 'La venta esta fuera de la ventana de 15 dias.';
  elsif exists(select 1 from public.sale_reversals where sale_id=v_sale.id) then v_block := 'ALREADY_REVERSED'; v_reason := 'La venta ya tiene una reversa historica.';
  elsif exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id join public.employee_service_production p on p.id=l.production_entry_id where p.sale_id=v_sale.id and s.status='paid') then v_block := 'SALE_INCLUDED_IN_PAID_SETTLEMENT'; v_reason := 'La venta esta incluida en una liquidacion pagada.';
  elsif exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id join public.employee_service_production p on p.id=l.production_entry_id where p.sale_id=v_sale.id and s.status in ('draft','review','approved')) then v_block := 'SALE_INCLUDED_IN_ACTIVE_SETTLEMENT'; v_reason := 'La venta esta incluida en una liquidacion activa.';
  elsif exists(select 1 from public.customer_reward_entitlements e join public.reward_redemptions r on r.entitlement_id=e.id join public.sales used_sale on used_sale.id=r.sale_id where e.source_ledger_id in (select id from public.customer_reward_ledger where sale_id=v_sale.id and movement_type='accrual') and r.status='applied' and used_sale.id<>v_sale.id and used_sale.status='completed') then v_block := 'REWARD_ALREADY_CONSUMED_BY_ANOTHER_SALE'; v_reason := 'Un Reward generado por esta venta fue usado en otra venta.';
  elsif exists(select 1 from public.internal_pos_operations op join public.employee_debts d on d.id=op.debt_id where op.sale_id=v_sale.id and (d.status <> 'pending' or d.outstanding_amount <> d.original_amount)) then v_block := 'INTERNAL_CREDIT_ALREADY_CHANGED'; v_reason := 'El credito interno asociado ya tuvo movimientos.';
  end if;
  return jsonb_build_object(
    'saleId',v_sale.id,'accountingDate',v_sale.accounting_date,'daysOld',v_age,
    'reversalDeadline',v_sale.accounting_date+15,'canReverse',v_block is null,
    'blockCode',v_block,'blockReason',v_reason,
    'impact',jsonb_build_object(
      'stockItems',(select count(*) from public.sale_items i join public.products p on p.id=i.product_id where i.sale_id=v_sale.id and i.item_type='product' and p.is_stockable),
      'stockQuantity',(select coalesce(sum(i.quantity),0) from public.sale_items i join public.products p on p.id=i.product_id where i.sale_id=v_sale.id and i.item_type='product' and p.is_stockable),
      'rewardAccruals',(select count(*) from public.customer_reward_ledger where sale_id=v_sale.id and movement_type='accrual')
    )
  );
end; $$;

-- This preserves the normal POS cancellation behavior. When a sale_reversal
-- exists, it creates linked financial counter-postings on the current business date.
create or replace function public.sync_sale_financial_postings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_item record;
  v_date date := coalesce(new.accounting_date,public.pos_business_date());
  v_posting record;
  v_reversal public.sale_reversals%rowtype;
begin
  if new.status='completed' and (tg_op='INSERT' or old.status<>'completed') then
    perform public.assert_financial_date_open(new.branch_id,v_date);
    for v_item in select * from public.sale_items where sale_id=new.id loop
      if not v_item.is_courtesy and v_item.total>0 then
        insert into public.financial_postings(accounting_date,branch_id,business_line,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,created_by)
        values(v_date,new.branch_id,coalesce(v_item.business_line_snapshot,case when v_item.item_type='service' then 'services' else 'other' end),'operating_income','income','sale_revenue',v_item.total,true,'sale_item',v_item.id,'Ingreso por venta: '||v_item.description_snapshot,new.closed_by)
        on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
      end if;
      if v_item.item_type='product' and coalesce(v_item.cost_snapshot,0)>0 then
        insert into public.financial_postings(accounting_date,branch_id,business_line,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,metadata,created_by)
        values(v_date,new.branch_id,coalesce(v_item.business_line_snapshot,'other'),'cost_of_sales','expense',case when v_item.is_courtesy then 'courtesy_actual_cost' else 'product_cost_of_sales' end,round(v_item.quantity*v_item.cost_snapshot,2),true,'sale_item',v_item.id,case when v_item.is_courtesy then 'Costo real de cortesia: ' else 'Costo de producto vendido: ' end||v_item.description_snapshot,jsonb_build_object('courtesyRetailValue',coalesce(v_item.courtesy_retail_value,0)),new.closed_by)
        on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
      end if;
    end loop;
  elsif old.status='completed' and new.status='cancelled' then
    select * into v_reversal from public.sale_reversals where sale_id=new.id;
    if found then
      perform public.assert_financial_date_open(new.branch_id,v_reversal.reversal_accounting_date);
      for v_posting in select posting.* from public.financial_postings posting join public.sale_items item on item.id=posting.source_id where item.sale_id=new.id and posting.source_type='sale_item' and posting.status='posted' loop
        insert into public.financial_postings(accounting_date,branch_id,payroll_period_id,business_line,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,reversal_of_id,description,metadata,created_by)
        values(v_reversal.reversal_accounting_date,v_posting.branch_id,v_posting.payroll_period_id,v_posting.business_line,v_posting.financial_group,case v_posting.effect_type when 'income' then 'expense' when 'expense' then 'income' when 'asset_increase' then 'asset_decrease' when 'asset_decrease' then 'asset_increase' when 'liability_increase' then 'liability_decrease' when 'liability_decrease' then 'liability_increase' when 'cash_in' then 'cash_out' when 'cash_out' then 'cash_in' else 'memo' end,v_posting.posting_code||'_historical_reversal',v_posting.amount,v_posting.affects_profit,'financial_posting_reversal',v_posting.id,v_posting.id,'Reversa historica: '||v_posting.description,jsonb_build_object('saleReversalId',v_reversal.id,'originalAccountingDate',v_posting.accounting_date),public.current_employee_id());
      end loop;
    else
      perform public.assert_financial_date_open(new.branch_id,public.pos_business_date());
      for v_posting in select posting.id from public.financial_postings posting join public.sale_items item on item.id=posting.source_id where item.sale_id=new.id and posting.source_type='sale_item' and posting.status='posted' loop
        perform public.reverse_financial_posting(v_posting.id,'SOURCE_CANCELLED',new.cancelled_reason);
      end loop;
    end if;
  end if;
  return new;
end; $$;

create or replace function public.reverse_completed_sale_historical(
  p_sale_id uuid,
  p_reason_id uuid,
  p_notes text default null,
  p_refunds jsonb default '[]'::jsonb
)
returns public.sale_reversals language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sale public.sales%rowtype;
  v_session public.pos_sessions%rowtype;
  v_reason public.sale_cancellation_reasons%rowtype;
  v_reversal public.sale_reversals%rowtype;
  v_actor uuid := public.current_employee_id();
  v_today date := public.pos_business_date();
  v_age integer;
  v_refund jsonb;
  v_refund_total numeric := 0;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden ejecutar una reversa historica.'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  select * into v_session from public.pos_sessions where id=v_sale.pos_session_id;
  if not found then raise exception 'La sesion POS no existe.'; end if;
  v_age := v_today-v_sale.accounting_date;
  if v_sale.status<>'completed' then raise exception 'SALE_NOT_COMPLETED: la venta no esta completada.'; end if;
  if v_session.status='open' then raise exception 'USE_POS_CANCELLATION: usa la anulacion operacional del POS mientras la sesion este abierta.'; end if;
  if v_session.status<>'closed' then raise exception 'POS_SESSION_NOT_CLOSED: la sesion POS debe estar cerrada.'; end if;
  if v_age<0 or v_age>15 then raise exception 'OUTSIDE_REVERSAL_WINDOW: la reversa historica solo esta disponible hasta 15 dias desde la fecha contable.'; end if;
  select * into v_reason from public.sale_cancellation_reasons where id=p_reason_id and is_active;
  if not found then raise exception 'El motivo de reversa no es valido.'; end if;
  if v_reason.code='otro' and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Describe el motivo de reversa.'; end if;
  if exists(select 1 from public.sale_reversals where sale_id=v_sale.id) then raise exception 'ALREADY_REVERSED: la venta ya fue revertida.'; end if;
  if exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id join public.employee_service_production p on p.id=l.production_entry_id where p.sale_id=v_sale.id and s.status='paid') then raise exception 'SALE_INCLUDED_IN_PAID_SETTLEMENT: esta venta esta incluida en una liquidacion pagada.'; end if;
  if exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id join public.employee_service_production p on p.id=l.production_entry_id where p.sale_id=v_sale.id and s.status in ('draft','review','approved')) then raise exception 'SALE_INCLUDED_IN_ACTIVE_SETTLEMENT: esta venta esta incluida en una liquidacion activa.'; end if;
  if exists(select 1 from public.customer_reward_entitlements e join public.reward_redemptions r on r.entitlement_id=e.id join public.sales used_sale on used_sale.id=r.sale_id where e.source_ledger_id in (select id from public.customer_reward_ledger where sale_id=v_sale.id and movement_type='accrual') and r.status='applied' and used_sale.id<>v_sale.id and used_sale.status='completed') then raise exception 'REWARD_ALREADY_CONSUMED_BY_ANOTHER_SALE: un Reward generado por esta venta ya fue usado.'; end if;
  if exists(select 1 from public.internal_pos_operations op join public.employee_debts d on d.id=op.debt_id where op.sale_id=v_sale.id and (d.status<>'pending' or d.outstanding_amount<>d.original_amount)) then raise exception 'INTERNAL_CREDIT_ALREADY_CHANGED: el credito interno asociado ya recibio movimientos.'; end if;
  if jsonb_typeof(p_refunds)<>'array' then raise exception 'Los reembolsos no son validos.'; end if;
  for v_refund in select value from jsonb_array_elements(p_refunds) loop
    if coalesce((v_refund->>'amount')::numeric,0)<=0 or not exists(select 1 from public.sale_payments payment join public.payment_methods method on method.id=payment.payment_method_id where payment.sale_id=v_sale.id and payment.payment_method_id=(v_refund->>'payment_method_id')::uuid and method.is_active and method.payment_kind<>'internal_credit') then raise exception 'El reembolso no es valido.'; end if;
    v_refund_total := v_refund_total + (v_refund->>'amount')::numeric;
  end loop;
  if v_refund_total>v_sale.total then raise exception 'El reembolso no puede superar el total original.'; end if;
  perform public.assert_financial_date_open(v_sale.branch_id,v_today);
  insert into public.sale_reversals(sale_id,original_accounting_date,reversal_accounting_date,original_total,reason_id,reason_snapshot,notes,created_by,metadata)
  values(v_sale.id,v_sale.accounting_date,v_today,v_sale.total,v_reason.id,v_reason.name,nullif(btrim(coalesce(p_notes,'')),''),v_actor,jsonb_build_object('non_fiscal',true,'refund_total',v_refund_total)) returning * into v_reversal;
  insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
  select i.product_id,v_sale.branch_id,'adjustment',i.quantity,coalesce(i.cost_snapshot,p.cost_price),'sale_historical_reversal',v_reversal.id,'Reversa historica de venta '||v_sale.id,v_actor from public.sale_items i join public.products p on p.id=i.product_id where i.sale_id=v_sale.id and i.item_type='product' and p.is_stockable;
  update public.sales set status='cancelled',cancelled_reason='Reversa historica: '||v_reason.name,cancelled_by=v_actor,cancelled_at=now(),cancellation_reason_id=v_reason.id,cancellation_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=v_sale.id;
  perform public.reverse_rewards_for_cancelled_sale(v_sale.id);
  for v_refund in select value from jsonb_array_elements(p_refunds) loop
    insert into public.sale_reversal_payments(sale_reversal_id,payment_method_id,amount,reference) values(v_reversal.id,(v_refund->>'payment_method_id')::uuid,(v_refund->>'amount')::numeric,nullif(btrim(coalesce(v_refund->>'reference','')),''));
  end loop;
  insert into public.sale_document_snapshots(sale_id,document_type,schema_version,payload,generated_by)
  values(v_sale.id,'internal_credit_note','1.0',jsonb_build_object('document_type','internal_credit_note','non_fiscal',true,'reversal_id',v_reversal.id,'sale_id',v_sale.id,'original_accounting_date',v_sale.accounting_date,'reversal_accounting_date',v_today,'original_total',v_sale.total,'reason',v_reason.name,'notes',p_notes,'internal_number','REV-'||to_char(v_today,'YYYYMMDD')||'-'||replace(v_reversal.id::text,'-','')),v_actor);
  insert into public.pos_session_events(pos_session_id,employee_id,event_type,message,metadata)
  values(v_sale.pos_session_id,v_actor,'note','Venta revertida historicamente.',jsonb_build_object('sale_id',v_sale.id,'reversal_id',v_reversal.id,'reason',v_reason.name,'reversal_accounting_date',v_today));
  return v_reversal;
end; $$;

revoke all on function public.get_historical_sale_reversal_preview(uuid),public.reverse_completed_sale_historical(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.get_historical_sale_reversal_preview(uuid),public.reverse_completed_sale_historical(uuid,uuid,text,jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
