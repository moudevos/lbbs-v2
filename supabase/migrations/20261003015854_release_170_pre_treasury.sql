-- ============================================================
-- LBBS RELEASE 170
-- PRE-TREASURY RELEASE
-- Base requerida: producción hasta versión 169
--
-- Incluye:
-- Phase 0
-- Phase 1A
-- Phase 1B
-- Liquidaciones final
-- POS flujo de efectivo
-- Cash Movement Applications B1
-- Loan Interest Snapshot B1.1
-- Cortesías final
--
-- Tesorería incluida únicamente por dependencia funcional de Phase 0/1A/1B.
--
-- Ejecutar UNA SOLA VEZ manualmente mediante Supabase SQL Editor.
-- ============================================================
--
-- Incluye la base de Tesorería 171–173 porque los bloques posteriores la requieren.
-- Excluye scripts operativos de desarrollo y QA.
-- ============================================================
-- BLOQUE: Financial analysis
-- Origen: src/sql/170_financial_analysis_v2.sql
-- ============================================================
-- Capa analitica financiera V2. Es solo lectura: no modifica ventas, caja,
-- inventario, deudas ni liquidaciones historicas.
create or replace function public.get_financial_analysis_v2(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sales jsonb; v_costs jsonb; v_personnel jsonb; v_expenses jsonb;
  v_debts jsonb; v_cashflow jsonb; v_reconciliation jsonb;
  v_net_sales numeric := 0; v_direct_costs numeric := 0; v_personnel_cost numeric := 0;
  v_operating_expenses numeric := 0; v_profit numeric := 0;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'El rango de fechas no es valido.';
  end if;
  if not public.is_admin() then raise exception 'Solo owner o admin pueden ver el analisis financiero V2.'; end if;

  with completed as (
    select s.* from public.sales s left join public.pos_sessions ps on ps.id=s.pos_session_id
    where s.status='completed' and s.accounting_date between p_date_from and p_date_to
      and (p_branch_id is null or s.branch_id=p_branch_id) and (s.pos_session_id is null or ps.status='closed')
  ), lines as (select si.*, s.operation_kind from completed s join public.sale_items si on si.sale_id=s.id)
  select jsonb_build_object(
    'commercialRetailGross',coalesce(sum(case when operation_kind='customer' then original_total else 0 end),0),
    'commercialDiscounts',coalesce(sum(case when operation_kind='customer' then discount_amount else 0 end),0),
    'rewardDiscounts',coalesce(sum(case when operation_kind='customer' and exists(select 1 from public.reward_redemptions rr where rr.sale_id=lines.sale_id and rr.status='applied') then discount_amount else 0 end),0),
    'courtesyRetailValue',coalesce(sum(case when is_courtesy then original_total else 0 end),0),
    'employeeCreditSales',coalesce(sum(case when operation_kind='employee_credit' then total else 0 end),0),
    'employeeBenefitRetailValue',coalesce(sum(case when operation_kind='employee_benefit' then original_total else 0 end),0),
    'internalComplimentaryRetailValue',coalesce(sum(case when operation_kind='internal_complimentary' then original_total else 0 end),0),
    'netCommercialSales',coalesce(sum(case when operation_kind='customer' then total else 0 end),0),
    'cancelledSales', (select coalesce(sum(total),0) from public.sales where status='cancelled' and accounting_date between p_date_from and p_date_to and (p_branch_id is null or branch_id=p_branch_id))
  ) into v_sales from lines;
  v_net_sales := coalesce((v_sales->>'netCommercialSales')::numeric,0);

  with completed as (select s.id from public.sales s left join public.pos_sessions ps on ps.id=s.pos_session_id where s.status='completed' and s.accounting_date between p_date_from and p_date_to and (p_branch_id is null or s.branch_id=p_branch_id) and (s.pos_session_id is null or ps.status='closed'))
  select jsonb_build_object('productCogs',coalesce(sum(case when not si.is_courtesy then si.quantity*coalesce(si.cost_snapshot,0) else 0 end),0),'courtesyProductRealCost',coalesce(sum(case when si.is_courtesy then si.quantity*coalesce(si.cost_snapshot,0) else 0 end),0),'zeroCostProductLines',count(*) filter(where si.item_type='product' and coalesce(si.cost_snapshot,0)<=0),'zeroCostProductQuantity',coalesce(sum(si.quantity) filter(where si.item_type='product' and coalesce(si.cost_snapshot,0)<=0),0),'zeroCostProductRetailValue',coalesce(sum(si.original_total) filter(where si.item_type='product' and coalesce(si.cost_snapshot,0)<=0),0)) into v_costs from public.sale_items si join completed c on c.id=si.sale_id where si.item_type='product';
  v_direct_costs := coalesce((v_costs->>'productCogs')::numeric,0)+coalesce((v_costs->>'courtesyProductRealCost')::numeric,0);

  select jsonb_build_object('grossCompensation',coalesce(sum(gross_pay_amount),0),'mandatoryDiscount',coalesce(sum(mandatory_discount_amount),0),'otherDeductions',coalesce(sum(other_deduction_total),0),'debtRecoveredFromSettlement',coalesce(sum(debt_deduction_total),0),'netPaid',coalesce(sum(net_pay_amount) filter(where status='paid'),0),'paidAmount',coalesce(sum(net_pay_amount) filter(where status='paid'),0),'recognizedPersonnelCost',coalesce(sum(gross_pay_amount+manual_bonus_total-mandatory_discount_amount-other_deduction_total),0)) into v_personnel from public.employee_settlements es join public.payroll_periods pp on pp.id=es.payroll_period_id where es.status in ('review','approved','paid') and pp.end_date>=p_date_from and pp.start_date<=p_date_to and (p_branch_id is null or es.branch_id=p_branch_id);
  v_personnel_cost := coalesce((v_personnel->>'recognizedPersonnelCost')::numeric,0);

  select jsonb_build_object('operatingExpenses',coalesce(sum(case when f.direction='expense' and c.financial_group='operating_expense' then f.amount else 0 end),0),'ownerContributions',coalesce(sum(case when c.code='owner_contribution' then f.amount else 0 end),0),'ownerWithdrawals',coalesce(sum(case when c.code='owner_withdrawal' then f.amount else 0 end),0),'inventoryPurchases',coalesce(sum(case when c.code='inventory_purchase' then f.amount else 0 end),0)) into v_expenses from public.finance_manual_entries f join public.finance_categories c on c.id=f.category_id where f.status='active' and f.entry_date between p_date_from and p_date_to and (p_branch_id is null or f.branch_id=p_branch_id);
  v_operating_expenses:=coalesce((v_expenses->>'operatingExpenses')::numeric,0);
  v_profit:=v_net_sales-v_direct_costs-v_personnel_cost-v_operating_expenses;

  select jsonb_build_object('debtCharges',coalesce(sum(original_amount) filter(where created_at::date between p_date_from and p_date_to),0),'debtOutstanding',coalesce(sum(outstanding_amount) filter(where status in ('pending','partial')),0),'debtWriteoffs',coalesce(sum(original_amount) filter(where status='written_off' and settled_at::date between p_date_from and p_date_to),0),'debtCancellations',coalesce(sum(original_amount) filter(where status='cancelled' and settled_at::date between p_date_from and p_date_to),0)) into v_debts from public.employee_debts where (p_branch_id is null or branch_id=p_branch_id);
  select jsonb_build_object('recordedInflows',coalesce(sum(sp.amount),0),'settlementCashOutflow',coalesce((v_personnel->>'netPaid')::numeric,0),'ownerContributions',coalesce((v_expenses->>'ownerContributions')::numeric,0),'ownerWithdrawals',coalesce((v_expenses->>'ownerWithdrawals')::numeric,0),'netRecordedFlow',coalesce(sum(sp.amount),0)+coalesce((v_expenses->>'ownerContributions')::numeric,0)-coalesce((v_personnel->>'netPaid')::numeric,0)-coalesce((v_expenses->>'ownerWithdrawals')::numeric,0)) into v_cashflow from public.sale_payments sp join public.sales s on s.id=sp.sale_id left join public.pos_sessions ps on ps.id=s.pos_session_id where s.status='completed' and s.accounting_date between p_date_from and p_date_to and (p_branch_id is null or s.branch_id=p_branch_id) and (s.pos_session_id is null or ps.status='closed');
  select jsonb_build_object('unpostedOpenSessionSales',(select count(*) from public.sales s join public.pos_sessions ps on ps.id=s.pos_session_id where s.status='completed' and ps.status='open' and s.accounting_date between p_date_from and p_date_to and (p_branch_id is null or s.branch_id=p_branch_id)),'unreconciledProductionCount',(select count(*) from public.employee_service_production p where p.status='active' and p.accounting_date between p_date_from and p_date_to and (p_branch_id is null or p.branch_id=p_branch_id) and not exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements e on e.id=l.settlement_id where l.production_entry_id=p.id and e.status in ('review','approved','paid'))),'zeroCostProductLines',coalesce((v_costs->>'zeroCostProductLines')::numeric,0)) into v_reconciliation;
  return jsonb_build_object('period',jsonb_build_object('from',p_date_from,'to',p_date_to,'branchId',p_branch_id),'sales',v_sales,'directCosts',v_costs,'personnel',v_personnel,'expenses',v_expenses,'debts',v_debts,'cashflow',v_cashflow,'profit',jsonb_build_object('operatingProfit',v_profit,'operatingMarginPercentage',case when v_net_sales=0 then null else round(v_profit/v_net_sales*100,2) end,'status',case when coalesce((v_reconciliation->>'unreconciledProductionCount')::int,0)>0 then 'provisional' else 'final' end),'reconciliation',v_reconciliation);
end; $$;
revoke all on function public.get_financial_analysis_v2(date,date,uuid) from public, anon;
grant execute on function public.get_financial_analysis_v2(date,date,uuid) to authenticated, service_role;
notify pgrst, 'reload schema';


-- ============================================================
-- BLOQUE: Treasury and partial settlement payments
-- Origen: src/sql/171_treasury_and_partial_settlement_payments.sql
-- ============================================================
-- Fase 2 financiera: tesoreria independiente de caja POS. No migra ni altera
-- pagos historicos; las nuevas operaciones usan estas tablas.
create table if not exists public.treasury_accounts (
 id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id) on delete restrict,
 code text not null unique, name text not null, account_type text not null check(account_type in('bank','digital_wallet','payment_processor','other')),
 institution_name text, currency text not null default 'PEN', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.employees(id) on delete set null
);
create table if not exists public.employee_payout_methods (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete restrict,
 payment_method_id uuid not null references public.payment_methods(id) on delete restrict, label text, destination_reference text,
 is_default boolean not null default false, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references public.employees(id) on delete set null
);
create unique index if not exists employee_payout_methods_default_uidx on public.employee_payout_methods(employee_id) where is_default and is_active;
create table if not exists public.employee_settlement_payments (
 id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
 employee_id uuid not null references public.employees(id) on delete restrict, treasury_account_id uuid not null references public.treasury_accounts(id) on delete restrict,
 payment_method_id uuid not null references public.payment_methods(id) on delete restrict, employee_payout_method_id uuid references public.employee_payout_methods(id) on delete set null,
 amount numeric(12,2) not null check(amount>0), paid_at timestamptz not null default now(), reference text, status text not null default 'posted' check(status in('posted','voided')),
 created_by uuid references public.employees(id) on delete set null, created_at timestamptz not null default now(), voided_at timestamptz, voided_by uuid references public.employees(id) on delete set null, void_reason text
);
create table if not exists public.treasury_movements (
 id uuid primary key default gen_random_uuid(), treasury_account_id uuid not null references public.treasury_accounts(id) on delete restrict, branch_id uuid references public.branches(id) on delete restrict,
 movement_date date not null, direction text not null check(direction in('in','out')), movement_type text not null check(movement_type in('employee_settlement_payment','employee_debt_collection','owner_contribution','owner_withdrawal','operating_expense','inventory_purchase','sale_collection','transfer_between_accounts','other_income','other_outflow')),
 amount numeric(12,2) not null check(amount>0), currency text not null default 'PEN', payment_method_id uuid references public.payment_methods(id) on delete set null,
 source_type text not null, source_id uuid not null, description text not null, reference text, status text not null default 'posted' check(status in('posted','voided')),
 created_by uuid references public.employees(id) on delete set null, created_at timestamptz not null default now(), reversed_at timestamptz, reversed_by uuid references public.employees(id) on delete set null, reversal_reason text
);
create unique index if not exists treasury_movements_source_posted_uidx on public.treasury_movements(source_type,source_id) where status='posted';
create index if not exists treasury_movements_account_date_idx on public.treasury_movements(treasury_account_id,movement_date) where status='posted';

create or replace function public.record_employee_settlement_payment(p_settlement_id uuid,p_treasury_account_id uuid,p_payment_method_id uuid,p_amount numeric,p_employee_payout_method_id uuid default null,p_reference text default null,p_notes text default null)
returns public.employee_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.employee_settlements%rowtype; v_employee uuid:=public.current_employee_id(); v_paid numeric:=0; v_remaining numeric:=0; v_payment_id uuid; v_d record;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin pueden registrar pagos de liquidaciones.'; end if;
 select * into v_settlement from public.employee_settlements where id=p_settlement_id for update;
 if not found or v_settlement.status not in('approved','paid') then raise exception 'La liquidacion debe estar aprobada antes de pagar.'; end if;
 if not exists(select 1 from public.treasury_accounts where id=p_treasury_account_id and is_active) then raise exception 'La cuenta de tesoreria no esta disponible.'; end if;
 if not exists(select 1 from public.payment_methods where id=p_payment_method_id and is_active and payment_kind<>'internal_credit') then raise exception 'El metodo de pago no esta disponible.'; end if;
 select coalesce(sum(amount) filter(where status='posted'),0) into v_paid from public.employee_settlement_payments where settlement_id=p_settlement_id;
 v_remaining:=round(v_settlement.net_pay_amount-v_paid,2); if p_amount<=0 or round(p_amount,2)>v_remaining then raise exception 'El monto supera el saldo pendiente de la liquidacion.'; end if;
 insert into public.employee_settlement_payments(settlement_id,employee_id,treasury_account_id,payment_method_id,employee_payout_method_id,amount,reference,created_by) values(p_settlement_id,v_settlement.employee_id,p_treasury_account_id,p_payment_method_id,p_employee_payout_method_id,round(p_amount,2),nullif(btrim(coalesce(p_reference,'')),''),v_employee) returning id into v_payment_id;
 insert into public.treasury_movements(treasury_account_id,branch_id,movement_date,direction,movement_type,amount,payment_method_id,source_type,source_id,description,reference,created_by) values(p_treasury_account_id,v_settlement.branch_id,public.pos_business_date(),'out','employee_settlement_payment',round(p_amount,2),p_payment_method_id,'employee_settlement_payment',v_payment_id,'Pago de liquidacion '||v_settlement.settlement_number,nullif(btrim(coalesce(p_reference,'')),''),v_employee);
 if round(v_paid+p_amount,2)=round(v_settlement.net_pay_amount,2) then
   for v_d in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id loop
     update public.employee_debts set outstanding_amount=v_d.balance_after,status=case when v_d.balance_after=0 then 'paid' else 'partial' end,settled_at=case when v_d.balance_after=0 then now() else null end where id=v_d.employee_debt_id;
     insert into public.employee_debt_movements(debt_id,movement_type,amount,settlement_id,notes,created_by) values(v_d.employee_debt_id,'settlement_deduction',v_d.amount,p_settlement_id,'Descuento aplicado al completar liquidacion.',v_employee);
   end loop;
   update public.employee_settlements set status='paid',payment_method_id=p_payment_method_id,payment_reference=nullif(btrim(coalesce(p_reference,'')),''),notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),paid_by=v_employee,paid_at=now(),cash_movement_id=null where id=p_settlement_id returning * into v_settlement;
 else update public.employee_settlements set payment_method_id=p_payment_method_id,payment_reference=nullif(btrim(coalesce(p_reference,'')),''),cash_movement_id=null where id=p_settlement_id returning * into v_settlement; end if;
 return v_settlement;
end; $$;
alter table public.treasury_accounts enable row level security; alter table public.treasury_movements enable row level security; alter table public.employee_payout_methods enable row level security; alter table public.employee_settlement_payments enable row level security;
drop policy if exists treasury_accounts_admin on public.treasury_accounts;
drop policy if exists treasury_movements_admin on public.treasury_movements;
drop policy if exists employee_payout_methods_admin on public.employee_payout_methods;
drop policy if exists employee_settlement_payments_admin on public.employee_settlement_payments;
create policy treasury_accounts_admin on public.treasury_accounts for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy treasury_movements_admin on public.treasury_movements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy employee_payout_methods_admin on public.employee_payout_methods for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy employee_settlement_payments_admin on public.employee_settlement_payments for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on function public.record_employee_settlement_payment(uuid,uuid,uuid,numeric,uuid,text,text) from public,anon; grant execute on function public.record_employee_settlement_payment(uuid,uuid,uuid,numeric,uuid,text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Treasury operational ledger
-- Origen: src/sql/172_treasury_operational_ledger.sql
-- ============================================================
-- Fase 3: ledger de tesoreria para eventos nuevos. Sin backfill historico.
create table if not exists public.payment_method_treasury_accounts (
 id uuid primary key default gen_random_uuid(), payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
 treasury_account_id uuid not null references public.treasury_accounts(id) on delete restrict, branch_id uuid references public.branches(id) on delete restrict,
 is_default boolean not null default true,is_active boolean not null default true,created_at timestamptz not null default now(),created_by uuid references public.employees(id) on delete set null
);
create unique index if not exists payment_method_treasury_default_uidx on public.payment_method_treasury_accounts(payment_method_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)) where is_active and is_default;
alter table public.finance_manual_entries add column if not exists treasury_account_id uuid references public.treasury_accounts(id) on delete restrict,add column if not exists funding_source text;

create or replace function public.sync_sale_payment_to_treasury() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale record; v_account uuid; v_kind text;
begin
 select s.branch_id,s.status,pm.payment_kind into v_sale from public.sales s join public.payment_methods pm on pm.id=new.payment_method_id where s.id=new.sale_id;
 if not found or v_sale.status<>'completed' then return new; end if;
 select payment_kind into v_kind from public.payment_methods where id=new.payment_method_id;
 if v_kind in ('cash','internal_credit') then return new; end if;
 select treasury_account_id into v_account from public.payment_method_treasury_accounts where payment_method_id=new.payment_method_id and is_active and (branch_id=v_sale.branch_id or branch_id is null) order by branch_id nulls last limit 1;
 if v_account is null then return new; end if;
 insert into public.treasury_movements(treasury_account_id,branch_id,movement_date,direction,movement_type,amount,payment_method_id,source_type,source_id,description,status) values(v_account,v_sale.branch_id,public.pos_business_date(),'in','sale_collection',new.amount,new.payment_method_id,'sale_payment',new.id,'Cobro digital de venta','posted') on conflict(source_type,source_id) where status='posted' do nothing;
 return new;
end $$;
drop trigger if exists sale_payments_treasury_sync on public.sale_payments; create trigger sale_payments_treasury_sync after insert on public.sale_payments for each row execute function public.sync_sale_payment_to_treasury();

create or replace function public.post_treasury_finance_entry(p_category_id uuid,p_branch_id uuid,p_date date,p_amount numeric,p_description text,p_treasury_account_id uuid,p_payment_method_id uuid default null,p_reference text default null)
returns public.finance_manual_entries language plpgsql security definer set search_path=public,pg_temp as $$
declare v_category record; v_entry public.finance_manual_entries%rowtype; v_actor uuid:=public.current_employee_id(); v_direction text;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede registrar tesoreria.'; end if;
 if p_amount<=0 or p_date is null or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Fecha, monto y descripcion son obligatorios.'; end if;
 select * into v_category from public.finance_categories where id=p_category_id and is_active; if not found then raise exception 'Categoria no disponible.'; end if;
 if not exists(select 1 from public.treasury_accounts where id=p_treasury_account_id and is_active) then raise exception 'Cuenta de tesoreria no disponible.'; end if;
 v_direction:=case when v_category.direction='income' then 'in' else 'out' end;
 insert into public.finance_manual_entries(branch_id,entry_date,direction,category_id,amount,payment_method_id,description,reference,status,created_by,treasury_account_id,funding_source) values(p_branch_id,p_date,v_category.direction,p_category_id,p_amount,p_payment_method_id,p_description,p_reference,'active',v_actor,p_treasury_account_id,'treasury') returning * into v_entry;
 insert into public.treasury_movements(treasury_account_id,branch_id,movement_date,direction,movement_type,amount,payment_method_id,source_type,source_id,description,reference,created_by) values(p_treasury_account_id,p_branch_id,p_date,v_direction,case when v_category.code='owner_contribution' then 'owner_contribution' when v_category.code='owner_withdrawal' then 'owner_withdrawal' when v_category.code='inventory_purchase' then 'inventory_purchase' when v_category.direction='income' then 'other_income' else 'operating_expense' end,p_amount,p_payment_method_id,'finance_manual_entry',v_entry.id,p_description,p_reference,v_actor);
 return v_entry;
end $$;
revoke all on function public.sync_sale_payment_to_treasury() from public,anon; revoke all on function public.post_treasury_finance_entry(uuid,uuid,date,numeric,text,uuid,uuid,text) from public,anon; grant execute on function public.post_treasury_finance_entry(uuid,uuid,date,numeric,text,uuid,uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Financial reconciliation and period close
-- Origen: src/sql/173_financial_reconciliation_and_period_close.sql
-- ============================================================
-- Fase 4: conciliacion y cierre. Solo agrega estructuras; no hace backfill.
create table if not exists public.financial_periods(id uuid primary key default gen_random_uuid(),branch_id uuid references public.branches(id) on delete restrict,date_from date not null,date_to date not null,status text not null default 'open' check(status in('open','review','closed')),opened_at timestamptz not null default now(),opened_by uuid references public.employees(id) on delete set null,reviewed_at timestamptz,reviewed_by uuid references public.employees(id) on delete set null,closed_at timestamptz,closed_by uuid references public.employees(id) on delete set null,reopened_at timestamptz,reopened_by uuid references public.employees(id) on delete set null,reopen_reason text,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(date_to>=date_from));
create unique index if not exists financial_periods_closed_overlap_guard on public.financial_periods(coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),date_from,date_to) where status='closed';
create table if not exists public.financial_period_snapshots(id uuid primary key default gen_random_uuid(),period_id uuid not null references public.financial_periods(id) on delete restrict,generated_at timestamptz not null default now(),financial_summary jsonb not null,reconciliation_summary jsonb not null,operating_profit numeric(12,2) not null default 0,operating_margin numeric(12,2),recorded_cashflow numeric(12,2) not null default 0,warning_count integer not null default 0,blocking_issue_count integer not null default 0,schema_version text not null default 'v2',created_by uuid references public.employees(id) on delete set null);
create table if not exists public.financial_period_events(id uuid primary key default gen_random_uuid(),period_id uuid not null references public.financial_periods(id) on delete restrict,event_type text not null check(event_type in('opened','sent_to_review','closed','reopened')),employee_id uuid references public.employees(id) on delete set null,reason text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());

create or replace function public.get_financial_reconciliation_v2(p_date_from date,p_date_to date,p_branch_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_analysis jsonb; v_issues jsonb:='[]'::jsonb; v_blocking int:=0; v_warning int:=0; v_unsettled int:=0; v_zero int:=0; v_payment_mismatch int:=0; v_overpaid int:=0;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede conciliar.'; end if;
 v_analysis:=public.get_financial_analysis_v2(p_date_from,p_date_to,p_branch_id);
 select count(*) into v_payment_mismatch from (select s.id from public.sales s left join public.pos_sessions ps on ps.id=s.pos_session_id left join public.sale_payments sp on sp.sale_id=s.id where s.status='completed' and s.accounting_date between p_date_from and p_date_to and (p_branch_id is null or s.branch_id=p_branch_id) and (s.pos_session_id is null or ps.status='closed') group by s.id,s.total having abs(coalesce(sum(sp.amount),0)-s.total)>0.01) mismatches;
 select count(*) into v_unsettled from public.employee_service_production p where p.status='active' and p.accounting_date between p_date_from and p_date_to and (p_branch_id is null or p.branch_id=p_branch_id) and not exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements e on e.id=l.settlement_id where l.production_entry_id=p.id and e.status in('review','approved','paid'));
 v_zero:=coalesce((v_analysis->'reconciliation'->>'zeroCostProductLines')::int,0);
 select count(*) into v_overpaid from public.employee_settlements e where e.status='paid' and (p_branch_id is null or e.branch_id=p_branch_id) and exists(select 1 from public.employee_settlement_payments p where p.settlement_id=e.id group by p.settlement_id having sum(p.amount) filter(where p.status='posted')>e.net_pay_amount+0.01);
 if v_payment_mismatch>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','SALE_PAYMENT_MISMATCH','severity','blocking','title','Ventas con diferencia de pago','count',v_payment_mismatch));v_blocking:=v_blocking+1;end if;
 if v_overpaid>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','EMPLOYEE_SETTLEMENT_OVERPAYMENT','severity','blocking','title','Liquidaciones sobrepagadas','count',v_overpaid));v_blocking:=v_blocking+1;end if;
 if v_unsettled>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNRECONCILED_PRODUCTION','severity','warning','title','Producción sin liquidar','count',v_unsettled));v_warning:=v_warning+1;end if;
 if v_zero>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','ZERO_COST_PRODUCT','severity','warning','title','Productos sin costo confiable','count',v_zero));v_warning:=v_warning+1;end if;
 return jsonb_build_object('period',jsonb_build_object('from',p_date_from,'to',p_date_to,'branchId',p_branch_id),'analysis',v_analysis,'issues',v_issues,'blockingIssues',v_blocking,'warnings',v_warning,'profitStatus',case when v_blocking>0 then 'inconsistent' when v_unsettled>0 or v_zero>0 then 'provisional' else 'final' end,'canClose',v_blocking=0 and v_unsettled=0);
end $$;
create or replace function public.close_financial_period(p_period_id uuid,p_notes text default null) returns public.financial_periods language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.financial_periods%rowtype; v_check jsonb; v_actor uuid:=public.current_employee_id();
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede cerrar periodos.'; end if; select * into v_period from public.financial_periods where id=p_period_id for update; if not found or v_period.status='closed' then raise exception 'Periodo no disponible para cierre.'; end if;
 v_check:=public.get_financial_reconciliation_v2(v_period.date_from,v_period.date_to,v_period.branch_id); if not coalesce((v_check->>'canClose')::boolean,false) then raise exception 'El periodo tiene inconsistencias bloqueantes o producción sin conciliar.'; end if;
 insert into public.financial_period_snapshots(period_id,financial_summary,reconciliation_summary,operating_profit,operating_margin,recorded_cashflow,warning_count,blocking_issue_count,created_by) values(p_period_id,v_check->'analysis',v_check,coalesce((v_check->'analysis'->'profit'->>'operatingProfit')::numeric,0),(v_check->'analysis'->'profit'->>'operatingMarginPercentage')::numeric,coalesce((v_check->'analysis'->'cashflow'->>'netRecordedFlow')::numeric,0),coalesce((v_check->>'warnings')::int,0),coalesce((v_check->>'blockingIssues')::int,0),v_actor);
 update public.financial_periods set status='closed',closed_at=now(),closed_by=v_actor,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),updated_at=now() where id=p_period_id returning * into v_period; insert into public.financial_period_events(period_id,event_type,employee_id,metadata) values(p_period_id,'closed',v_actor,v_check);return v_period;
end $$;
create or replace function public.reopen_financial_period(p_period_id uuid,p_reason text) returns public.financial_periods language plpgsql security definer set search_path=public,pg_temp as $$ declare v public.financial_periods%rowtype;begin if not public.is_admin() then raise exception 'Solo owner o admin puede reabrir periodos.';end if;if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'El motivo de reapertura es obligatorio.';end if;update public.financial_periods set status='open',reopened_at=now(),reopened_by=public.current_employee_id(),reopen_reason=p_reason,updated_at=now() where id=p_period_id and status='closed' returning * into v;if not found then raise exception 'Solo se puede reabrir un periodo cerrado.';end if;insert into public.financial_period_events(period_id,event_type,employee_id,reason)values(p_period_id,'reopened',public.current_employee_id(),p_reason);return v;end $$;
revoke all on function public.get_financial_reconciliation_v2(date,date,uuid),public.close_financial_period(uuid,text),public.reopen_financial_period(uuid,text) from public,anon;grant execute on function public.get_financial_reconciliation_v2(date,date,uuid),public.close_financial_period(uuid,text),public.reopen_financial_period(uuid,text) to authenticated,service_role; notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Employee compensation accruals
-- Origen: src/sql/174_employee_compensation_accruals.sql
-- ============================================================
-- Fase 5: costo laboral devengado. Ejecutar despues de 173.
-- No actualiza produccion, liquidaciones pagadas ni snapshots financieros existentes.

create table if not exists public.employee_compensation_terms (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  compensation_mode text not null check (compensation_mode in ('commission','commission_plus_bonus','fixed','fixed_plus_bonus')),
  commission_rate numeric(7,4),
  fixed_amount numeric(12,2),
  fixed_period text not null default 'payroll_period' check (fixed_period in ('payroll_period')),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (compensation_mode in ('commission','commission_plus_bonus') and commission_rate between 0 and 100 and fixed_amount is null)
    or
    (compensation_mode in ('fixed','fixed_plus_bonus') and fixed_amount >= 0 and commission_rate is null)
  )
);

create index if not exists employee_compensation_terms_lookup_idx
  on public.employee_compensation_terms (employee_id, effective_from, effective_to)
  where is_active;

create or replace function public.guard_employee_compensation_term_overlap()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from public.employee_compensation_terms other_term
    where other_term.employee_id = new.employee_id
      and other_term.is_active
      and other_term.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(other_term.effective_from, coalesce(other_term.effective_to, 'infinity'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'El empleado ya tiene una condición de compensación vigente que se superpone con esas fechas.';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_compensation_terms_overlap_guard on public.employee_compensation_terms;
create trigger employee_compensation_terms_overlap_guard
before insert or update of employee_id, effective_from, effective_to, is_active
on public.employee_compensation_terms
for each row execute function public.guard_employee_compensation_term_overlap();

create or replace function public.create_employee_compensation_term(
  p_employee_id uuid,p_compensation_mode text,p_commission_rate numeric,p_fixed_amount numeric,
  p_effective_from date,p_notes text default null,p_replace_current boolean default false
) returns public.employee_compensation_terms language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prior public.employee_compensation_terms%rowtype; v_term public.employee_compensation_terms%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede configurar compensación.'; end if;
  if p_compensation_mode not in ('commission','commission_plus_bonus','fixed','fixed_plus_bonus') then raise exception 'La modalidad de compensación no es válida.'; end if;
  if p_effective_from is null then raise exception 'La fecha de vigencia es obligatoria.'; end if;
  if p_compensation_mode in ('commission','commission_plus_bonus') and coalesce(p_commission_rate,-1) not between 0 and 100 then raise exception 'La comisión debe estar entre 0 y 100.'; end if;
  if p_compensation_mode in ('fixed','fixed_plus_bonus') and coalesce(p_fixed_amount,-1)<0 then raise exception 'El monto fijo no es válido.'; end if;
  select * into v_prior from public.employee_compensation_terms where employee_id=p_employee_id and is_active
    and effective_from < p_effective_from and (effective_to is null or effective_to >= p_effective_from)
    order by effective_from desc limit 1 for update;
  if found and not p_replace_current then raise exception 'Existe una condición vigente. Confirma reemplazarla para cerrarla el día anterior.'; end if;
  if found then update public.employee_compensation_terms set effective_to=p_effective_from-1,updated_at=now() where id=v_prior.id; end if;
  insert into public.employee_compensation_terms(employee_id,compensation_mode,commission_rate,fixed_amount,effective_from,notes,created_by)
  values(p_employee_id,p_compensation_mode,case when p_compensation_mode in ('commission','commission_plus_bonus') then p_commission_rate else null end,case when p_compensation_mode in ('fixed','fixed_plus_bonus') then p_fixed_amount else null end,p_effective_from,nullif(btrim(coalesce(p_notes,'')),''),public.current_employee_id()) returning * into v_term;
  return v_term;
end;
$$;

alter table public.employee_service_production
  add column if not exists compensation_term_id uuid references public.employee_compensation_terms(id) on delete set null,
  add column if not exists compensation_mode_snapshot text,
  add column if not exists commission_rate_snapshot numeric(7,4),
  add column if not exists fixed_amount_snapshot numeric(12,2);

alter table public.employee_service_production
  drop constraint if exists employee_service_production_compensation_mode_snapshot_check;
alter table public.employee_service_production
  add constraint employee_service_production_compensation_mode_snapshot_check
  check (compensation_mode_snapshot is null or compensation_mode_snapshot in ('commission','commission_plus_bonus','fixed','fixed_plus_bonus'));

alter table public.employee_settlements
  add column if not exists compensation_term_id_snapshot uuid,
  add column if not exists compensation_mode_snapshot text,
  add column if not exists commission_rate_snapshot numeric(7,4),
  add column if not exists fixed_amount_snapshot numeric(12,2),
  add column if not exists fixed_compensation_total numeric(12,2) not null default 0;

alter table public.employee_settlement_service_lines
  add column if not exists compensation_mode_snapshot text,
  add column if not exists commission_rate_snapshot numeric(7,4),
  add column if not exists compensation_term_id_snapshot uuid;

create table if not exists public.payroll_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  summary jsonb not null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (payroll_period_id)
);

alter table public.payroll_periods
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.employees(id) on delete set null,
  add column if not exists reopen_reason text;

-- Al generar produccion nueva se congela la condición vigente. Las filas legacy
-- permanecen con snapshot nulo y se reportan para resolución administrativa.
create or replace function public.capture_employee_compensation_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_term public.employee_compensation_terms%rowtype;
begin
  select * into v_term
  from public.employee_compensation_terms
  where employee_id = new.employee_id
    and is_active
    and effective_from <= new.accounting_date
    and (effective_to is null or effective_to >= new.accounting_date)
  order by effective_from desc
  limit 1;

  if found then
    new.compensation_term_id := v_term.id;
    new.compensation_mode_snapshot := v_term.compensation_mode;
    new.commission_rate_snapshot := v_term.commission_rate;
    new.fixed_amount_snapshot := v_term.fixed_amount;
  end if;
  return new;
end;
$$;

drop trigger if exists z_employee_service_production_compensation_snapshot on public.employee_service_production;
create trigger z_employee_service_production_compensation_snapshot
before insert on public.employee_service_production
for each row execute function public.capture_employee_compensation_snapshot();

-- Fuente canónica, de solo lectura, para costo devengado. No toma la
-- liquidación como fuente del gasto: esta solo determina su estado posterior.
create or replace function public.get_employee_compensation_accruals(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows jsonb := '[]'::jsonb; v_summary jsonb; v_paid numeric(12,2) := 0;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if not public.is_admin() then raise exception 'Solo owner o admin puede consultar costos devengados.'; end if;

  with production as (
    select p.employee_id,p.branch_id,p.accounting_date,p.production_source,p.commissionable_amount,p.fixed_commission_amount,
      p.compensation_mode_snapshot,p.commission_rate_snapshot,
      case when p.compensation_mode_snapshot in ('commission','commission_plus_bonus')
        then round(p.commissionable_amount * coalesce(p.commission_rate_snapshot,0) / 100,2) else 0 end as percentage_cost,
      exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id where l.production_entry_id=p.id and s.status in ('review','approved','paid')) as is_settled
    from public.employee_service_production p
    where p.status='active' and p.accounting_date between p_date_from and p_date_to
      and (p_branch_id is null or p.branch_id=p_branch_id)
  ), bonuses as (
    select b.employee_id,b.branch_id,b.accounting_date,b.total_bonus_amount,
      exists(select 1 from public.employee_settlement_bonus_lines l join public.employee_settlements s on s.id=l.settlement_id where l.product_bonus_entry_id=b.id and s.status in ('review','approved','paid')) as is_settled
    from public.employee_product_bonus_entries b
    left join lateral (select t.compensation_mode from public.employee_compensation_terms t where t.employee_id=b.employee_id and t.is_active and t.effective_from<=b.accounting_date and (t.effective_to is null or t.effective_to>=b.accounting_date) order by t.effective_from desc limit 1) term on true
    where b.status='active' and b.employee_id is not null
      and b.accounting_date between p_date_from and p_date_to and (p_branch_id is null or b.branch_id=p_branch_id)
      and (term.compensation_mode is null or term.compensation_mode in ('commission_plus_bonus','fixed_plus_bonus'))
  ), fixed_terms as (
    select t.employee_id, e.branch_id, pp.id payroll_period_id,
      round(t.fixed_amount * greatest(0, least(pp.end_date,p_date_to,coalesce(t.effective_to,pp.end_date))-greatest(pp.start_date,p_date_from,t.effective_from)+1)::numeric / (pp.end_date-pp.start_date+1),2) amount,
      exists(select 1 from public.employee_settlements s where s.payroll_period_id=pp.id and s.employee_id=t.employee_id and s.status in ('review','approved','paid')) as is_settled
    from public.payroll_periods pp join public.employee_compensation_terms t on t.compensation_mode in ('fixed','fixed_plus_bonus') and t.is_active
      and t.effective_from <= pp.end_date and (t.effective_to is null or t.effective_to >= pp.start_date)
    join public.employees e on e.id=t.employee_id and e.status='active'
    where pp.status <> 'cancelled' and pp.start_date <= p_date_to and pp.end_date >= p_date_from
      and (p_branch_id is null or e.branch_id=p_branch_id)
  ), production_sum as (
    select employee_id,min(branch_id::text)::uuid branch_id,coalesce(sum(commissionable_amount),0) commissionable_base,
      coalesce(sum(percentage_cost),0) percentage_commissions,
      coalesce(sum(fixed_commission_amount) filter(where production_source='reward'),0) reward_compensation,
      coalesce(sum(fixed_commission_amount) filter(where production_source='courtesy'),0) courtesy_compensation,
      coalesce(sum(percentage_cost+fixed_commission_amount) filter(where not is_settled),0) accrued_unsettled,
      coalesce(sum(percentage_cost+fixed_commission_amount) filter(where is_settled),0) settled_cost,
      count(*) filter(where compensation_mode_snapshot is null and commissionable_amount>0) unresolved_count
    from production group by employee_id
  ), bonus_sum as (
    select employee_id,min(branch_id::text)::uuid branch_id,coalesce(sum(total_bonus_amount),0) product_bonuses,
      coalesce(sum(total_bonus_amount) filter(where not is_settled),0) accrued_unsettled,
      coalesce(sum(total_bonus_amount) filter(where is_settled),0) settled_cost
    from bonuses group by employee_id
  ), fixed_sum as (
    select employee_id,min(branch_id::text)::uuid branch_id,coalesce(sum(amount),0) fixed_compensation,
      coalesce(sum(amount) filter(where not is_settled),0) accrued_unsettled,
      coalesce(sum(amount) filter(where is_settled),0) settled_cost
    from fixed_terms group by employee_id
  ), involved as (
    select employee_id from production_sum union select employee_id from bonus_sum union select employee_id from fixed_sum
  ), per_employee as (
    select e.id employee_id,e.full_name,e.role,coalesce(p.branch_id,b.branch_id,f.branch_id,e.branch_id) branch_id,
      coalesce(p.commissionable_base,0) commissionable_base,coalesce(p.percentage_commissions,0) percentage_commissions,
      coalesce(p.reward_compensation,0) reward_compensation,coalesce(p.courtesy_compensation,0) courtesy_compensation,
      coalesce(b.product_bonuses,0) product_bonuses,coalesce(f.fixed_compensation,0) fixed_compensation,
      coalesce(p.accrued_unsettled,0)+coalesce(b.accrued_unsettled,0)+coalesce(f.accrued_unsettled,0) accrued_unsettled,
      coalesce(p.settled_cost,0)+coalesce(b.settled_cost,0)+coalesce(f.settled_cost,0) settled_cost,
      coalesce(p.unresolved_count,0) unresolved_count
    from involved i join public.employees e on e.id=i.employee_id
    left join production_sum p on p.employee_id=e.id left join bonus_sum b on b.employee_id=e.id left join fixed_sum f on f.employee_id=e.id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'employeeId',employee_id,'employeeName',full_name,'role',role,'branchId',branch_id,
    'commissionableBase',commissionable_base,'percentageCommissions',percentage_commissions,
    'fixedCompensation',fixed_compensation,'rewardCompensation',reward_compensation,'courtesyCompensation',courtesy_compensation,
    'productBonuses',product_bonuses,'totalAccruedCost',percentage_commissions+fixed_compensation+reward_compensation+courtesy_compensation+product_bonuses,
    'accruedUnsettled',accrued_unsettled,'settledCost',settled_cost,'unresolvedCount',unresolved_count
  )),'[]'::jsonb) into v_rows from per_employee;
  select jsonb_build_object(
    'employees',v_rows,
    'accruedCost',coalesce(sum((x->>'totalAccruedCost')::numeric),0),
    'percentageCommissions',coalesce(sum((x->>'percentageCommissions')::numeric),0),
    'fixedCompensation',coalesce(sum((x->>'fixedCompensation')::numeric),0),
    'rewardCompensation',coalesce(sum((x->>'rewardCompensation')::numeric),0),
    'courtesyCompensation',coalesce(sum((x->>'courtesyCompensation')::numeric),0),
    'productBonuses',coalesce(sum((x->>'productBonuses')::numeric),0),
    'accruedUnsettled',coalesce(sum((x->>'accruedUnsettled')::numeric),0),
    'settledCost',coalesce(sum((x->>'settledCost')::numeric),0),
    'unresolvedCost',coalesce(sum((x->>'unresolvedCount')::numeric),0),
    'employeeCount',jsonb_array_length(v_rows)
  ) into v_summary from jsonb_array_elements(v_rows) x;
  select coalesce(sum(payment.amount),0) into v_paid
  from public.employee_settlement_payments payment join public.employee_settlements settlement on settlement.id=payment.settlement_id
  where payment.status='posted' and payment.paid_at::date between p_date_from and p_date_to and (p_branch_id is null or settlement.branch_id=p_branch_id);
  v_summary:=coalesce(v_summary, jsonb_build_object('employees','[]'::jsonb,'accruedCost',0,'unresolvedCost',0,'employeeCount',0));
  return v_summary || jsonb_build_object('paidAmount',v_paid,'settledUnpaid',greatest(coalesce((v_summary->>'settledCost')::numeric,0)-v_paid,0));
end;
$$;

-- Se conserva la implementación anterior para legacy y se agrega la capa V2.
do $$ begin
  if to_regprocedure('public.get_financial_analysis_v2(date,date,uuid)') is not null
     and to_regprocedure('public.get_financial_analysis_v2_legacy(date,date,uuid)') is null then
    alter function public.get_financial_analysis_v2(date,date,uuid) rename to get_financial_analysis_v2_legacy;
  end if;
end $$;

create or replace function public.get_financial_analysis_v2(p_date_from date,p_date_to date,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_personnel jsonb; v_profit numeric; v_sales numeric; v_costs numeric; v_expenses numeric; v_status text;
begin
  v_base:=public.get_financial_analysis_v2_legacy(p_date_from,p_date_to,p_branch_id);
  v_personnel:=public.get_employee_compensation_accruals(p_date_from,p_date_to,p_branch_id);
  select coalesce((v_base->'sales'->>'netCommercialSales')::numeric,0),coalesce((v_base->'directCosts'->>'productCogs')::numeric,0)+coalesce((v_base->'directCosts'->>'courtesyProductRealCost')::numeric,0),coalesce((v_base->'expenses'->>'operatingExpenses')::numeric,0) into v_sales,v_costs,v_expenses;
  v_profit:=v_sales-v_costs-v_expenses-coalesce((v_personnel->>'accruedCost')::numeric,0);
  v_status:=case when coalesce((v_personnel->>'unresolvedCost')::numeric,0)>0 then 'provisional' else 'final' end;
  return v_base || jsonb_build_object('personnel',v_personnel,'profit',jsonb_build_object('operatingProfit',v_profit,'operatingMarginPercentage',case when v_sales=0 then null else round(v_profit/v_sales*100,2) end,'status',v_status));
end;
$$;

-- La producción sin liquidar con snapshot ya tiene costo conocido: informa,
-- pero no convierte la utilidad en provisional ni bloquea el cierre financiero.
do $$ begin
  if to_regprocedure('public.get_financial_reconciliation_v2(date,date,uuid)') is not null
     and to_regprocedure('public.get_financial_reconciliation_v2_legacy(date,date,uuid)') is null then
    alter function public.get_financial_reconciliation_v2(date,date,uuid) rename to get_financial_reconciliation_v2_legacy;
  end if;
end $$;

create or replace function public.get_financial_reconciliation_v2(p_date_from date,p_date_to date,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_personnel jsonb; v_issues jsonb; v_unsettled_known int:=0; v_unknown int:=0; v_blocking int; v_warnings int;
begin
  v_base:=public.get_financial_reconciliation_v2_legacy(p_date_from,p_date_to,p_branch_id);
  v_personnel:=public.get_employee_compensation_accruals(p_date_from,p_date_to,p_branch_id);
  select count(*) filter(where compensation_mode_snapshot is not null),count(*) filter(where compensation_mode_snapshot is null and commissionable_amount>0)
  into v_unsettled_known,v_unknown
  from public.employee_service_production p where p.status='active' and p.accounting_date between p_date_from and p_date_to
    and (p_branch_id is null or p.branch_id=p_branch_id)
    and not exists(select 1 from public.employee_settlement_service_lines l join public.employee_settlements s on s.id=l.settlement_id where l.production_entry_id=p.id and s.status in('review','approved','paid'));
  select coalesce(jsonb_agg(issue),'[]'::jsonb) into v_issues
  from jsonb_array_elements(coalesce(v_base->'issues','[]'::jsonb)) issue
  where issue->>'code' <> 'UNRECONCILED_PRODUCTION';
  if v_unsettled_known>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNSETTLED_PRODUCTION_WITH_KNOWN_COST','severity','warning','title','Producción devengada pendiente de liquidar','count',v_unsettled_known)); end if;
  if v_unknown>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNRESOLVED_COMPENSATION_RATE','severity','blocking','title','Producción sin tasa de compensación resuelta','count',v_unknown)); end if;
  select count(*) filter(where issue->>'severity'='blocking'),count(*) filter(where issue->>'severity'='warning') into v_blocking,v_warnings from jsonb_array_elements(v_issues) issue;
  return v_base || jsonb_build_object('issues',v_issues,'blockingIssues',v_blocking,'warnings',v_warnings,
    'personnel',v_personnel,'profitStatus',case when v_blocking>0 then 'inconsistent' when v_unknown>0 or coalesce((v_base->'analysis'->'directCosts'->>'zeroCostProductLines')::int,0)>0 then 'provisional' else 'final' end,
    'canClose',v_blocking=0);
end;
$$;

create or replace function public.close_payroll_period(p_period_id uuid,p_notes text default null)
returns public.payroll_periods language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.payroll_periods%rowtype; v_summary jsonb;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede cerrar períodos de nómina.'; end if;
 select * into v_period from public.payroll_periods where id=p_period_id for update;
 if not found or v_period.status in ('closed','cancelled') then raise exception 'El período no está disponible para cierre.'; end if;
 v_summary:=public.get_employee_compensation_accruals(v_period.start_date,v_period.end_date,null);
 if coalesce((v_summary->>'unresolvedCost')::numeric,0)>0 then raise exception 'No se puede cerrar: existen producciones con compensación sin resolver.'; end if;
 insert into public.payroll_period_snapshots(payroll_period_id,summary,created_by) values(p_period_id,v_summary,public.current_employee_id()) on conflict(payroll_period_id) do nothing;
 update public.payroll_periods set status='closed',closed_at=now(),closed_by=public.current_employee_id() where id=p_period_id returning * into v_period;
 return v_period;
end;
$$;

-- Preparación V2: conserva la ruta legacy cuando no hay término/snapshot, pero
-- para las nuevas filas usa exclusivamente los snapshots de producción.
do $$ begin
  if to_regprocedure('public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)') is not null
     and to_regprocedure('public.prepare_employee_settlement_v169(uuid,uuid,numeric,jsonb,text,text)') is null then
    alter function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) rename to prepare_employee_settlement_v169;
  end if;
end $$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid,p_employee_id uuid,p_commission_rate numeric default null,
  p_debt_deductions jsonb default '[]'::jsonb,p_notes text default null,p_high_rate_note text default null
) returns public.employee_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.payroll_periods%rowtype; v_term public.employee_compensation_terms%rowtype;
  v_rate numeric(7,4); v_settlement public.employee_settlements%rowtype; v_has_snapshots boolean;
  v_has_term boolean := false;
  v_percentage numeric(12,2); v_fixed numeric(12,2); v_reward_fixed numeric(12,2); v_courtesy numeric(12,2); v_bonus numeric(12,2); v_gross numeric(12,2);
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden preparar liquidaciones.'; end if;
  select * into v_period from public.payroll_periods where id=p_period_id and status not in ('cancelled','closed');
  if not found then raise exception 'El período no está disponible para liquidación.'; end if;
  select * into v_term from public.employee_compensation_terms where employee_id=p_employee_id and is_active
    and effective_from <= v_period.end_date and (effective_to is null or effective_to >= v_period.start_date)
    order by effective_from desc limit 1;
  v_has_term:=found;
  select exists(select 1 from public.employee_service_production p where p.payroll_period_id=p_period_id and p.employee_id=p_employee_id and p.status='active' and p.compensation_mode_snapshot is not null) into v_has_snapshots;
  if v_has_term then
    v_rate:=coalesce(v_term.commission_rate,0);
  elsif v_has_snapshots then
    raise exception 'Compensación pendiente de configurar para este empleado.';
  elsif p_commission_rate is null then
    raise exception 'Este período es legacy: indica un porcentaje administrativo y su motivo.';
  else
    v_rate:=p_commission_rate;
  end if;
  select * into v_settlement from public.prepare_employee_settlement_v169(p_period_id,p_employee_id,v_rate,p_debt_deductions,p_notes,p_high_rate_note);
  if not v_has_snapshots and not (v_has_term and v_term.compensation_mode in ('fixed','fixed_plus_bonus')) then return v_settlement; end if;

  update public.employee_settlement_service_lines l
  set compensation_term_id_snapshot=p.compensation_term_id,
      compensation_mode_snapshot=p.compensation_mode_snapshot,
      commission_rate_snapshot=p.commission_rate_snapshot,
      commission_rate=case when p.compensation_mode_snapshot in ('commission','commission_plus_bonus') then coalesce(p.commission_rate_snapshot,0) else 0 end,
      commission_amount=case when p.compensation_mode_snapshot in ('commission','commission_plus_bonus') then round(p.commissionable_amount*coalesce(p.commission_rate_snapshot,0)/100,2) else 0 end
  from public.employee_service_production p
  where l.settlement_id=v_settlement.id and l.production_entry_id=p.id;

  select coalesce(sum(l.commission_amount),0),
         coalesce(sum(l.fixed_commission_amount) filter(where l.production_source_snapshot='reward'),0),
         coalesce(sum(l.fixed_commission_amount) filter(where l.production_source_snapshot='courtesy'),0)
  into v_percentage,v_reward_fixed,v_courtesy
  from public.employee_settlement_service_lines l where l.settlement_id=v_settlement.id;
  select coalesce(sum(b.bonus_amount),0) into v_bonus from public.employee_settlement_bonus_lines b where b.settlement_id=v_settlement.id;
  -- Los fijos se reconocen una vez por período y se prorratean si una
  -- condición cambia dentro de la quincena; no dependen de producción.
  select coalesce(sum(term.fixed_amount * greatest(0, least(v_period.end_date,coalesce(term.effective_to,v_period.end_date))-greatest(v_period.start_date,term.effective_from)+1)::numeric / (v_period.end_date-v_period.start_date+1)),0)
  into v_fixed from public.employee_compensation_terms term
  where term.employee_id=p_employee_id and term.is_active and term.compensation_mode in ('fixed','fixed_plus_bonus')
    and term.effective_from<=v_period.end_date and (term.effective_to is null or term.effective_to>=v_period.start_date);
  if v_term.compensation_mode not in ('commission_plus_bonus','fixed_plus_bonus') then
    v_bonus:=0;
  end if;
  v_gross:=round(v_percentage+v_reward_fixed+v_courtesy+v_bonus+v_fixed,2);
  update public.employee_settlements
  set compensation_term_id_snapshot=v_term.id,compensation_mode_snapshot=v_term.compensation_mode,
      commission_rate_snapshot=v_term.commission_rate,fixed_amount_snapshot=v_term.fixed_amount,
      commission_rate=coalesce(v_term.commission_rate,0),percentage_commission_total=v_percentage,
      reward_fixed_commission_total=v_reward_fixed,courtesy_fixed_commission_total=v_courtesy,
      product_bonus_total=v_bonus,fixed_compensation_total=v_fixed,gross_pay_amount=v_gross
  where id=v_settlement.id returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.reopen_payroll_period(p_period_id uuid,p_reason text)
returns public.payroll_periods language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.payroll_periods%rowtype;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede reabrir períodos de nómina.'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'El motivo de reapertura es obligatorio.'; end if;
 update public.payroll_periods set status='open',closed_at=null,closed_by=null,reopened_at=now(),reopened_by=public.current_employee_id(),reopen_reason=btrim(p_reason) where id=p_period_id and status='closed' returning * into v_period;
 if not found then raise exception 'Solo se puede reabrir un período cerrado.'; end if;
 return v_period;
end;
$$;

alter table public.employee_compensation_terms enable row level security;
alter table public.payroll_period_snapshots enable row level security;
drop policy if exists employee_compensation_terms_admin on public.employee_compensation_terms;
create policy employee_compensation_terms_admin on public.employee_compensation_terms for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists payroll_period_snapshots_admin on public.payroll_period_snapshots;
create policy payroll_period_snapshots_admin on public.payroll_period_snapshots for all to authenticated using(public.is_admin()) with check(public.is_admin());

revoke all on function public.guard_employee_compensation_term_overlap(),public.capture_employee_compensation_snapshot(),public.create_employee_compensation_term(uuid,text,numeric,numeric,date,text,boolean),public.get_employee_compensation_accruals(date,date,uuid),public.get_financial_analysis_v2(date,date,uuid),public.close_payroll_period(uuid,text),public.reopen_payroll_period(uuid,text),public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) from public,anon;
grant execute on function public.create_employee_compensation_term(uuid,text,numeric,numeric,date,text,boolean),public.get_employee_compensation_accruals(date,date,uuid),public.get_financial_analysis_v2(date,date,uuid),public.close_payroll_period(uuid,text),public.reopen_payroll_period(uuid,text),public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Phase 0 financial engine
-- Origen: src/sql/175_financial_engine_phase_0.sql
-- ============================================================
-- FASE 0 Â· Motor financiero canÃ³nico. MigraciÃ³n incremental sin backfill.
-- Solo rige hechos nuevos; las operaciones pagadas/cerradas conservan su historia.

-- ClasificaciÃ³n econÃ³mica y lÃ­neas de negocio.
alter table public.finance_categories
  drop constraint if exists finance_categories_financial_group_check;
alter table public.finance_categories
  add constraint finance_categories_financial_group_check
  check (financial_group in (
    'operating_income','cost_of_sales','personnel_cost','operating_expense',
    'asset_movement','receivable','payable','financing','cash_adjustment'
  ));

insert into public.finance_categories (code,name,direction,financial_group,affects_profit,is_active,sort_order)
values
  ('inventory_loss','Merma o pÃ©rdida de inventario','expense','cost_of_sales',true,true,30),
  ('accounts_payable_payment','Pago de cuenta por pagar','expense','payable',false,true,31),
  ('cash_adjustment','Ajuste de caja','expense','cash_adjustment',false,true,32)
on conflict (code) do update set
  name=excluded.name,direction=excluded.direction,financial_group=excluded.financial_group,
  affects_profit=excluded.affects_profit,is_active=excluded.is_active,sort_order=excluded.sort_order,updated_at=now();

-- El pago de liquidaciÃ³n cancela una obligaciÃ³n. El costo nace al aprobar.
-- La clasificación histórica se conserva; el pago Fase 0 solo mueve
-- tesorería y no crea un segundo costo de personal.

alter table public.product_categories
  add column if not exists business_line text not null default 'other';
alter table public.product_categories
  drop constraint if exists product_categories_business_line_check;
alter table public.product_categories
  add constraint product_categories_business_line_check
  check (business_line in ('barbershop_products','cafeteria_products','other'));
create index if not exists product_categories_business_line_idx
  on public.product_categories (business_line) where is_active;

alter table public.sales
  add column if not exists tax_status text not null default 'EXONERATED',
  add column if not exists tax_rate numeric(5,2) not null default 0;
alter table public.sales
  drop constraint if exists sales_tax_status_check;
alter table public.sales
  add constraint sales_tax_status_check check (tax_status in ('EXONERATED','TAXED'));
alter table public.sales
  drop constraint if exists sales_tax_rate_status_check;
alter table public.sales
  add constraint sales_tax_rate_status_check check (
    (tax_status='EXONERATED' and tax_rate=0)
    or (tax_status='TAXED' and tax_rate>=0)
  );

alter table public.sale_items
  add column if not exists business_line_snapshot text,
  add column if not exists sales_scope_snapshot text,
  add column if not exists discount_type text not null default 'CLIENT_DISCOUNT',
  add column if not exists operational_contribution_amount numeric(12,2) not null default 0,
  add column if not exists courtesy_retail_value numeric(12,2) not null default 0,
  add column if not exists courtesy_actual_cost numeric(12,2) not null default 0;
alter table public.sale_items
  drop constraint if exists sale_items_discount_type_check;
alter table public.sale_items
  add constraint sale_items_discount_type_check
  check (discount_type in (
    'CLIENT_DISCOUNT','OPERATIONAL_CONTRIBUTION','COURTESY',
    'COMMISSION_BASE_ADJUSTMENT','EMPLOYEE_DEBT_DEDUCTION',
    'EMPLOYEE_ADVANCE_SETTLEMENT','MANUAL_CORRECTION'
  ));

-- Fuente financiera canÃ³nica por componente de una operaciÃ³n.
create table if not exists public.financial_postings (
  id uuid primary key default gen_random_uuid(),
  accounting_date date not null,
  branch_id uuid references public.branches(id) on delete restrict,
  payroll_period_id uuid references public.payroll_periods(id) on delete restrict,
  business_line text check (business_line in ('services','barbershop_products','cafeteria_products','other')),
  financial_group text not null check (financial_group in (
    'operating_income','cost_of_sales','personnel_cost','operating_expense',
    'asset_movement','receivable','payable','financing','cash_adjustment'
  )),
  effect_type text not null check (effect_type in (
    'income','expense','asset_increase','asset_decrease',
    'liability_increase','liability_decrease','cash_in','cash_out','memo'
  )),
  posting_code text not null,
  amount numeric(12,2) not null check (amount >= 0),
  affects_profit boolean not null default false,
  source_type text not null,
  source_id uuid not null,
  reversal_of_id uuid references public.financial_postings(id) on delete restrict,
  status text not null default 'posted' check (status in ('posted','reversed')),
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists financial_postings_active_source_idx
  on public.financial_postings(source_type,source_id,posting_code)
  where status='posted';
create unique index if not exists financial_postings_one_reversal_idx
  on public.financial_postings(reversal_of_id) where reversal_of_id is not null;
create index if not exists financial_postings_date_branch_idx
  on public.financial_postings(accounting_date,branch_id,financial_group)
  where status='posted';

create or replace function public.assert_financial_date_open(p_branch_id uuid,p_date date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from public.financial_periods period
    where period.status='closed'
      and (period.branch_id is null or period.branch_id=p_branch_id)
      and p_date between period.date_from and period.date_to
  ) then
    raise exception 'La fecha contable pertenece a un perÃ­odo financiero cerrado. Registra una reversa o ajuste en un perÃ­odo abierto.';
  end if;
end;
$$;

create or replace function public.reverse_financial_posting(
  p_posting_id uuid,p_reason_code text,p_reason_note text default null
)
returns public.financial_postings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_original public.financial_postings%rowtype; v_reversal public.financial_postings%rowtype;
begin
  select * into v_original from public.financial_postings where id=p_posting_id for update;
  if not found then raise exception 'El hecho financiero no existe.'; end if;
  if v_original.status<>'posted' then raise exception 'El hecho financiero no estÃ¡ disponible para reversa.'; end if;
  if exists (select 1 from public.financial_postings where reversal_of_id=v_original.id) then
    raise exception 'El hecho financiero ya fue revertido.';
  end if;
  if p_reason_code='OTHER' and nullif(btrim(coalesce(p_reason_note,'')),'') is null then
    raise exception 'El motivo OTHER requiere una observaciÃ³n.';
  end if;
  perform public.assert_financial_date_open(v_original.branch_id,public.pos_business_date());
  insert into public.financial_postings(
    accounting_date,branch_id,payroll_period_id,business_line,financial_group,effect_type,
    posting_code,amount,affects_profit,source_type,source_id,reversal_of_id,description,metadata,created_by
  ) values (
    public.pos_business_date(),v_original.branch_id,v_original.payroll_period_id,v_original.business_line,
    v_original.financial_group,
    case v_original.effect_type
      when 'income' then 'expense' when 'expense' then 'income'
      when 'asset_increase' then 'asset_decrease' when 'asset_decrease' then 'asset_increase'
      when 'liability_increase' then 'liability_decrease' when 'liability_decrease' then 'liability_increase'
      when 'cash_in' then 'cash_out' when 'cash_out' then 'cash_in' else 'memo'
    end,
    v_original.posting_code || '_reversal',v_original.amount,v_original.affects_profit,
    'reversal',v_original.id,v_original.id,'Reversa: ' || v_original.description,
    jsonb_build_object('reasonCode',p_reason_code,'reasonNote',nullif(btrim(coalesce(p_reason_note,'')),'')),
    public.current_employee_id()
  ) returning * into v_reversal;
  -- El hecho original se conserva activo para que el asiento de reversa lo
  -- compense en los resÃºmenes. La unicidad de reversal_of_id impide duplicar
  -- la correcciÃ³n sin borrar ni reescribir el historial.
  return v_reversal;
end;
$$;

-- Costo promedio por producto/sede y snapshot no retroactivo de cada Ã­tem.
create table if not exists public.product_branch_inventory_costs (
  product_id uuid not null references public.products(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  average_unit_cost numeric(12,4) not null default 0 check(average_unit_cost>=0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null,
  primary key(product_id,branch_id)
);

create or replace function public.snapshot_sale_item_financial_data()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_branch_id uuid; v_line text:='other'; v_scope text; v_cost numeric(12,4);
begin
  select branch_id into v_branch_id from public.sales where id=new.sale_id;
  if new.item_type='service' then
    new.business_line_snapshot:='services';
  elsif new.product_id is not null then
    select coalesce(category.business_line,'other'),product.visibility_scope,
      coalesce(branch_cost.average_unit_cost,product.cost_price,0)
    into v_line,v_scope,v_cost
    from public.products product
    left join public.product_categories category on category.id=product.category_id
    left join public.product_branch_inventory_costs branch_cost
      on branch_cost.product_id=product.id and branch_cost.branch_id=v_branch_id
    where product.id=new.product_id;
    new.business_line_snapshot:=v_line;
    new.sales_scope_snapshot:=v_scope;
    new.cost_snapshot:=coalesce(new.cost_snapshot,v_cost,0);
  end if;
  if new.is_courtesy then
    new.discount_type:='COURTESY';
    new.courtesy_retail_value:=round(coalesce(new.original_total,new.quantity*new.unit_price,0),2);
    new.courtesy_actual_cost:=round(coalesce(new.cost_snapshot,0)*new.quantity,2);
  end if;
  return new;
end;
$$;
drop trigger if exists sale_items_financial_snapshot on public.sale_items;
create trigger sale_items_financial_snapshot
before insert on public.sale_items
for each row execute function public.snapshot_sale_item_financial_data();

create or replace function public.sync_sale_financial_postings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item record; v_date date:=coalesce(new.accounting_date,public.pos_business_date()); v_posting record;
begin
  if new.status='completed' and (tg_op='INSERT' or old.status<>'completed') then
    perform public.assert_financial_date_open(new.branch_id,v_date);
    for v_item in select * from public.sale_items where sale_id=new.id loop
      if not v_item.is_courtesy and v_item.total>0 then
        insert into public.financial_postings(
          accounting_date,branch_id,business_line,financial_group,effect_type,posting_code,amount,
          affects_profit,source_type,source_id,description,created_by
        ) values (
          v_date,new.branch_id,coalesce(v_item.business_line_snapshot,case when v_item.item_type='service' then 'services' else 'other' end),
          'operating_income','income','sale_revenue',v_item.total,true,'sale_item',v_item.id,
          'Ingreso por venta: '||v_item.description_snapshot,new.closed_by
        ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
      end if;
      if v_item.item_type='product' and coalesce(v_item.cost_snapshot,0)>0 then
        insert into public.financial_postings(
          accounting_date,branch_id,business_line,financial_group,effect_type,posting_code,amount,
          affects_profit,source_type,source_id,description,metadata,created_by
        ) values (
          v_date,new.branch_id,coalesce(v_item.business_line_snapshot,'other'),'cost_of_sales','expense',
          case when v_item.is_courtesy then 'courtesy_actual_cost' else 'product_cost_of_sales' end,
          round(v_item.quantity*v_item.cost_snapshot,2),true,'sale_item',v_item.id,
          case when v_item.is_courtesy then 'Costo real de cortesÃ­a: ' else 'Costo de producto vendido: ' end || v_item.description_snapshot,
          jsonb_build_object('courtesyRetailValue',coalesce(v_item.courtesy_retail_value,0)),new.closed_by
        ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
      end if;
    end loop;
  elsif old.status='completed' and new.status='cancelled' then
    perform public.assert_financial_date_open(new.branch_id,public.pos_business_date());
    for v_posting in
      select posting.id from public.financial_postings posting
      join public.sale_items item on item.id=posting.source_id
      where item.sale_id=new.id and posting.source_type='sale_item' and posting.status='posted'
    loop
      perform public.reverse_financial_posting(v_posting.id,'SOURCE_CANCELLED',new.cancelled_reason);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_financial_postings_sync on public.sales;
create trigger sales_financial_postings_sync
after insert or update of status on public.sales
for each row execute function public.sync_sale_financial_postings();

-- El costo laboral oficial se reconoce al aprobar, no al pagar. Las deudas son
-- recuperaciones y por eso no entran en la fÃ³rmula del costo.
create or replace function public.sync_settlement_personnel_cost()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.payroll_periods%rowtype; v_cost numeric(12,2); v_posting uuid;
begin
  if new.status='approved' and (tg_op='INSERT' or old.status<>'approved') then
    select * into v_period from public.payroll_periods where id=new.payroll_period_id;
    v_cost:=round(greatest(
      coalesce(new.gross_pay_amount,0)+coalesce(new.manual_bonus_total,0)
      -coalesce(new.other_deduction_total,0)-coalesce(new.mandatory_discount_amount,0),0
    ),2);
    insert into public.financial_postings(
      accounting_date,branch_id,payroll_period_id,financial_group,effect_type,posting_code,
      amount,affects_profit,source_type,source_id,description,metadata,created_by
    ) values (
      v_period.end_date,new.branch_id,new.payroll_period_id,'personnel_cost','expense',
      'approved_settlement_personnel_cost',v_cost,true,'employee_settlement',new.id,
      'Costo oficial de personal: '||new.settlement_number,
      jsonb_build_object('grossPay',new.gross_pay_amount,'mandatoryDiscount',new.mandatory_discount_amount,
        'debtRecoveries',new.debt_deduction_total),new.approved_by
    ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  elsif old.status='approved' and new.status='cancelled' then
    select id into v_posting from public.financial_postings
    where source_type='employee_settlement' and source_id=new.id
      and posting_code='approved_settlement_personnel_cost' and status='posted';
    if v_posting is not null then
      perform public.reverse_financial_posting(v_posting.id,'SOURCE_CANCELLED',new.cancellation_reason);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists employee_settlements_personnel_cost_sync on public.employee_settlements;
create trigger employee_settlements_personnel_cost_sync
after insert or update of status on public.employee_settlements
for each row execute function public.sync_settlement_personnel_cost();


-- Compra/recepciÃ³n formal. El documento es la fuente; stock_movements es su
-- consecuencia. La compra incrementa activo y no es gasto de P&L.
create table if not exists public.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  branch_id uuid not null references public.branches(id) on delete restrict,
  accounting_date date not null default public.pos_business_date(),
  status text not null default 'draft' check(status in('draft','received','cancelled')),
  payment_status text not null default 'unpaid' check(payment_status in('unpaid','partial','paid')),
  total_cost numeric(12,2) not null default 0 check(total_cost>=0),
  treasury_account_id uuid references public.treasury_accounts(id) on delete restrict,
  payment_method_id uuid references public.payment_methods(id) on delete restrict,
  source_reference text, notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  received_at timestamptz, received_by uuid references public.employees(id) on delete set null,
  cancelled_at timestamptz, cancelled_by uuid references public.employees(id) on delete set null,
  cancellation_reason_code text, cancellation_note text
);
create table if not exists public.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_receipts(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,2) not null check(quantity>0),
  unit_purchase_cost numeric(12,4) not null check(unit_purchase_cost>=0),
  total_cost numeric(12,2) not null check(total_cost>=0),
  unit_cost_snapshot numeric(12,4) not null check(unit_cost_snapshot>=0),
  unique(receipt_id,product_id)
);
create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique references public.inventory_receipts(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_name text, accounting_date date not null,
  original_amount numeric(12,2) not null check(original_amount>0),
  outstanding_amount numeric(12,2) not null check(outstanding_amount>=0),
  status text not null default 'open' check(status in('open','partial','paid','cancelled')),
  notes text, created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null, settled_at timestamptz
);
create table if not exists public.accounts_payable_payments (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.accounts_payable(id) on delete restrict,
  treasury_account_id uuid not null references public.treasury_accounts(id) on delete restrict,
  payment_method_id uuid references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  paid_at date not null default public.pos_business_date(),
  reference text, notes text,
  status text not null default 'posted' check(status in('posted','voided')),
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null
);
create unique index if not exists stock_receipt_source_product_idx
  on public.stock_movements(reference_type,reference_id,product_id)
  where reference_type='inventory_receipt';
create index if not exists accounts_payable_open_idx
  on public.accounts_payable(branch_id,status,accounting_date);

create or replace function public.receive_inventory_receipt(
  p_receipt_id uuid,p_lines jsonb,p_payment_status text default 'unpaid',
  p_treasury_account_id uuid default null,p_payment_method_id uuid default null,p_notes text default null
)
returns public.inventory_receipts language plpgsql security definer set search_path=public,pg_temp as $$
declare v_receipt public.inventory_receipts%rowtype; v_line jsonb; v_product record;
  v_qty numeric; v_cost numeric; v_total numeric:=0; v_current_qty numeric; v_average numeric;
  v_actor uuid:=public.current_employee_id(); v_payable_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden recibir compras de inventario.'; end if;
  select * into v_receipt from public.inventory_receipts where id=p_receipt_id for update;
  if not found or v_receipt.status<>'draft' then raise exception 'La recepciÃ³n no estÃ¡ disponible.'; end if;
  perform public.assert_financial_date_open(v_receipt.branch_id,v_receipt.accounting_date);
  if jsonb_typeof(coalesce(p_lines,'null'::jsonb))<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'La compra debe incluir al menos una lÃ­nea.';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=round((v_line->>'quantity')::numeric,2);
    v_cost:=round((v_line->>'unit_purchase_cost')::numeric,4);
    if v_qty<=0 or v_cost<0 then raise exception 'Cantidad o costo de compra invÃ¡lido.'; end if;
    select product.id,coalesce(branch_cost.average_unit_cost,product.cost_price,0) average_cost
    into v_product
    from public.products product
    left join public.product_branch_inventory_costs branch_cost
      on branch_cost.product_id=product.id and branch_cost.branch_id=v_receipt.branch_id
    where product.id=(v_line->>'product_id')::uuid and product.is_active and product.is_stockable;
    if not found then raise exception 'El producto no estÃ¡ disponible o no maneja stock.'; end if;
    select coalesce(sum(public.stock_movement_signed_quantity(movement_type,quantity)),0)
    into v_current_qty from public.stock_movements
    where product_id=v_product.id and branch_id=v_receipt.branch_id;
    v_average:=case
      when greatest(v_current_qty,0)+v_qty=0 then v_cost
      else round(((greatest(v_current_qty,0)*v_product.average_cost)+(v_qty*v_cost))/(greatest(v_current_qty,0)+v_qty),4)
    end;
    insert into public.inventory_receipt_lines(receipt_id,product_id,quantity,unit_purchase_cost,total_cost,unit_cost_snapshot)
    values(v_receipt.id,v_product.id,v_qty,v_cost,round(v_qty*v_cost,2),v_cost);
    insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
    values(v_product.id,v_receipt.branch_id,'purchase',v_qty,v_cost,'inventory_receipt',v_receipt.id,'RecepciÃ³n de inventario',v_actor);
    insert into public.product_branch_inventory_costs(product_id,branch_id,average_unit_cost,updated_at,updated_by)
    values(v_product.id,v_receipt.branch_id,v_average,now(),v_actor)
    on conflict(product_id,branch_id) do update
    set average_unit_cost=excluded.average_unit_cost,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
    -- Solo actualiza el costo por defecto de futuras operaciones sin reescribir snapshots.
    update public.products set cost_price=v_average,updated_at=now() where id=v_product.id;
    v_total:=v_total+round(v_qty*v_cost,2);
  end loop;
  if p_payment_status not in('unpaid','paid') then raise exception 'Estado de pago invÃ¡lido.'; end if;
  if p_payment_status='paid' and p_treasury_account_id is null then
    raise exception 'Una compra pagada requiere cuenta de tesorerÃ­a.';
  end if;
  update public.inventory_receipts
  set status='received',payment_status=p_payment_status,total_cost=round(v_total,2),
    treasury_account_id=p_treasury_account_id,payment_method_id=p_payment_method_id,
    notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
    received_at=now(),received_by=v_actor
  where id=v_receipt.id returning * into v_receipt;
  insert into public.financial_postings(
    accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
    source_type,source_id,description,created_by
  ) values(
    v_receipt.accounting_date,v_receipt.branch_id,'asset_movement','asset_increase',
    'inventory_receipt',v_receipt.total_cost,false,'inventory_purchase',v_receipt.id,
    'Ingreso de inventario',v_actor
  ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  if p_payment_status='paid' then
    insert into public.treasury_movements(
      treasury_account_id,branch_id,movement_date,direction,movement_type,amount,payment_method_id,
      source_type,source_id,description,created_by
    ) values(
      p_treasury_account_id,v_receipt.branch_id,v_receipt.accounting_date,'out','inventory_purchase',
      v_receipt.total_cost,p_payment_method_id,'inventory_purchase_payment',v_receipt.id,
      'Pago de compra de inventario',v_actor
    ) on conflict(source_type,source_id) where status='posted' do nothing;
  else
    insert into public.accounts_payable(
      receipt_id,branch_id,supplier_name,accounting_date,original_amount,outstanding_amount,notes,created_by
    ) values(
      v_receipt.id,v_receipt.branch_id,v_receipt.supplier_name,v_receipt.accounting_date,
      v_receipt.total_cost,v_receipt.total_cost,v_receipt.notes,v_actor
    ) returning id into v_payable_id;
    insert into public.financial_postings(
      accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
      source_type,source_id,description,created_by
    ) values(
      v_receipt.accounting_date,v_receipt.branch_id,'payable','liability_increase',
      'inventory_purchase_payable',v_receipt.total_cost,false,'accounts_payable',v_payable_id,
      'Cuenta por pagar de inventario',v_actor
    ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  end if;
  return v_receipt;
end;
$$;

create or replace function public.pay_accounts_payable(
  p_payable_id uuid,p_treasury_account_id uuid,p_payment_method_id uuid,p_amount numeric,
  p_reference text default null,p_notes text default null
)
returns public.accounts_payable language plpgsql security definer set search_path=public,pg_temp as $$
declare v_payable public.accounts_payable%rowtype; v_payment_id uuid; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden pagar cuentas por pagar.'; end if;
  select * into v_payable from public.accounts_payable where id=p_payable_id for update;
  if not found or v_payable.status not in('open','partial') then raise exception 'La cuenta por pagar no estÃ¡ disponible.'; end if;
  if p_amount<=0 or round(p_amount,2)>v_payable.outstanding_amount then raise exception 'El monto supera el saldo pendiente.'; end if;
  perform public.assert_financial_date_open(v_payable.branch_id,public.pos_business_date());
  insert into public.accounts_payable_payments(
    payable_id,treasury_account_id,payment_method_id,amount,reference,notes,created_by
  ) values(
    v_payable.id,p_treasury_account_id,p_payment_method_id,round(p_amount,2),
    nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_notes,'')),''),v_actor
  ) returning id into v_payment_id;
  update public.accounts_payable
  set outstanding_amount=round(outstanding_amount-p_amount,2),
    status=case when round(outstanding_amount-p_amount,2)=0 then 'paid' else 'partial' end,
    settled_at=case when round(outstanding_amount-p_amount,2)=0 then now() else null end
  where id=v_payable.id returning * into v_payable;
  insert into public.treasury_movements(
    treasury_account_id,branch_id,movement_date,direction,movement_type,amount,payment_method_id,
    source_type,source_id,description,reference,created_by
  ) values(
    p_treasury_account_id,v_payable.branch_id,public.pos_business_date(),'out','inventory_purchase',
    round(p_amount,2),p_payment_method_id,'accounts_payable_payment',v_payment_id,
    'Pago de cuenta por pagar',p_reference,v_actor
  ) on conflict(source_type,source_id) where status='posted' do nothing;
  insert into public.financial_postings(
    accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
    source_type,source_id,description,created_by
  ) values(
    public.pos_business_date(),v_payable.branch_id,'payable','liability_decrease',
    'accounts_payable_payment',round(p_amount,2),false,'accounts_payable_payment',v_payment_id,
    'CancelaciÃ³n de cuenta por pagar',v_actor
  ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  return v_payable;
end;
$$;


-- Transferencias entre sedes: el despacho baja origen; destino no incrementa
-- hasta su recepciÃ³n explÃ­cita.
create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references public.branches(id) on delete restrict,
  to_branch_id uuid not null references public.branches(id) on delete restrict,
  accounting_date date not null default public.pos_business_date(),
  status text not null default 'draft' check(status in('draft','in_transit','received','cancelled','reconciled')),
  notes text, created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(), dispatched_at timestamptz,
  dispatched_by uuid references public.employees(id) on delete set null,
  received_at timestamptz, received_by uuid references public.employees(id) on delete set null,
  check(from_branch_id<>to_branch_id)
);
create table if not exists public.inventory_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_dispatched numeric(12,2) not null check(quantity_dispatched>0),
  quantity_received numeric(12,2),
  unit_cost_snapshot numeric(12,4) not null default 0,
  variance_reason_code text, variance_note text, unique(transfer_id,product_id)
);

create or replace function public.dispatch_inventory_transfer(p_transfer_id uuid,p_lines jsonb,p_notes text default null)
returns public.inventory_transfers language plpgsql security definer set search_path=public,pg_temp as $$
declare v_transfer public.inventory_transfers%rowtype; v_line jsonb; v_product uuid; v_qty numeric;
  v_cost numeric; v_stock numeric; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden despachar transferencias.'; end if;
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'draft' then raise exception 'La transferencia no estÃ¡ disponible.'; end if;
  perform public.assert_financial_date_open(v_transfer.from_branch_id,v_transfer.accounting_date);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_product:=(v_line->>'product_id')::uuid; v_qty:=round((v_line->>'quantity')::numeric,2);
    select stock.stock_quantity,coalesce(cost.average_unit_cost,product.cost_price,0)
    into v_stock,v_cost from public.vw_product_stock stock
    join public.products product on product.id=stock.product_id
    left join public.product_branch_inventory_costs cost
      on cost.product_id=product.id and cost.branch_id=v_transfer.from_branch_id
    where stock.product_id=v_product and stock.branch_id=v_transfer.from_branch_id;
    if v_qty<=0 or coalesce(v_stock,0)<v_qty then raise exception 'Stock insuficiente para la transferencia.'; end if;
    insert into public.inventory_transfer_lines(transfer_id,product_id,quantity_dispatched,unit_cost_snapshot)
    values(v_transfer.id,v_product,v_qty,v_cost);
    insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
    values(v_product,v_transfer.from_branch_id,'transfer_out',v_qty,v_cost,'inventory_transfer',v_transfer.id,'Despacho a sede destino',v_actor);
  end loop;
  update public.inventory_transfers set status='in_transit',
    notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
    dispatched_at=now(),dispatched_by=v_actor
  where id=v_transfer.id returning * into v_transfer;
  return v_transfer;
end;
$$;

create or replace function public.receive_inventory_transfer(p_transfer_id uuid,p_received_lines jsonb,p_notes text default null)
returns public.inventory_transfers language plpgsql security definer set search_path=public,pg_temp as $$
declare v_transfer public.inventory_transfers%rowtype; v_line public.inventory_transfer_lines%rowtype;
  v_received numeric; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden recibir transferencias.'; end if;
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'in_transit' then raise exception 'La transferencia no estÃ¡ en trÃ¡nsito.'; end if;
  perform public.assert_financial_date_open(v_transfer.to_branch_id,public.pos_business_date());
  for v_line in select * from public.inventory_transfer_lines where transfer_id=v_transfer.id loop
    select (value->>'quantity_received')::numeric into v_received
    from jsonb_array_elements(coalesce(p_received_lines,'[]'::jsonb))
    where (value->>'product_id')::uuid=v_line.product_id limit 1;
    v_received:=coalesce(v_received,v_line.quantity_dispatched);
    if v_received<0 or v_received>v_line.quantity_dispatched then raise exception 'Cantidad recibida invÃ¡lida.'; end if;
    update public.inventory_transfer_lines
    set quantity_received=v_received,
      variance_reason_code=case when v_received<>quantity_dispatched then 'IN_TRANSIT_VARIANCE' else null end
    where id=v_line.id;
    if v_received>0 then
      insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
      values(v_line.product_id,v_transfer.to_branch_id,'transfer_in',v_received,v_line.unit_cost_snapshot,'inventory_transfer',v_transfer.id,'RecepciÃ³n de transferencia',v_actor);
    end if;
    if v_received<v_line.quantity_dispatched then
      insert into public.financial_postings(
        accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
        source_type,source_id,description,created_by
      ) values(
        public.pos_business_date(),v_transfer.from_branch_id,'cost_of_sales','expense','transfer_loss',
        round((v_line.quantity_dispatched-v_received)*v_line.unit_cost_snapshot,2),true,
        'transfer',v_line.id,'Diferencia de transferencia entre sedes',v_actor
      ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
    end if;
  end loop;
  update public.inventory_transfers set status='received',
    notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),
    received_at=now(),received_by=v_actor
  where id=v_transfer.id returning * into v_transfer;
  return v_transfer;
end;
$$;

-- Mermas por costo econÃ³mico real.
create table if not exists public.inventory_losses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  accounting_date date not null default public.pos_business_date(),
  reason_code text not null check(reason_code in(
    'EXPIRATION','DAMAGE','OPERATIONAL_SHRINKAGE','LOSS','THEFT','BREAKAGE','INVENTORY_ERROR','OTHER'
  )),
  notes text, status text not null default 'draft' check(status in('draft','posted','reversed')),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(), reversed_at timestamptz,
  reversed_by uuid references public.employees(id) on delete set null,
  reversal_reason_code text, reversal_note text
);
create table if not exists public.inventory_loss_lines (
  id uuid primary key default gen_random_uuid(),
  loss_id uuid not null references public.inventory_losses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,2) not null check(quantity>0),
  unit_cost_snapshot numeric(12,4) not null check(unit_cost_snapshot>=0),
  total_cost numeric(12,2) not null check(total_cost>=0), unique(loss_id,product_id)
);

create or replace function public.record_inventory_loss(p_loss_id uuid,p_lines jsonb,p_reason_code text,p_notes text default null)
returns public.inventory_losses language plpgsql security definer set search_path=public,pg_temp as $$
declare v_loss public.inventory_losses%rowtype; v_line jsonb; v_product uuid; v_qty numeric;
  v_cost numeric; v_stock numeric; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden registrar mermas.'; end if;
  if p_reason_code='INVENTORY_ERROR' and public.current_user_role()<>'owner' then
    raise exception 'Solo owner puede registrar un error de inventario.';
  end if;
  if p_reason_code='OTHER' and nullif(btrim(coalesce(p_notes,'')),'') is null then
    raise exception 'El motivo OTHER requiere una observaciÃ³n.';
  end if;
  select * into v_loss from public.inventory_losses where id=p_loss_id for update;
  if not found or v_loss.status<>'draft' then raise exception 'El documento de merma no estÃ¡ disponible.'; end if;
  perform public.assert_financial_date_open(v_loss.branch_id,v_loss.accounting_date);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_product:=(v_line->>'product_id')::uuid; v_qty:=round((v_line->>'quantity')::numeric,2);
    select stock.stock_quantity,coalesce(cost.average_unit_cost,product.cost_price,0)
    into v_stock,v_cost from public.vw_product_stock stock
    join public.products product on product.id=stock.product_id
    left join public.product_branch_inventory_costs cost
      on cost.product_id=product.id and cost.branch_id=v_loss.branch_id
    where stock.product_id=v_product and stock.branch_id=v_loss.branch_id;
    if v_qty<=0 or coalesce(v_stock,0)<v_qty then raise exception 'Stock insuficiente para registrar la merma.'; end if;
    insert into public.inventory_loss_lines(loss_id,product_id,quantity,unit_cost_snapshot,total_cost)
    values(v_loss.id,v_product,v_qty,v_cost,round(v_qty*v_cost,2));
    insert into public.stock_movements(product_id,branch_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by)
    values(v_product,v_loss.branch_id,'waste',v_qty,v_cost,'inventory_loss',v_loss.id,p_reason_code,v_actor);
  end loop;
  update public.inventory_losses set status='posted',reason_code=p_reason_code,
    notes=nullif(btrim(coalesce(p_notes,'')),''),created_by=v_actor
  where id=v_loss.id returning * into v_loss;
  insert into public.financial_postings(
    accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
    source_type,source_id,description,metadata,created_by
  )
  select v_loss.accounting_date,v_loss.branch_id,'cost_of_sales','expense','inventory_loss',
    line.total_cost,true,'inventory_loss',line.id,'Merma de inventario',
    jsonb_build_object('reasonCode',p_reason_code),v_actor
  from public.inventory_loss_lines line where line.loss_id=v_loss.id
  on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  return v_loss;
end;
$$;


-- Cliente vinculado a empleado: el precio empleado se resuelve en PostgreSQL.
-- Se renombra la implementaciÃ³n previa, que sigue atendiendo beneficios, rewards,
-- cortesÃ­as y el checkout atÃ³mico, y se la envuelve sin duplicar su lÃ³gica.
do $$
begin
  if to_regprocedure('public.checkout_pos_sale(jsonb)') is not null
    and to_regprocedure('public.checkout_pos_sale_phase0_core(jsonb)') is null then
    alter function public.checkout_pos_sale(jsonb) rename to checkout_pos_sale_phase0_core;
  end if;
end;
$$;

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_customer_id uuid:=(p_payload->>'customer_id')::uuid;
  v_branch_id uuid:=(p_payload->>'branch_id')::uuid;
  v_employee_id uuid; v_credit boolean:=coalesce((p_payload->>'internal_credit')::boolean,false);
  v_item jsonb; v_items jsonb:='[]'::jsonb; v_product record; v_employee_price numeric;
begin
  select link.employee_id into v_employee_id
  from public.employee_customer_links link
  where link.customer_id=v_customer_id and link.is_active;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if v_item->>'item_type'='product' then
      select product.id,product.visibility_scope
      into v_product from public.products product
      where product.id=(v_item->>'product_id')::uuid and product.is_active;
      if not found then raise exception 'El producto no estÃ¡ disponible.'; end if;
      if v_employee_id is null and v_product.visibility_scope='internal' then
        raise exception 'El producto es exclusivo para empleados vinculados.';
      end if;
      if v_employee_id is not null and v_product.visibility_scope in('internal','both') then
        select catalog.employee_unit_price into v_employee_price
        from public.employee_supply_catalog_items catalog
        where catalog.product_id=v_product.id and catalog.is_active;
        if v_employee_price is null then
          raise exception 'El producto no estÃ¡ habilitado en el catÃ¡logo para empleados.';
        end if;
        v_item:=jsonb_set(v_item,'{unit_price}',to_jsonb(v_employee_price),true);
      elsif v_credit then
        raise exception 'El crÃ©dito de empleado solo permite productos habilitados para empleados.';
      end if;
    end if;
    v_items:=v_items || jsonb_build_array(v_item);
  end loop;
  if v_credit and v_employee_id is null then
    raise exception 'El crÃ©dito de empleado requiere un cliente vinculado.';
  end if;
  return public.checkout_pos_sale_phase0_core(jsonb_set(p_payload,'{items}',v_items,true));
end;
$$;

-- CrÃ©dito del empleado: cuenta por cobrar separada del ingreso y de caja.
create or replace function public.sync_employee_credit_receivable()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_debt public.employee_debts%rowtype; v_date date;
begin
  if tg_table_name='internal_pos_operations' then
    if new.operation_kind='employee_credit' and new.debt_id is not null then
      select * into v_debt from public.employee_debts where id=new.debt_id;
      select accounting_date into v_date from public.sales where id=new.sale_id;
      insert into public.financial_postings(
        accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
        source_type,source_id,description,created_by
      ) values(
        coalesce(v_date,public.pos_business_date()),v_debt.branch_id,'receivable','asset_increase',
        'employee_credit_receivable',v_debt.original_amount,false,'employee_credit_sale',v_debt.id,
        'Cuenta por cobrar a empleado',new.created_by
      ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
    end if;
    return new;
  end if;

  select * into v_debt from public.employee_debts where id=new.debt_id;
  if found and v_debt.debt_type='internal_credit'
    and new.movement_type in('settlement_deduction','manual_payment','immediate_payment','write_off','cancellation') then
    insert into public.financial_postings(
      accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,
      source_type,source_id,description,created_by
    ) values(
      public.pos_business_date(),v_debt.branch_id,'receivable','asset_decrease',
      'employee_credit_collection',new.amount,false,'employee_debt_payment',new.id,
      'RecuperaciÃ³n de crÃ©dito de empleado',new.created_by
    ) on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists employee_credit_receivable_on_debt on public.employee_debts;
drop trigger if exists employee_credit_receivable_on_operation on public.internal_pos_operations;
create trigger employee_credit_receivable_on_operation
after insert on public.internal_pos_operations
for each row execute function public.sync_employee_credit_receivable();
drop trigger if exists employee_credit_receivable_on_movement on public.employee_debt_movements;
create trigger employee_credit_receivable_on_movement
after insert on public.employee_debt_movements
for each row execute function public.sync_employee_credit_receivable();

-- Resumen consumible por la siguiente fase de P&L: no mezcla aporte operativo
-- como gasto ni flujo de caja con resultado econÃ³mico.
create or replace view public.vw_financial_phase0_summary
with (security_invoker=true) as
select
  posting.accounting_date, posting.branch_id, posting.business_line, posting.financial_group,
  sum(case when posting.effect_type='income' and posting.affects_profit then posting.amount else 0 end) as profit_income,
  sum(case when posting.effect_type='expense' and posting.affects_profit then posting.amount else 0 end) as profit_expense,
  sum(case when posting.effect_type='asset_increase' then posting.amount when posting.effect_type='asset_decrease' then -posting.amount else 0 end) as asset_change,
  sum(case when posting.effect_type='liability_increase' then posting.amount when posting.effect_type='liability_decrease' then -posting.amount else 0 end) as liability_change
from public.financial_postings posting
where posting.status='posted'
group by posting.accounting_date,posting.branch_id,posting.business_line,posting.financial_group;

-- RLS explÃ­cito para proyectos Supabase que ya no exponen tablas nuevas por
-- defecto. Todas estas tablas solo son administrables por owner/admin.
alter table public.financial_postings enable row level security;
alter table public.product_branch_inventory_costs enable row level security;
alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_lines enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.accounts_payable_payments enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_lines enable row level security;
alter table public.inventory_losses enable row level security;
alter table public.inventory_loss_lines enable row level security;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'financial_postings','product_branch_inventory_costs','inventory_receipts',
    'inventory_receipt_lines','accounts_payable','accounts_payable_payments',
    'inventory_transfers','inventory_transfer_lines','inventory_losses','inventory_loss_lines'
  ] loop
    execute format('drop policy if exists phase0_admin on public.%I',v_table);
    execute format('create policy phase0_admin on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',v_table);
    execute format('grant select, insert, update on public.%I to authenticated',v_table);
  end loop;
end;
$$;

revoke all on function public.assert_financial_date_open(uuid,date) from public,anon;
revoke all on function public.reverse_financial_posting(uuid,text,text) from public,anon;
revoke all on function public.receive_inventory_receipt(uuid,jsonb,text,uuid,uuid,text) from public,anon;
revoke all on function public.pay_accounts_payable(uuid,uuid,uuid,numeric,text,text) from public,anon;
revoke all on function public.dispatch_inventory_transfer(uuid,jsonb,text) from public,anon;
revoke all on function public.receive_inventory_transfer(uuid,jsonb,text) from public,anon;
revoke all on function public.record_inventory_loss(uuid,jsonb,text,text) from public,anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated,service_role;
grant execute on function public.receive_inventory_receipt(uuid,jsonb,text,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.pay_accounts_payable(uuid,uuid,uuid,numeric,text,text) to authenticated,service_role;
grant execute on function public.dispatch_inventory_transfer(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.receive_inventory_transfer(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.record_inventory_loss(uuid,jsonb,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Phase 1A compensation and production
-- Origen: src/sql/176_employee_compensation_and_production_attribution.sql
-- ============================================================
-- Fase 1 de remuneraciones: extiende el motor de liquidaciones existente.
-- Es prospectiva: no recalcula ventas, producciones ni liquidaciones históricas.

create table if not exists public.employee_compensation_engine_settings (
  singleton boolean primary key default true check (singleton),
  production_attribution_starts_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
insert into public.employee_compensation_engine_settings(singleton)
values(true) on conflict(singleton) do nothing;

alter table public.employee_compensation_terms
  add column if not exists base_monthly_salary numeric(12,2),
  add column if not exists mandatory_discount_enabled boolean,
  add column if not exists mandatory_discount_rate numeric(7,4),
  add column if not exists compensation_policy_version integer not null default 1;

-- F174 tenía un CHECK anónimo que obligaba commission_rate también para
-- commission_plus_bonus. En V2 esa tasa se define por liquidación, no por
-- contrato. Se localiza por su definición para no depender del nombre que
-- PostgreSQL haya asignado al CHECK histórico.
do $$
declare v_constraint_name text;
begin
  select constraint_name into v_constraint_name
  from information_schema.table_constraints constraint_meta
  join pg_constraint constraint_def
    on constraint_def.conname = constraint_meta.constraint_name
  join pg_class relation_def on relation_def.oid = constraint_def.conrelid
  join pg_namespace schema_def on schema_def.oid = relation_def.relnamespace
  where constraint_meta.table_schema = 'public'
    and constraint_meta.table_name = 'employee_compensation_terms'
    and constraint_meta.constraint_type = 'CHECK'
    and schema_def.nspname = 'public'
    and pg_get_constraintdef(constraint_def.oid) like '%commission_rate%'
    and pg_get_constraintdef(constraint_def.oid) like '%fixed_amount%'
    and pg_get_constraintdef(constraint_def.oid) like '%compensation_mode%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.employee_compensation_terms drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.employee_compensation_terms
  drop constraint if exists employee_compensation_terms_legacy_amount_check;
alter table public.employee_compensation_terms
  drop constraint if exists employee_compensation_terms_compensation_mode_check;
alter table public.employee_compensation_terms
  add constraint employee_compensation_terms_compensation_mode_check
  check (compensation_mode in ('commission','commission_plus_bonus','commission_only','fixed','fixed_plus_bonus'));
alter table public.employee_compensation_terms
  add constraint employee_compensation_terms_legacy_amount_check
  check (
    (
      compensation_policy_version = 1
      and (
        (compensation_mode in ('commission','commission_plus_bonus') and commission_rate between 0 and 100 and fixed_amount is null)
        or (compensation_mode in ('fixed','fixed_plus_bonus') and fixed_amount >= 0 and commission_rate is null)
      )
    )
    or (
      compensation_policy_version = 2
      and (
        (compensation_mode in ('commission_plus_bonus','commission_only') and commission_rate is null and fixed_amount is null)
        or (compensation_mode in ('fixed_plus_bonus','fixed') and commission_rate is null and fixed_amount >= 0)
      )
    )
  );

alter table public.employee_compensation_terms
  drop constraint if exists employee_compensation_terms_policy_version_check;
alter table public.employee_compensation_terms
  add constraint employee_compensation_terms_policy_version_check
  check (compensation_policy_version in (1,2));
alter table public.employee_compensation_terms
  drop constraint if exists employee_compensation_terms_v2_contract_check;
alter table public.employee_compensation_terms
  add constraint employee_compensation_terms_v2_contract_check
  check (
    compensation_policy_version = 1
    or (
      compensation_mode in ('commission_plus_bonus','commission_only','fixed_plus_bonus','fixed')
      and (
        (compensation_mode in ('commission_plus_bonus','commission_only') and coalesce(base_monthly_salary,0) = 0)
        or (compensation_mode in ('fixed_plus_bonus','fixed') and base_monthly_salary > 0)
      )
    )
  );
alter table public.employee_compensation_terms
  drop constraint if exists employee_compensation_terms_mandatory_discount_rate_check;
alter table public.employee_compensation_terms
  add constraint employee_compensation_terms_mandatory_discount_rate_check
  check (mandatory_discount_rate is null or mandatory_discount_rate between 0 and 100);

-- Se conservan los términos legacy sin inventar tasas ni salarios. Los perfiles
-- V2 son explícitos y se crean por la nueva RPC.
create or replace function public.create_employee_compensation_term_v176(
  p_employee_id uuid,
  p_compensation_type text,
  p_base_monthly_salary numeric,
  p_mandatory_discount_enabled boolean default true,
  p_mandatory_discount_rate numeric default 1,
  p_effective_from date default public.pos_business_date(),
  p_notes text default null,
  p_replace_current boolean default false
) returns public.employee_compensation_terms
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prior public.employee_compensation_terms%rowtype; v_term public.employee_compensation_terms%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede configurar remuneraciones.'; end if;
  if p_compensation_type not in ('commission_plus_bonus','commission_only','fixed_plus_bonus','fixed') then
    raise exception 'El tipo de remuneración no es válido.';
  end if;
  if p_effective_from is null then raise exception 'La fecha de vigencia es obligatoria.'; end if;
  if p_compensation_type in ('fixed_plus_bonus','fixed') and coalesce(p_base_monthly_salary,0) <= 0 then
    raise exception 'El sueldo base mensual debe ser mayor que cero.';
  end if;
  if coalesce(p_mandatory_discount_enabled,true) and coalesce(p_mandatory_discount_rate,-1) not between 0 and 100 then
    raise exception 'La tasa de descuento obligatorio debe estar entre 0 y 100.';
  end if;
  select * into v_prior from public.employee_compensation_terms
  where employee_id=p_employee_id and is_active and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from)
  order by effective_from desc limit 1 for update;
  if found and not p_replace_current then
    raise exception 'Existe una condición vigente. Confirma reemplazarla para cerrar el historial anterior.';
  end if;
  if found then
    update public.employee_compensation_terms
    set effective_to=p_effective_from-1,updated_at=now()
    where id=v_prior.id;
  end if;
  insert into public.employee_compensation_terms(
    employee_id,compensation_mode,commission_rate,fixed_amount,base_monthly_salary,
    mandatory_discount_enabled,mandatory_discount_rate,compensation_policy_version,
    effective_from,notes,created_by
  ) values (
    p_employee_id,p_compensation_type,null,
    case when p_compensation_type in ('fixed_plus_bonus','fixed') then 0 else null end,
    case when p_compensation_type in ('fixed_plus_bonus','fixed') then round(p_base_monthly_salary,2) else null end,
    coalesce(p_mandatory_discount_enabled,true),
    case when coalesce(p_mandatory_discount_enabled,true) then round(coalesce(p_mandatory_discount_rate,1),4) else 0 end,
    2,p_effective_from,nullif(btrim(coalesce(p_notes,'')),''),public.current_employee_id()
  ) returning * into v_term;
  return v_term;
end;
$$;

alter table public.sale_items
  add column if not exists attributed_employee_id uuid references public.employees(id) on delete set null;
create index if not exists sale_items_attributed_employee_idx
  on public.sale_items(attributed_employee_id) where attributed_employee_id is not null;

-- checkout_pos_sale histórico ya persiste barber_id por línea. Para las
-- operaciones nuevas se usa como el responsable explícito recibido por la
-- envoltura V176 y se conserva la columna nueva para lectura inequívoca.
create or replace function public.capture_sale_item_responsible_employee()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.item_type='product' and new.attributed_employee_id is null and new.barber_id is not null then
    new.attributed_employee_id:=new.barber_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sale_items_capture_responsible_employee on public.sale_items;
create trigger sale_items_capture_responsible_employee
before insert or update of item_type,barber_id,attributed_employee_id on public.sale_items
for each row execute function public.capture_sale_item_responsible_employee();

-- Registro prospectivo y auditable para ventas de productos atribuidas.
create table if not exists public.employee_sale_item_attributions (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null unique references public.sale_items(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  accounting_date date not null,
  business_line text not null check (business_line in ('barbershop_products','cafeteria_products','other')),
  recognized_production_amount numeric(12,2) not null default 0 check (recognized_production_amount >= 0),
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz, reversed_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists employee_sale_item_attributions_period_employee_idx
  on public.employee_sale_item_attributions(payroll_period_id,employee_id,status);

alter table public.employee_settlements
  add column if not exists mandatory_discount_base_amount numeric(12,2) not null default 0,
  add column if not exists mandatory_discount_rate numeric(7,4) not null default 1,
  add column if not exists mandatory_discount_amount numeric(12,2) not null default 0,
  add column if not exists compensation_type_snapshot text,
  add column if not exists base_monthly_salary_snapshot numeric(12,2),
  add column if not exists fixed_salary_period_amount numeric(12,2) not null default 0,
  add column if not exists mandatory_discount_enabled_snapshot boolean,
  add column if not exists recognized_production_total numeric(12,2) not null default 0,
  add column if not exists labor_cost_amount numeric(12,2) not null default 0;
alter table public.employee_settlements
  drop constraint if exists employee_settlements_compensation_type_snapshot_check;
alter table public.employee_settlements
  add constraint employee_settlements_compensation_type_snapshot_check
  check (compensation_type_snapshot is null or compensation_type_snapshot in ('commission','commission_plus_bonus','commission_only','fixed_plus_bonus','fixed'));

alter table public.employee_service_production
  add column if not exists recognized_production_amount numeric(12,2) not null default 0,
  drop constraint if exists employee_service_production_compensation_mode_snapshot_check;
alter table public.employee_service_production
  add constraint employee_service_production_compensation_mode_snapshot_check
  check (compensation_mode_snapshot is null or compensation_mode_snapshot in ('commission','commission_plus_bonus','commission_only','fixed','fixed_plus_bonus'));
alter table public.employee_settlement_service_lines
  add column if not exists recognized_production_amount_snapshot numeric(12,2) not null default 0,
  drop constraint if exists employee_settlement_service_lines_compensation_mode_snapshot_check;
alter table public.employee_settlement_service_lines
  add constraint employee_settlement_service_lines_compensation_mode_snapshot_check
  check (compensation_mode_snapshot is null or compensation_mode_snapshot in ('commission','commission_plus_bonus','commission_only','fixed','fixed_plus_bonus'));

-- 176 no depende de que 167/168 hayan sido instaladas antes. El descuento se
-- calcula exclusivamente sobre el snapshot de producción reconocida.
create or replace function public.apply_settlement_mandatory_discount_v176()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  new.mandatory_discount_rate:=greatest(coalesce(new.mandatory_discount_rate,1),0);
  new.mandatory_discount_base_amount:=greatest(coalesce(new.mandatory_discount_base_amount,0),0);
  new.mandatory_discount_amount:=case when coalesce(new.mandatory_discount_enabled_snapshot,true)
    then round(new.mandatory_discount_base_amount*new.mandatory_discount_rate/100,2) else 0 end;
  new.labor_cost_amount:=greatest(round(coalesce(new.gross_pay_amount,0)-new.mandatory_discount_amount,2),0);
  new.net_before_mandatory_discount:=greatest(round(
    coalesce(new.gross_pay_amount,0)-coalesce(new.debt_deduction_total,0)-coalesce(new.other_deduction_total,0),2),0);
  new.net_pay_amount:=greatest(new.labor_cost_amount-coalesce(new.debt_deduction_total,0)-coalesce(new.other_deduction_total,0),0);
  return new;
end;
$$;
drop trigger if exists employee_settlements_mandatory_discount on public.employee_settlements;
create trigger employee_settlements_mandatory_discount
before insert or update of gross_pay_amount,debt_deduction_total,other_deduction_total,
  mandatory_discount_base_amount,mandatory_discount_rate,mandatory_discount_enabled_snapshot
on public.employee_settlements for each row execute function public.apply_settlement_mandatory_discount_v176();

-- Congela la producción reconocida de los servicios nuevos. El aporte solo
-- modifica commissionable_amount; nunca esta instantánea utilizada por el 1 %.
create or replace function public.capture_service_recognized_production_v176()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_internal_recognized numeric(12,2);
begin
  if new.production_source='reward' then
    new.recognized_production_amount:=greatest(coalesce(new.reward_commission_basis_amount,0),0);
  elsif new.production_source='employee_benefit' then
    select operation.recognized_production_amount * new.quantity into v_internal_recognized
    from public.internal_pos_operations operation where operation.sale_id=new.sale_id limit 1;
    new.recognized_production_amount:=greatest(coalesce(v_internal_recognized,new.original_line_total),0);
  else
    new.recognized_production_amount:=greatest(coalesce(new.original_line_total,0),0);
  end if;
  return new;
end;
$$;
drop trigger if exists employee_service_production_recognized_snapshot_v176 on public.employee_service_production;
create trigger employee_service_production_recognized_snapshot_v176
before insert or update of production_source,reward_commission_basis_amount,original_line_total,quantity
on public.employee_service_production for each row execute function public.capture_service_recognized_production_v176();

create or replace function public.get_employee_recognized_production(
  p_period_id uuid,p_employee_id uuid
) returns numeric(12,2)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_services numeric(12,2):=0; v_products numeric(12,2):=0; v_start timestamptz;
begin
  select production_attribution_starts_at into v_start from public.employee_compensation_engine_settings where singleton;
  select coalesce(sum(production.recognized_production_amount),0) into v_services
  from public.employee_service_production production
  join public.sales sale on sale.id=production.sale_id
  join public.pos_sessions session on session.id=sale.pos_session_id
  where production.payroll_period_id=p_period_id and production.employee_id=p_employee_id
    and production.status='active' and sale.status='completed' and session.status='closed'
    and coalesce(sale.closed_at,sale.created_at)>=v_start;
  select coalesce(sum(attribution.recognized_production_amount),0) into v_products
  from public.employee_sale_item_attributions attribution
  join public.sales sale on sale.id=attribution.sale_id
  join public.pos_sessions session on session.id=sale.pos_session_id
  where attribution.payroll_period_id=p_period_id and attribution.employee_id=p_employee_id
    and attribution.status='active' and sale.status='completed' and session.status='closed'
    and coalesce(sale.closed_at,sale.created_at)>=v_start;
  return round(greatest(v_services,0)+greatest(v_products,0),2);
end;
$$;

-- La atribución de productos se calcula únicamente cuando la venta ya puede
-- generar producción (sesión cerrada). No toca ninguna venta anterior al hito.
create or replace function public.sync_employee_sale_item_attributions(p_sale_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sale public.sales%rowtype; v_start timestamptz; v_period public.payroll_periods%rowtype; v_item record;
begin
  select * into v_sale from public.sales where id=p_sale_id;
  if not found then return; end if;
  select production_attribution_starts_at into v_start from public.employee_compensation_engine_settings where singleton;
  if v_sale.status='cancelled' then
    update public.employee_sale_item_attributions set status='reversed',reversed_at=now(),reversed_reason='Venta anulada.',updated_at=now()
    where sale_id=p_sale_id and status<>'reversed';
    return;
  end if;
  if v_sale.status<>'completed' or coalesce(v_sale.closed_at,v_sale.created_at)<v_start then return; end if;
  select * into v_period from public.get_or_create_payroll_period(v_sale.accounting_date);
  if v_period.status in ('closed','cancelled') then return; end if;
  for v_item in
    select item.*,coalesce(item.business_line_snapshot,category.business_line,'other') business_line
    from public.sale_items item join public.products product on product.id=item.product_id
    left join public.product_categories category on category.id=product.category_id
    where item.sale_id=p_sale_id and item.item_type='product' and not item.is_courtesy
  loop
    if v_item.attributed_employee_id is null then continue; end if;
    insert into public.employee_sale_item_attributions(
      sale_item_id,sale_id,employee_id,branch_id,payroll_period_id,accounting_date,business_line,recognized_production_amount,status
    ) values (
      v_item.id,v_sale.id,v_item.attributed_employee_id,v_sale.branch_id,v_period.id,v_sale.accounting_date,
      v_item.business_line,greatest(coalesce(v_item.total,0),0),'active'
    ) on conflict(sale_item_id) do update set
      employee_id=excluded.employee_id,payroll_period_id=excluded.payroll_period_id,accounting_date=excluded.accounting_date,
      business_line=excluded.business_line,recognized_production_amount=excluded.recognized_production_amount,
      status='active',reversed_at=null,reversed_reason=null,updated_at=now();
  end loop;
end;
$$;

-- El checkout actual sigue siendo el núcleo. Esta envoltura solo exige y
-- propaga responsable explícito por producto de barbería hacia sale_items.
do $$ begin
  if to_regprocedure('public.checkout_pos_sale(jsonb)') is not null
    and to_regprocedure('public.checkout_pos_sale_v175(jsonb)') is null then
    alter function public.checkout_pos_sale(jsonb) rename to checkout_pos_sale_v175;
  end if;
end $$;
create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_item jsonb; v_items jsonb:='[]'::jsonb; v_line text; v_responsible uuid; v_branch_id uuid := (p_payload->>'branch_id')::uuid; v_employee public.employees%rowtype;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if v_item->>'item_type'='product' then
      select coalesce(category.business_line,'other') into v_line
      from public.products product left join public.product_categories category on category.id=product.category_id
      where product.id=(v_item->>'product_id')::uuid;
      v_responsible:=nullif(v_item->>'responsible_employee_id','')::uuid;
      if v_line='barbershop_products' and v_responsible is null then
        raise exception 'Los productos de barbería requieren responsable o vendedor.';
      end if;
      if v_responsible is not null then
        select * into v_employee from public.employees where id=v_responsible and status='active'
          and (branch_id is null or branch_id=v_branch_id);
        if not found then raise exception 'El responsable seleccionado no está activo.'; end if;
        v_item:=jsonb_set(v_item,'{barber_id}',to_jsonb(v_responsible::text),true);
      end if;
    end if;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  return public.checkout_pos_sale_v175(jsonb_set(p_payload,'{items}',v_items,true));
end;
$$;

do $$ begin
  if to_regprocedure('public.generate_employee_production_for_sale(uuid)') is not null
    and to_regprocedure('public.generate_employee_production_for_sale_v175(uuid)') is null then
    alter function public.generate_employee_production_for_sale(uuid) rename to generate_employee_production_for_sale_v175;
  end if;
end $$;
create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_start timestamptz;
begin
  v_result:=public.generate_employee_production_for_sale_v175(p_sale_id);
  select production_attribution_starts_at into v_start from public.employee_compensation_engine_settings where singleton;
  if exists(select 1 from public.sales where id=p_sale_id and coalesce(closed_at,created_at)>=v_start) then
    update public.employee_product_bonus_entries bonus
    set employee_id=item.attributed_employee_id,
        status=case when item.attributed_employee_id is null then 'pending_review'
          when exists(select 1 from public.employee_compensation_terms term
            where term.employee_id=item.attributed_employee_id and term.is_active
              and term.effective_from<=bonus.accounting_date and (term.effective_to is null or term.effective_to>=bonus.accounting_date)
              and term.compensation_mode in ('fixed','commission_only')) then 'reversed'
          else 'active' end,
        reversed_at=case when item.attributed_employee_id is not null and exists(select 1 from public.employee_compensation_terms term where term.employee_id=item.attributed_employee_id and term.is_active and term.effective_from<=bonus.accounting_date and (term.effective_to is null or term.effective_to>=bonus.accounting_date) and term.compensation_mode in ('fixed','commission_only')) then now() else null end,
        reversed_reason=case when item.attributed_employee_id is not null and exists(select 1 from public.employee_compensation_terms term where term.employee_id=item.attributed_employee_id and term.is_active and term.effective_from<=bonus.accounting_date and (term.effective_to is null or term.effective_to>=bonus.accounting_date) and term.compensation_mode in ('fixed','commission_only')) then 'Perfil sin bonos remunerativos: venta atribuida solo para producción.' else null end
    from public.sale_items item
    where bonus.sale_item_id=item.id and item.item_type='product';
    perform public.sync_employee_sale_item_attributions(p_sale_id);
  end if;
  return v_result;
end;
$$;

-- La liquidación conserva la reserva de deudas y las líneas existentes. Esta
-- última capa aplica el contrato V2 y snapshots sin recalcular historia pagada.
do $$ begin
  if to_regprocedure('public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)') is not null
    and to_regprocedure('public.prepare_employee_settlement_v174(uuid,uuid,numeric,jsonb,text,text)') is null then
    alter function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) rename to prepare_employee_settlement_v174;
  end if;
end $$;
create or replace function public.prepare_employee_settlement(
  p_period_id uuid,p_employee_id uuid,p_commission_rate numeric default null,
  p_debt_deductions jsonb default '[]'::jsonb,p_notes text default null,p_high_rate_note text default null
) returns public.employee_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.employee_settlements%rowtype; v_period public.payroll_periods%rowtype;
  v_term public.employee_compensation_terms%rowtype; v_rate numeric(7,4):=0; v_fixed numeric(12,2):=0;
  v_bonus numeric(12,2):=0; v_rewards numeric(12,2):=0; v_courtesy numeric(12,2):=0; v_percentage numeric(12,2):=0;
  v_recognized numeric(12,2):=0; v_commissionable numeric(12,2):=0; v_gross numeric(12,2):=0; v_days numeric(12,2);
begin
  select * into v_period from public.payroll_periods where id=p_period_id;
  if not found or v_period.status in ('closed','cancelled') then raise exception 'El período no está disponible para liquidación.'; end if;
  select * into v_term from public.employee_compensation_terms
  where employee_id=p_employee_id and is_active and effective_from<=v_period.end_date
    and (effective_to is null or effective_to>=v_period.start_date)
  order by effective_from desc limit 1;
  if not found or v_term.compensation_policy_version<>2 then
    return public.prepare_employee_settlement_v174(p_period_id,p_employee_id,p_commission_rate,p_debt_deductions,p_notes,p_high_rate_note);
  end if;
  if v_term.compensation_mode in ('commission_plus_bonus','commission_only') then
    if p_commission_rate is null or p_commission_rate<0 or p_commission_rate>100 then raise exception 'Indica el porcentaje de comisión de esta liquidación.'; end if;
    v_rate:=round(p_commission_rate,4);
  end if;
  -- Core previo conserva validaciones y reservas. El resultado se reemplaza
  -- antes de review/approved, por lo que no hay doble sistema de liquidación.
  select * into v_settlement from public.prepare_employee_settlement_v174(p_period_id,p_employee_id,0,p_debt_deductions,p_notes,p_high_rate_note);
  -- La línea conserva el valor reconocido que existía al preparar el
  -- documento. Así una edición posterior de reglas no altera su trazabilidad.
  update public.employee_settlement_service_lines line
  set recognized_production_amount_snapshot=production.recognized_production_amount
  from public.employee_service_production production
  where line.settlement_id=v_settlement.id and production.id=line.production_entry_id;
  select coalesce(sum(line.commissionable_amount),0) into v_commissionable
  from public.employee_settlement_service_lines line where line.settlement_id=v_settlement.id;
  if v_term.compensation_mode in ('commission_plus_bonus','commission_only') then
    select coalesce(sum(round(line.commissionable_amount*v_rate/100,2)),0) into v_percentage
    from public.employee_settlement_service_lines line where line.settlement_id=v_settlement.id;
  end if;
  if v_term.compensation_mode in ('commission_plus_bonus','fixed_plus_bonus') then
    select coalesce(sum(line.bonus_amount),0) into v_bonus from public.employee_settlement_bonus_lines line where line.settlement_id=v_settlement.id;
  end if;
  if v_term.compensation_mode in ('commission_plus_bonus','commission_only','fixed_plus_bonus') then
    select coalesce(sum(line.fixed_commission_amount) filter(where line.production_source_snapshot='reward'),0),
           coalesce(sum(line.fixed_commission_amount) filter(where line.production_source_snapshot='courtesy'),0)
    into v_rewards,v_courtesy from public.employee_settlement_service_lines line where line.settlement_id=v_settlement.id;
  end if;
  if v_term.compensation_mode in ('fixed_plus_bonus','fixed') then
    select coalesce(sum(
      term.base_monthly_salary/2 * greatest(0,least(v_period.end_date,coalesce(term.effective_to,v_period.end_date))-greatest(v_period.start_date,term.effective_from)+1)::numeric
        / (v_period.end_date-v_period.start_date+1)
    ),0) into v_fixed
    from public.employee_compensation_terms term
    where term.employee_id=p_employee_id and term.is_active and term.compensation_policy_version=2
      and term.compensation_mode in ('fixed_plus_bonus','fixed')
      and term.effective_from<=v_period.end_date and (term.effective_to is null or term.effective_to>=v_period.start_date);
  end if;
  v_recognized:=public.get_employee_recognized_production(p_period_id,p_employee_id);
  v_gross:=round(v_percentage+v_rewards+v_courtesy+v_bonus+v_fixed,2);
  update public.employee_settlements set
    compensation_term_id_snapshot=v_term.id,compensation_mode_snapshot=v_term.compensation_mode,
    compensation_type_snapshot=v_term.compensation_mode,base_monthly_salary_snapshot=v_term.base_monthly_salary,
    fixed_amount_snapshot=null,commission_rate_snapshot=v_rate,commission_rate=v_rate,
    fixed_salary_period_amount=round(v_fixed,2),fixed_compensation_total=round(v_fixed,2),
    mandatory_discount_enabled_snapshot=coalesce(v_term.mandatory_discount_enabled,false),
    mandatory_discount_rate=case when coalesce(v_term.mandatory_discount_enabled,false) then coalesce(v_term.mandatory_discount_rate,1) else 0 end,
    mandatory_discount_base_amount=case when coalesce(v_term.mandatory_discount_enabled,false) then v_recognized else 0 end,
    recognized_production_total=v_recognized,commissionable_base_total=round(v_commissionable,2),
    percentage_commission_total=round(v_percentage,2),reward_fixed_commission_total=round(v_rewards,2),
    courtesy_fixed_commission_total=round(v_courtesy,2),product_bonus_total=round(v_bonus,2),gross_pay_amount=v_gross
  where id=v_settlement.id returning * into v_settlement;
  return v_settlement;
end;
$$;

-- Fase 0 reconoce el costo al aprobar y su fecha es el cierre del período.
-- Las deudas y adelantos solo reducen el pago, nunca el costo laboral.
create or replace function public.sync_settlement_personnel_cost()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period public.payroll_periods%rowtype; v_cost numeric(12,2); v_posting uuid;
begin
  if new.status='approved' and (tg_op='INSERT' or old.status<>'approved') then
    select * into v_period from public.payroll_periods where id=new.payroll_period_id;
    v_cost:=round(greatest(coalesce(new.labor_cost_amount,coalesce(new.gross_pay_amount,0)-coalesce(new.mandatory_discount_amount,0)),0),2);
    insert into public.financial_postings(accounting_date,branch_id,payroll_period_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,metadata,created_by)
    values(v_period.end_date,new.branch_id,new.payroll_period_id,'personnel_cost','expense','approved_settlement_personnel_cost',v_cost,true,'employee_settlement',new.id,'Costo oficial de personal: '||new.settlement_number,jsonb_build_object('grossPay',new.gross_pay_amount,'mandatoryDiscount',new.mandatory_discount_amount,'laborCost',v_cost,'debtRecoveries',new.debt_deduction_total),new.approved_by)
    on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  elsif old.status='approved' and new.status='cancelled' then
    select id into v_posting from public.financial_postings where source_type='employee_settlement' and source_id=new.id and posting_code='approved_settlement_personnel_cost' and status='posted';
    if v_posting is not null then perform public.reverse_financial_posting(v_posting.id,'SOURCE_CANCELLED',new.cancellation_reason); end if;
  end if;
  return new;
end;
$$;

alter table public.employee_compensation_engine_settings enable row level security;
alter table public.employee_sale_item_attributions enable row level security;
drop policy if exists employee_compensation_engine_settings_admin on public.employee_compensation_engine_settings;
create policy employee_compensation_engine_settings_admin on public.employee_compensation_engine_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists employee_sale_item_attributions_admin on public.employee_sale_item_attributions;
create policy employee_sale_item_attributions_admin on public.employee_sale_item_attributions for all to authenticated using(public.is_admin()) with check(public.is_admin());

revoke all on function public.capture_sale_item_responsible_employee(),public.capture_service_recognized_production_v176(),public.apply_settlement_mandatory_discount_v176(),public.sync_settlement_personnel_cost(),public.create_employee_compensation_term_v176(uuid,text,numeric,boolean,numeric,date,text,boolean),public.get_employee_recognized_production(uuid,uuid),public.sync_employee_sale_item_attributions(uuid),public.checkout_pos_sale(jsonb),public.generate_employee_production_for_sale(uuid),public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) from public,anon;
grant execute on function public.create_employee_compensation_term_v176(uuid,text,numeric,boolean,numeric,date,text,boolean),public.get_employee_recognized_production(uuid,uuid),public.sync_employee_sale_item_attributions(uuid),public.checkout_pos_sale(jsonb),public.generate_employee_production_for_sale(uuid),public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Phase 1B operational finance
-- Origen: src/sql/177_financial_operational_register_phase_1b.sql
-- ============================================================
-- Fase 1B: registro operativo único, cuentas por pagar genéricas y caja.
-- Prospectiva: no reescribe sesiones cerradas, pagos ni documentos históricos.

alter table public.finance_manual_entries
  add column if not exists payment_status text not null default 'paid',
  add column if not exists payment_date date,
  add column if not exists due_date date,
  add column if not exists notes text,
  add column if not exists payable_id uuid;
alter table public.finance_manual_entries
  drop constraint if exists finance_manual_entries_payment_status_check;
alter table public.finance_manual_entries
  add constraint finance_manual_entries_payment_status_check
  check (payment_status in ('paid','pending'));

alter table public.accounts_payable
  alter column receipt_id drop not null,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists due_date date,
  add column if not exists description text,
  add column if not exists payment_date date;
alter table public.accounts_payable
  drop constraint if exists accounts_payable_status_check;
alter table public.accounts_payable
  add constraint accounts_payable_status_check
  check (status in ('open','pending','partial','paid','cancelled'));
create unique index if not exists accounts_payable_active_source_idx
  on public.accounts_payable(source_type,source_id)
  where source_type is not null and source_id is not null and status <> 'cancelled';
alter table public.finance_manual_entries
  drop constraint if exists finance_manual_entries_payable_id_fkey;
alter table public.finance_manual_entries
  add constraint finance_manual_entries_payable_id_fkey
  foreign key(payable_id) references public.accounts_payable(id) on delete set null;

alter table public.accounts_payable_payments
  alter column treasury_account_id drop not null;

alter table public.cash_movements
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists is_system_generated boolean not null default false,
  add column if not exists adjustment_direction text not null default 'increase';
alter table public.cash_movements
  drop constraint if exists cash_movements_adjustment_direction_check;
alter table public.cash_movements
  add constraint cash_movements_adjustment_direction_check
  check (adjustment_direction in ('increase','decrease'));
create unique index if not exists cash_movements_active_source_idx
  on public.cash_movements(source_type,source_id)
  where source_type is not null and source_id is not null and status='active';

create table if not exists public.pos_session_opening_corrections (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete restrict,
  original_opening_amount numeric(12,2) not null check(original_opening_amount >= 0),
  correction_amount numeric(12,2) not null check(correction_amount > 0),
  direction text not null check(direction in ('increase','decrease')),
  effective_opening_amount numeric(12,2) not null check(effective_opening_amount >= 0),
  reason_code text not null check(reason_code in ('DATA_ENTRY_ERROR','COUNTING_ERROR','OTHER')),
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pos_session_opening_corrections_session_idx
  on public.pos_session_opening_corrections(pos_session_id,created_at);

-- La fórmula de caja usa apertura efectiva y ajustes con dirección explícita.
-- Los ajustes históricos se conservan como increase por el default de columna.
create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.pos_sessions%rowtype; v_total_sales numeric(12,2):=0; v_total_cash numeric(12,2):=0;
  v_total_wallet numeric(12,2):=0; v_total_card numeric(12,2):=0; v_total_cancelled numeric(12,2):=0;
  v_sales_count integer:=0; v_cancelled_sales_count integer:=0; v_cash_income numeric(12,2):=0;
  v_cash_expense numeric(12,2):=0; v_adjustment_increase numeric(12,2):=0; v_adjustment_decrease numeric(12,2):=0;
  v_opening_increase numeric(12,2):=0; v_opening_decrease numeric(12,2):=0;
begin
  select * into v_session from public.pos_sessions where id=p_session_id for update;
  if not found then raise exception 'La sesión POS no existe.'; end if;
  select coalesce(sum(case when s.status='completed' then s.total else 0 end),0),coalesce(sum(case when s.status='cancelled' then s.total else 0 end),0),coalesce(count(*) filter(where s.status='completed'),0),coalesce(count(*) filter(where s.status='cancelled'),0)
  into v_total_sales,v_total_cancelled,v_sales_count,v_cancelled_sales_count from public.sales s where s.pos_session_id=p_session_id;
  select coalesce(sum(sp.amount) filter(where pm.counts_as_cash and s.status='completed'),0),coalesce(sum(sp.amount) filter(where pm.payment_kind='wallet_qr' and s.status='completed'),0),coalesce(sum(sp.amount) filter(where pm.payment_kind='card' and s.status='completed'),0)
  into v_total_cash,v_total_wallet,v_total_card from public.sale_payments sp join public.sales s on s.id=sp.sale_id join public.payment_methods pm on pm.id=sp.payment_method_id where s.pos_session_id=p_session_id;
  select coalesce(sum(cm.amount) filter(where cm.movement_type='income'),0),coalesce(sum(cm.amount) filter(where cm.movement_type='expense'),0),coalesce(sum(cm.amount) filter(where cm.movement_type='adjustment' and cm.adjustment_direction='increase'),0),coalesce(sum(cm.amount) filter(where cm.movement_type='adjustment' and cm.adjustment_direction='decrease'),0)
  into v_cash_income,v_cash_expense,v_adjustment_increase,v_adjustment_decrease from public.cash_movements cm where cm.pos_session_id=p_session_id and cm.status='active';
  select coalesce(sum(correction_amount) filter(where direction='increase'),0),coalesce(sum(correction_amount) filter(where direction='decrease'),0)
  into v_opening_increase,v_opening_decrease from public.pos_session_opening_corrections where pos_session_id=p_session_id;
  update public.pos_sessions set total_sales_amount=v_total_sales,total_cash_amount=v_total_cash,total_wallet_qr_amount=v_total_wallet,total_card_pos_amount=v_total_card,total_cancelled_amount=v_total_cancelled,sales_count=v_sales_count,cancelled_sales_count=v_cancelled_sales_count,
    expected_cash_amount=coalesce(opening_cash_amount,0)+v_opening_increase-v_opening_decrease+v_total_cash+v_cash_income-v_cash_expense-v_adjustment_decrease+v_adjustment_increase
  where id=p_session_id returning * into v_session;
  return v_session;
end; $$;

create or replace function public.create_pos_opening_correction(
  p_session_id uuid,p_correction_amount numeric,p_direction text,p_reason_code text,p_note text default null
) returns public.pos_session_opening_corrections language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.pos_sessions%rowtype; v_total numeric(12,2); v_correction public.pos_session_opening_corrections%rowtype;
begin
  if public.current_user_role() not in ('owner','admin') then raise exception 'Solo owner o admin puede corregir la apertura.'; end if;
  if p_direction not in ('increase','decrease') or p_reason_code not in ('DATA_ENTRY_ERROR','COUNTING_ERROR','OTHER') then raise exception 'La corrección de apertura no es válida.'; end if;
  if coalesce(p_correction_amount,0)<=0 then raise exception 'El monto de corrección debe ser mayor a cero.'; end if;
  if p_reason_code='OTHER' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'El motivo OTHER requiere una observación.'; end if;
  select * into v_session from public.pos_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'Solo se puede corregir la apertura de una sesión abierta.'; end if;
  if not public.can_manage_pos_branch(v_session.branch_id) then raise exception 'No tienes permisos para corregir esta apertura.'; end if;
  select coalesce(sum(case when direction='increase' then correction_amount else -correction_amount end),0) into v_total from public.pos_session_opening_corrections where pos_session_id=p_session_id;
  if (coalesce(v_session.opening_cash_amount,0)+v_total+(case when p_direction='increase' then p_correction_amount else -p_correction_amount end)) < 0 then raise exception 'La apertura efectiva no puede ser negativa.'; end if;
  insert into public.pos_session_opening_corrections(pos_session_id,original_opening_amount,correction_amount,direction,effective_opening_amount,reason_code,note,created_by)
  values(p_session_id,v_session.opening_cash_amount,round(p_correction_amount,2),p_direction,round((coalesce(v_session.opening_cash_amount,0)+v_total+(case when p_direction='increase' then p_correction_amount else -p_correction_amount end)),2),p_reason_code,nullif(btrim(coalesce(p_note,'')),''),public.current_employee_id()) returning * into v_correction;
  perform public.sync_pos_session_totals(p_session_id);
  return v_correction;
end; $$;

create or replace function public.create_operational_finance_entry(
  p_category_id uuid,p_branch_id uuid,p_accounting_date date,p_amount numeric,p_description text,p_payment_status text default 'paid',p_payment_method_id uuid default null,p_payment_date date default null,p_due_date date default null,p_reference text default null,p_evidence_url text default null,p_notes text default null
) returns public.finance_manual_entries language plpgsql security definer set search_path=public,pg_temp as $$
declare v_category public.finance_categories%rowtype; v_entry public.finance_manual_entries%rowtype; v_payable public.accounts_payable%rowtype;
  v_session public.pos_sessions%rowtype; v_counts_cash boolean:=false; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede registrar costos y gastos.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Monto y descripción son obligatorios.'; end if;
  if p_payment_status not in ('paid','pending') then raise exception 'El estado de pago no es válido.'; end if;
  if p_payment_status='paid' and p_payment_method_id is null then raise exception 'Selecciona el método de pago de la operación pagada.'; end if;
  select * into v_category from public.finance_categories where id=p_category_id and is_active;
  if not found then raise exception 'La categoría financiera no está disponible.'; end if;
  if p_payment_status='pending' and v_category.direction<>'expense' then raise exception 'Solo los egresos pueden registrarse como pendientes.'; end if;
  perform public.assert_financial_date_open(p_branch_id,coalesce(p_accounting_date,public.pos_business_date()));
  if p_payment_method_id is not null then select counts_as_cash into v_counts_cash from public.payment_methods where id=p_payment_method_id and is_active; end if;
  if p_payment_status='paid' and coalesce(v_counts_cash,false) then
    if p_branch_id is null then raise exception 'Un pago en efectivo requiere sede.'; end if;
    select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1 for update;
    if not found then raise exception 'El pago en efectivo requiere una sesión POS abierta en la sede.'; end if;
  end if;
  insert into public.finance_manual_entries(branch_id,entry_date,direction,category_id,amount,payment_method_id,description,reference,evidence_url,status,created_by,payment_status,payment_date,due_date,notes)
  values(p_branch_id,coalesce(p_accounting_date,public.pos_business_date()),v_category.direction, p_category_id,round(p_amount,2),p_payment_method_id,btrim(p_description),nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_evidence_url,'')),''),'active',v_actor,p_payment_status,case when p_payment_status='paid' then coalesce(p_payment_date,public.pos_business_date()) else null end,p_due_date,nullif(btrim(coalesce(p_notes,'')),'')) returning * into v_entry;
  insert into public.financial_postings(accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,metadata,created_by)
  values(v_entry.entry_date,v_entry.branch_id,v_category.financial_group,case when v_category.financial_group='asset_movement' and v_category.direction='income' then 'asset_increase' when v_category.financial_group='asset_movement' then 'asset_decrease' when v_category.direction='income' then 'income' else 'expense' end,'finance_manual_entry',v_entry.amount,v_category.affects_profit,'finance_manual_entry',v_entry.id,v_entry.description,jsonb_build_object('paymentStatus',p_payment_status,'reference',v_entry.reference),v_actor)
  on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  if p_payment_status='pending' then
    insert into public.accounts_payable(branch_id,source_type,source_id,accounting_date,original_amount,outstanding_amount,status,due_date,description,notes,created_by)
    values(v_entry.branch_id,'finance_manual_entry',v_entry.id,v_entry.entry_date,v_entry.amount,v_entry.amount,'pending',p_due_date,v_entry.description,v_entry.notes,v_actor) returning * into v_payable;
    update public.finance_manual_entries set payable_id=v_payable.id where id=v_entry.id returning * into v_entry;
    insert into public.financial_postings(accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,created_by)
    values(v_entry.entry_date,v_entry.branch_id,'payable','liability_increase','finance_manual_entry_payable',v_entry.amount,false,'accounts_payable',v_payable.id,'Obligación pendiente: '||v_entry.description,v_actor)
    on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  elsif coalesce(v_counts_cash,false) then
    insert into public.cash_movements(pos_session_id,branch_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
    values(v_session.id,v_session.branch_id,case when v_category.direction='income' then 'income' else 'expense' end,v_entry.amount,v_entry.description,'active',v_actor,'finance_manual_entry',v_entry.id,true)
    on conflict(source_type,source_id) where status='active' do nothing;
    perform public.sync_pos_session_totals(v_session.id);
  end if;
  return v_entry;
end; $$;

create or replace function public.pay_operational_accounts_payable(
  p_payable_id uuid,p_amount numeric,p_payment_method_id uuid,p_payment_date date default null,p_reference text default null,p_notes text default null
) returns public.accounts_payable language plpgsql security definer set search_path=public,pg_temp as $$
declare v_payable public.accounts_payable%rowtype; v_payment public.accounts_payable_payments%rowtype; v_session public.pos_sessions%rowtype; v_cash boolean:=false; v_actor uuid:=public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede pagar cuentas por pagar.'; end if;
  select * into v_payable from public.accounts_payable where id=p_payable_id for update;
  if not found or v_payable.status in ('paid','cancelled') then raise exception 'La cuenta por pagar no está disponible.'; end if;
  if coalesce(p_amount,0)<=0 or p_amount>v_payable.outstanding_amount then raise exception 'El pago no puede superar el saldo pendiente.'; end if;
  perform public.assert_financial_date_open(v_payable.branch_id,coalesce(p_payment_date,public.pos_business_date()));
  select counts_as_cash into v_cash from public.payment_methods where id=p_payment_method_id and is_active;
  if not found then raise exception 'El método de pago no está disponible.'; end if;
  if v_cash then select * into v_session from public.pos_sessions where branch_id=v_payable.branch_id and status='open' order by opened_at desc limit 1 for update; if not found then raise exception 'El pago en efectivo requiere una sesión POS abierta en la sede.'; end if; end if;
  insert into public.accounts_payable_payments(payable_id,payment_method_id,amount,paid_at,reference,notes,status,created_by)
  values(v_payable.id,p_payment_method_id,round(p_amount,2),coalesce(p_payment_date,public.pos_business_date()),nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_notes,'')),''),'posted',v_actor) returning * into v_payment;
  update public.accounts_payable set outstanding_amount=round(outstanding_amount-v_payment.amount,2),status=case when round(outstanding_amount-v_payment.amount,2)=0 then 'paid' else 'partial' end,payment_date=case when round(outstanding_amount-v_payment.amount,2)=0 then v_payment.paid_at else payment_date end,settled_at=case when round(outstanding_amount-v_payment.amount,2)=0 then now() else settled_at end where id=v_payable.id returning * into v_payable;
  insert into public.financial_postings(accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,created_by)
  values(v_payment.paid_at,v_payable.branch_id,'payable','liability_decrease','accounts_payable_payment',v_payment.amount,false,'accounts_payable_payment',v_payment.id,'Pago de cuenta por pagar',v_actor)
  on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  if v_cash then insert into public.cash_movements(pos_session_id,branch_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated) values(v_session.id,v_session.branch_id,'expense',v_payment.amount,'Pago de cuenta por pagar','active',v_actor,'accounts_payable_payment',v_payment.id,true) on conflict(source_type,source_id) where status='active' do nothing; perform public.sync_pos_session_totals(v_session.id); end if;
  return v_payable;
end; $$;

create or replace function public.cancel_operational_finance_entry(p_entry_id uuid,p_reason text)
returns public.finance_manual_entries language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry public.finance_manual_entries%rowtype; v_posting uuid; v_payable_posting uuid; v_cash public.cash_movements%rowtype; v_payable public.accounts_payable%rowtype; v_has_cash boolean:=false;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede anular costos y gastos.'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'El motivo de anulación es obligatorio.'; end if;
  select * into v_entry from public.finance_manual_entries where id=p_entry_id for update;
  if not found or v_entry.status<>'active' then raise exception 'El registro financiero no está disponible.'; end if;
  if v_entry.payable_id is not null then select * into v_payable from public.accounts_payable where id=v_entry.payable_id for update; if v_payable.outstanding_amount<>v_payable.original_amount then raise exception 'No se puede anular una obligación con pagos; primero revierte sus pagos.'; end if; select id into v_payable_posting from public.financial_postings where source_type='accounts_payable' and source_id=v_payable.id and status='posted' limit 1; update public.accounts_payable set status='cancelled' where id=v_payable.id; end if;
  select * into v_cash from public.cash_movements where source_type='finance_manual_entry' and source_id=v_entry.id and status='active' for update;
  v_has_cash:=found;
  if v_has_cash and not exists(select 1 from public.pos_sessions where id=v_cash.pos_session_id and status='open') then raise exception 'La salida de caja pertenece a una sesión cerrada; no puede anularse desde Finanzas.'; end if;
  select id into v_posting from public.financial_postings where source_type='finance_manual_entry' and source_id=v_entry.id and status='posted' limit 1;
  if v_posting is not null then perform public.reverse_financial_posting(v_posting,'SOURCE_CANCELLED',p_reason); end if;
  if v_payable_posting is not null then perform public.reverse_financial_posting(v_payable_posting,'SOURCE_CANCELLED',p_reason); end if;
  if v_has_cash then update public.cash_movements set status='cancelled',cancelled_at=now(),cancelled_by=public.current_employee_id(),cancelled_reason='Reversa desde Finanzas: '||btrim(p_reason) where id=v_cash.id; perform public.sync_pos_session_totals(v_cash.pos_session_id); end if;
  update public.finance_manual_entries set status='cancelled',cancellation_reason=btrim(p_reason),cancelled_at=now(),cancelled_by=public.current_employee_id(),updated_at=now() where id=v_entry.id returning * into v_entry;
  return v_entry;
end; $$;

create or replace function public.cancel_cash_movement(p_cash_movement_id uuid,p_cancelled_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_movement public.cash_movements%rowtype; v_session public.pos_sessions%rowtype;
begin
  if public.current_user_role() not in ('owner','admin','reception') then raise exception 'No tienes permisos para anular movimientos de caja.'; end if;
  if nullif(btrim(coalesce(p_cancelled_reason,'')),'') is null then raise exception 'Debes indicar el motivo de anulación.'; end if;
  select * into v_movement from public.cash_movements where id=p_cash_movement_id for update;
  if not found or v_movement.status<>'active' then raise exception 'El movimiento de caja no está disponible.'; end if;
  if v_movement.is_system_generated then raise exception 'Este movimiento fue generado por su documento origen y debe revertirse desde allí.'; end if;
  select * into v_session from public.pos_sessions where id=v_movement.pos_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'No se puede anular un movimiento de una sesión cerrada.'; end if;
  if not public.can_access_branch(v_movement.branch_id) then raise exception 'No tienes permisos para anular este movimiento.'; end if;
  update public.cash_movements set status='cancelled',cancelled_by=public.current_employee_id(),cancelled_reason=btrim(p_cancelled_reason),cancelled_at=now() where id=v_movement.id returning * into v_movement;
  perform public.sync_pos_session_totals(v_session.id); return v_movement;
end; $$;

-- Caja conserva hechos físicos manuales, pero los gastos operativos nuevos
-- nacen en Finanzas para no duplicar el asiento económico ni el efectivo.
create or replace function public.create_cash_movement(
  p_pos_session_id uuid,p_category_id uuid,p_movement_type text,p_amount numeric,p_description text,p_evidence_url text default null
) returns public.cash_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.pos_sessions%rowtype; v_category public.cash_movement_categories%rowtype; v_movement public.cash_movements%rowtype; v_employee_id uuid:=public.current_employee_id(); v_role public.app_role:=public.current_user_role();
begin
  if v_role is null or v_role not in ('owner','admin','reception') then raise exception 'No tienes permisos para registrar movimientos de caja.'; end if;
  if p_movement_type not in ('income','expense','adjustment') or coalesce(p_amount,0)<=0 or nullif(btrim(coalesce(p_description,'')),'') is null or p_category_id is null then raise exception 'Completa tipo, categoría, monto y descripción válidos.'; end if;
  select * into v_category from public.cash_movement_categories where id=p_category_id and is_active;
  if not found or v_category.movement_direction<>p_movement_type then raise exception 'La categoría no corresponde al tipo de movimiento seleccionado.'; end if;
  if v_category.code in ('operational_expense','petty_purchase') then raise exception 'Los gastos operativos se registran desde Registro de Costos y Gastos.'; end if;
  select * into v_session from public.pos_sessions where id=p_pos_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'No se pueden registrar movimientos en una sesión cerrada o inexistente.'; end if;
  if not public.can_access_branch(v_session.branch_id) then raise exception 'No tienes permisos para registrar movimientos en esta sede.'; end if;
  insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,evidence_url,status,created_by)
  values(v_session.id,v_session.branch_id,v_category.id,p_movement_type,round(p_amount,2),btrim(p_description),nullif(btrim(coalesce(p_evidence_url,'')),''),'active',v_employee_id) returning * into v_movement;
  perform public.sync_pos_session_totals(v_session.id);
  insert into public.pos_session_events(pos_session_id,employee_id,event_type,message,metadata)
  values(v_session.id,v_employee_id,'cash_movement_created','Movimiento físico de caja registrado.',jsonb_build_object('cash_movement_id',v_movement.id,'movement_type',v_movement.movement_type,'amount',v_movement.amount,'category_id',v_movement.category_id));
  return v_movement;
end; $$;

alter table public.pos_session_opening_corrections enable row level security;
drop policy if exists phase1b_admin on public.pos_session_opening_corrections;
create policy phase1b_admin on public.pos_session_opening_corrections for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert on public.pos_session_opening_corrections to authenticated;
revoke all on function public.create_pos_opening_correction(uuid,numeric,text,text,text),public.create_operational_finance_entry(uuid,uuid,date,numeric,text,text,uuid,date,date,text,text,text),public.pay_operational_accounts_payable(uuid,numeric,uuid,date,text,text),public.cancel_operational_finance_entry(uuid,text),public.cancel_cash_movement(uuid,text) from public,anon;
revoke all on function public.create_cash_movement(uuid,uuid,text,numeric,text,text) from public,anon;
revoke all on function public.sync_pos_session_totals(uuid) from public,anon;
grant execute on function public.create_pos_opening_correction(uuid,numeric,text,text,text),public.create_operational_finance_entry(uuid,uuid,date,numeric,text,text,uuid,date,date,text,text,text),public.pay_operational_accounts_payable(uuid,numeric,uuid,date,text,text),public.cancel_operational_finance_entry(uuid,text),public.cancel_cash_movement(uuid,text) to authenticated,service_role;
grant execute on function public.create_cash_movement(uuid,uuid,text,numeric,text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: POS and finance stabilization
-- Origen: src/sql/178_stabilize_finance_cash_pos_production.sql
-- ============================================================
-- Fase 1B/1A stabilization. Prospective only: never changes paid settlements
-- or closed POS sessions. This migration supersedes runtime gaps in 176/177.

alter table public.employee_settlements
  add column if not exists cancellation_reason_code text;
alter table public.employee_settlements
  drop constraint if exists employee_settlements_cancellation_reason_code_check;
alter table public.employee_settlements
  add constraint employee_settlements_cancellation_reason_code_check
  check (cancellation_reason_code is null or cancellation_reason_code in (
    'CALCULATION_ERROR','WRONG_EMPLOYEE','WRONG_PERIOD','WRONG_PRODUCTION','DUPLICATE','ADMINISTRATIVE_CORRECTION','OTHER'
  ));

-- New seven-argument overload preserves the six-argument legacy call. New UI
-- always sends a direction; old callers retain their historical increase default.
create or replace function public.create_cash_movement(
  p_pos_session_id uuid, p_category_id uuid, p_movement_type text, p_amount numeric,
  p_description text, p_evidence_url text default null, p_adjustment_direction text default null
) returns public.cash_movements
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.pos_sessions%rowtype;
  v_category public.cash_movement_categories%rowtype;
  v_movement public.cash_movements%rowtype;
  v_direction text := case when p_movement_type='adjustment' then coalesce(p_adjustment_direction,'increase') else 'increase' end;
begin
  if public.current_user_role() not in ('owner','admin','reception') then raise exception 'No tienes permisos para registrar movimientos de caja.'; end if;
  if p_movement_type not in ('income','expense','adjustment') or coalesce(p_amount,0)<=0 or p_category_id is null or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Completa tipo, categoría, monto y descripción válidos.'; end if;
  if p_movement_type='adjustment' and v_direction not in ('increase','decrease') then raise exception 'La dirección del ajuste debe ser aumentar o disminuir.'; end if;
  select * into v_category from public.cash_movement_categories where id=p_category_id and is_active;
  if not found or v_category.movement_direction<>p_movement_type then raise exception 'La categoría no corresponde al tipo de movimiento seleccionado.'; end if;
  if v_category.code in ('operational_expense','petty_purchase') then raise exception 'Los gastos operativos se registran desde Registro de Costos y Gastos.'; end if;
  select * into v_session from public.pos_sessions where id=p_pos_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'No se pueden registrar movimientos en una sesión cerrada o inexistente.'; end if;
  if not public.can_access_branch(v_session.branch_id) then raise exception 'No tienes permisos para registrar movimientos en esta sede.'; end if;
  insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,evidence_url,adjustment_direction,status,created_by)
  values(v_session.id,v_session.branch_id,v_category.id,p_movement_type,round(p_amount,2),btrim(p_description),nullif(btrim(coalesce(p_evidence_url,'')),''),v_direction,'active',public.current_employee_id()) returning * into v_movement;
  perform public.sync_pos_session_totals(v_session.id);
  return v_movement;
end; $$;

create or replace function public.create_pos_opening_correction(
  p_session_id uuid, p_correction_amount numeric, p_direction text, p_reason_code text, p_note text default null
) returns public.pos_session_opening_corrections
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.pos_sessions%rowtype; v_net_corrections numeric(12,2):=0; v_effective numeric(12,2); v_correction public.pos_session_opening_corrections%rowtype;
begin
  if public.current_user_role() not in ('owner','admin') then raise exception 'Solo owner o admin puede corregir la apertura.'; end if;
  if coalesce(p_correction_amount,0)<=0 then raise exception 'El monto de corrección debe ser mayor a cero.'; end if;
  if p_direction not in ('increase','decrease') then raise exception 'La dirección de corrección no es válida.'; end if;
  if p_reason_code not in ('DATA_ENTRY_ERROR','COUNTING_ERROR','OTHER') then raise exception 'El motivo de corrección no es válido.'; end if;
  if p_reason_code='OTHER' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'El motivo Otro requiere una observación.'; end if;
  select * into v_session from public.pos_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'Solo se puede corregir la apertura de una sesión abierta.'; end if;
  if not public.can_manage_pos_branch(v_session.branch_id) then raise exception 'No tienes permisos para corregir esta apertura.'; end if;
  select coalesce(sum(case when direction='increase' then correction_amount else -correction_amount end),0) into v_net_corrections from public.pos_session_opening_corrections where pos_session_id=p_session_id;
  v_effective:=round(coalesce(v_session.opening_cash_amount,0)+v_net_corrections+(case when p_direction='increase' then p_correction_amount else -p_correction_amount end),2);
  if v_effective<0 then raise exception 'La apertura efectiva no puede ser negativa.'; end if;
  insert into public.pos_session_opening_corrections(pos_session_id,original_opening_amount,correction_amount,direction,effective_opening_amount,reason_code,note,created_by)
  values(p_session_id,coalesce(v_session.opening_cash_amount,0),round(p_correction_amount,2),p_direction,v_effective,p_reason_code,nullif(btrim(coalesce(p_note,'')),''),public.current_employee_id()) returning * into v_correction;
  perform public.sync_pos_session_totals(p_session_id);
  return v_correction;
end; $$;

create or replace function public.cancel_employee_settlement_with_reason(
  p_settlement_id uuid, p_reason_code text, p_note text default null
) returns public.employee_settlements
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.employee_settlements%rowtype;
begin
  if p_reason_code not in ('CALCULATION_ERROR','WRONG_EMPLOYEE','WRONG_PERIOD','WRONG_PRODUCTION','DUPLICATE','ADMINISTRATIVE_CORRECTION','OTHER') then raise exception 'El motivo de anulación no es válido.'; end if;
  if p_reason_code='OTHER' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'El motivo Otro requiere una observación.'; end if;
  select * into v_settlement from public.transition_employee_settlement(p_settlement_id,'cancel',nullif(btrim(coalesce(p_note,'')),''));
  update public.employee_settlements set cancellation_reason_code=p_reason_code, cancellation_reason=coalesce(nullif(btrim(coalesce(p_note,'')),''),cancellation_reason), updated_at=now() where id=v_settlement.id returning * into v_settlement;
  return v_settlement;
end; $$;

revoke all on function public.create_cash_movement(uuid,uuid,text,numeric,text,text,text), public.create_pos_opening_correction(uuid,numeric,text,text,text), public.cancel_employee_settlement_with_reason(uuid,text,text) from public,anon;
grant execute on function public.create_cash_movement(uuid,uuid,text,numeric,text,text,text), public.create_pos_opening_correction(uuid,numeric,text,text,text), public.cancel_employee_settlement_with_reason(uuid,text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Sales canonical reconciliation
-- Origen: src/sql/179_sales_canonical_reconciliation_and_stability.sql
-- ============================================================
-- EstabilizaciÃ³n transversal: una venta se lee siempre desde sus hechos
-- comerciales (sales, items, pagos, rewards y atribuciones), sin tabla mutable
-- adicional. No modifica ventas cerradas ni liquidaciones pagadas.

create or replace view public.vw_sale_employee_attributions
with (security_invoker = true)
as
select distinct
  sale.id as sale_id,
  item.id as sale_item_id,
  sale.branch_id,
  sale.accounting_date,
  item.item_type,
  coalesce(
    explicit.employee_id,
    item.attributed_employee_id,
    item.barber_id,
    case when item.item_type = 'service' then sale.barber_id end
  ) as responsible_employee_id
from public.sales sale
join public.sale_items item on item.sale_id = sale.id
left join public.employee_sale_item_attributions explicit
  on explicit.sale_item_id = item.id
 and explicit.status = 'active'
where coalesce(
  explicit.employee_id,
  item.attributed_employee_id,
  item.barber_id,
  case when item.item_type = 'service' then sale.barber_id end
) is not null;

create or replace view public.vw_sales_canonical
with (security_invoker = true)
as
select
  sale.id as sale_id,
  concat('VTA-', upper(left(sale.id::text, 8))) as sale_reference,
  sale.accounting_date,
  sale.created_at,
  sale.closed_at,
  sale.status,
  sale.branch_id,
  sale.pos_session_id,
  session.status as session_status,
  sale.customer_id,
  customer.full_name as customer_name,
  branch.name as branch_name,
  sale.subtotal,
  sale.discount_total,
  sale.courtesy_total,
  sale.total,
  sale.paid_total,
  sale.change_amount,
  sale.operation_kind,
  coalesce(item_facts.has_courtesy, false) as has_courtesy,
  coalesce(reward_facts.has_reward, false) as has_reward,
  coalesce(reward_facts.reward_discount_total, 0)::numeric(12,2) as reward_discount_total,
  coalesce(item_facts.item_types, array[]::text[]) as item_types,
  coalesce(payment_facts.payment_method_ids, array[]::uuid[]) as payment_method_ids,
  coalesce(payment_facts.payment_method_labels, array[]::text[]) as payment_method_labels,
  coalesce(payment_facts.payment_rows, '[]'::jsonb) as payment_rows,
  coalesce(responsible_facts.responsible_employee_ids, array[]::uuid[]) as responsible_employee_ids,
  coalesce(responsible_facts.responsibles, '[]'::jsonb) as responsibles
from public.sales sale
join public.branches branch on branch.id = sale.branch_id
join public.customers customer on customer.id = sale.customer_id
left join public.pos_sessions session on session.id = sale.pos_session_id
left join lateral (
  select
    bool_or(item.is_courtesy) as has_courtesy,
    array_agg(distinct item.item_type order by item.item_type) as item_types
  from public.sale_items item
  where item.sale_id = sale.id
) item_facts on true
left join lateral (
  select
    bool_or(redemption.status = 'applied') as has_reward,
    coalesce(sum(redemption.discount_amount) filter (where redemption.status = 'applied'), 0) as reward_discount_total
  from public.reward_redemptions redemption
  where redemption.sale_id = sale.id
) reward_facts on true
left join lateral (
  select
    array_agg(distinct payment.payment_method_id) as payment_method_ids,
    array_agg(distinct method.name order by method.name) as payment_method_labels,
    jsonb_agg(jsonb_build_object(
      'payment_method_id', payment.payment_method_id,
      'payment_method_name', method.name,
      'payment_kind', method.payment_kind,
      'counts_as_cash', method.counts_as_cash,
      'amount', payment.amount,
      'change_amount', payment.change_amount
    ) order by payment.created_at) as payment_rows
  from public.sale_payments payment
  join public.payment_methods method on method.id = payment.payment_method_id
  where payment.sale_id = sale.id
) payment_facts on true
left join lateral (
  select
    array_agg(distinct attribution.responsible_employee_id) as responsible_employee_ids,
    jsonb_agg(distinct jsonb_build_object(
      'employee_id', attribution.responsible_employee_id,
      'employee_name', employee.full_name
    )) as responsibles
  from public.vw_sale_employee_attributions attribution
  join public.employees employee on employee.id = attribution.responsible_employee_id
  where attribution.sale_id = sale.id
) responsible_facts on true;

revoke all on public.vw_sale_employee_attributions, public.vw_sales_canonical from public, anon, authenticated;
grant select on public.vw_sale_employee_attributions, public.vw_sales_canonical to service_role;

create or replace function public.get_sales_canonical_page(
  p_date_from date default null,
  p_date_to date default null,
  p_branch_id uuid default null,
  p_status text default null,
  p_customer text default null,
  p_responsible_employee_id uuid default null,
  p_payment_method_id uuid default null,
  p_pos_session_id uuid default null,
  p_item_type text default null,
  p_courtesy text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_total_count bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_status is not null and p_status not in ('draft', 'completed', 'cancelled') then
    raise exception 'El estado de venta no es vÃ¡lido.';
  end if;
  if p_item_type is not null and p_item_type not in ('service', 'product') then
    raise exception 'El tipo de Ã­tem no es vÃ¡lido.';
  end if;
  if p_courtesy is not null and p_courtesy not in ('with_courtesy', 'without_courtesy') then
    raise exception 'El filtro de cortesÃ­a no es vÃ¡lido.';
  end if;
  if p_branch_id is not null and not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para consultar esta sede.';
  end if;

  with filtered as (
    select canonical.*
    from public.vw_sales_canonical canonical
    where public.can_manage_pos_branch(canonical.branch_id)
      and (p_date_from is null or canonical.accounting_date >= p_date_from)
      and (p_date_to is null or canonical.accounting_date <= p_date_to)
      and (p_branch_id is null or canonical.branch_id = p_branch_id)
      and (p_status is null or canonical.status = p_status)
      and (nullif(btrim(coalesce(p_customer, '')), '') is null or canonical.customer_name ilike '%' || btrim(p_customer) || '%')
      and (p_responsible_employee_id is null or p_responsible_employee_id = any(canonical.responsible_employee_ids))
      and (p_payment_method_id is null or p_payment_method_id = any(canonical.payment_method_ids))
      and (p_pos_session_id is null or canonical.pos_session_id = p_pos_session_id)
      and (p_item_type is null or p_item_type = any(canonical.item_types))
      and (p_courtesy is null or (p_courtesy = 'with_courtesy' and canonical.has_courtesy) or (p_courtesy = 'without_courtesy' and not canonical.has_courtesy))
  )
  select count(*) into v_total_count from filtered;

  with filtered as (
    select canonical.*
    from public.vw_sales_canonical canonical
    where public.can_manage_pos_branch(canonical.branch_id)
      and (p_date_from is null or canonical.accounting_date >= p_date_from)
      and (p_date_to is null or canonical.accounting_date <= p_date_to)
      and (p_branch_id is null or canonical.branch_id = p_branch_id)
      and (p_status is null or canonical.status = p_status)
      and (nullif(btrim(coalesce(p_customer, '')), '') is null or canonical.customer_name ilike '%' || btrim(p_customer) || '%')
      and (p_responsible_employee_id is null or p_responsible_employee_id = any(canonical.responsible_employee_ids))
      and (p_payment_method_id is null or p_payment_method_id = any(canonical.payment_method_ids))
      and (p_pos_session_id is null or canonical.pos_session_id = p_pos_session_id)
      and (p_item_type is null or p_item_type = any(canonical.item_types))
      and (p_courtesy is null or (p_courtesy = 'with_courtesy' and canonical.has_courtesy) or (p_courtesy = 'without_courtesy' and not canonical.has_courtesy))
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb)
  into v_rows
  from (
    select *
    from filtered
    order by accounting_date desc, created_at desc, sale_id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ) page_rows;

  return jsonb_build_object(
    'rows', v_rows,
    'total_count', v_total_count,
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

create or replace function public.get_sales_reconciliation(
  p_accounting_date date,
  p_branch_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with scoped as (
    select * from public.vw_sales_canonical canonical
    where canonical.accounting_date = p_accounting_date
      and canonical.status = 'completed'
      and (p_branch_id is null or canonical.branch_id = p_branch_id)
      and public.can_manage_pos_branch(canonical.branch_id)
  ), payment_totals as (
    select coalesce(sum((payment ->> 'amount')::numeric), 0) as amount,
           coalesce(sum((payment ->> 'amount')::numeric) filter (where coalesce((payment ->> 'counts_as_cash')::boolean, false)), 0) as cash_amount
    from scoped cross join lateral jsonb_array_elements(scoped.payment_rows) payment
  )
  select jsonb_build_object(
    'accounting_date', p_accounting_date,
    'branch_id', p_branch_id,
    'completed_sales', count(*),
    'subtotal', coalesce(sum(subtotal), 0),
    'discounts', coalesce(sum(discount_total), 0),
    'courtesy', coalesce(sum(courtesy_total), 0),
    'total', coalesce(sum(total), 0),
    'paid', coalesce(sum(paid_total), 0),
    'rewards', coalesce(sum(reward_discount_total), 0),
    'sales_with_responsible', count(*) filter (where cardinality(responsible_employee_ids) > 0),
    'payment_total', (select amount from payment_totals),
    'cash_total', (select cash_amount from payment_totals)
  ) from scoped;
$$;

-- La cortesÃ­a se gana por el valor comercial de la lÃ­nea de servicio,
-- nunca por el total ya reducido por Rewards.
create or replace function public.validate_completed_sale_courtesies()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_product_item record; v_courtesy_quantity numeric; v_item_capacity numeric; v_total_capacity numeric; v_total_amount_cap numeric; v_total_amount numeric; v_rule_id uuid; v_rule_name text;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if not exists (select 1 from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy) then return new; end if;
  with matched_services as (
    select si.id, si.quantity, rule.maximum_courtesy_items, rule.maximum_courtesy_amount
    from public.sale_items si
    cross join lateral (
      select r.* from public.courtesy_rules r
      where r.is_active and (r.branch_id is null or r.branch_id = new.branch_id)
        and (r.starts_at is null or r.starts_at <= new.closed_at) and (r.ends_at is null or r.ends_at >= new.closed_at)
        and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id)
        and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id))
        and coalesce(coalesce(si.original_total, si.quantity * si.unit_price) / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount
      order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc, r.priority desc, r.created_at desc limit 1
    ) rule where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
  ) select coalesce(sum(quantity * maximum_courtesy_items), 0), case when bool_or(maximum_courtesy_amount is null) then null else sum(quantity * maximum_courtesy_amount) end into v_total_capacity, v_total_amount_cap from matched_services;
  select coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_price), 0) into v_courtesy_quantity, v_total_amount from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy;
  if v_total_capacity = 0 or v_courtesy_quantity > v_total_capacity then raise exception 'La cantidad de productos en cortesÃ­a supera el cupo configurado para los servicios pagados.'; end if;
  if v_total_amount_cap is not null and v_total_amount > v_total_amount_cap then raise exception 'El importe de productos en cortesÃ­a supera el tope configurado.'; end if;
  for v_product_item in select * from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy loop
    with matched_services as (
      select si.quantity, rule.id as rule_id, rule.name as rule_name, rule.maximum_courtesy_items from public.sale_items si cross join lateral (
        select r.* from public.courtesy_rules r where r.is_active and (r.branch_id is null or r.branch_id = new.branch_id) and (r.starts_at is null or r.starts_at <= new.closed_at) and (r.ends_at is null or r.ends_at >= new.closed_at) and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id) and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id)) and coalesce(coalesce(si.original_total, si.quantity * si.unit_price) / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc, r.priority desc, r.created_at desc limit 1
      ) rule where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
    ) select ms.rule_id, ms.rule_name, coalesce(sum(ms.quantity * coalesce(benefit.max_quantity, ms.maximum_courtesy_items)), 0) into v_rule_id, v_rule_name, v_item_capacity from matched_services ms join public.products product on product.id = v_product_item.product_id left join public.courtesy_rule_benefits benefit on benefit.rule_id = ms.rule_id and benefit.is_active and benefit.benefit_item_type = 'product' and benefit.product_id = v_product_item.product_id where (benefit.id is not null and (benefit.max_unit_amount is null or v_product_item.unit_price <= benefit.max_unit_amount)) or (benefit.id is null and product.is_courtesy_allowed and not exists (select 1 from public.courtesy_rule_benefits configured where configured.rule_id = ms.rule_id and configured.is_active and configured.benefit_item_type = 'product')) group by ms.rule_id, ms.rule_name order by sum(ms.quantity * coalesce(benefit.max_quantity, ms.maximum_courtesy_items)) desc limit 1;
    if not found or v_product_item.quantity > v_item_capacity then raise exception 'El producto en cortesÃ­a no estÃ¡ permitido o supera su mÃ¡ximo configurado.'; end if;
    update public.sale_items set courtesy_rule_id = v_rule_id, courtesy_rule_name_snapshot = v_rule_name where id = v_product_item.id;
  end loop;
  return new;
end;
$$;

-- El esperado de efectivo siempre es el total sincronizado de la sesiÃ³n;
-- no se vuelve a reconstruir con una fÃ³rmula legacy en el cierre.
create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_payments jsonb;
  v_expected_cash numeric(12,2);
begin
  perform public.sync_pos_session_totals(p_session_id);
  select expected_cash_amount into v_expected_cash from public.pos_sessions where id = p_session_id;
  v_summary := public.get_pos_session_closure_summary_raw(p_session_id);
  if not public.is_admin() and exists (select 1 from public.pos_session_legacy_closure_authorizations where pos_session_id = p_session_id) then
    raise exception 'No tienes permisos para ver el cierre histÃ³rico auditado.';
  end if;
  select coalesce(jsonb_agg(
    jsonb_set(item, '{expected_amount}', to_jsonb(case when method.counts_as_cash then coalesce(v_expected_cash, 0) else coalesce((item ->> 'expected_amount')::numeric, 0) end), true)
    order by ordinal
  ), '[]'::jsonb) into v_payments
  from jsonb_array_elements(v_summary -> 'payment_methods') with ordinality as payments(item, ordinal)
  join public.payment_methods method on method.id = (item ->> 'payment_method_id')::uuid
  where method.payment_kind <> 'internal_credit';
  return jsonb_set(v_summary, '{payment_methods}', v_payments, true);
end;
$$;

revoke all on function public.get_sales_canonical_page(date,date,uuid,text,text,uuid,uuid,uuid,text,text,integer,integer), public.get_sales_reconciliation(date,uuid), public.get_pos_session_closure_summary(uuid) from public, anon;
grant execute on function public.get_sales_canonical_page(date,date,uuid,text,text,uuid,uuid,uuid,text,text,integer,integer), public.get_sales_reconciliation(date,uuid), public.get_pos_session_closure_summary(uuid) to authenticated, service_role;

-- Control de ventas conserva su contrato JSON, pero su universo de ventas es
-- exactamente el mismo read model que usa Historial.
create or replace function public.get_sales_control_breakdown(p_accounting_date date, p_branch_id uuid default null, p_pos_session_id uuid default null)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  with scoped as (
    select * from public.vw_sales_canonical c
    where c.status = 'completed' and c.accounting_date = p_accounting_date
      and (p_branch_id is null or c.branch_id = p_branch_id)
      and (p_pos_session_id is null or c.pos_session_id = p_pos_session_id)
      and public.can_manage_pos_branch(c.branch_id)
  ), payments as (
    select c.sale_id, c.created_at, c.total sale_total, c.customer_name, coalesce((c.responsibles -> 0 ->> 'employee_name'), 'Sin responsable') barber_name,
      (payment ->> 'amount')::numeric amount, coalesce((payment ->> 'change_amount')::numeric, 0) change_amount,
      payment ->> 'payment_method_id' payment_method_id, payment ->> 'payment_method_name' payment_method_name, payment ->> 'payment_kind' payment_kind
    from scoped c cross join lateral jsonb_array_elements(c.payment_rows) payment
  ), service_lines as (
    select attribution.responsible_employee_id employee_id, item.quantity,
      greatest(coalesce(item.total, 0), 0) collected_amount,
      case when item.is_courtesy or c.has_reward then 0::numeric
        when public.is_operational_contribution_service_excluded(item.service_id, coalesce(c.closed_at, c.created_at)) then 0::numeric
        when item.quantity <= 0 then 0::numeric
        else least(greatest(coalesce(item.total, 0), 0), round(item.quantity * public.calculate_operational_contribution(greatest(coalesce(item.total, 0), 0) / item.quantity, c.accounting_date), 2)) end contribution_amount
    from scoped c join public.sale_items item on item.sale_id = c.sale_id and item.item_type = 'service'
    join public.vw_sale_employee_attributions attribution on attribution.sale_item_id = item.id
  ), categories as (
    select case when item.item_type = 'service' then 'Servicios' else coalesce(category.name, 'Productos y otras categorÃ­as') end name, item.item_type, sum(item.total) total
    from scoped c join public.sale_items item on item.sale_id = c.sale_id left join public.products product on product.id = item.product_id left join public.product_categories category on category.id = product.category_id group by 1,2
  )
  select jsonb_build_object(
    'summary', jsonb_build_object('sales_count',(select count(*) from scoped),'gross_total',coalesce((select sum(subtotal) from scoped),0),'net_total',coalesce((select sum(total) from scoped),0),'paid_total',coalesce((select sum(paid_total) from scoped),0),'service_total',coalesce((select sum(collected_amount) from service_lines),0),'operational_contribution_total',coalesce((select sum(contribution_amount) from service_lines),0),'commissionable_base_total',coalesce((select sum(collected_amount-contribution_amount) from service_lines),0),'courtesy_total',coalesce((select sum(courtesy_total) from scoped),0),'discount_total',coalesce((select sum(discount_total) from scoped),0),'reward_discount_total',coalesce((select sum(reward_discount_total) from scoped),0),'internal_credit_total',coalesce((select sum(amount) from payments where payment_kind='internal_credit'),0),'real_collected_total',coalesce((select sum(amount) from payments where payment_kind<>'internal_credit'),0)),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('sale_id',sale_id,'created_at',created_at,'sale_total',sale_total,'customer_name',customer_name,'barber_name',barber_name,'amount',amount,'change_amount',change_amount,'payment_method_id',payment_method_id,'payment_method_name',payment_method_name,'payment_kind',payment_kind) order by created_at desc) from payments),'[]'::jsonb),
    'barbers',coalesce((select jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee.full_name,'services_count',services_count,'service_gross',service_gross,'operational_contribution',contribution,'commissionable_base',service_gross-contribution) order by service_gross-contribution desc) from (select employee_id,count(*) services_count,sum(collected_amount) service_gross,sum(contribution_amount) contribution from service_lines group by employee_id) ranked join public.employees employee on employee.id=ranked.employee_id),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('name',name,'item_type',item_type,'total',total) order by total desc) from categories),'[]'::jsonb),
    'adjustments',jsonb_build_object('courtesy_total',coalesce((select sum(courtesy_total) from scoped),0),'commercial_discount_total',coalesce((select sum(discount_total) from scoped),0),'reward_discount_total',coalesce((select sum(reward_discount_total) from scoped),0),'internal_operations',coalesce((select count(*) from scoped where operation_kind<>'customer'),0),'internal_credit_total',coalesce((select sum(amount) from payments where payment_kind='internal_credit'),0)),
    'recent_sales',coalesce((select jsonb_agg(jsonb_build_object('id',sale_id,'created_at',created_at,'total',total,'paid_total',paid_total,'courtesy_total',courtesy_total,'discount_total',discount_total,'operation_kind',operation_kind,'customer_name',customer_name,'barber_name',coalesce(responsibles->0->>'employee_name','Sin responsable'),'payment_methods',to_jsonb(payment_method_labels)) order by created_at desc) from scoped),'[]'::jsonb)
  );
$$;
revoke all on function public.get_sales_control_breakdown(date,uuid,uuid) from public, anon;
grant execute on function public.get_sales_control_breakdown(date,uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';



-- ============================================================
-- BLOQUE: Settlement production reconciliation
-- Origen: src/sql/180_settlement_production_reconciliation_and_cancellation_fix.sql
-- ============================================================
-- Settlement production reconciliation and cancellation stabilization.
-- This migration is prospective and corrective only. It never rewrites paid
-- settlements, closed payroll periods, or closed historical documents.

-- Reward configuration and recognized production used two BEFORE triggers.
-- PostgreSQL executes same-kind triggers alphabetically, so the old recognized
-- snapshot could run before the reward rule had populated its commission basis.
-- Recreate the configuration trigger with an earlier name.
create or replace function public.apply_reward_commission_configuration_v180()
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

  select category_id into v_category_id
  from public.services
  where id = new.service_id;

  select id, commission_mode, commission_basis_amount
  into v_rule_id, v_mode, v_basis
  from public.reward_service_commission_rules
  where is_active
    and effective_from <= new.production_date::date
    and (effective_to is null or effective_to >= new.production_date::date)
    and (
      service_id = new.service_id
      or (service_id is null and service_category_id = v_category_id)
      or (service_id is null and service_category_id is null)
    )
  order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc,
           priority desc
  limit 1;

  v_basis := greatest(coalesce(v_basis, 0), 0);
  if v_mode = 'percentage'
    and not public.is_operational_contribution_service_excluded(new.service_id, new.production_date) then
    v_contribution := least(v_basis, public.calculate_operational_contribution(v_basis, new.production_date::date));
  end if;

  new.reward_commission_rule_id := v_rule_id;
  new.reward_commission_mode := coalesce(v_mode, 'fixed');
  new.reward_commission_basis_amount := v_basis;
  new.recognized_production_amount := v_basis;
  new.operational_contribution_amount := case when v_mode = 'percentage' then v_contribution else 0 end;
  new.commissionable_amount := case when v_mode = 'percentage' then greatest(v_basis - v_contribution, 0) else 0 end;
  new.fixed_commission_amount := case when v_mode = 'fixed' then v_basis else 0 end;
  return new;
end;
$$;

drop trigger if exists employee_service_production_reward_commission_configuration
  on public.employee_service_production;
drop trigger if exists employee_service_production_010_reward_commission_configuration_v180
  on public.employee_service_production;
create trigger employee_service_production_010_reward_commission_configuration_v180
before insert or update of production_source, service_id, production_date
on public.employee_service_production
for each row execute function public.apply_reward_commission_configuration_v180();

-- Defensively keep the recognized snapshot tied to the configured basis even
-- when a later integration updates that basis directly.
create or replace function public.capture_service_recognized_production_v176()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_internal_recognized numeric(12,2);
begin
  if new.production_source = 'reward' then
    new.recognized_production_amount := greatest(coalesce(new.reward_commission_basis_amount, 0), 0);
  elsif new.production_source = 'employee_benefit' then
    select operation.recognized_production_amount * new.quantity
    into v_internal_recognized
    from public.internal_pos_operations operation
    where operation.sale_id = new.sale_id
    limit 1;
    new.recognized_production_amount := greatest(coalesce(v_internal_recognized, new.original_line_total), 0);
  else
    new.recognized_production_amount := greatest(coalesce(new.original_line_total, 0), 0);
  end if;
  return new;
end;
$$;

-- Safe repair: only uncommitted reward production from completed sales with a
-- closed POS session and an open payroll period. Draft/review/approved/paid
-- settlement documents are deliberately left for explicit cancellation and
-- recreation, never silently changed here.
with reward_candidates as (
  select
    production.id,
    rule.id as rule_id,
    rule.commission_mode,
    greatest(coalesce(rule.commission_basis_amount, 0), 0) as basis_amount,
    case
      when rule.commission_mode = 'percentage'
        and not public.is_operational_contribution_service_excluded(production.service_id, production.production_date)
      then least(
        greatest(coalesce(rule.commission_basis_amount, 0), 0),
        public.calculate_operational_contribution(greatest(coalesce(rule.commission_basis_amount, 0), 0), production.production_date::date)
      )
      else 0
    end as contribution_amount
  from public.employee_service_production production
  join public.sales sale on sale.id = production.sale_id and sale.status = 'completed'
  join public.pos_sessions session on session.id = sale.pos_session_id and session.status = 'closed'
  join public.payroll_periods period on period.id = production.payroll_period_id
    and period.status not in ('closed', 'cancelled')
  join public.services service on service.id = production.service_id
  join lateral (
    select candidate.*
    from public.reward_service_commission_rules candidate
    where candidate.is_active
      and candidate.effective_from <= production.production_date::date
      and (candidate.effective_to is null or candidate.effective_to >= production.production_date::date)
      and (
        candidate.service_id = production.service_id
        or (candidate.service_id is null and candidate.service_category_id = service.category_id)
        or (candidate.service_id is null and candidate.service_category_id is null)
      )
    order by case when candidate.service_id is not null then 3 when candidate.service_category_id is not null then 2 else 1 end desc,
             candidate.priority desc
    limit 1
  ) rule on true
  where production.status = 'active'
    and production.production_source = 'reward'
    and greatest(coalesce(rule.commission_basis_amount, 0), 0) > 0
    and coalesce(production.recognized_production_amount, 0) <> greatest(coalesce(rule.commission_basis_amount, 0), 0)
    and not exists (
      select 1
      from public.employee_settlement_service_lines line
      join public.employee_settlements settlement on settlement.id = line.settlement_id
      where line.production_entry_id = production.id
        and settlement.status <> 'cancelled'
    )
)
update public.employee_service_production production
set reward_commission_rule_id = candidate.rule_id,
    reward_commission_mode = candidate.commission_mode,
    reward_commission_basis_amount = candidate.basis_amount,
    operational_contribution_amount = case when candidate.commission_mode = 'percentage' then candidate.contribution_amount else 0 end,
    commissionable_amount = case when candidate.commission_mode = 'percentage' then greatest(candidate.basis_amount - candidate.contribution_amount, 0) else 0 end,
    fixed_commission_amount = case when candidate.commission_mode = 'fixed' then candidate.basis_amount else 0 end,
    recognized_production_amount = candidate.basis_amount
from reward_candidates candidate
where production.id = candidate.id;

-- Wrap the active preparer. The previous layer reserves debts and enforces the
-- compensation term; this layer makes its service-line snapshots authoritative.
do $$
begin
  if to_regprocedure('public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)') is not null
    and to_regprocedure('public.prepare_employee_settlement_v179(uuid,uuid,numeric,jsonb,text,text)') is null then
    alter function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text)
      rename to prepare_employee_settlement_v179;
  end if;
end;
$$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid,
  p_employee_id uuid,
  p_commission_rate numeric default null,
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
  v_rate numeric(7,4) := 0;
  v_commissionable numeric(12,2) := 0;
  v_percentage numeric(12,2) := 0;
  v_reward_fixed numeric(12,2) := 0;
  v_courtesy_fixed numeric(12,2) := 0;
  v_bonus numeric(12,2) := 0;
  v_recognized numeric(12,2) := 0;
  v_reward_percentage numeric(12,2) := 0;
  v_service_count integer := 0;
  v_reward_count integer := 0;
  v_product_count integer := 0;
  v_gross numeric(12,2) := 0;
begin
  select * into v_settlement
  from public.prepare_employee_settlement_v179(
    p_period_id, p_employee_id, p_commission_rate, p_debt_deductions, p_notes, p_high_rate_note
  );

  v_rate := greatest(coalesce(v_settlement.commission_rate, 0), 0);

  update public.employee_settlement_service_lines line
  set production_source_snapshot = production.production_source,
      original_line_total_snapshot = greatest(coalesce(production.original_line_total, 0), 0),
      recognized_production_amount_snapshot = greatest(coalesce(production.recognized_production_amount, 0), 0),
      operational_contribution_snapshot = greatest(coalesce(production.operational_contribution_amount, 0), 0),
      reward_commission_mode_snapshot = production.reward_commission_mode,
      reward_commission_basis_snapshot = greatest(coalesce(production.reward_commission_basis_amount, 0), 0),
      commission_rate = case
        when production.production_source in ('normal', 'commercial_discount') then v_rate
        when production.production_source = 'reward' and production.reward_commission_mode = 'percentage' then v_rate
        else 0
      end,
      commission_amount = case
        when production.production_source in ('normal', 'commercial_discount')
          then round(greatest(coalesce(line.commissionable_amount, 0), 0) * v_rate / 100, 2)
        when production.production_source = 'reward' and production.reward_commission_mode = 'percentage'
          then round(greatest(coalesce(line.commissionable_amount, 0), 0) * v_rate / 100, 2)
        else 0
      end,
      fixed_commission_amount = case
        when production.production_source = 'reward' and production.reward_commission_mode = 'fixed'
          then greatest(coalesce(production.fixed_commission_amount, 0), 0)
        else greatest(coalesce(production.fixed_commission_amount, line.fixed_commission_amount, 0), 0)
      end
  from public.employee_service_production production
  where line.settlement_id = v_settlement.id
    and production.id = line.production_entry_id;

  select
    coalesce(sum(line.commissionable_amount), 0),
    coalesce(sum(line.commission_amount), 0),
    coalesce(sum(line.fixed_commission_amount) filter (where line.production_source_snapshot = 'reward'), 0),
    coalesce(sum(line.fixed_commission_amount) filter (where line.production_source_snapshot = 'courtesy'), 0),
    coalesce(sum(line.commission_amount) filter (
      where line.production_source_snapshot = 'reward' and line.reward_commission_mode_snapshot = 'percentage'
    ), 0),
    count(*) filter (where line.production_source_snapshot <> 'reward'),
    count(*) filter (where line.production_source_snapshot = 'reward')
  into v_commissionable, v_percentage, v_reward_fixed, v_courtesy_fixed,
       v_reward_percentage, v_service_count, v_reward_count
  from public.employee_settlement_service_lines line
  where line.settlement_id = v_settlement.id;

  select coalesce(sum(line.bonus_amount), 0), count(*)
  into v_bonus, v_product_count
  from public.employee_settlement_bonus_lines line
  where line.settlement_id = v_settlement.id;

  v_recognized := public.get_employee_recognized_production(p_period_id, p_employee_id);
  v_gross := round(
    v_percentage + v_reward_fixed + v_courtesy_fixed + v_bonus
      + coalesce(v_settlement.fixed_compensation_total, 0),
    2
  );

  update public.employee_settlements
  set commissionable_base_total = round(v_commissionable, 2),
      percentage_commission_total = round(v_percentage, 2),
      reward_fixed_commission_total = round(v_reward_fixed, 2),
      courtesy_fixed_commission_total = round(v_courtesy_fixed, 2),
      product_bonus_total = round(v_bonus, 2),
      reward_percentage_commission_total = round(v_reward_percentage, 2),
      total_service_count = coalesce(v_service_count, 0),
      total_product_count = coalesce(v_product_count, 0),
      total_reward_count = coalesce(v_reward_count, 0),
      total_production_amount = round(v_recognized, 2),
      recognized_production_total = round(v_recognized, 2),
      mandatory_discount_base_amount = case
        when coalesce(v_settlement.mandatory_discount_enabled_snapshot, true) then round(v_recognized, 2)
        else 0
      end,
      gross_pay_amount = v_gross
  where id = v_settlement.id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

-- Cancellation always supplies the legacy transition with a non-empty,
-- user-readable reason. No updated_at column is assumed or written.
create or replace function public.cancel_employee_settlement_with_reason(
  p_settlement_id uuid,
  p_reason_code text,
  p_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_label text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text;
begin
  v_label := case p_reason_code
    when 'CALCULATION_ERROR' then 'Error de calculo'
    when 'WRONG_EMPLOYEE' then 'Empleado incorrecto'
    when 'WRONG_PERIOD' then 'Periodo incorrecto'
    when 'WRONG_PRODUCTION' then 'Produccion incorrecta'
    when 'DUPLICATE' then 'Liquidacion duplicada'
    when 'ADMINISTRATIVE_CORRECTION' then 'Correccion administrativa'
    when 'OTHER' then 'Otro'
    else null
  end;

  if v_label is null then
    raise exception 'El motivo de anulacion no es valido.';
  end if;
  if p_reason_code = 'OTHER' and v_note is null then
    raise exception 'El motivo Otro requiere una observacion.';
  end if;

  v_reason := v_label || case when v_note is null then '' else '. ' || v_note end;
  select * into v_settlement
  from public.transition_employee_settlement(p_settlement_id, 'cancel', v_reason);

  update public.employee_settlements
  set cancellation_reason_code = p_reason_code,
      cancellation_reason = v_reason
  where id = v_settlement.id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function public.apply_reward_commission_configuration_v180() from public, anon;
revoke all on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) from public, anon;
revoke all on function public.cancel_employee_settlement_with_reason(uuid,text,text) from public, anon;
grant execute on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) to authenticated, service_role;
grant execute on function public.cancel_employee_settlement_with_reason(uuid,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- BLOQUE: Phase 1A/1B close initial migration
-- Origen: supabase/migrations/20260924161918_close_financial_engine_phase_1a_1b.sql
-- ============================================================

-- ============================================================
-- BLOQUE: Phase 1A/1B close
-- Origen: src/sql/181_close_financial_engine_phase_1a_1b.sql
-- ============================================================
-- Espejo ejecutable de la migración 20260924161926_close_financial_engine_phase_1a_1b.sql.
-- Cierre de Fase 1A/1B: contrato financiero prospectivo y auditable.

alter table public.finance_categories
  add column if not exists is_manual_selectable boolean not null default true;
update public.finance_categories set is_manual_selectable = false
where code in ('employee_advance', 'employee_loan', 'advance', 'loan');

create or replace function public.validate_commercial_product_category_v181()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_line text;
begin
  if new.is_active and coalesce(new.visibility_scope, 'pos') in ('pos', 'both') then
    if new.category_id is null then raise exception 'Los productos comerciales nuevos requieren categoría y familia.'; end if;
    select business_line into v_line from public.product_categories where id = new.category_id;
    if v_line not in ('barbershop_products', 'cafeteria_products') then raise exception 'La categoría del producto comercial debe pertenecer a Barbería o Cafetería.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists products_validate_commercial_category_v181 on public.products;
create trigger products_validate_commercial_category_v181 before insert or update of category_id, visibility_scope, is_active on public.products for each row execute function public.validate_commercial_product_category_v181();

create or replace view public.vw_product_category_classification_issues with (security_invoker = true) as
select product.id, product.name, product.category_id, product.visibility_scope, category.name as category_name, coalesce(category.business_line, 'other') as business_line
from public.products product left join public.product_categories category on category.id = product.category_id
where product.is_active and coalesce(product.visibility_scope, 'pos') in ('pos', 'both') and (product.category_id is null or coalesce(category.business_line, 'other') = 'other');

alter table public.employee_debts drop constraint if exists employee_debts_debt_type_check;
alter table public.employee_debts add constraint employee_debts_debt_type_check check (debt_type in ('loan', 'advance', 'supply', 'internal_credit', 'penalty', 'administrative_charge', 'other'));
create table if not exists public.employee_debt_disbursements (
  id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.employee_debts(id) on delete restrict,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict, amount numeric(12,2) not null check (amount > 0),
  payment_reference text, evidence_url text, notes text, created_at timestamptz not null default now(), created_by uuid references public.employees(id) on delete set null
);
create index if not exists employee_debt_disbursements_debt_idx on public.employee_debt_disbursements(debt_id, created_at);
alter table public.employee_debt_disbursements enable row level security;
drop policy if exists employee_debt_disbursements_admin_scope on public.employee_debt_disbursements;
create policy employee_debt_disbursements_admin_scope on public.employee_debt_disbursements for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_employee_debt_with_disbursements(p_employee_id uuid,p_branch_id uuid,p_debt_type text,p_amount numeric,p_description text,p_disbursements jsonb default '[]'::jsonb)
returns public.employee_debts language plpgsql security definer set search_path = public, pg_temp as $$
declare v_debt public.employee_debts%rowtype; v_item jsonb; v_method public.payment_methods%rowtype; v_amount numeric(12,2):=0; v_total numeric(12,2):=0; v_session public.pos_sessions%rowtype;
begin
  if coalesce(p_debt_type,'') not in ('loan','advance','penalty','administrative_charge','other') then raise exception 'El tipo de deuda no se puede registrar manualmente.'; end if;
  if p_debt_type='penalty' and not public.is_admin() then raise exception 'Solo owner o admin puede registrar penalidades.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Monto y descripción son obligatorios.'; end if;
  if p_debt_type in ('loan','advance') and (jsonb_typeof(p_disbursements)<>'array' or jsonb_array_length(p_disbursements)=0) then raise exception 'Un préstamo o adelanto requiere uno o más desembolsos con método de pago.'; end if;
  if p_debt_type not in ('loan','advance') and coalesce(p_disbursements,'[]'::jsonb)<>'[]'::jsonb then raise exception 'Solo préstamos y adelantos admiten desembolsos.'; end if;
  if p_debt_type in ('loan','advance') then
    for v_item in select value from jsonb_array_elements(p_disbursements) loop
      v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
      if v_amount<=0 or nullif(v_item->>'paymentMethodId','') is null then raise exception 'Cada desembolso requiere método y monto mayor a cero.'; end if;
      select * into v_method from public.payment_methods where id=(v_item->>'paymentMethodId')::uuid and is_active;
      if not found then raise exception 'El método de pago del desembolso no está disponible.'; end if;
      if v_method.counts_as_cash then select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1 for update; if not found then raise exception 'Un desembolso en efectivo requiere una sesión POS abierta en la sede.'; end if; end if;
      v_total:=v_total+v_amount;
    end loop;
    if round(v_total,2)<>round(p_amount,2) then raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.'; end if;
  end if;
  v_debt:=public.create_employee_debt(p_employee_id,p_branch_id,p_debt_type,p_amount,p_description);
  if p_debt_type in ('loan','advance') then
    for v_item in select value from jsonb_array_elements(p_disbursements) loop
      insert into public.employee_debt_disbursements(debt_id,payment_method_id,amount,payment_reference,evidence_url,notes,created_by)
      values(v_debt.id,(v_item->>'paymentMethodId')::uuid,round((v_item->>'amount')::numeric,2),nullif(btrim(coalesce(v_item->>'reference','')),''),nullif(btrim(coalesce(v_item->>'evidenceUrl','')),''),nullif(btrim(coalesce(v_item->>'notes','')),''),public.current_employee_id());
    end loop;
  end if;
  return v_debt;
end;
$$;

create or replace view public.vw_financial_postings_signed with (security_invoker = true) as
select posting.*, case when posting.effect_type='income' then posting.amount when posting.effect_type='expense' then -posting.amount when posting.effect_type='asset_increase' then posting.amount when posting.effect_type='asset_decrease' then -posting.amount when posting.effect_type='liability_increase' then posting.amount when posting.effect_type='liability_decrease' then -posting.amount else 0 end as signed_amount,
case when posting.effect_type='income' then posting.amount when posting.effect_type='expense' then -posting.amount else 0 end as profit_signed_amount
from public.financial_postings posting where posting.status='posted';
create or replace view public.vw_financial_phase0_summary with (security_invoker = true) as
select posting.accounting_date,posting.branch_id,posting.business_line,posting.financial_group,
coalesce(sum(case when posting.affects_profit then greatest(posting.profit_signed_amount,0) else 0 end),0) as profit_income,
coalesce(sum(case when posting.affects_profit then greatest(-posting.profit_signed_amount,0) else 0 end),0) as profit_expense,
coalesce(sum(case when posting.effect_type in ('asset_increase','asset_decrease') then posting.signed_amount else 0 end),0) as asset_change,
coalesce(sum(case when posting.effect_type in ('liability_increase','liability_decrease') then posting.signed_amount else 0 end),0) as liability_change
from public.vw_financial_postings_signed posting group by posting.accounting_date,posting.branch_id,posting.business_line,posting.financial_group;
create or replace view public.vw_employee_debt_financial_reconciliation with (security_invoker = true) as
select debt.id as debt_id,debt.employee_id,debt.branch_id,debt.debt_type,debt.original_amount,debt.outstanding_amount,debt.status,coalesce(disbursed.amount,0) as disbursed_amount,coalesce(collected.amount,0) as collected_amount
from public.employee_debts debt
left join lateral (select sum(amount) as amount from public.employee_debt_disbursements where debt_id=debt.id) disbursed on true
left join lateral (select sum(amount) as amount from public.employee_debt_movements where debt_id=debt.id and movement_type in ('settlement_deduction','manual_payment','immediate_payment')) collected on true;
revoke all on function public.validate_commercial_product_category_v181() from public, anon;
revoke all on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb) from public, anon;
grant execute on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb) to authenticated,service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Phase 1A/1B final hotfix initial migration
-- Origen: supabase/migrations/20260924183153_financial_engine_phase_1a_1b_final_hotfix.sql
-- ============================================================

-- ============================================================
-- BLOQUE: Phase 1A/1B final hotfix
-- Origen: src/sql/182_financial_engine_phase_1a_1b_final_hotfix.sql
-- ============================================================
-- Espejo de la migración 20260924183213_financial_engine_phase_1a_1b_final_hotfix.sql.
create or replace function public.sync_settlement_personnel_cost()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_period public.payroll_periods%rowtype; v_cost numeric(12,2); v_posting uuid;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    select * into v_period from public.payroll_periods where id = new.payroll_period_id;
    v_cost := round(greatest(coalesce(new.gross_pay_amount,0)+coalesce(new.manual_bonus_total,0)-coalesce(new.other_deduction_total,0)-coalesce(new.mandatory_discount_amount,0),0),2);
    insert into public.financial_postings(accounting_date,branch_id,payroll_period_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,metadata,created_by)
    values(v_period.end_date,new.branch_id,new.payroll_period_id,'personnel_cost','expense','approved_settlement_personnel_cost',v_cost,true,'employee_settlement',new.id,'Costo oficial de personal: '||new.settlement_number,jsonb_build_object('grossPay',new.gross_pay_amount,'mandatoryDiscount',new.mandatory_discount_amount,'debtRecoveries',new.debt_deduction_total),new.approved_by)
    on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  elsif old.status='approved' and new.status='cancelled' then
    select id into v_posting from public.financial_postings where source_type='employee_settlement' and source_id=new.id and posting_code='approved_settlement_personnel_cost' and status='posted' limit 1;
    if v_posting is not null then perform public.reverse_financial_posting(v_posting,'SOURCE_CANCELLED',new.cancellation_reason); end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_settlement_personnel_cost() from public, anon;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Phase 1A/1B closeout
-- Origen: supabase/migrations/20260924194408_financial_engine_phase_1a_1b_closeout.sql
-- ============================================================
-- Fase 1A/1B closeout. Incremental and prospective: no paid settlement,
-- historical sale, or historical debt is rewritten.

-- Product attribution is distinct from bonuses. Snapshot it at settlement
-- creation so Review, Document and PDF cannot disagree later.
create table if not exists public.employee_settlement_product_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  attribution_id uuid not null references public.employee_sale_item_attributions(id) on delete restrict,
  sale_id_snapshot uuid not null,
  sale_number_snapshot text,
  accounting_date_snapshot date not null,
  sale_item_id_snapshot uuid not null,
  product_id_snapshot uuid,
  product_name_snapshot text not null,
  business_line_snapshot text not null,
  quantity_snapshot numeric(12,2) not null default 0,
  commercial_amount_snapshot numeric(12,2) not null default 0,
  recognized_production_amount_snapshot numeric(12,2) not null default 0,
  bonus_amount_snapshot numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(settlement_id, attribution_id)
);
create index if not exists employee_settlement_product_lines_settlement_idx
  on public.employee_settlement_product_lines(settlement_id, accounting_date_snapshot);
alter table public.employee_settlement_product_lines enable row level security;
drop policy if exists employee_settlement_product_lines_admin on public.employee_settlement_product_lines;
create policy employee_settlement_product_lines_admin on public.employee_settlement_product_lines
  for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.snapshot_employee_settlement_product_lines_v183()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.employee_settlement_product_lines(
    settlement_id,attribution_id,sale_id_snapshot,sale_number_snapshot,accounting_date_snapshot,
    sale_item_id_snapshot,product_id_snapshot,product_name_snapshot,business_line_snapshot,
    quantity_snapshot,commercial_amount_snapshot,recognized_production_amount_snapshot,bonus_amount_snapshot
  )
  select new.id, attribution.id, attribution.sale_id, sale.sale_number, attribution.accounting_date,
    attribution.sale_item_id, item.product_id, coalesce(product.name, item.item_name_snapshot, 'Producto'),
    attribution.business_line, item.quantity, greatest(coalesce(item.original_total, item.total, 0),0),
    attribution.recognized_production_amount, 0
  from public.employee_sale_item_attributions attribution
  join public.sales sale on sale.id=attribution.sale_id and sale.status='completed'
  join public.sale_items item on item.id=attribution.sale_item_id
  left join public.products product on product.id=item.product_id
  where attribution.employee_id=new.employee_id
    and attribution.payroll_period_id=new.payroll_period_id
    and attribution.status='active'
  on conflict(settlement_id,attribution_id) do nothing;
  return new;
end;
$$;
drop trigger if exists employee_settlements_snapshot_product_lines_v183 on public.employee_settlements;
create trigger employee_settlements_snapshot_product_lines_v183
after insert on public.employee_settlements
for each row execute function public.snapshot_employee_settlement_product_lines_v183();

-- Canonical debt ledger. `outstanding_amount` remains the official balance;
-- this view is audit history and never recalculates the official balance.
create or replace view public.vw_employee_debt_ledger
with (security_invoker=true) as
select debt.employee_id,debt.branch_id,debt.id as debt_id,debt.created_at as event_date,
  debt.debt_type as event_type,'debt'::text as source_type,debt.id as source_id,
  debt.description,null::text as reference,debt.original_amount as signed_amount
from public.employee_debts debt
union all
select debt.employee_id,debt.branch_id,movement.debt_id,movement.created_at,movement.movement_type,
  'debt_movement',movement.id,coalesce(movement.notes,'Movimiento de deuda'),movement.payment_reference,
  case when movement.movement_type in ('settlement_deduction','manual_payment','immediate_payment','write_off','cancellation') then -movement.amount else movement.amount end
from public.employee_debt_movements movement
join public.employee_debts debt on debt.id=movement.debt_id;

-- Manual debts carry a receivable without affecting profit. A collection only
-- reduces that receivable and is never a second income.
create or replace function public.sync_manual_employee_debt_receivable_v183()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.debt_type in ('loan','advance','penalty','administrative_charge','other') then
    insert into public.financial_postings(accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,created_by)
    values(coalesce(new.created_at::date,public.pos_business_date()),new.branch_id,'receivable','asset_increase','employee_debt_receivable',new.original_amount,false,'employee_debt',new.id,'Cuenta por cobrar a empleado: '||new.description,new.created_by)
    on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists employee_debt_manual_receivable_v183 on public.employee_debts;
create trigger employee_debt_manual_receivable_v183 after insert on public.employee_debts for each row execute function public.sync_manual_employee_debt_receivable_v183();

create or replace function public.sync_manual_employee_debt_collection_v183()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_debt public.employee_debts%rowtype;
begin
  if new.movement_type not in ('settlement_deduction','manual_payment','immediate_payment','write_off','cancellation') then return new; end if;
  select * into v_debt from public.employee_debts where id=new.debt_id;
  if found and v_debt.debt_type in ('loan','advance','penalty','administrative_charge','other') then
    insert into public.financial_postings(accounting_date,branch_id,financial_group,effect_type,posting_code,amount,affects_profit,source_type,source_id,description,created_by)
    values(coalesce(new.created_at::date,public.pos_business_date()),v_debt.branch_id,'receivable','asset_decrease','employee_debt_collection',new.amount,false,'employee_debt_movement',new.id,'Recuperación de deuda de empleado',new.created_by)
    on conflict(source_type,source_id,posting_code) where status='posted' do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists employee_debt_manual_collection_v183 on public.employee_debt_movements;
create trigger employee_debt_manual_collection_v183 after insert on public.employee_debt_movements for each row execute function public.sync_manual_employee_debt_collection_v183();

revoke all on function public.snapshot_employee_settlement_product_lines_v183() from public,anon;
revoke all on function public.sync_manual_employee_debt_receivable_v183() from public,anon;
revoke all on function public.sync_manual_employee_debt_collection_v183() from public,anon;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Phase 1A/1B acceptance hotfix
-- Origen: supabase/migrations/20260925184040_financial_engine_phase_1a_1b_acceptance_hotfix.sql
-- ============================================================
-- Acceptance hotfix for Phase 1A / 1B. This migration is prospective and
-- preserves paid settlements, historical sales, and existing audit records.

-- P&L must consume signed postings. The original and its reversal remain
-- posted, so aggregating raw amount would double a reversed fact.
create or replace function public.get_financial_analysis_v2(
  p_date_from date,
  p_date_to date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_sales numeric(12,2) := 0;
  v_barbershop_sales numeric(12,2) := 0;
  v_cafeteria_sales numeric(12,2) := 0;
  v_other_sales numeric(12,2) := 0;
  v_product_cogs numeric(12,2) := 0;
  v_courtesy_cost numeric(12,2) := 0;
  v_personnel_cost numeric(12,2) := 0;
  v_operating_expense numeric(12,2) := 0;
  v_net_sales numeric(12,2) := 0;
  v_operating_profit numeric(12,2) := 0;
begin
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden ver Ganancias y Pérdidas.';
  end if;

  -- income is positive and an income reversal is negative. Expense groups are
  -- exposed as positive costs by negating their signed profit contribution.
  select
    coalesce(sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'operating_income' and posting.business_line = 'services'
    ), 0),
    coalesce(sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'operating_income' and posting.business_line = 'barbershop_products'
    ), 0),
    coalesce(sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'operating_income' and posting.business_line = 'cafeteria_products'
    ), 0),
    coalesce(sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'operating_income'
        and coalesce(posting.business_line, 'other') = 'other'
    ), 0),
    coalesce(-sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'cost_of_sales' and posting.posting_code <> 'courtesy_actual_cost'
    ), 0),
    coalesce(-sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'cost_of_sales' and posting.posting_code = 'courtesy_actual_cost'
    ), 0),
    coalesce(-sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'personnel_cost'
    ), 0),
    coalesce(-sum(posting.profit_signed_amount) filter (
      where posting.financial_group = 'operating_expense'
    ), 0)
  into v_service_sales, v_barbershop_sales, v_cafeteria_sales, v_other_sales,
       v_product_cogs, v_courtesy_cost, v_personnel_cost, v_operating_expense
  from public.vw_financial_postings_signed posting
  where posting.accounting_date between p_date_from and p_date_to
    and (p_branch_id is null or posting.branch_id = p_branch_id)
    and posting.affects_profit;

  v_net_sales := round(v_service_sales + v_barbershop_sales + v_cafeteria_sales + v_other_sales, 2);
  v_operating_profit := round(v_net_sales - v_product_cogs - v_courtesy_cost - v_personnel_cost - v_operating_expense, 2);

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_date_from, 'to', p_date_to, 'branchId', p_branch_id),
    'sales', jsonb_build_object(
      'serviceSales', v_service_sales,
      'barbershopProductSales', v_barbershop_sales,
      'cafeteriaProductSales', v_cafeteria_sales,
      'otherCategorySales', v_other_sales,
      'commercialRetailGross', v_net_sales,
      'netCommercialSales', v_net_sales
    ),
    'directCosts', jsonb_build_object(
      'productCogs', v_product_cogs,
      'courtesyProductRealCost', v_courtesy_cost
    ),
    'personnel', jsonb_build_object('recognizedPersonnelCost', v_personnel_cost),
    'expenses', jsonb_build_object('operatingExpenses', v_operating_expense),
    'cashflow', jsonb_build_object('recordedInflows', 0, 'settlementCashOutflow', 0, 'ownerContributions', 0, 'netRecordedFlow', 0),
    'reconciliation', jsonb_build_object('unreconciledProductionCount', 0, 'zeroCostProductLines', 0, 'unpostedOpenSessionSales', 0),
    'profit', jsonb_build_object(
      'operatingProfit', v_operating_profit,
      'operatingMarginPercentage', case when v_net_sales = 0 then null else round(v_operating_profit / v_net_sales * 100, 2) end,
      'status', 'final'
    )
  );
end;
$$;

-- Keep the low-level creator compatible with operational supply flows while
-- allowing the complete manual contract used by the dedicated wrapper.
create or replace function public.create_employee_debt(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_amount numeric,
  p_description text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_creator uuid := public.current_employee_id();
  v_employee_branch_id uuid;
begin
  if v_creator is null then raise exception 'No se pudo identificar al usuario que registra la deuda.'; end if;
  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'supply', 'internal_credit', 'penalty', 'administrative_charge', 'other') then
    raise exception 'El tipo de deuda no se puede registrar manualmente.';
  end if;
  if p_debt_type in ('penalty', 'administrative_charge') and not public.is_admin() then
    raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.';
  end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then
    raise exception 'No tienes permisos para registrar esta deuda.';
  end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Monto y descripción son obligatorios.';
  end if;
  select branch_id into v_employee_branch_id from public.employees where id = p_employee_id and status = 'active';
  if not found or v_employee_branch_id <> p_branch_id then
    raise exception 'El empleado debe estar activo y pertenecer a la sede de la deuda.';
  end if;
  insert into public.employee_debts(employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by)
  values(p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), round(p_amount, 2), btrim(p_description), v_creator)
  returning * into v_debt;
  insert into public.employee_debt_movements(debt_id, movement_type, amount, notes, created_by)
  values(v_debt.id, 'charge', v_debt.original_amount, 'Registro inicial de deuda.', v_creator);
  return v_debt;
end;
$$;

create or replace function public.create_employee_debt_with_disbursements(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_amount numeric,
  p_description text,
  p_disbursements jsonb default '[]'::jsonb
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_item jsonb;
  v_method public.payment_methods%rowtype;
  v_amount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_session public.pos_sessions%rowtype;
begin
  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'penalty', 'administrative_charge', 'other') then
    raise exception 'El tipo de deuda no se puede registrar manualmente.';
  end if;
  if p_debt_type in ('penalty', 'administrative_charge') and not public.is_admin() then
    raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.';
  end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Monto y descripción son obligatorios.';
  end if;
  if p_debt_type in ('loan', 'advance') and (jsonb_typeof(p_disbursements) <> 'array' or jsonb_array_length(p_disbursements) = 0) then
    raise exception 'Un préstamo o adelanto requiere uno o más desembolsos con método de pago.';
  end if;
  if p_debt_type not in ('loan', 'advance') and coalesce(p_disbursements, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'Solo préstamos y adelantos admiten desembolsos.';
  end if;
  if p_debt_type in ('loan', 'advance') and exists (
    select 1
    from (
      select nullif(disbursement.value ->> 'paymentMethodId', '') as payment_method_id
      from jsonb_array_elements(p_disbursements) as disbursement(value)
    ) methods
    where payment_method_id is not null
    group by payment_method_id
    having count(*) > 1
  ) then
    raise exception 'No se puede repetir el mismo método de desembolso.';
  end if;
  if p_debt_type in ('loan', 'advance') then
    for v_item in select value from jsonb_array_elements(p_disbursements)
    loop
      v_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
      if v_amount <= 0 or nullif(v_item ->> 'paymentMethodId', '') is null then
        raise exception 'Cada desembolso requiere método y monto mayor a cero.';
      end if;
      select * into v_method from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid and is_active;
      if not found then raise exception 'El método de pago del desembolso no está disponible.'; end if;
      if v_method.counts_as_cash then
        select * into v_session from public.pos_sessions where branch_id = p_branch_id and status = 'open' order by opened_at desc limit 1 for update;
        if not found then raise exception 'Un desembolso en efectivo requiere una sesión POS abierta en la sede.'; end if;
      end if;
      v_total := v_total + v_amount;
    end loop;
    if round(v_total, 2) <> round(p_amount, 2) then raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.'; end if;
  end if;
  v_debt := public.create_employee_debt(p_employee_id, p_branch_id, p_debt_type, p_amount, p_description);
  if p_debt_type in ('loan', 'advance') then
    for v_item in select value from jsonb_array_elements(p_disbursements)
    loop
      insert into public.employee_debt_disbursements(debt_id, payment_method_id, amount, payment_reference, evidence_url, notes, created_by)
      values(v_debt.id, (v_item ->> 'paymentMethodId')::uuid, round((v_item ->> 'amount')::numeric, 2), nullif(btrim(coalesce(v_item ->> 'reference', '')), ''), nullif(btrim(coalesce(v_item ->> 'evidenceUrl', '')), ''), nullif(btrim(coalesce(v_item ->> 'notes', '')), ''), public.current_employee_id());
    end loop;
  end if;
  return v_debt;
end;
$$;

revoke all on function public.create_employee_debt(uuid,uuid,text,numeric,text) from public, anon;
revoke all on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb) from public, anon;
grant execute on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb) to authenticated, service_role;
revoke all on function public.get_financial_analysis_v2(date,date,uuid) from public, anon;
grant execute on function public.get_financial_analysis_v2(date,date,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Final financial acceptance fixes
-- Origen: supabase/migrations/20260925215723_financial_engine_final_acceptance_fixes.sql
-- ============================================================
-- Final acceptance fixes. Prospective only; does not rewrite paid settlements
-- nor delete historical business facts.

-- `sales` has no sale_number. The canonical public reference is VTA- + UUID.
create or replace function public.snapshot_employee_settlement_product_lines_v183()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.employee_settlement_product_lines(
    settlement_id,attribution_id,sale_id_snapshot,sale_number_snapshot,accounting_date_snapshot,
    sale_item_id_snapshot,product_id_snapshot,product_name_snapshot,business_line_snapshot,
    quantity_snapshot,commercial_amount_snapshot,recognized_production_amount_snapshot,bonus_amount_snapshot
  )
  select new.id, attribution.id, attribution.sale_id,
    concat('VTA-', upper(left(sale.id::text, 8))), attribution.accounting_date,
    attribution.sale_item_id, item.product_id, coalesce(product.name, item.item_name_snapshot, 'Producto'),
    attribution.business_line, item.quantity, greatest(coalesce(item.original_total, item.total, 0),0),
    attribution.recognized_production_amount, 0
  from public.employee_sale_item_attributions attribution
  join public.sales sale on sale.id=attribution.sale_id and sale.status='completed'
  join public.sale_items item on item.id=attribution.sale_item_id
  left join public.products product on product.id=item.product_id
  where attribution.employee_id=new.employee_id
    and attribution.payroll_period_id=new.payroll_period_id
    and attribution.status='active'
  on conflict(settlement_id,attribution_id) do nothing;
  return new;
end;
$$;

-- P&L presentation exposes net economic costs as positive magnitudes. A
-- reversal remains visible as a legitimate negative contra-cost; never clamp.
create or replace function public.get_financial_analysis_v2(p_date_from date,p_date_to date,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_services numeric:=0; v_barber numeric:=0; v_cafe numeric:=0; v_other numeric:=0; v_cogs numeric:=0; v_courtesy numeric:=0; v_personnel numeric:=0; v_expenses numeric:=0; v_income numeric:=0; v_profit numeric:=0;
begin
  if p_date_from is null or p_date_to is null or p_date_from>p_date_to then raise exception 'El rango de fechas no es válido.'; end if;
  if not public.is_admin() then raise exception 'Solo owner o admin pueden ver Ganancias y Pérdidas.'; end if;
  select
    coalesce(sum(profit_signed_amount) filter(where financial_group='operating_income' and business_line='services'),0),
    coalesce(sum(profit_signed_amount) filter(where financial_group='operating_income' and business_line='barbershop_products'),0),
    coalesce(sum(profit_signed_amount) filter(where financial_group='operating_income' and business_line='cafeteria_products'),0),
    coalesce(sum(profit_signed_amount) filter(where financial_group='operating_income' and coalesce(business_line,'other')='other'),0),
    coalesce(-sum(profit_signed_amount) filter(where financial_group='cost_of_sales' and posting_code<>'courtesy_actual_cost'),0),
    coalesce(-sum(profit_signed_amount) filter(where financial_group='cost_of_sales' and posting_code='courtesy_actual_cost'),0),
    coalesce(-sum(profit_signed_amount) filter(where financial_group='personnel_cost'),0),
    coalesce(-sum(profit_signed_amount) filter(where financial_group='operating_expense'),0)
  into v_services,v_barber,v_cafe,v_other,v_cogs,v_courtesy,v_personnel,v_expenses
  from public.vw_financial_postings_signed
  where accounting_date between p_date_from and p_date_to and (p_branch_id is null or branch_id=p_branch_id) and affects_profit;
  v_income:=round(v_services+v_barber+v_cafe+v_other,2); v_profit:=round(v_income-v_cogs-v_courtesy-v_personnel-v_expenses,2);
  return jsonb_build_object('period',jsonb_build_object('from',p_date_from,'to',p_date_to,'branchId',p_branch_id),'sales',jsonb_build_object('serviceSales',v_services,'barbershopProductSales',v_barber,'cafeteriaProductSales',v_cafe,'otherCategorySales',v_other,'commercialRetailGross',v_income,'netCommercialSales',v_income),'directCosts',jsonb_build_object('productCogs',v_cogs,'courtesyProductRealCost',v_courtesy),'personnel',jsonb_build_object('recognizedPersonnelCost',v_personnel,'accruedCost',v_personnel),'expenses',jsonb_build_object('operatingExpenses',v_expenses),'profit',jsonb_build_object('operatingProfit',v_profit,'operatingMarginPercentage',case when v_income=0 then null else round(v_profit/v_income*100,2) end,'status','final'));
end;
$$;

-- Read model for the grouped employee debt landing page. Outstanding amounts
-- remain authoritative in employee_debts; the ledger is audit history only.
create or replace view public.vw_employee_debt_profiles
with (security_invoker=true) as
select debt.employee_id, debt.branch_id, max(employee.full_name) as employee_name, max(branch.name) as branch_name,
  coalesce(sum(debt.outstanding_amount) filter(where debt.status in ('pending','partial')),0) as outstanding_total,
  count(*) filter(where debt.status in ('pending','partial')) as active_debt_count,
  max(ledger.event_date) as last_movement_date,
  (array_agg(ledger.event_type order by ledger.event_date desc nulls last))[1] as last_movement_type,
  (array_agg(ledger.signed_amount order by ledger.event_date desc nulls last))[1] as last_movement_signed_amount
from public.employee_debts debt
join public.employees employee on employee.id=debt.employee_id
join public.branches branch on branch.id=debt.branch_id
left join public.vw_employee_debt_ledger ledger on ledger.debt_id=debt.id
group by debt.employee_id,debt.branch_id;

revoke all on function public.snapshot_employee_settlement_product_lines_v183() from public,anon;
revoke all on function public.get_financial_analysis_v2(date,date,uuid) from public,anon;
grant execute on function public.get_financial_analysis_v2(date,date,uuid) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Final Phase 1A/1B runtime fixes
-- Origen: supabase/migrations/20260925224851_final_phase_1a_1b_runtime_fixes.sql
-- ============================================================
-- Runtime acceptance fixes. Prospective only: paid settlements and historical
-- business facts remain immutable.

-- `sale_items` stores the human name in description_snapshot, not in an
-- item_name_snapshot column. The bonus is a separate fact and must be read
-- from the active product-bonus entry for this sale item / employee / period.
create or replace function public.snapshot_employee_settlement_product_lines_v183()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.employee_settlement_product_lines(
    settlement_id, attribution_id, sale_id_snapshot, sale_number_snapshot,
    accounting_date_snapshot, sale_item_id_snapshot, product_id_snapshot,
    product_name_snapshot, business_line_snapshot, quantity_snapshot,
    commercial_amount_snapshot, recognized_production_amount_snapshot,
    bonus_amount_snapshot
  )
  select
    new.id,
    attribution.id,
    attribution.sale_id,
    concat('VTA-', upper(left(sale.id::text, 8))),
    attribution.accounting_date,
    attribution.sale_item_id,
    item.product_id,
    coalesce(product.name, item.description_snapshot, 'Producto'),
    attribution.business_line,
    item.quantity,
    greatest(coalesce(item.original_total, item.total, 0), 0),
    attribution.recognized_production_amount,
    coalesce(bonus.total_bonus_amount, 0)
  from public.employee_sale_item_attributions attribution
  join public.sales sale
    on sale.id = attribution.sale_id
   and sale.status = 'completed'
  join public.sale_items item
    on item.id = attribution.sale_item_id
  left join public.products product
    on product.id = item.product_id
  left join public.employee_product_bonus_entries bonus
    on bonus.sale_item_id = attribution.sale_item_id
   and bonus.employee_id = new.employee_id
   and bonus.payroll_period_id = new.payroll_period_id
   and bonus.status = 'active'
  where attribution.employee_id = new.employee_id
    and attribution.payroll_period_id = new.payroll_period_id
    and attribution.status = 'active'
  on conflict(settlement_id, attribution_id) do nothing;

  return new;
end;
$$;

-- The API canonicalizes responsible_employee_id. The historical checkout core
-- still consumes barber_id / attributed_employee_id, so normalize all keys at
-- the SQL boundary and inherit only when exactly one service executor exists.
create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_line text;
  v_responsible uuid;
  v_inherited_service_executor uuid;
  v_branch_id uuid := (p_payload->>'branch_id')::uuid;
  v_employee public.employees%rowtype;
begin
  select (array_agg(distinct coalesce(
      nullif(service_item.value->>'responsible_employee_id', '')::uuid,
      nullif(service_item.value->>'attributed_employee_id', '')::uuid,
      nullif(service_item.value->>'barber_id', '')::uuid
    )))[1]
    into v_inherited_service_executor
  from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) as service_item(value)
  where service_item.value->>'item_type' = 'service'
    and coalesce(
      nullif(service_item.value->>'responsible_employee_id', '')::uuid,
      nullif(service_item.value->>'attributed_employee_id', '')::uuid,
      nullif(service_item.value->>'barber_id', '')::uuid
    ) is not null
  having count(distinct coalesce(
      nullif(service_item.value->>'responsible_employee_id', '')::uuid,
      nullif(service_item.value->>'attributed_employee_id', '')::uuid,
      nullif(service_item.value->>'barber_id', '')::uuid
    )) = 1;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    if v_item->>'item_type' = 'product' then
      select coalesce(category.business_line, 'other')
        into v_line
      from public.products product
      left join public.product_categories category on category.id = product.category_id
      where product.id = (v_item->>'product_id')::uuid;

      v_responsible := coalesce(
        nullif(v_item->>'responsible_employee_id', '')::uuid,
        nullif(v_item->>'attributed_employee_id', '')::uuid,
        nullif(v_item->>'barber_id', '')::uuid,
        v_inherited_service_executor
      );

      if v_line = 'barbershop_products' and v_responsible is null then
        raise exception 'Los productos de barbería requieren responsable o vendedor.';
      end if;

      if v_responsible is not null then
        select * into v_employee
        from public.employees
        where id = v_responsible
          and status = 'active'
          and (branch_id is null or branch_id = v_branch_id);

        if not found then
          raise exception 'El responsable seleccionado no está activo.';
        end if;

        v_item := jsonb_set(v_item, '{responsible_employee_id}', to_jsonb(v_responsible::text), true);
        v_item := jsonb_set(v_item, '{attributed_employee_id}', to_jsonb(v_responsible::text), true);
        v_item := jsonb_set(v_item, '{barber_id}', to_jsonb(v_responsible::text), true);
      end if;
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  return public.checkout_pos_sale_v175(jsonb_set(p_payload, '{items}', v_items, true));
end;
$$;

-- Finance cancellations need a stable reason code while preserving the
-- historic free-text field for audit readability.
alter table public.finance_manual_entries
  add column if not exists cancellation_reason_code text;

alter table public.finance_manual_entries
  drop constraint if exists finance_manual_entries_cancellation_reason_code_check;
alter table public.finance_manual_entries
  add constraint finance_manual_entries_cancellation_reason_code_check
  check (cancellation_reason_code is null or cancellation_reason_code in (
    'ENTRY_ERROR', 'DUPLICATE', 'WRONG_AMOUNT', 'WRONG_CATEGORY',
    'WRONG_DATE', 'WRONG_PAYMENT_METHOD', 'SOURCE_DOCUMENT_CANCELLED', 'OTHER'
  ));

-- Reception already has scoped read access to debts and their ledger. Give the
-- same scoped read access to the associated disbursements used by the profile.
drop policy if exists employee_debt_disbursements_reception_scope on public.employee_debt_disbursements;
create policy employee_debt_disbursements_reception_scope
on public.employee_debt_disbursements
for select to authenticated
using (
  public.current_user_role() = 'reception'
  and exists (
    select 1
    from public.employee_debts debt
    where debt.id = employee_debt_disbursements.debt_id
      and public.can_access_branch(debt.branch_id)
  )
);

create or replace function public.cancel_operational_finance_entry_v186(
  p_entry_id uuid,
  p_reason_code text,
  p_note text default null
)
returns public.finance_manual_entries
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_entry public.finance_manual_entries%rowtype;
  v_posting uuid;
  v_payable_posting uuid;
  v_cash public.cash_movements%rowtype;
  v_payable public.accounts_payable%rowtype;
  v_has_cash boolean := false;
  v_code text := upper(btrim(coalesce(p_reason_code, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin puede anular costos y gastos.';
  end if;

  v_label := case v_code
    when 'ENTRY_ERROR' then 'Error de registro'
    when 'DUPLICATE' then 'Movimiento duplicado'
    when 'WRONG_AMOUNT' then 'Monto incorrecto'
    when 'WRONG_CATEGORY' then 'Categoría incorrecta'
    when 'WRONG_DATE' then 'Fecha incorrecta'
    when 'WRONG_PAYMENT_METHOD' then 'Método de pago incorrecto'
    when 'SOURCE_DOCUMENT_CANCELLED' then 'Documento u obligación anulada'
    when 'OTHER' then 'Otro'
    else null
  end;
  if v_label is null then
    raise exception 'El motivo de anulación no es válido.';
  end if;
  if v_code = 'OTHER' and v_note is null then
    raise exception 'La observación es obligatoria cuando el motivo es Otro.';
  end if;
  v_reason := v_label || case when v_note is null then '' else '. ' || v_note end;

  select * into v_entry
  from public.finance_manual_entries
  where id = p_entry_id
  for update;
  if not found or v_entry.status <> 'active' then
    raise exception 'El registro financiero no está disponible.';
  end if;

  if v_entry.payable_id is not null then
    select * into v_payable
    from public.accounts_payable
    where id = v_entry.payable_id
    for update;
    if not found then
      raise exception 'La cuenta por pagar asociada no está disponible.';
    end if;
    if v_payable.outstanding_amount <> v_payable.original_amount then
      raise exception 'La cuenta por pagar ya tiene pagos; primero revierte sus pagos para conservar la trazabilidad.';
    end if;
    select id into v_payable_posting
    from public.financial_postings
    where source_type = 'accounts_payable'
      and source_id = v_payable.id
      and status = 'posted'
    limit 1;
    update public.accounts_payable
    set status = 'cancelled',
        settled_at = now()
    where id = v_payable.id;
  end if;

  select * into v_cash
  from public.cash_movements
  where source_type = 'finance_manual_entry'
    and source_id = v_entry.id
    and status = 'active'
  for update;
  v_has_cash := found;
  if v_has_cash and not exists (
    select 1 from public.pos_sessions
    where id = v_cash.pos_session_id and status = 'open'
  ) then
    raise exception 'Este movimiento afectó una caja POS ya cerrada y no puede modificarse retroactivamente.';
  end if;

  select id into v_posting
  from public.financial_postings
  where source_type = 'finance_manual_entry'
    and source_id = v_entry.id
    and status = 'posted'
  limit 1;
  if v_posting is not null then
    perform public.reverse_financial_posting(v_posting, 'SOURCE_CANCELLED', v_reason);
  end if;
  if v_payable_posting is not null then
    perform public.reverse_financial_posting(v_payable_posting, 'SOURCE_CANCELLED', v_reason);
  end if;
  if v_has_cash then
    update public.cash_movements
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = public.current_employee_id(),
        cancelled_reason = 'Reversa desde Finanzas: ' || v_reason
    where id = v_cash.id;
    perform public.sync_pos_session_totals(v_cash.pos_session_id);
  end if;

  update public.finance_manual_entries
  set status = 'cancelled',
      cancellation_reason_code = v_code,
      cancellation_reason = v_reason,
      cancelled_at = now(),
      cancelled_by = public.current_employee_id(),
      updated_at = now()
  where id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

-- Preserve the existing RPC signature for older callers while directing it
-- through the audited contract.
create or replace function public.cancel_operational_finance_entry(
  p_entry_id uuid,
  p_reason text
)
returns public.finance_manual_entries
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  return public.cancel_operational_finance_entry_v186(p_entry_id, 'OTHER', p_reason);
end;
$$;

revoke all on function public.snapshot_employee_settlement_product_lines_v183() from public, anon;
revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
revoke all on function public.cancel_operational_finance_entry_v186(uuid,text,text) from public, anon;
revoke all on function public.cancel_operational_finance_entry(uuid,text) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb), public.cancel_operational_finance_entry_v186(uuid,text,text), public.cancel_operational_finance_entry(uuid,text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement debt and payable reversal
-- Origen: supabase/migrations/20260926014337_settlement_debt_and_payable_reversal_fixes.sql
-- ============================================================
-- 187: fecha económica de reversas, descuento automático de deudas y reversa CxP.
-- Es prospectiva; no reescribe liquidaciones pagadas ni los importes de hechos históricos.

create or replace function public.reverse_financial_posting(
  p_posting_id uuid,
  p_reason_code text,
  p_reason_note text default null
)
returns public.financial_postings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.financial_postings%rowtype;
  v_reversal public.financial_postings%rowtype;
begin
  select * into v_original from public.financial_postings where id = p_posting_id for update;
  if not found then raise exception 'El hecho financiero no existe.'; end if;
  if v_original.status <> 'posted' then raise exception 'El hecho financiero no está disponible para reversa.'; end if;
  if exists (select 1 from public.financial_postings where reversal_of_id = v_original.id) then
    raise exception 'El hecho financiero ya fue revertido.';
  end if;
  if p_reason_code = 'OTHER' and nullif(btrim(coalesce(p_reason_note, '')), '') is null then
    raise exception 'El motivo OTHER requiere una observación.';
  end if;

  -- La reversa corrige el mismo hecho económico; su fecha es la del original.
  perform public.assert_financial_date_open(v_original.branch_id, v_original.accounting_date);
  insert into public.financial_postings(
    accounting_date, branch_id, payroll_period_id, business_line, financial_group, effect_type,
    posting_code, amount, affects_profit, source_type, source_id, reversal_of_id,
    description, metadata, created_by
  ) values (
    v_original.accounting_date, v_original.branch_id, v_original.payroll_period_id,
    v_original.business_line, v_original.financial_group,
    case v_original.effect_type
      when 'income' then 'expense' when 'expense' then 'income'
      when 'asset_increase' then 'asset_decrease' when 'asset_decrease' then 'asset_increase'
      when 'liability_increase' then 'liability_decrease' when 'liability_decrease' then 'liability_increase'
      when 'cash_in' then 'cash_out' when 'cash_out' then 'cash_in' else 'memo'
    end,
    v_original.posting_code || '_reversal', v_original.amount, v_original.affects_profit,
    'reversal', v_original.id, v_original.id, 'Reversa: ' || v_original.description,
    jsonb_build_object('reasonCode', p_reason_code, 'reasonNote', nullif(btrim(coalesce(p_reason_note, '')), '')),
    public.current_employee_id()
  ) returning * into v_reversal;
  return v_reversal;
end;
$$;

-- Backfill idempotente: corrige exclusivamente la fecha de reversas legacy.
do $$
declare v_affected integer := 0;
begin
  update public.financial_postings reversal
     set accounting_date = original.accounting_date
    from public.financial_postings original
   where reversal.reversal_of_id = original.id
     and reversal.accounting_date is distinct from original.accounting_date;
  get diagnostics v_affected = row_count;
  raise notice '187: % reversa(s) legacy con fecha contable corregida(s).', v_affected;
end;
$$;

-- Contrato explícito: [] nunca significa simultáneamente automático y ninguno.
create or replace function public.prepare_employee_settlement_v187(
  p_period_id uuid,
  p_employee_id uuid,
  p_commission_rate numeric,
  p_debt_deductions jsonb,
  p_notes text,
  p_high_rate_note text,
  p_debt_application_mode text
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_debt public.employee_debts%rowtype;
  v_manual_item jsonb;
  v_available numeric(12,2) := 0;
  v_apply numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
begin
  if p_debt_application_mode not in ('auto', 'manual', 'none') then
    raise exception 'El modo de aplicación de deudas no es válido.';
  end if;

  if p_debt_application_mode = 'manual' then
    for v_manual_item in select value from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
      if exists (
        select 1
          from public.employee_settlement_deductions deduction
          join public.employee_settlements settlement on settlement.id = deduction.settlement_id
         where deduction.employee_debt_id = (v_manual_item ->> 'debt_id')::uuid
           and settlement.status in ('draft', 'review', 'approved')
      ) then
        raise exception 'Una deuda seleccionada ya está reservada en otra liquidación activa.';
      end if;
    end loop;
    return public.prepare_employee_settlement(
      p_period_id, p_employee_id, p_commission_rate,
      coalesce(p_debt_deductions, '[]'::jsonb), p_notes, p_high_rate_note
    );
  end if;

  -- Primero se prepara el documento sin deudas para obtener el neto real previo
  -- al descuento y conservar todas las validaciones/snapshots existentes.
  select * into v_settlement from public.prepare_employee_settlement(
    p_period_id, p_employee_id, p_commission_rate,
    '[]'::jsonb, p_notes, p_high_rate_note
  );
  if p_debt_application_mode = 'none' then return v_settlement; end if;

  v_available := greatest(coalesce(v_settlement.net_pay_amount, 0), 0);
  for v_debt in
    select debt.*
      from public.employee_debts debt
     where debt.employee_id = p_employee_id
       and debt.status in ('pending', 'partial')
       and debt.outstanding_amount > 0
       -- Una deuda incluida en otro borrador/revisión/aprobación no se reserva dos veces.
       and not exists (
         select 1
           from public.employee_settlement_deductions deduction
           join public.employee_settlements settlement on settlement.id = deduction.settlement_id
          where deduction.employee_debt_id = debt.id
            and settlement.id <> v_settlement.id
            and settlement.status in ('draft', 'review', 'approved')
       )
     order by debt.created_at, debt.id
     for update
  loop
    exit when v_available <= 0;
    v_apply := least(v_available, v_debt.outstanding_amount);
    insert into public.employee_settlement_deductions(
      settlement_id, employee_debt_id, amount, balance_before, balance_after
    ) values (
      v_settlement.id, v_debt.id, v_apply, v_debt.outstanding_amount,
      v_debt.outstanding_amount - v_apply
    );
    v_total := v_total + v_apply;
    v_available := v_available - v_apply;
  end loop;

  update public.employee_settlements
     set debt_deduction_total = round(v_total, 2),
         net_pay_amount = greatest(round(gross_pay_amount - v_total, 2), 0)
   where id = v_settlement.id
   returning * into v_settlement;
  return v_settlement;
end;
$$;

alter table public.accounts_payable_payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.employees(id) on delete set null,
  add column if not exists reversal_reason_code text,
  add column if not exists reversal_reason text;

create or replace function public.reverse_operational_accounts_payable_payment(
  p_payment_id uuid,
  p_reason_code text,
  p_note text default null
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.accounts_payable_payments%rowtype;
  v_payable public.accounts_payable%rowtype;
  v_cash public.cash_movements%rowtype;
  v_posting_id uuid;
  v_reason text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede revertir pagos de cuentas por pagar.'; end if;
  if p_reason_code not in ('ENTRY_ERROR', 'DUPLICATE', 'WRONG_PAYMENT_METHOD', 'WRONG_AMOUNT', 'WRONG_REFERENCE', 'OTHER') then
    raise exception 'El motivo de reversa no es válido.';
  end if;
  if p_reason_code = 'OTHER' and v_reason is null then
    raise exception 'El motivo Otro requiere una observación.';
  end if;

  select * into v_payment from public.accounts_payable_payments where id = p_payment_id for update;
  if not found then raise exception 'El pago de cuenta por pagar no existe.'; end if;
  if v_payment.status <> 'posted' then raise exception 'Este pago ya fue revertido o no está disponible.'; end if;
  select * into v_payable from public.accounts_payable where id = v_payment.payable_id for update;
  if not found then raise exception 'La cuenta por pagar no existe.'; end if;

  select * into v_cash
    from public.cash_movements
   where source_type = 'accounts_payable_payment'
     and source_id = v_payment.id
     and status = 'active'
   for update;
  if found then
    if not exists (select 1 from public.pos_sessions where id = v_cash.pos_session_id and status = 'open') then
      raise exception 'El pago afectó una caja POS ya cerrada. No puede revertirse retroactivamente hasta la implementación de Tesorería.';
    end if;
    update public.cash_movements
       set status = 'cancelled', cancelled_at = now(), cancelled_by = public.current_employee_id(),
           cancelled_reason = 'Reversa de pago CxP: ' || p_reason_code || coalesce('. ' || v_reason, '')
     where id = v_cash.id;
    perform public.sync_pos_session_totals(v_cash.pos_session_id);
  end if;

  select id into v_posting_id
    from public.financial_postings
   where source_type = 'accounts_payable_payment'
     and source_id = v_payment.id
     and status = 'posted'
   order by created_at desc
   limit 1;
  if v_posting_id is not null then
    perform public.reverse_financial_posting(v_posting_id, p_reason_code, v_reason);
  end if;

  update public.accounts_payable_payments
     set status = 'voided', reversed_at = now(), reversed_by = public.current_employee_id(),
         reversal_reason_code = p_reason_code, reversal_reason = v_reason
   where id = v_payment.id;

  update public.accounts_payable
     set outstanding_amount = least(original_amount, round(outstanding_amount + v_payment.amount, 2)),
         status = case when round(outstanding_amount + v_payment.amount, 2) >= original_amount then 'pending' else 'partial' end,
         payment_date = null,
         settled_at = null
   where id = v_payable.id
   returning * into v_payable;
  return v_payable;
end;
$$;

revoke all on function public.prepare_employee_settlement_v187(uuid,uuid,numeric,jsonb,text,text,text) from public, anon;
revoke all on function public.reverse_financial_posting(uuid,text,text) from public, anon;
revoke all on function public.reverse_operational_accounts_payable_payment(uuid,text,text) from public, anon;
grant execute on function public.prepare_employee_settlement_v187(uuid,uuid,numeric,jsonb,text,text,text) to authenticated, service_role;
grant execute on function public.reverse_financial_posting(uuid,text,text), public.reverse_operational_accounts_payable_payment(uuid,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Debt selection and recovery
-- Origen: supabase/migrations/20260926022825_employee_debt_settlement_selection_and_recovery.sql
-- ============================================================
-- 188: selección explícita de deudas, reserva parcial y cobro directo.
-- Incremental y prospectiva: no modifica liquidaciones paid ni saldos históricos.

create or replace function public.get_employee_settlement_debt_options_v188(
  p_employee_id uuid,
  p_branch_id uuid
)
returns table(
  debt_id uuid,
  debt_date timestamptz,
  debt_type text,
  debt_label text,
  description text,
  origin_label text,
  original_amount numeric,
  outstanding_amount numeric,
  active_reserved_amount numeric,
  available_debt_amount numeric
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with reserved as (
    select deduction.employee_debt_id, coalesce(sum(deduction.amount), 0)::numeric(12,2) as amount
    from public.employee_settlement_deductions deduction
    join public.employee_settlements settlement on settlement.id = deduction.settlement_id
    where settlement.status in ('draft', 'review', 'approved')
    group by deduction.employee_debt_id
  )
  select debt.id,
    debt.created_at,
    debt.debt_type,
    case debt.debt_type
      when 'loan' then 'Préstamo'
      when 'advance' then 'Adelanto'
      when 'penalty' then 'Penalidad'
      when 'administrative_charge' then 'Cargo administrativo'
      when 'supply' then 'Consumo POS'
      when 'internal_credit' then 'Consumo POS'
      else 'Otro cargo'
    end,
    debt.description,
    case debt.debt_type
      when 'supply' then 'Entrega de insumos'
      when 'internal_credit' then 'Crédito de empleado en POS'
      when 'loan' then 'Préstamo registrado'
      when 'advance' then 'Adelanto registrado'
      when 'penalty' then 'Penalidad administrativa'
      else 'Registro administrativo'
    end,
    debt.original_amount,
    debt.outstanding_amount,
    coalesce(reserved.amount, 0)::numeric(12,2),
    greatest(debt.outstanding_amount - coalesce(reserved.amount, 0), 0)::numeric(12,2)
  from public.employee_debts debt
  left join reserved on reserved.employee_debt_id = debt.id
  where debt.employee_id = p_employee_id
    and debt.branch_id = p_branch_id
    and debt.status in ('pending', 'partial')
    and debt.outstanding_amount > 0
  order by debt.created_at, debt.id;
$$;

-- The legacy preparer treats [] as automatic.  This wrapper deliberately
-- removes that temporary legacy allocation and inserts only the explicit rows.
create or replace function public.prepare_employee_settlement_v188(
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
  v_item jsonb;
  v_debt public.employee_debts%rowtype;
  v_debt_id uuid;
  v_amount numeric(12,2);
  v_reserved numeric(12,2);
  v_available numeric(12,2);
  v_total numeric(12,2) := 0;
  v_net_before_debt numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin puede preparar liquidaciones.';
  end if;
  if jsonb_typeof(coalesce(p_debt_deductions, '[]'::jsonb)) <> 'array' then
    raise exception 'Las deudas seleccionadas no tienen un formato válido.';
  end if;

  select * into v_settlement from public.prepare_employee_settlement_v187(
    p_period_id, p_employee_id, p_commission_rate, '[]'::jsonb,
    p_notes, p_high_rate_note, 'none'
  );

  -- Keep all production/mandatory-discount snapshots created by the canonical
  -- preparer, but remove its legacy automatic reservation before selecting.
  v_net_before_debt := round(coalesce(v_settlement.net_pay_amount, 0) + coalesce(v_settlement.debt_deduction_total, 0), 2);
  delete from public.employee_settlement_deductions where settlement_id = v_settlement.id;
  update public.employee_settlements
     set debt_deduction_total = 0,
         net_pay_amount = v_net_before_debt
   where id = v_settlement.id
   returning * into v_settlement;

  for v_item in select value from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    begin
      v_debt_id := coalesce(nullif(v_item ->> 'debt_id', '')::uuid, nullif(v_item ->> 'debtId', '')::uuid);
      v_amount := round((v_item ->> 'amount')::numeric, 2);
    exception when others then
      raise exception 'Cada descuento de deuda debe contener una deuda y monto monetario válidos.';
    end;
    if v_debt_id is null or v_amount <= 0 then
      raise exception 'Cada descuento de deuda debe tener un monto mayor a cero.';
    end if;
    if exists (select 1 from public.employee_settlement_deductions where settlement_id = v_settlement.id and employee_debt_id = v_debt_id) then
      raise exception 'Una deuda no puede seleccionarse dos veces.';
    end if;
    select * into v_debt from public.employee_debts
      where id = v_debt_id and employee_id = p_employee_id and branch_id = v_settlement.branch_id
        and status in ('pending', 'partial') and outstanding_amount > 0
      for update;
    if not found then raise exception 'Una deuda seleccionada ya no está disponible.'; end if;
    select coalesce(sum(deduction.amount), 0) into v_reserved
      from public.employee_settlement_deductions deduction
      join public.employee_settlements other_settlement on other_settlement.id = deduction.settlement_id
     where deduction.employee_debt_id = v_debt.id
       and other_settlement.id <> v_settlement.id
       and other_settlement.status in ('draft', 'review', 'approved');
    v_available := greatest(v_debt.outstanding_amount - coalesce(v_reserved, 0), 0);
    if v_amount > v_available then
      raise exception 'El descuento solicitado supera el saldo disponible de la deuda "%".', v_debt.description;
    end if;
    v_total := v_total + v_amount;
    insert into public.employee_settlement_deductions(
      settlement_id, employee_debt_id, amount, balance_before, balance_after
    ) values (
      v_settlement.id, v_debt.id, v_amount, v_debt.outstanding_amount,
      round(v_debt.outstanding_amount - v_amount, 2)
    );
  end loop;
  if v_total > v_net_before_debt then
    raise exception 'El total seleccionado de deudas supera el neto disponible de la liquidación. Reduce alguno de los descuentos seleccionados.';
  end if;
  update public.employee_settlements
     set debt_deduction_total = round(v_total, 2),
         net_pay_amount = round(v_net_before_debt - v_total, 2)
   where id = v_settlement.id
   returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.waive_employee_penalty_v188(
  p_debt_id uuid,
  p_reason_code text,
  p_note text default null
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_label text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_reason_code not in ('ENTRY_ERROR', 'DUPLICATE', 'ADMIN_CANCELLED', 'JUSTIFICATION_ACCEPTED', 'OTHER') then
    raise exception 'El motivo para dejar la penalidad sin efecto no es válido.';
  end if;
  if p_reason_code = 'OTHER' and v_note is null then
    raise exception 'La observación es obligatoria cuando el motivo es Otro.';
  end if;
  select * into v_debt from public.employee_debts where id = p_debt_id;
  if not found or v_debt.debt_type <> 'penalty' then
    raise exception 'Solo una penalidad puede dejarse sin efecto desde la liquidación.';
  end if;
  v_label := case p_reason_code
    when 'ENTRY_ERROR' then 'Penalidad registrada por error'
    when 'DUPLICATE' then 'Penalidad duplicada'
    when 'ADMIN_CANCELLED' then 'Penalidad anulada por administración'
    when 'JUSTIFICATION_ACCEPTED' then 'Justificación aceptada'
    else 'Otro'
  end;
  return public.waive_employee_debt(v_debt.id, v_label || coalesce(': ' || v_note, ''));
end;
$$;

create or replace function public.collect_employee_debt_v188(
  p_debt_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_reference text default null,
  p_notes text default null
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_category_id uuid;
  v_result public.employee_debts%rowtype;
  v_actor uuid := public.current_employee_id();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede cobrar deudas.'; end if;
  select * into v_debt from public.employee_debts where id = p_debt_id for update;
  if not found or v_debt.status not in ('pending', 'partial') then raise exception 'La deuda no está disponible para cobro.'; end if;
  if coalesce(p_amount, 0) <= 0 or round(p_amount, 2) > v_debt.outstanding_amount then raise exception 'El cobro no puede superar el saldo pendiente.'; end if;
  select * into v_method from public.payment_methods where id = p_payment_method_id and is_active;
  if not found or v_method.payment_kind not in ('cash', 'wallet_qr', 'bank_transfer') then
    raise exception 'El método de cobro debe ser Efectivo, Yape/Plin o Transferencia.';
  end if;
  if v_method.payment_kind in ('wallet_qr', 'bank_transfer') and v_reference is null then
    raise exception 'La referencia u operación es obligatoria para este método de cobro.';
  end if;
  if v_method.payment_kind = 'cash' then
    select * into v_session from public.pos_sessions
      where branch_id = v_debt.branch_id and status = 'open'
      order by opened_at desc limit 1 for update;
    if not found then raise exception 'No existe una caja abierta en esta sede para registrar el cobro en efectivo.'; end if;
    select id into v_category_id from public.cash_movement_categories where code = 'employee_debt_collection' and is_active limit 1;
    insert into public.cash_movements(pos_session_id, branch_id, category_id, movement_type, amount, description, status, created_by)
    values(v_session.id, v_debt.branch_id, v_category_id, 'income', round(p_amount,2),
      'Cobro de deuda de empleado: ' || v_debt.description, 'active', v_actor);
    perform public.sync_pos_session_totals(v_session.id);
  end if;
  select * into v_result from public.apply_employee_debt_payment(
    p_debt_id, round(p_amount, 2), 'manual_payment', p_notes, p_payment_method_id, v_reference
  );
  return v_result;
end;
$$;

insert into public.cash_movement_categories(code, name, description, movement_direction, sort_order, is_active)
values ('employee_debt_collection', 'Cobro de deuda de empleado', 'Ingreso de efectivo por recuperación de cuenta por cobrar a empleado.', 'income', 52, true)
on conflict (code) do update set name = excluded.name, description = excluded.description, movement_direction = excluded.movement_direction, is_active = true;

revoke all on function public.get_employee_settlement_debt_options_v188(uuid,uuid) from public, anon;
revoke all on function public.prepare_employee_settlement_v188(uuid,uuid,numeric,jsonb,text,text) from public, anon;
revoke all on function public.waive_employee_penalty_v188(uuid,text,text) from public, anon;
revoke all on function public.collect_employee_debt_v188(uuid,numeric,uuid,text,text) from public, anon;
grant execute on function public.get_employee_settlement_debt_options_v188(uuid,uuid), public.prepare_employee_settlement_v188(uuid,uuid,numeric,jsonb,text,text), public.waive_employee_penalty_v188(uuid,text,text), public.collect_employee_debt_v188(uuid,numeric,uuid,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement cash and payable consistency
-- Origen: supabase/migrations/20260926172546_final_settlement_cash_and_payable_consistency.sql
-- ============================================================
-- 189: consistencia final de liquidaciones, deudas, caja y cuentas por pagar.
-- Incremental: no reescribe liquidaciones pagadas ni borra hechos históricos.

-- Una deducción de liquidación solo se consume una vez. La reserva sigue
-- viviendo en employee_settlement_deductions; este índice protege el hecho
-- consumido del ledger incluso ante reintentos concurrentes.
create unique index if not exists employee_debt_movements_settlement_deduction_once
  on public.employee_debt_movements(debt_id, settlement_id, movement_type)
  where movement_type = 'settlement_deduction' and settlement_id is not null;

-- Un pago de liquidación puede dividirse entre métodos, pero el costo laboral
-- ya fue reconocido al aprobar la liquidación: estas filas sólo documentan la
-- salida/cobro operativo. Nunca se usan para recalcular P&L.
create table if not exists public.employee_settlement_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  notes text,
  status text not null default 'posted' check (status in ('posted','voided','reversed')),
  cash_movement_id uuid references public.cash_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references public.employees(id) on delete set null,
  reversal_reason text
);
alter table public.employee_settlement_payments add column if not exists employee_id uuid references public.employees(id) on delete restrict;
alter table public.employee_settlement_payments add column if not exists notes text;
alter table public.employee_settlement_payments add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete restrict;
alter table public.employee_settlement_payments add column if not exists reversed_at timestamptz;
alter table public.employee_settlement_payments add column if not exists reversed_by uuid references public.employees(id) on delete set null;
alter table public.employee_settlement_payments add column if not exists reversal_reason text;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='employee_settlement_payments' and column_name='treasury_account_id') then
    alter table public.employee_settlement_payments alter column treasury_account_id drop not null;
  end if;
end $$;
alter table public.employee_settlement_payments drop constraint if exists employee_settlement_payments_status_check;
alter table public.employee_settlement_payments add constraint employee_settlement_payments_status_check check (status in ('posted','voided','reversed'));
create unique index if not exists employee_settlement_payments_one_active_method
  on public.employee_settlement_payments(settlement_id, payment_method_id)
  where status = 'posted';
create index if not exists employee_settlement_payments_settlement_idx
  on public.employee_settlement_payments(settlement_id, created_at);
alter table public.employee_settlement_payments enable row level security;
drop policy if exists employee_settlement_payments_admin on public.employee_settlement_payments;
create policy employee_settlement_payments_admin on public.employee_settlement_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.employee_settlement_payments to authenticated;
grant all on public.employee_settlement_payments to service_role;
revoke all on public.employee_settlement_payments from public, anon;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_reference text default null,
  p_evidence_path text default null,
  p_notes text default null,
  p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_method public.payment_methods%rowtype;
  v_debt public.employee_debts%rowtype;
  v_deduction record;
  v_actor uuid := public.current_employee_id();
  v_category_id uuid;
  v_business_date date := public.pos_business_date();
  v_new_outstanding numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select * into v_settlement from public.employee_settlements
   where id = p_settlement_id for update;
  if not found or v_settlement.status <> 'approved' then
    raise exception 'La liquidación debe estar aprobada antes de pagar.';
  end if;
  if round(coalesce(p_amount, 0), 2) <> round(v_settlement.net_pay_amount, 2) then
    raise exception 'El monto debe coincidir con el neto de la liquidación.';
  end if;

  select * into v_method from public.payment_methods
   where id = p_payment_method_id and is_active;
  if not found or v_method.payment_kind = 'internal_credit' then
    raise exception 'El método de pago no está disponible para liquidaciones.';
  end if;
  select id into v_category_id from public.finance_categories
   where code = 'employee_settlement_payment' and is_active limit 1;
  if v_category_id is null then
    raise exception 'No existe una categoría financiera activa para el pago de liquidación.';
  end if;

  -- El pago y el consumo se ejecutan dentro de la misma transacción. Si una
  -- deuda ya no alcanza, no queda ni pago financiero ni saldo parcial.
  insert into public.finance_manual_entries(
    branch_id, entry_date, direction, category_id, amount, payment_method_id,
    description, reference, evidence_url, status, created_by, source_type, source_id
  ) values (
    v_settlement.branch_id, v_business_date, 'expense', v_category_id,
    v_settlement.net_pay_amount, v_method.id,
    'Pago de liquidación ' || v_settlement.settlement_number,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_evidence_path, '')), ''), 'active', v_actor,
    'employee_settlement', v_settlement.id
  );

  for v_deduction in
    select * from public.employee_settlement_deductions
     where settlement_id = p_settlement_id
     order by id
  loop
    -- Idempotencia defensiva: si este hecho ya existe, el estado approved no
    -- podría reintentarse, pero nunca se vuelve a descontar por esta fila.
    if exists (
      select 1 from public.employee_debt_movements movement
       where movement.debt_id = v_deduction.employee_debt_id
         and movement.settlement_id = p_settlement_id
         and movement.movement_type = 'settlement_deduction'
    ) then
      continue;
    end if;

    select * into v_debt from public.employee_debts
     where id = v_deduction.employee_debt_id for update;
    if not found or v_debt.status not in ('pending', 'partial') then
      raise exception 'La deuda reservada ya no está disponible para esta liquidación.';
    end if;
    if round(v_debt.outstanding_amount, 2) < round(v_deduction.amount, 2) then
      raise exception 'La deuda "%" ya no tiene saldo suficiente para el descuento reservado.', v_debt.description;
    end if;
    v_new_outstanding := round(v_debt.outstanding_amount - v_deduction.amount, 2);
    update public.employee_debts
       set outstanding_amount = v_new_outstanding,
           status = case when v_new_outstanding = 0 then 'paid' else 'partial' end,
           settled_at = case when v_new_outstanding = 0 then now() else null end
     where id = v_debt.id;
    insert into public.employee_debt_movements(
      debt_id, movement_type, amount, settlement_id, notes, created_by
    ) values (
      v_debt.id, 'settlement_deduction', round(v_deduction.amount, 2), p_settlement_id,
      'Descuento aplicado en liquidación ' || v_settlement.settlement_number || '.', v_actor
    );
  end loop;

  update public.employee_settlements
     set status = 'paid', payment_method_id = p_payment_method_id,
         payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         payment_evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
         cash_movement_id = null,
         notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
         paid_by = v_actor, paid_at = now()
   where id = p_settlement_id
   returning * into v_settlement;
  return v_settlement;
end;
$$;

insert into public.cash_movement_categories(code, name, description, movement_direction, sort_order, is_active)
values ('employee_debt_disbursement', 'Desembolso a empleado', 'Salida de efectivo por adelanto o préstamo a empleado.', 'expense', 51, true)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  movement_direction = excluded.movement_direction, is_active = true;

create or replace function public.create_employee_debt_with_disbursements(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_amount numeric,
  p_description text,
  p_disbursements jsonb default '[]'::jsonb
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.employee_debts%rowtype;
  v_disbursement public.employee_debt_disbursements%rowtype;
  v_item jsonb;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_category_id uuid;
  v_line_amount numeric(12,2);
  v_total numeric(12,2) := 0;
  v_actor uuid := public.current_employee_id();
begin
  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'penalty', 'administrative_charge', 'other') then
    raise exception 'El tipo de deuda no se puede registrar manualmente.';
  end if;
  if p_debt_type in ('penalty', 'administrative_charge') and not public.is_admin() then
    raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.';
  end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Monto y descripción son obligatorios.';
  end if;
  if p_debt_type in ('loan', 'advance') and (jsonb_typeof(p_disbursements) <> 'array' or jsonb_array_length(p_disbursements) = 0) then
    raise exception 'Un préstamo o adelanto requiere uno o más desembolsos con método de pago.';
  end if;
  if p_debt_type not in ('loan', 'advance') and coalesce(p_disbursements, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'Solo préstamos y adelantos admiten desembolsos.';
  end if;

  -- Validar caja antes de crear la deuda evita hechos huérfanos. FOR UPDATE
  -- serializa el desembolso efectivo con otros movimientos de esa sesión.
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements, '[]'::jsonb)) loop
    v_line_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
    if v_line_amount <= 0 or nullif(v_item ->> 'paymentMethodId', '') is null then
      raise exception 'Cada desembolso requiere método y monto mayor a cero.';
    end if;
    select * into v_method from public.payment_methods
     where id = (v_item ->> 'paymentMethodId')::uuid and is_active;
    if not found then raise exception 'El método de pago del desembolso no está disponible.'; end if;
    if v_method.counts_as_cash then
      select * into v_session from public.pos_sessions
       where branch_id = p_branch_id and status = 'open'
       order by opened_at desc limit 1 for update;
      if not found then
        raise exception 'No existe una caja abierta en esta sede para registrar el desembolso en efectivo.';
      end if;
    end if;
    v_total := v_total + v_line_amount;
  end loop;
  if p_debt_type in ('loan', 'advance') and round(v_total, 2) <> round(p_amount, 2) then
    raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.';
  end if;

  v_debt := public.create_employee_debt(p_employee_id, p_branch_id, p_debt_type, p_amount, p_description);
  select id into v_category_id from public.cash_movement_categories
   where code = 'employee_debt_disbursement' and is_active limit 1;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements, '[]'::jsonb)) loop
    select * into v_method from public.payment_methods
     where id = (v_item ->> 'paymentMethodId')::uuid and is_active;
    insert into public.employee_debt_disbursements(
      debt_id, payment_method_id, amount, payment_reference, evidence_url, notes, created_by
    ) values (
      v_debt.id, v_method.id, round((v_item ->> 'amount')::numeric, 2),
      nullif(btrim(coalesce(v_item ->> 'reference', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'evidenceUrl', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'notes', '')), ''), v_actor
    ) returning * into v_disbursement;
    if v_method.counts_as_cash then
      select * into v_session from public.pos_sessions
       where branch_id = p_branch_id and status = 'open'
       order by opened_at desc limit 1 for update;
      insert into public.cash_movements(
        pos_session_id, branch_id, category_id, movement_type, amount, description,
        status, created_by, source_type, source_id, is_system_generated
      ) values (
        v_session.id, p_branch_id, v_category_id, 'expense', v_disbursement.amount,
        'Desembolso ' || case when p_debt_type = 'advance' then 'adelanto' else 'préstamo' end || ' empleado: ' || v_debt.description,
        'active', v_actor, 'employee_debt_disbursement', v_disbursement.id, true
      ) on conflict (source_type, source_id) where status = 'active' do nothing;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;
  return v_debt;
end;
$$;

-- Una anulación de obligación solo está bloqueada por pagos vigentes. Los
-- pagos voided/reversed permanecen como historial y no bloquean el origen.
create or replace function public.cancel_operational_finance_entry_v186(
  p_entry_id uuid,
  p_reason_code text,
  p_note text default null
)
returns public.finance_manual_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.finance_manual_entries%rowtype;
  v_payable public.accounts_payable%rowtype;
  v_posting_id uuid;
  v_payable_posting_id uuid;
  v_cash public.cash_movements%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin puede anular costos y gastos.'; end if;
  if upper(coalesce(p_reason_code, '')) not in ('ENTRY_ERROR','DUPLICATE','WRONG_AMOUNT','WRONG_CATEGORY','WRONG_DATE','WRONG_PAYMENT_METHOD','SOURCE_DOCUMENT_CANCELLED','OTHER') then
    raise exception 'El motivo de anulación no es válido.';
  end if;
  if upper(p_reason_code) = 'OTHER' and v_note is null then raise exception 'La observación es obligatoria cuando el motivo es Otro.'; end if;
  v_reason := upper(p_reason_code) || coalesce(': ' || v_note, '');
  select * into v_entry from public.finance_manual_entries where id = p_entry_id for update;
  if not found or v_entry.status <> 'active' then raise exception 'El registro financiero no está disponible.'; end if;
  if v_entry.payable_id is not null then
    select * into v_payable from public.accounts_payable where id = v_entry.payable_id for update;
    if exists (select 1 from public.accounts_payable_payments payment where payment.payable_id = v_payable.id and payment.status = 'posted') then
      raise exception 'La cuenta por pagar tiene pagos vigentes; primero revierte sus pagos para conservar la trazabilidad.';
    end if;
    select id into v_payable_posting_id from public.financial_postings where source_type = 'accounts_payable' and source_id = v_payable.id and status = 'posted' limit 1;
    update public.accounts_payable set status = 'cancelled', outstanding_amount = 0, settled_at = now() where id = v_payable.id;
  end if;
  select * into v_cash from public.cash_movements where source_type = 'finance_manual_entry' and source_id = v_entry.id and status = 'active' for update;
  if found and not exists (select 1 from public.pos_sessions where id = v_cash.pos_session_id and status = 'open') then
    raise exception 'Este movimiento afectó una caja POS ya cerrada y no puede modificarse retroactivamente.';
  end if;
  select id into v_posting_id from public.financial_postings where source_type = 'finance_manual_entry' and source_id = v_entry.id and status = 'posted' limit 1;
  if v_posting_id is not null then perform public.reverse_financial_posting(v_posting_id, 'SOURCE_CANCELLED', v_reason); end if;
  if v_payable_posting_id is not null then perform public.reverse_financial_posting(v_payable_posting_id, 'SOURCE_CANCELLED', v_reason); end if;
  if v_cash.id is not null then
    update public.cash_movements set status = 'cancelled', cancelled_at = now(), cancelled_by = public.current_employee_id(), cancelled_reason = 'Reversa desde Finanzas: ' || v_reason where id = v_cash.id;
    perform public.sync_pos_session_totals(v_cash.pos_session_id);
  end if;
  update public.finance_manual_entries set status='cancelled', cancellation_reason_code=upper(p_reason_code), cancellation_reason=v_reason, cancelled_at=now(), cancelled_by=public.current_employee_id(), updated_at=now() where id=v_entry.id returning * into v_entry;
  return v_entry;
end;
$$;

-- Pago final atómico: valida todas las partes antes de mutar saldo, exige
-- referencia en rieles digitales y genera movimiento de caja sólo por la
-- parte en efectivo. Las reservas se consumen desde el saldo vigente, no
-- desde el saldo histórico que quedó impreso en el borrador.
create or replace function public.pay_employee_settlement_v189(
  p_settlement_id uuid,
  p_payment_parts jsonb,
  p_notes text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_part jsonb;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_payment public.employee_settlement_payments%rowtype;
  v_debt public.employee_debts%rowtype;
  v_deduction record;
  v_actor uuid := public.current_employee_id();
  v_total numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_category_id uuid;
  v_reference text;
  v_new_outstanding numeric(12,2);
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden pagar liquidaciones.'; end if;
  if jsonb_typeof(p_payment_parts) <> 'array' or jsonb_array_length(p_payment_parts) = 0 then
    raise exception 'Registra al menos una parte de pago.';
  end if;
  select * into v_settlement from public.employee_settlements where id = p_settlement_id for update;
  if not found or v_settlement.status <> 'approved' then raise exception 'La liquidación debe estar aprobada antes de pagar.'; end if;

  -- Primera pasada: no crea hechos mientras el pago no esté conciliado.
  for v_part in select value from jsonb_array_elements(p_payment_parts) loop
    v_amount := round(coalesce((v_part ->> 'amount')::numeric, 0), 2);
    if v_amount <= 0 or nullif(v_part ->> 'paymentMethodId', '') is null then raise exception 'Cada parte requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id = (v_part ->> 'paymentMethodId')::uuid and is_active;
    if not found or v_method.payment_kind = 'internal_credit' then raise exception 'El método de pago no está disponible para liquidaciones.'; end if;
    v_reference := nullif(btrim(coalesce(v_part ->> 'reference', '')), '');
    if v_method.payment_kind in ('wallet_qr','bank_transfer') and v_reference is null then
      raise exception 'La referencia es obligatoria para el método digital %.', v_method.name;
    end if;
    if exists (select 1 from jsonb_array_elements(p_payment_parts) other where other <> v_part and other ->> 'paymentMethodId' = v_part ->> 'paymentMethodId') then
      raise exception 'Cada método de pago puede aparecer una sola vez.';
    end if;
    if v_method.payment_kind = 'cash' then
      select * into v_session from public.pos_sessions where branch_id = v_settlement.branch_id and status = 'open' order by opened_at desc limit 1 for update;
      if not found then raise exception 'No existe una sesión POS abierta para registrar la parte en efectivo.'; end if;
    end if;
    v_total := v_total + v_amount;
  end loop;
  if round(v_total,2) <> round(v_settlement.net_pay_amount,2) then raise exception 'La suma de las partes debe coincidir exactamente con el neto de la liquidación.'; end if;

  select id into v_category_id from public.cash_movement_categories where code = 'employee_settlement_payment' and is_active limit 1;
  for v_part in select value from jsonb_array_elements(p_payment_parts) loop
    select * into v_method from public.payment_methods where id = (v_part ->> 'paymentMethodId')::uuid for share;
    v_amount := round((v_part ->> 'amount')::numeric, 2);
    v_reference := nullif(btrim(coalesce(v_part ->> 'reference', '')), '');
    insert into public.employee_settlement_payments(settlement_id,employee_id,payment_method_id,amount,reference,notes,created_by)
    values (p_settlement_id,v_settlement.employee_id,v_method.id,v_amount,v_reference,nullif(btrim(coalesce(v_part ->> 'notes','')),''),v_actor)
    returning * into v_payment;
    if v_method.payment_kind = 'cash' then
      select * into v_session from public.pos_sessions where branch_id = v_settlement.branch_id and status = 'open' order by opened_at desc limit 1 for update;
      insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
      values(v_session.id,v_settlement.branch_id,v_category_id,'expense',v_amount,'Pago de liquidación '||v_settlement.settlement_number,'active',v_actor,'employee_settlement_payment',v_payment.id,true)
      returning id into v_payment.cash_movement_id;
      update public.employee_settlement_payments set cash_movement_id=v_payment.cash_movement_id where id=v_payment.id;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;

  for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id order by id loop
    if exists(select 1 from public.employee_debt_movements movement where movement.debt_id=v_deduction.employee_debt_id and movement.settlement_id=p_settlement_id and movement.movement_type='settlement_deduction') then continue; end if;
    select * into v_debt from public.employee_debts where id=v_deduction.employee_debt_id for update;
    if not found or v_debt.status not in ('pending','partial') or round(v_debt.outstanding_amount,2) < round(v_deduction.amount,2) then
      raise exception 'La deuda reservada ya no tiene saldo suficiente para esta liquidación.';
    end if;
    v_new_outstanding:=round(v_debt.outstanding_amount-v_deduction.amount,2);
    update public.employee_debts set outstanding_amount=v_new_outstanding,status=case when v_new_outstanding=0 then 'paid' else 'partial' end,settled_at=case when v_new_outstanding=0 then now() else null end where id=v_debt.id;
    insert into public.employee_debt_movements(debt_id,movement_type,amount,settlement_id,notes,created_by)
    values(v_debt.id,'settlement_deduction',v_deduction.amount,p_settlement_id,'Descuento aplicado en liquidación '||v_settlement.settlement_number||'.',v_actor);
  end loop;
  update public.employee_settlements set status='paid',payment_method_id=null,payment_reference=null,payment_evidence_path=null,cash_movement_id=null,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),paid_by=v_actor,paid_at=now() where id=p_settlement_id returning * into v_settlement;
  return v_settlement;
end;
$$;

-- El total de perfil se agrega antes de juntar el historial; de esta forma un
-- empleado con varios movimientos no duplica artificialmente su saldo.
create or replace view public.vw_employee_debt_profiles
with (security_invoker=true) as
with debt_totals as (
  select debt.employee_id,debt.branch_id,
    coalesce(sum(debt.outstanding_amount) filter(where debt.status in ('pending','partial')),0) as outstanding_total,
    count(*) filter(where debt.status in ('pending','partial')) as active_debt_count
  from public.employee_debts debt group by debt.employee_id,debt.branch_id
), last_ledger as (
  select distinct on (ledger.employee_id,ledger.branch_id) ledger.employee_id,ledger.branch_id,ledger.event_date,ledger.event_type,ledger.signed_amount
  from public.vw_employee_debt_ledger ledger order by ledger.employee_id,ledger.branch_id,ledger.event_date desc nulls last
)
select totals.employee_id,totals.branch_id,employee.full_name as employee_name,branch.name as branch_name,
  totals.outstanding_total,totals.active_debt_count,last.event_date as last_movement_date,last.event_type as last_movement_type,last.signed_amount as last_movement_signed_amount
from debt_totals totals join public.employees employee on employee.id=totals.employee_id join public.branches branch on branch.id=totals.branch_id
left join last_ledger last on last.employee_id=totals.employee_id and last.branch_id=totals.branch_id;

revoke all on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid), public.pay_employee_settlement_v189(uuid,jsonb,text), public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb), public.cancel_operational_finance_entry_v186(uuid,text,text) from public, anon;
grant execute on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid), public.pay_employee_settlement_v189(uuid,jsonb,text), public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb), public.cancel_operational_finance_entry_v186(uuid,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement reentry and debt detail
-- Origen: supabase/migrations/20260926193000_settlement_reentry_debt_sources_and_detail_fix.sql
-- ============================================================
  -- 190: reingreso de liquidaciones, detalle de fuentes y compatibilidad de pagos.
  -- Incremental: no modifica liquidaciones paid ni borra historia.

  -- La tabla preexistente de pagos parciales no tiene una columna notes en todos
  -- los entornos. El contrato de detalle usa método, monto, referencia y estado.
  -- No se añade notes porque no es un dato funcional requerido.

  -- Sólo puede existir un documento de liquidación en curso por empleado/período.
  -- Los documentos paid/cancelled son terminales y no bloquean un nuevo cálculo.
  drop index if exists public.employee_settlements_one_active_idx;
  create unique index if not exists employee_settlements_one_active_employee_period
    on public.employee_settlements(employee_id, payroll_period_id)
    where status in ('draft','review','approved');

  create or replace view public.vw_employee_settlement_consumed_sources
  with (security_invoker=true) as
  select line.production_entry_id as source_id,'service_production'::text as source_kind
  from public.employee_settlement_service_lines line join public.employee_settlements settlement on settlement.id=line.settlement_id
  where settlement.status in ('draft','review','approved','paid')
  union
  select line.attribution_id,'product_attribution'::text
  from public.employee_settlement_product_lines line join public.employee_settlements settlement on settlement.id=line.settlement_id
  where settlement.status in ('draft','review','approved','paid');

  -- El snapshot de producto conserva el bono real de la fuente canónica, en vez
  -- de escribir cero y dejar el detalle en desacuerdo con el encabezado.
  create or replace function public.snapshot_employee_settlement_product_lines_v183()
  returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
  begin
    insert into public.employee_settlement_product_lines(
      settlement_id,attribution_id,sale_id_snapshot,sale_number_snapshot,accounting_date_snapshot,
      sale_item_id_snapshot,product_id_snapshot,product_name_snapshot,business_line_snapshot,
      quantity_snapshot,commercial_amount_snapshot,recognized_production_amount_snapshot,bonus_amount_snapshot
    )
    select new.id,attribution.id,attribution.sale_id,sale.sale_number,attribution.accounting_date,
      attribution.sale_item_id,item.product_id,coalesce(product.name,item.item_name_snapshot,'Producto'),
      attribution.business_line,item.quantity,greatest(coalesce(item.original_total,item.total,0),0),
      attribution.recognized_production_amount,coalesce(bonus.total_bonus_amount,0)
    from public.employee_sale_item_attributions attribution
    join public.sales sale on sale.id=attribution.sale_id and sale.status='completed'
    join public.sale_items item on item.id=attribution.sale_item_id
    left join public.products product on product.id=item.product_id
    left join public.employee_product_bonus_entries bonus on bonus.sale_item_id=attribution.sale_item_id and bonus.employee_id=attribution.employee_id and bonus.status='active'
    where attribution.employee_id=new.employee_id and attribution.payroll_period_id=new.payroll_period_id and attribution.status='active'
      and not exists(select 1 from public.vw_employee_settlement_consumed_sources used where used.source_kind='product_attribution' and used.source_id=attribution.id)
    on conflict(settlement_id,attribution_id) do nothing;
    return new;
  end;
  $$;

  -- Fuente legible de cada deuda. Para créditos internos, internal_pos_operations
  -- es el vínculo relacional canónico hacia la venta y sus ítems; no se usa UUID
  -- como descripción principal.
  create or replace view public.vw_employee_debt_source_detail
  with (security_invoker=true) as
  select debt.id as debt_id, debt.debt_type, debt.description as debt_description,
    debt.original_amount, debt.outstanding_amount, debt.status,
    operation.sale_id,
    case when operation.sale_id is not null then 'VTA-' || upper(left(operation.sale_id::text,8)) end as sale_reference,
    coalesce(items.item_summary, debt.description) as source_description
  from public.employee_debts debt
  left join public.internal_pos_operations operation on operation.debt_id=debt.id
  left join lateral (
    select string_agg(coalesce(item.description_snapshot,'Ítem') || ' x' || item.quantity::text, ', ' order by item.created_at) as item_summary
    from public.sale_items item where item.sale_id=operation.sale_id
  ) items on true;

  -- Línea de auditoría para consumos de deuda por liquidación, con su documento
  -- y deuda real. Conserva cualquier ledger histórico sin reescribirlo.
  create or replace view public.vw_employee_settlement_debt_ledger_detail
  with (security_invoker=true) as
  select movement.id as movement_id,movement.debt_id,movement.settlement_id,movement.amount,movement.created_at,
    settlement.settlement_number,debt.debt_type,debt.description as debt_description
  from public.employee_debt_movements movement
  join public.employee_settlements settlement on settlement.id=movement.settlement_id
  join public.employee_debts debt on debt.id=movement.debt_id
  where movement.movement_type='settlement_deduction';

  -- La elegibilidad por fuente se consulta desde snapshots: las líneas de una
  -- liquidación paid/review/approved bloquean su fuente; las canceladas no. La
  -- función preparadora debe aplicar este conjunto antes de snapshotear.

  revoke all on public.vw_employee_debt_source_detail, public.vw_employee_settlement_debt_ledger_detail, public.vw_employee_settlement_consumed_sources from public, anon;
  grant select on public.vw_employee_debt_source_detail, public.vw_employee_settlement_debt_ledger_detail, public.vw_employee_settlement_consumed_sources to authenticated, service_role;
  notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: WiFi hotspot phase 1
-- Origen: supabase/migrations/20260926200000_wifi_hotspot_phase_1.sql
-- ============================================================
-- WiFi Hotspot fase 1. Migración independiente de finanzas.
create table if not exists public.wifi_access_vouchers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  code_hash text not null unique,
  code_last4 text not null,
  status text not null default 'available' check(status in ('available','active','expired','revoked')),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unused_expires_at timestamptz not null,
  first_used_at timestamptz,
  session_expires_at timestamptz,
  revoked_at timestamptz,
  device_identifier text,
  mikrotik_username text,
  mikrotik_user_id text,
  updated_at timestamptz not null default now(),
  check ((status='available' and first_used_at is null) or status <> 'available')
);
create index if not exists wifi_access_vouchers_branch_status_idx on public.wifi_access_vouchers(branch_id,status,created_at desc);
create index if not exists wifi_access_vouchers_unused_expiry_idx on public.wifi_access_vouchers(unused_expires_at) where status='available';
create index if not exists wifi_access_vouchers_session_expiry_idx on public.wifi_access_vouchers(session_expires_at) where status='active';
alter table public.wifi_access_vouchers enable row level security;
drop policy if exists wifi_access_vouchers_admin on public.wifi_access_vouchers;
create policy wifi_access_vouchers_admin on public.wifi_access_vouchers for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.wifi_access_vouchers from public,anon;
grant select,insert,update on public.wifi_access_vouchers to authenticated;
grant all on public.wifi_access_vouchers to service_role;

create or replace function public.generate_wifi_access_voucher(p_branch_id uuid)
returns table(id uuid, code text, code_last4 text, unused_expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_code text; v_hash text; v_id uuid;
begin
 if not public.is_admin() then raise exception 'Solo owner o admin puede generar accesos WiFi.'; end if;
 if not public.can_manage_pos_branch(p_branch_id) then raise exception 'No tienes acceso a esta sede.'; end if;
 loop
   v_code:=lpad(mod(('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint,1000000)::text,6,'0');
   v_hash:=encode(extensions.digest(v_code,'sha256'),'hex');
   begin
     insert into public.wifi_access_vouchers(branch_id,code_hash,code_last4,created_by,unused_expires_at)
     values(p_branch_id,v_hash,right(v_code,4),public.current_employee_id(),now()+interval '30 minutes') returning wifi_access_vouchers.id into v_id;
     exit;
   exception when unique_violation then end;
 end loop;
 return query select v_id,v_code,right(v_code,4),now()+interval '30 minutes';
end; $$;

create or replace function public.consume_wifi_access_voucher(p_code text,p_device_identifier text)
returns table(status text, session_expires_at timestamptz, branch_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.wifi_access_vouchers%rowtype; v_hash text:=encode(extensions.digest(trim(p_code),'sha256'),'hex');
begin
 if p_code !~ '^[0-9]{6}$' or nullif(btrim(p_device_identifier),'') is null then return; end if;
 select * into v_row from public.wifi_access_vouchers where code_hash=v_hash for update;
 if not found or v_row.status in ('revoked','expired') then return; end if;
 if v_row.status='available' and v_row.unused_expires_at<=now() then update public.wifi_access_vouchers set status='expired',updated_at=now() where id=v_row.id; return; end if;
 if v_row.status='active' and v_row.session_expires_at<=now() then update public.wifi_access_vouchers set status='expired',updated_at=now() where id=v_row.id; return; end if;
 if v_row.status='active' and v_row.device_identifier<>p_device_identifier then return query select 'other_device'::text,null::timestamptz,v_row.branch_id; return; end if;
 if v_row.status='available' then update public.wifi_access_vouchers set status='active',first_used_at=now(),session_expires_at=now()+interval '3 hours',device_identifier=left(p_device_identifier,255),updated_at=now() where id=v_row.id returning * into v_row; end if;
 return query select 'active'::text,v_row.session_expires_at,v_row.branch_id;
end; $$;
revoke all on function public.generate_wifi_access_voucher(uuid),public.consume_wifi_access_voucher(text,text) from public,anon;
grant execute on function public.generate_wifi_access_voucher(uuid),public.consume_wifi_access_voucher(text,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Debt registration without POS session
-- Origen: src/sql/191_employee_debt_registration_without_pos_session.sql
-- ============================================================
-- Mirror of supabase/migrations/20260926203000_employee_debt_registration_without_pos_session.sql.
-- Execute the timestamped migration in Supabase; never execute both copies.
-- 191: una deuda y su desembolso existen aunque no haya sesión POS abierta.

alter table public.employee_debt_disbursements
  add column if not exists cash_context text,
  add column if not exists reconciliation_status text;

alter table public.employee_debt_disbursements drop constraint if exists employee_debt_disbursements_cash_context_check;
alter table public.employee_debt_disbursements add constraint employee_debt_disbursements_cash_context_check check (cash_context is null or cash_context in ('pos', 'external'));
alter table public.employee_debt_disbursements drop constraint if exists employee_debt_disbursements_reconciliation_status_check;
alter table public.employee_debt_disbursements add constraint employee_debt_disbursements_reconciliation_status_check check (reconciliation_status is null or reconciliation_status in ('reconciled', 'pending'));

create or replace function public.create_employee_debt_with_disbursements(
  p_employee_id uuid, p_branch_id uuid, p_debt_type text, p_amount numeric,
  p_description text, p_disbursements jsonb default '[]'::jsonb
)
returns public.employee_debts language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_debt public.employee_debts%rowtype;
  v_disbursement public.employee_debt_disbursements%rowtype;
  v_item jsonb;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_category_id uuid;
  v_line_amount numeric(12,2);
  v_total numeric(12,2) := 0;
  v_method_ids text[] := array[]::text[];
  v_actor uuid := public.current_employee_id();
begin
  if coalesce(p_debt_type, '') not in ('loan', 'advance', 'penalty', 'administrative_charge') then raise exception 'El tipo de deuda no se puede registrar manualmente.'; end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda en esta sede.'; end if;
  if p_debt_type in ('penalty', 'administrative_charge') and not public.is_admin() then raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.'; end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'Monto y descripción son obligatorios.'; end if;
  if p_debt_type in ('loan', 'advance') and (jsonb_typeof(p_disbursements) <> 'array' or jsonb_array_length(p_disbursements) = 0) then raise exception 'Un préstamo o adelanto requiere uno o más desembolsos.'; end if;
  if p_debt_type not in ('loan', 'advance') and coalesce(p_disbursements, '[]'::jsonb) <> '[]'::jsonb then raise exception 'Las penalidades y cargos administrativos no admiten desembolsos.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements, '[]'::jsonb)) loop
    v_line_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
    if v_line_amount <= 0 or nullif(v_item ->> 'paymentMethodId', '') is null then raise exception 'Cada desembolso requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid and is_active and payment_kind in ('cash', 'wallet_qr', 'bank_transfer');
    if not found then raise exception 'Solo Efectivo, Yape/Plin o Transferencia son válidos para desembolsar.'; end if;
    if v_method.id::text = any(v_method_ids) then raise exception 'No se puede repetir el mismo método de desembolso.'; end if;
    v_method_ids := array_append(v_method_ids, v_method.id::text);
    if v_method.payment_kind in ('wallet_qr', 'bank_transfer') and nullif(btrim(coalesce(v_item ->> 'reference', '')), '') is null then raise exception 'La referencia es obligatoria para desembolsos digitales.'; end if;
    v_total := v_total + v_line_amount;
  end loop;
  if p_debt_type in ('loan', 'advance') and round(v_total, 2) <> round(p_amount, 2) then raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.'; end if;
  v_debt := public.create_employee_debt(p_employee_id, p_branch_id, p_debt_type, p_amount, p_description);
  select id into v_category_id from public.cash_movement_categories where code = 'employee_debt_disbursement' and is_active limit 1;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements, '[]'::jsonb)) loop
    select * into v_method from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid and is_active;
    v_line_amount := round((v_item ->> 'amount')::numeric, 2);
    v_session := null;
    if v_method.payment_kind = 'cash' then select * into v_session from public.pos_sessions where branch_id = p_branch_id and status = 'open' order by opened_at desc limit 1 for update; end if;
    insert into public.employee_debt_disbursements(debt_id,payment_method_id,amount,payment_reference,evidence_url,notes,created_by,cash_context,reconciliation_status)
    values(v_debt.id,v_method.id,v_line_amount,nullif(btrim(coalesce(v_item ->> 'reference', '')), ''),nullif(btrim(coalesce(v_item ->> 'evidenceUrl', '')), ''),nullif(btrim(coalesce(v_item ->> 'notes', '')), ''),v_actor,case when v_method.payment_kind = 'cash' then case when v_session.id is null then 'external' else 'pos' end end,case when v_method.payment_kind = 'cash' then case when v_session.id is null then 'pending' else 'reconciled' end end) returning * into v_disbursement;
    if v_method.payment_kind = 'cash' and v_session.id is not null then
      insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
      values(v_session.id,p_branch_id,v_category_id,'expense',v_disbursement.amount,'Desembolso ' || case when p_debt_type = 'advance' then 'adelanto' else 'préstamo' end || ' empleado: ' || v_debt.description,'active',v_actor,'employee_debt_disbursement',v_disbursement.id,true)
      on conflict (source_type, source_id) where status = 'active' do nothing;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;
  return v_debt;
end;
$$;

revoke all on function public.create_employee_debt_with_disbursements(uuid, uuid, text, numeric, text, jsonb) from public, anon;
grant execute on function public.create_employee_debt_with_disbursements(uuid, uuid, text, numeric, text, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement sale references
-- Origen: src/sql/192_settlement_sale_reference_and_debt_display_fix.sql
-- ============================================================
-- Mirror of supabase/migrations/20260927010000_settlement_sale_reference_and_debt_display_fix.sql.
-- Execute the timestamped migration in Supabase; never execute both copies.

create or replace function public.snapshot_employee_settlement_product_lines_v183()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.employee_settlement_product_lines(settlement_id,attribution_id,sale_id_snapshot,sale_number_snapshot,accounting_date_snapshot,sale_item_id_snapshot,product_id_snapshot,product_name_snapshot,business_line_snapshot,quantity_snapshot,commercial_amount_snapshot,recognized_production_amount_snapshot,bonus_amount_snapshot)
  select new.id,attribution.id,attribution.sale_id,concat('VTA-', upper(left(sale.id::text, 8))),attribution.accounting_date,attribution.sale_item_id,item.product_id,coalesce(product.name,item.description_snapshot,'Producto'),attribution.business_line,item.quantity,greatest(coalesce(item.original_total,item.total,0),0),attribution.recognized_production_amount,coalesce(bonus.total_bonus_amount,0)
  from public.employee_sale_item_attributions attribution join public.sales sale on sale.id=attribution.sale_id and sale.status='completed' join public.sale_items item on item.id=attribution.sale_item_id left join public.products product on product.id=item.product_id left join public.employee_product_bonus_entries bonus on bonus.sale_item_id=attribution.sale_item_id and bonus.employee_id=new.employee_id and bonus.payroll_period_id=new.payroll_period_id and bonus.status='active'
  where attribution.employee_id=new.employee_id and attribution.payroll_period_id=new.payroll_period_id and attribution.status='active' and not exists(select 1 from public.vw_employee_settlement_consumed_sources used where used.source_kind='product_attribution' and used.source_id=attribution.id)
  on conflict(settlement_id,attribution_id) do nothing;
  return new;
end;
$$;

create or replace view public.vw_employee_debt_source_detail with (security_invoker = true) as
select debt.id as debt_id,debt.debt_type,debt.description as debt_description,debt.original_amount,debt.outstanding_amount,debt.status,operation.sale_id,case when operation.sale_id is not null then concat('VTA-',upper(left(operation.sale_id::text,8))) end as sale_reference,case when operation.sale_id is not null then coalesce(items.first_item_description,debt.description,'Producto') else debt.description end as source_description,debt.created_at as debt_created_at,items.first_item_description,greatest(coalesce(items.item_count,0)-1,0)::integer as extra_item_count
from public.employee_debts debt left join public.internal_pos_operations operation on operation.debt_id=debt.id left join lateral (select (array_agg(coalesce(item.description_snapshot,product.name,'Producto') order by item.created_at,item.id))[1] as first_item_description,count(*)::integer as item_count from public.sale_items item left join public.products product on product.id=item.product_id where item.sale_id=operation.sale_id) items on true;

alter table public.employee_settlement_deductions add column if not exists debt_sale_reference_snapshot text,add column if not exists debt_first_item_description_snapshot text,add column if not exists debt_extra_item_count_snapshot integer not null default 0;
create or replace function public.snapshot_employee_settlement_deduction_source_v192() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_source public.vw_employee_debt_source_detail%rowtype;
begin
  select * into v_source from public.vw_employee_debt_source_detail where debt_id=new.employee_debt_id;
  if found then new.debt_type_snapshot:=v_source.debt_type; new.debt_description_snapshot:=v_source.debt_description; new.debt_created_at_snapshot:=v_source.debt_created_at; new.debt_sale_reference_snapshot:=v_source.sale_reference; new.debt_first_item_description_snapshot:=v_source.first_item_description; new.debt_extra_item_count_snapshot:=coalesce(v_source.extra_item_count,0); end if;
  return new;
end;
$$;
drop trigger if exists employee_settlement_deduction_source_snapshot_v192 on public.employee_settlement_deductions;
create trigger employee_settlement_deduction_source_snapshot_v192 before insert on public.employee_settlement_deductions for each row execute function public.snapshot_employee_settlement_deduction_source_v192();

create or replace view public.vw_employee_debt_ledger with (security_invoker = true) as
select debt.employee_id,debt.branch_id,movement.debt_id,movement.created_at as event_date,movement.movement_type as event_type,'debt_movement'::text as source_type,movement.id as source_id,coalesce(nullif(movement.notes,''),debt.description) as description,movement.payment_reference as reference,case when movement.movement_type in ('settlement_deduction','manual_payment','immediate_payment','write_off','cancellation') then -movement.amount else movement.amount end as signed_amount from public.employee_debt_movements movement join public.employee_debts debt on debt.id=movement.debt_id;

revoke all on function public.snapshot_employee_settlement_product_lines_v183() from public, anon;
revoke all on function public.snapshot_employee_settlement_deduction_source_v192() from public, anon;
revoke all on public.vw_employee_debt_source_detail, public.vw_employee_debt_ledger from public, anon;
grant select on public.vw_employee_debt_source_detail, public.vw_employee_debt_ledger to authenticated, service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: POS employee buyer pricing
-- Origen: supabase/migrations/20260927020000_pos_employee_buyer_pricing.sql
-- ============================================================
-- Buyer pricing is independent from the payment operation.  This wrapper is
-- deliberately the only SQL pricing boundary; the historical atomic core is
-- retained for debt, stock and accounting behaviour.
create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_customer_id uuid := (p_payload->>'customer_id')::uuid;
  v_branch_id uuid := (p_payload->>'branch_id')::uuid;
  v_buyer_employee_id uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_product record;
  v_retail_price numeric;
  v_employee_price numeric;
  v_line text;
  v_responsible uuid;
  v_inherited_service_executor uuid;
begin
  select link.employee_id into v_buyer_employee_id
  from public.employee_customer_links link
  join public.employees employee on employee.id = link.employee_id and employee.status = 'active'
  where link.customer_id = v_customer_id and link.is_active
  limit 1;

  select (array_agg(distinct coalesce(nullif(value->>'responsible_employee_id','')::uuid, nullif(value->>'attributed_employee_id','')::uuid, nullif(value->>'barber_id','')::uuid)))[1]
    into v_inherited_service_executor
  from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  where value->>'item_type' = 'service'
    and coalesce(nullif(value->>'responsible_employee_id','')::uuid, nullif(value->>'attributed_employee_id','')::uuid, nullif(value->>'barber_id','')::uuid) is not null
  having count(distinct coalesce(nullif(value->>'responsible_employee_id','')::uuid, nullif(value->>'attributed_employee_id','')::uuid, nullif(value->>'barber_id','')::uuid)) = 1;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    if v_item->>'item_type' = 'product' then
      select product.id, coalesce(product.visibility_scope,'pos') as visibility_scope,
             coalesce(category.business_line,'other') as business_line
        into v_product
      from public.products product
      left join public.product_categories category on category.id=product.category_id
      where product.id=(v_item->>'product_id')::uuid and product.is_active;
      if not found then raise exception 'El producto no está disponible.'; end if;
      if v_product.visibility_scope='internal' and v_buyer_employee_id is null then
        raise exception 'Este producto está disponible únicamente para empleados.';
      end if;
      select stock.final_sale_price into v_retail_price
      from public.vw_product_stock stock where stock.product_id=v_product.id and stock.branch_id=v_branch_id;
      v_retail_price := coalesce(v_retail_price, (select base_sale_price from public.products where id=v_product.id));
      select catalog.employee_unit_price into v_employee_price
      from public.employee_supply_catalog_items catalog
      where catalog.product_id=v_product.id and catalog.is_active
      limit 1;
      if v_product.visibility_scope='internal' and v_employee_price is null then
        raise exception 'El producto interno no tiene una configuración de precio para empleados.';
      end if;
      -- both/pos: special price is optional; absent means retail fallback.
      v_item := jsonb_set(v_item,'{unit_price}',to_jsonb(case when v_buyer_employee_id is not null and v_employee_price is not null then v_employee_price else v_retail_price end),true);
      v_responsible := coalesce(nullif(v_item->>'responsible_employee_id','')::uuid, nullif(v_item->>'attributed_employee_id','')::uuid, nullif(v_item->>'barber_id','')::uuid, v_inherited_service_executor);
      if v_product.business_line='barbershop_products' and v_responsible is null then raise exception 'Los productos de barbería requieren responsable o vendedor.'; end if;
      if v_responsible is not null then
        if not exists(select 1 from public.employees where id=v_responsible and status='active' and (branch_id is null or branch_id=v_branch_id)) then raise exception 'El responsable seleccionado no está activo.'; end if;
        v_item:=jsonb_set(v_item,'{responsible_employee_id}',to_jsonb(v_responsible::text),true);
        v_item:=jsonb_set(v_item,'{attributed_employee_id}',to_jsonb(v_responsible::text),true);
        v_item:=jsonb_set(v_item,'{barber_id}',to_jsonb(v_responsible::text),true);
      end if;
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  if coalesce((p_payload->>'internal_credit')::boolean,false) and v_buyer_employee_id is null then raise exception 'El crédito de empleado requiere un cliente vinculado.'; end if;
  return public.checkout_pos_sale_v175(jsonb_set(p_payload,'{items}',v_items,true));
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Hotspot captive identity
-- Origen: supabase/migrations/20260927030000_red_hotspot_captive_identity.sql
-- ============================================================
-- Red Hotspot: queue-driven RouterOS integration and captive customer identity.
-- This migration is intentionally local-only; it is not executed by this change.
alter table public.customers drop constraint if exists customers_source_check;
-- Preserve every historical source (`system` is used by Cliente varios) and
-- add only the new, auditable captive origin.
alter table public.customers add constraint customers_source_check check (source in ('manual','reservation','sale','import','system','hotspot'));

create table if not exists public.hotspot_routers (
  id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id) on delete restrict,
  identifier text not null unique, name text not null, token_hash text not null unique,
  last_heartbeat_at timestamptz, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.hotspot_routers
  add column if not exists status text not null default 'active',
  add column if not exists last_seen_at timestamptz,
  add column if not exists routeros_version text,
  add column if not exists model text;
alter table public.hotspot_routers add constraint hotspot_routers_status_check check (status in ('active','disabled'));
create index if not exists hotspot_routers_branch_status_idx on public.hotspot_routers(branch_id,status);
alter table public.wifi_access_vouchers
  add column if not exists router_id uuid references public.hotspot_routers(id) on delete restrict,
  add column if not exists customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists code_ciphertext text,
  add column if not exists claimed_at timestamptz,
  add column if not exists device_mac text,
  add column if not exists device_ip inet,
  add column if not exists router_sync_status text not null default 'pending',
  add column if not exists router_synced_at timestamptz;
alter table public.wifi_access_vouchers drop constraint if exists wifi_access_vouchers_status_check;
alter table public.wifi_access_vouchers add constraint wifi_access_vouchers_status_check check (status in ('pending_sync','available','registration_pending','activation_pending','activation_ready','active','expired','revoked','sync_error'));

create table if not exists public.hotspot_router_commands (
  id uuid primary key default gen_random_uuid(), router_id uuid not null references public.hotspot_routers(id) on delete cascade,
  voucher_id uuid references public.wifi_access_vouchers(id) on delete cascade, command_type text not null check(command_type in ('CREATE_VOUCHER','ACTIVATE_VOUCHER','REVOKE_VOUCHER','EXPIRE_VOUCHER')),
  payload jsonb not null default '{}'::jsonb, status text not null default 'pending' check(status in ('pending','leased','acknowledged','failed')),
  idempotency_key text not null unique, attempts integer not null default 0, available_at timestamptz not null default now(), acknowledged_at timestamptz, error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.hotspot_router_commands
  add column if not exists claimed_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists error_code text;
alter table public.hotspot_router_commands drop constraint if exists hotspot_router_commands_status_check;
alter table public.hotspot_router_commands add constraint hotspot_router_commands_status_check check (status in ('pending','processing','applied','failed'));
create unique index if not exists hotspot_create_voucher_active_unique
  on public.hotspot_router_commands(router_id,voucher_id,command_type)
  where command_type='CREATE_VOUCHER' and status in ('pending','processing','applied');
create table if not exists public.hotspot_session_events (
  id uuid primary key default gen_random_uuid(), router_id uuid not null references public.hotspot_routers(id) on delete cascade,
  voucher_id uuid references public.wifi_access_vouchers(id) on delete set null, event_type text not null check(event_type in ('LOGIN','LOGOUT','UNUSED_EXPIRED','SESSION_EXPIRED','SYNC_ERROR','TELEMETRY')),
  device_mac text, device_ip inet, payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create index if not exists hotspot_router_commands_pending_idx on public.hotspot_router_commands(router_id,status,available_at);
create index if not exists wifi_access_vouchers_customer_idx on public.wifi_access_vouchers(customer_id);

alter table public.hotspot_routers enable row level security;
alter table public.hotspot_router_commands enable row level security;
alter table public.hotspot_session_events enable row level security;
drop policy if exists hotspot_routers_admin on public.hotspot_routers;
drop policy if exists hotspot_commands_admin on public.hotspot_router_commands;
drop policy if exists hotspot_events_admin on public.hotspot_session_events;
create policy hotspot_routers_admin on public.hotspot_routers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy hotspot_commands_admin on public.hotspot_router_commands for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy hotspot_events_admin on public.hotspot_session_events for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.hotspot_routers,public.hotspot_router_commands,public.hotspot_session_events from public,anon;
grant select,insert,update on public.hotspot_routers,public.hotspot_router_commands,public.hotspot_session_events to authenticated;
grant all on public.hotspot_routers,public.hotspot_router_commands,public.hotspot_session_events to service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Hotspot router pull and ack
-- Origen: supabase/migrations/20260928012106_hotspot_router_pull_ack.sql
-- ============================================================
-- Router pull/ack is intentionally performed inside PostgreSQL so two
-- concurrent requests cannot deliver the same command.
alter table public.hotspot_router_commands
  add column if not exists result jsonb;

create or replace function public.claim_hotspot_router_commands(
  p_router_id uuid,
  p_limit integer default 20,
  p_processing_timeout_seconds integer default 120
)
returns table(
  id uuid,
  router_id uuid,
  voucher_id uuid,
  command_type text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A crashed request must not strand a command forever.
  update public.hotspot_router_commands
     set status = 'pending', claimed_at = null, updated_at = now()
   where router_id = p_router_id
     and status = 'processing'
     and claimed_at < now() - make_interval(secs => greatest(p_processing_timeout_seconds, 1));

  return query
  with claimable as (
    select c.id
      from public.hotspot_router_commands c
     where c.router_id = p_router_id
       and c.status = 'pending'
       and c.available_at <= now()
     order by c.created_at
     limit greatest(least(p_limit, 100), 1)
     for update skip locked
  ), claimed as (
    update public.hotspot_router_commands c
       set status = 'processing',
           claimed_at = now(),
           attempts = c.attempts + 1,
           updated_at = now()
      from claimable q
     where c.id = q.id
    returning c.id, c.router_id, c.voucher_id, c.command_type, c.payload, c.attempts
  )
  select * from claimed;
end;
$$;

create or replace function public.ack_hotspot_router_command(
  p_router_id uuid,
  p_command_id uuid,
  p_success boolean,
  p_result jsonb default null,
  p_error_code text default null,
  p_error_message text default null,
  p_router_user_id text default null,
  p_retry_limit integer default 3
)
returns table(outcome text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_command public.hotspot_router_commands%rowtype;
  v_error_code text := left(regexp_replace(coalesce(p_error_code, ''), '[[:cntrl:]]', '', 'g'), 100);
  v_error_message text := left(regexp_replace(coalesce(p_error_message, ''), '[[:cntrl:]]', '', 'g'), 500);
begin
  select * into v_command
    from public.hotspot_router_commands
   where id = p_command_id and router_id = p_router_id
   for update;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;

  if v_command.status = 'applied' then
    return query select 'applied'::text;
    return;
  end if;

  if v_command.status <> 'processing' then
    return query select 'not_processing'::text;
    return;
  end if;

  if p_success then
    update public.hotspot_router_commands
       set status = 'applied', processed_at = now(), result = p_result,
           error_code = null, error_message = null, updated_at = now()
     where id = v_command.id;

    if v_command.command_type = 'CREATE_VOUCHER' and v_command.voucher_id is not null then
      update public.wifi_access_vouchers
         set status = 'available', router_sync_status = 'synced', router_synced_at = now(),
             code_ciphertext = null,
             mikrotik_user_id = coalesce(nullif(left(p_router_user_id, 255), ''), mikrotik_user_id),
             updated_at = now()
       where id = v_command.voucher_id and status = 'pending_sync';
    end if;

    return query select 'applied'::text;
    return;
  end if;

  if v_command.attempts < greatest(p_retry_limit, 1) then
    update public.hotspot_router_commands
       set status = 'pending', claimed_at = null, result = p_result,
           error_code = nullif(v_error_code, ''), error_message = nullif(v_error_message, ''),
           updated_at = now()
     where id = v_command.id;
    return query select 'retrying'::text;
    return;
  end if;

  update public.hotspot_router_commands
     set status = 'failed', processed_at = now(), result = p_result,
         error_code = nullif(v_error_code, ''), error_message = nullif(v_error_message, ''),
         updated_at = now()
   where id = v_command.id;

  if v_command.command_type = 'CREATE_VOUCHER' and v_command.voucher_id is not null then
    update public.wifi_access_vouchers
       set status = 'sync_error', router_sync_status = 'error', updated_at = now()
     where id = v_command.voucher_id and status = 'pending_sync';
  end if;

  return query select 'failed'::text;
end;
$$;

revoke all on function public.claim_hotspot_router_commands(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.ack_hotspot_router_command(uuid,uuid,boolean,jsonb,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_hotspot_router_commands(uuid,integer,integer) to service_role;
grant execute on function public.ack_hotspot_router_command(uuid,uuid,boolean,jsonb,text,text,text,integer) to service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement draft and atomic confirmation
-- Origen: supabase/migrations/20261001221608_settlement_draft_edit_and_atomic_confirmation.sql
-- ============================================================
-- 193: edición segura de borradores y confirmación atómica.
-- Es incremental: no altera documentos paid/cancelled ni reescribe snapshots.

alter table public.employee_settlement_service_lines
  add column if not exists sale_id_snapshot uuid,
  add column if not exists sale_reference_snapshot text;

create or replace function public.snapshot_employee_settlement_service_sale_v193()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
begin
  select sale_id into v_sale_id
  from public.employee_service_production
  where id = new.production_entry_id;
  if v_sale_id is null then
    raise exception 'La línea de liquidación requiere una venta de origen válida.';
  end if;
  new.sale_id_snapshot := v_sale_id;
  new.sale_reference_snapshot := concat('VTA-', upper(left(v_sale_id::text, 8)));
  return new;
end;
$$;

drop trigger if exists employee_settlement_service_sale_snapshot_v193 on public.employee_settlement_service_lines;
create trigger employee_settlement_service_sale_snapshot_v193
before insert or update of production_entry_id on public.employee_settlement_service_lines
for each row execute function public.snapshot_employee_settlement_service_sale_v193();

create or replace function public.prepare_employee_settlement_v193(
  p_period_id uuid,
  p_employee_id uuid,
  p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb,
  p_notes text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
begin
  -- El borrador puede capturar una tasa excepcional sin pedir la observación en
  -- el modal mínimo. La autorización sigue siendo obligatoria al confirmar.
  if coalesce(p_commission_rate, 0) > 60 then
    select * into v_settlement from public.prepare_employee_settlement_v188(
      p_period_id, p_employee_id, 60, coalesce(p_debt_deductions, '[]'::jsonb), p_notes, null
    );
    select * into v_settlement from public.update_employee_settlement_draft_v193(
      v_settlement.id, p_commission_rate, coalesce(p_debt_deductions, '[]'::jsonb), null
    );
    return v_settlement;
  end if;
  return public.prepare_employee_settlement_v188(
    p_period_id, p_employee_id, p_commission_rate, coalesce(p_debt_deductions, '[]'::jsonb), p_notes, null
  );
end;
$$;

create or replace function public.update_employee_settlement_draft_v193(
  p_settlement_id uuid,
  p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_debt public.employee_debts%rowtype;
  v_item jsonb;
  v_debt_id uuid;
  v_amount numeric(12,2);
  v_reserved numeric(12,2);
  v_available numeric(12,2);
  v_debt_total numeric(12,2) := 0;
  v_percentage_total numeric(12,2) := 0;
  v_gross numeric(12,2);
  v_before_mandatory numeric(12,2);
  v_rate numeric(8,4);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin puede editar borradores de liquidación.';
  end if;
  if jsonb_typeof(coalesce(p_debt_deductions, '[]'::jsonb)) <> 'array' then
    raise exception 'Las deudas seleccionadas no tienen un formato válido.';
  end if;

  select * into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;
  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidación en borrador puede editarse.';
  end if;

  v_rate := round(coalesce(p_commission_rate, v_settlement.commission_rate), 4);
  if v_rate < 0 then
    raise exception 'El porcentaje de comisión no puede ser negativo.';
  end if;

  -- Bloquea primero las reservas que se liberarán. Una reserva nunca consume
  -- outstanding_amount: ese hecho sigue ocurriendo exclusivamente en v189.
  perform 1
  from public.employee_debts debt
  join public.employee_settlement_deductions deduction on deduction.employee_debt_id = debt.id
  where deduction.settlement_id = p_settlement_id
  order by debt.id
  for update;
  delete from public.employee_settlement_deductions where settlement_id = p_settlement_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    begin
      v_debt_id := coalesce(nullif(v_item ->> 'debt_id', '')::uuid, nullif(v_item ->> 'debtId', '')::uuid);
      v_amount := round((v_item ->> 'amount')::numeric, 2);
    exception when others then
      raise exception 'Cada descuento de deuda debe contener una deuda y monto monetario válidos.';
    end;
    if v_debt_id is null or v_amount <= 0 then
      raise exception 'Cada descuento de deuda debe tener un monto mayor a cero.';
    end if;
    if exists (
      select 1 from public.employee_settlement_deductions
      where settlement_id = p_settlement_id and employee_debt_id = v_debt_id
    ) then
      raise exception 'Una deuda no puede seleccionarse dos veces.';
    end if;

    select * into v_debt
    from public.employee_debts
    where id = v_debt_id
      and employee_id = v_settlement.employee_id
      and branch_id = v_settlement.branch_id
      and status in ('pending', 'partial')
      and outstanding_amount > 0
    for update;
    if not found then
      raise exception 'Una deuda seleccionada ya no está disponible.';
    end if;

    select coalesce(sum(deduction.amount), 0) into v_reserved
    from public.employee_settlement_deductions deduction
    join public.employee_settlements other_settlement on other_settlement.id = deduction.settlement_id
    where deduction.employee_debt_id = v_debt.id
      and other_settlement.id <> p_settlement_id
      and other_settlement.status in ('draft', 'review', 'approved');
    v_available := greatest(v_debt.outstanding_amount - coalesce(v_reserved, 0), 0);
    if v_amount > v_available then
      raise exception 'El descuento solicitado supera el saldo disponible de la deuda "%".', v_debt.description;
    end if;

    insert into public.employee_settlement_deductions(
      settlement_id, employee_debt_id, amount, balance_before, balance_after
    ) values (
      p_settlement_id, v_debt.id, v_amount, v_debt.outstanding_amount,
      round(v_debt.outstanding_amount - v_amount, 2)
    );
    v_debt_total := v_debt_total + v_amount;
  end loop;

  update public.employee_settlement_service_lines
  set commission_rate = case
        when production_source_snapshot in ('normal', 'commercial_discount')
          or (production_source_snapshot = 'reward' and reward_commission_mode_snapshot = 'percentage') then v_rate
        else 0
      end,
      commission_amount = case
        when production_source_snapshot in ('normal', 'commercial_discount')
          or (production_source_snapshot = 'reward' and reward_commission_mode_snapshot = 'percentage')
          then round(coalesce(commissionable_amount, 0) * v_rate / 100, 2)
        else 0
      end
  where settlement_id = p_settlement_id;
  select coalesce(sum(commission_amount), 0) into v_percentage_total
  from public.employee_settlement_service_lines
  where settlement_id = p_settlement_id;

  v_gross := round(
    v_percentage_total
    + coalesce(v_settlement.product_bonus_total, 0)
    + coalesce(v_settlement.reward_fixed_commission_total, 0)
    + coalesce(v_settlement.courtesy_fixed_commission_total, 0)
    + coalesce(v_settlement.fixed_compensation_total, 0),
    2
  );
  v_before_mandatory := greatest(
    v_gross
    + coalesce(v_settlement.manual_bonus_total, 0)
    - coalesce(v_settlement.other_deduction_total, 0)
    - v_debt_total,
    0
  );
  if v_debt_total > greatest(
    v_gross + coalesce(v_settlement.manual_bonus_total, 0) - coalesce(v_settlement.other_deduction_total, 0) - coalesce(v_settlement.mandatory_discount_amount, 0),
    0
  ) then
    raise exception 'El total seleccionado de deudas supera el neto disponible de la liquidación. Reduce alguno de los descuentos seleccionados.';
  end if;

  update public.employee_settlements
  set commission_rate = v_rate,
      high_rate_authorization_note = case
        when p_high_rate_note is null then high_rate_authorization_note
        else nullif(btrim(p_high_rate_note), '')
      end,
      percentage_commission_total = round(v_percentage_total, 2),
      gross_pay_amount = v_gross,
      debt_deduction_total = round(v_debt_total, 2),
      net_before_mandatory_discount = round(v_before_mandatory, 2),
      net_pay_amount = greatest(round(v_before_mandatory - coalesce(mandatory_discount_amount, 0), 2), 0)
  where id = p_settlement_id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.confirm_employee_settlement_v193(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
begin
  -- Las dos funciones existentes bloquean el documento, validan las reglas
  -- canónicas y conservan los side effects/financial postings ya asociados a
  -- aprobar. Al ser una RPC, ambas llamadas viven en la misma transacción.
  select * into v_settlement
  from public.review_employee_settlement(p_settlement_id, coalesce(p_adjustments, '[]'::jsonb));
  select * into v_settlement
  from public.transition_employee_settlement(p_settlement_id, 'approve', null);
  return v_settlement;
end;
$$;

revoke all on function public.prepare_employee_settlement_v193(uuid,uuid,numeric,jsonb,text), public.update_employee_settlement_draft_v193(uuid,numeric,jsonb,text), public.confirm_employee_settlement_v193(uuid,jsonb) from public, anon;
revoke all on function public.snapshot_employee_settlement_service_sale_v193() from public, anon;
grant execute on function public.prepare_employee_settlement_v193(uuid,uuid,numeric,jsonb,text), public.update_employee_settlement_draft_v193(uuid,numeric,jsonb,text), public.confirm_employee_settlement_v193(uuid,jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Settlement payment cash guard
-- Origen: supabase/migrations/20261002000429_settlement_payment_errors_and_cash_guard.sql
-- ============================================================
-- 194: pago multipart con guard explícito de caja antes del movimiento.
-- No modifica v189 ni documentos históricos.
create or replace function public.pay_employee_settlement_v194(
  p_settlement_id uuid,
  p_payment_parts jsonb,
  p_notes text default null
)
returns public.employee_settlements
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_settlement public.employee_settlements%rowtype; v_part jsonb; v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype; v_payment public.employee_settlement_payments%rowtype;
  v_debt public.employee_debts%rowtype; v_deduction record; v_actor uuid:=public.current_employee_id();
  v_amount numeric(12,2); v_total numeric(12,2):=0; v_reference text; v_category_id uuid; v_new_outstanding numeric(12,2); v_available_cash numeric(12,2);
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden pagar liquidaciones.'; end if;
  if jsonb_typeof(p_payment_parts)<>'array' or jsonb_array_length(p_payment_parts)=0 then raise exception 'Cada parte requiere método y monto mayor a cero.'; end if;
  select * into v_settlement from public.employee_settlements where id=p_settlement_id for update;
  if not found or v_settlement.status<>'approved' then raise exception 'La liquidación debe estar aprobada antes de pagar.'; end if;
  for v_part in select value from jsonb_array_elements(p_payment_parts) loop
    v_amount:=round(coalesce((v_part->>'amount')::numeric,0),2);
    if v_amount<=0 or nullif(v_part->>'paymentMethodId','') is null then raise exception 'Cada parte requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id=(v_part->>'paymentMethodId')::uuid and is_active;
    if not found or v_method.payment_kind='internal_credit' then raise exception 'El método de pago no está disponible para liquidaciones.'; end if;
    v_reference:=nullif(btrim(coalesce(v_part->>'reference','')),'');
    if v_method.payment_kind in ('wallet_qr','bank_transfer') and v_reference is null then raise exception 'La referencia es obligatoria para el método digital %.',v_method.name; end if;
    if exists(select 1 from jsonb_array_elements(p_payment_parts) other where other<>v_part and other->>'paymentMethodId'=v_part->>'paymentMethodId') then raise exception 'Cada método de pago puede aparecer una sola vez.'; end if;
    if v_method.payment_kind='cash' then
      select * into v_session from public.pos_sessions where branch_id=v_settlement.branch_id and status='open' order by opened_at desc limit 1 for update;
      if not found then raise exception 'No existe una sesión POS abierta para registrar la parte en efectivo.'; end if;
    end if;
    v_total:=v_total+v_amount;
  end loop;
  if round(v_total,2)<>round(v_settlement.net_pay_amount,2) then raise exception 'La suma de las partes debe coincidir exactamente con el neto de la liquidación.'; end if;
  select id into v_category_id from public.cash_movement_categories where code='employee_settlement_payment' and is_active limit 1;
  for v_part in select value from jsonb_array_elements(p_payment_parts) loop
    select * into v_method from public.payment_methods where id=(v_part->>'paymentMethodId')::uuid for share;
    v_amount:=round((v_part->>'amount')::numeric,2); v_reference:=nullif(btrim(coalesce(v_part->>'reference','')),'');
    if v_method.payment_kind='cash' then
      select * into v_session from public.pos_sessions where branch_id=v_settlement.branch_id and status='open' order by opened_at desc limit 1 for update;
      perform public.sync_pos_session_totals(v_session.id);
      select expected_cash_amount into v_available_cash from public.pos_sessions where id=v_session.id for update;
      if v_amount>coalesce(v_available_cash,0) then raise exception 'El efectivo disponible de la caja no cubre la parte en efectivo de esta liquidación.'; end if;
    end if;
    insert into public.employee_settlement_payments(settlement_id,employee_id,payment_method_id,amount,reference,notes,created_by)
    values(p_settlement_id,v_settlement.employee_id,v_method.id,v_amount,v_reference,nullif(btrim(coalesce(v_part->>'notes','')),''),v_actor) returning * into v_payment;
    if v_method.payment_kind='cash' then
      insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
      values(v_session.id,v_settlement.branch_id,v_category_id,'expense',v_amount,'Pago de liquidación '||v_settlement.settlement_number,'active',v_actor,'employee_settlement_payment',v_payment.id,true) returning id into v_payment.cash_movement_id;
      update public.employee_settlement_payments set cash_movement_id=v_payment.cash_movement_id where id=v_payment.id;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;
  for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id order by id loop
    if exists(select 1 from public.employee_debt_movements movement where movement.debt_id=v_deduction.employee_debt_id and movement.settlement_id=p_settlement_id and movement.movement_type='settlement_deduction') then continue; end if;
    select * into v_debt from public.employee_debts where id=v_deduction.employee_debt_id for update;
    if not found or v_debt.status not in ('pending','partial') or round(v_debt.outstanding_amount,2)<round(v_deduction.amount,2) then raise exception 'La deuda reservada ya no tiene saldo suficiente para esta liquidación.'; end if;
    v_new_outstanding:=round(v_debt.outstanding_amount-v_deduction.amount,2);
    update public.employee_debts set outstanding_amount=v_new_outstanding,status=case when v_new_outstanding=0 then 'paid' else 'partial' end,settled_at=case when v_new_outstanding=0 then now() else null end where id=v_debt.id;
    insert into public.employee_debt_movements(debt_id,movement_type,amount,settlement_id,notes,created_by) values(v_debt.id,'settlement_deduction',v_deduction.amount,p_settlement_id,'Descuento aplicado en liquidación '||v_settlement.settlement_number||'.',v_actor);
  end loop;
  update public.employee_settlements set status='paid',payment_method_id=null,payment_reference=null,payment_evidence_path=null,cash_movement_id=null,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),paid_by=v_actor,paid_at=now() where id=p_settlement_id returning * into v_settlement;
  return v_settlement;
end; $$;
revoke all on function public.pay_employee_settlement_v194(uuid,jsonb,text) from public,anon;
grant execute on function public.pay_employee_settlement_v194(uuid,jsonb,text) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Final UX and debt cash reconciliation
-- Origen: supabase/migrations/20261002015748_phase_1_final_ux_and_debt_cash_reconciliation.sql
-- ============================================================
-- Final Phase 0/1A/1B correction: preserve debt disbursements when cash did
-- not originate from an open POS session. No historical records are changed.
create or replace function public.create_employee_debt_with_disbursements(
  p_employee_id uuid, p_branch_id uuid, p_debt_type text, p_amount numeric,
  p_description text, p_disbursements jsonb default '[]'::jsonb
) returns public.employee_debts language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_debt public.employee_debts%rowtype; v_disbursement public.employee_debt_disbursements%rowtype;
  v_item jsonb; v_method public.payment_methods%rowtype; v_session public.pos_sessions%rowtype;
  v_category_id uuid; v_line_amount numeric(12,2); v_total numeric(12,2):=0;
  v_method_ids text[]:=array[]::text[]; v_actor uuid:=public.current_employee_id();
begin
  if coalesce(p_debt_type,'') not in ('loan','advance','penalty','administrative_charge') then raise exception 'El tipo de deuda no se puede registrar manualmente.'; end if;
  if not (public.is_admin() or (public.current_user_role()='reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda en esta sede.'; end if;
  if p_debt_type in ('penalty','administrative_charge') and not public.is_admin() then raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Monto y descripción son obligatorios.'; end if;
  if p_debt_type in ('loan','advance') and (jsonb_typeof(p_disbursements)<>'array' or jsonb_array_length(p_disbursements)=0) then raise exception 'Un préstamo o adelanto requiere uno o más desembolsos.'; end if;
  if p_debt_type not in ('loan','advance') and coalesce(p_disbursements,'[]'::jsonb)<>'[]'::jsonb then raise exception 'Las penalidades y cargos administrativos no admiten desembolsos.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements,'[]'::jsonb)) loop
    v_line_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_line_amount<=0 or nullif(v_item->>'paymentMethodId','') is null then raise exception 'Cada desembolso requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id=(v_item->>'paymentMethodId')::uuid and is_active and payment_kind in ('cash','wallet_qr','bank_transfer');
    if not found then raise exception 'Solo Efectivo, Yape/Plin o Transferencia son válidos para desembolsar.'; end if;
    if v_method.id::text=any(v_method_ids) then raise exception 'No se puede repetir el mismo método de desembolso.'; end if;
    v_method_ids:=array_append(v_method_ids,v_method.id::text);
    if v_method.payment_kind in ('wallet_qr','bank_transfer') and nullif(btrim(coalesce(v_item->>'reference','')),'') is null then raise exception 'La referencia es obligatoria para desembolsos digitales.'; end if;
    v_total:=v_total+v_line_amount;
  end loop;
  if p_debt_type in ('loan','advance') and round(v_total,2)<>round(p_amount,2) then raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.'; end if;
  v_debt:=public.create_employee_debt(p_employee_id,p_branch_id,p_debt_type,p_amount,p_description);
  select id into v_category_id from public.cash_movement_categories where code='employee_debt_disbursement' and is_active limit 1;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements,'[]'::jsonb)) loop
    select * into v_method from public.payment_methods where id=(v_item->>'paymentMethodId')::uuid and is_active;
    v_line_amount:=round((v_item->>'amount')::numeric,2); v_session:=null;
    if v_method.payment_kind='cash' then select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1 for update; end if;
    insert into public.employee_debt_disbursements(debt_id,payment_method_id,amount,payment_reference,evidence_url,notes,created_by,cash_context,reconciliation_status)
    values(v_debt.id,v_method.id,v_line_amount,nullif(btrim(coalesce(v_item->>'reference','')),''),nullif(btrim(coalesce(v_item->>'evidenceUrl','')),''),nullif(btrim(coalesce(v_item->>'notes','')),''),v_actor,
      case when v_method.payment_kind='cash' then case when v_session.id is null then 'external' else 'pos' end end,
      case when v_method.payment_kind='cash' then case when v_session.id is null then 'pending' else 'reconciled' end end) returning * into v_disbursement;
    if v_method.payment_kind='cash' and v_session.id is not null then
      insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
      values(v_session.id,p_branch_id,v_category_id,'expense',v_disbursement.amount,'Desembolso '||case when p_debt_type='advance' then 'adelanto' else 'préstamo' end||' empleado: '||v_debt.description,'active',v_actor,'employee_debt_disbursement',v_disbursement.id,true)
      on conflict (source_type,source_id) where status='active' do nothing;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;
  return v_debt;
end; $$;

create or replace function public.discard_employee_settlement_draft_v195(p_settlement_id uuid)
returns public.employee_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settlement public.employee_settlements%rowtype;
begin
  select * into v_settlement from public.employee_settlements where id=p_settlement_id for update;
  if not found or v_settlement.status<>'draft' then raise exception 'Solo un borrador puede descartarse.'; end if;
  select * into v_settlement from public.transition_employee_settlement(p_settlement_id,'cancel','Borrador descartado');
  update public.employee_settlements set cancellation_reason_code='DRAFT_DISCARDED', cancellation_reason='Borrador descartado' where id=v_settlement.id returning * into v_settlement;
  return v_settlement;
end; $$;

revoke all on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb), public.discard_employee_settlement_draft_v195(uuid) from public,anon;
grant execute on function public.create_employee_debt_with_disbursements(uuid,uuid,text,numeric,text,jsonb), public.discard_employee_settlement_draft_v195(uuid) to authenticated,service_role;
notify pgrst,'reload schema';

-- ============================================================
-- BLOQUE: Cash Movement Applications B1
-- Origen: supabase/migrations/20261002190000_pos_cash_movement_applications.sql
-- ============================================================
-- Phase B1: link a physical POS withdrawal to its eventual destination.
-- Additive only: this migration does not modify or backfill historical facts.

create table public.cash_movement_applications (
  id uuid primary key default gen_random_uuid(),
  cash_movement_id uuid not null references public.cash_movements(id) on delete restrict,
  application_type text not null check (application_type in ('employee_advance','employee_loan','expense','treasury_transfer','other')),
  source_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index cash_movement_applications_cash_movement_idx
  on public.cash_movement_applications(cash_movement_id);
create index cash_movement_applications_type_source_idx
  on public.cash_movement_applications(application_type, source_id);

alter table public.cash_movement_applications enable row level security;
grant select on table public.cash_movement_applications to authenticated;
drop policy if exists "cash_movement_applications_branch_read" on public.cash_movement_applications;
create policy "cash_movement_applications_branch_read" on public.cash_movement_applications
  for select to authenticated
  using (
    exists (
      select 1
      from public.cash_movements movement
      where movement.id = cash_movement_applications.cash_movement_id
        and public.can_access_branch(movement.branch_id)
    )
  );

create or replace function public.create_employee_debt_from_pos_cash(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_amount numeric,
  p_description text,
  p_cash_movement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.cash_movements%rowtype;
  v_category_code text;
  v_applied_amount numeric(12,2) := 0;
  v_available_amount numeric(12,2) := 0;
  v_debt public.employee_debts%rowtype;
  v_application public.cash_movement_applications%rowtype;
  v_actor uuid := public.current_employee_id();
begin
  if p_debt_type not in ('advance', 'loan') then
    raise exception 'Solo los adelantos y préstamos pueden usar una salida POS.';
  end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Monto y descripción son obligatorios.';
  end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then
    raise exception 'No tienes permisos para registrar esta deuda en esta sede.';
  end if;

  select * into v_movement
  from public.cash_movements
  where id = p_cash_movement_id
  for update;
  if not found then raise exception 'La salida POS seleccionada no existe.'; end if;
  if v_movement.branch_id <> p_branch_id then raise exception 'La salida POS pertenece a otra sede.'; end if;
  if v_movement.status <> 'active' or v_movement.movement_type <> 'expense' then raise exception 'La salida POS seleccionada no está disponible.'; end if;
  select code into v_category_code from public.cash_movement_categories where id = v_movement.category_id;
  if v_category_code <> 'cash_withdrawal' then raise exception 'El movimiento seleccionado no es una salida física de efectivo POS.'; end if;

  select coalesce(sum(amount), 0) into v_applied_amount
  from public.cash_movement_applications
  where cash_movement_id = v_movement.id;
  v_available_amount := greatest(v_movement.amount - v_applied_amount, 0);
  if round(p_amount, 2) > v_available_amount then
    raise exception 'Este movimiento solo tiene S/ % disponibles.', to_char(v_available_amount, 'FM999999990.00');
  end if;

  v_debt := public.create_employee_debt(p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), p_description);
  insert into public.cash_movement_applications(cash_movement_id, application_type, source_id, amount, created_by)
  values (v_movement.id, case when p_debt_type = 'advance' then 'employee_advance' else 'employee_loan' end, v_debt.id, round(p_amount, 2), v_actor)
  returning * into v_application;

  return jsonb_build_object('debt', to_jsonb(v_debt), 'application', to_jsonb(v_application), 'available_amount', v_available_amount - round(p_amount, 2));
end;
$$;

-- The pre-existing disbursement RPC remains the path for external cash and
-- digital payments. A client that explicitly marks cash as external never
-- creates a POS movement; legacy payloads retain their existing behavior.
create or replace function public.create_employee_debt_with_disbursements(
  p_employee_id uuid, p_branch_id uuid, p_debt_type text, p_amount numeric,
  p_description text, p_disbursements jsonb default '[]'::jsonb
) returns public.employee_debts language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_debt public.employee_debts%rowtype; v_disbursement public.employee_debt_disbursements%rowtype;
  v_item jsonb; v_method public.payment_methods%rowtype; v_session public.pos_sessions%rowtype;
  v_category_id uuid; v_line_amount numeric(12,2); v_total numeric(12,2):=0;
  v_method_ids text[]:=array[]::text[]; v_actor uuid:=public.current_employee_id(); v_cash_context text;
begin
  if coalesce(p_debt_type,'') not in ('loan','advance','penalty','administrative_charge') then raise exception 'El tipo de deuda no se puede registrar manualmente.'; end if;
  if not (public.is_admin() or (public.current_user_role()='reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda en esta sede.'; end if;
  if p_debt_type in ('penalty','administrative_charge') and not public.is_admin() then raise exception 'Solo owner o admin puede registrar penalidades o cargos administrativos.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Monto y descripción son obligatorios.'; end if;
  if p_debt_type in ('loan','advance') and (jsonb_typeof(p_disbursements)<>'array' or jsonb_array_length(p_disbursements)=0) then raise exception 'Un préstamo o adelanto requiere uno o más desembolsos.'; end if;
  if p_debt_type not in ('loan','advance') and coalesce(p_disbursements,'[]'::jsonb)<>'[]'::jsonb then raise exception 'Las penalidades y cargos administrativos no admiten desembolsos.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements,'[]'::jsonb)) loop
    v_line_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_line_amount<=0 or nullif(v_item->>'paymentMethodId','') is null then raise exception 'Cada desembolso requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id=(v_item->>'paymentMethodId')::uuid and is_active and payment_kind in ('cash','wallet_qr','bank_transfer');
    if not found then raise exception 'Solo Efectivo, Yape/Plin o Transferencia son válidos para desembolsar.'; end if;
    if v_method.id::text=any(v_method_ids) then raise exception 'No se puede repetir el mismo método de desembolso.'; end if;
    v_cash_context:=nullif(v_item->>'cashContext','');
    if v_method.payment_kind='cash' and v_cash_context not in ('external') and v_cash_context is not null then raise exception 'El efectivo POS requiere seleccionar una salida POS existente.'; end if;
    v_method_ids:=array_append(v_method_ids,v_method.id::text);
    if v_method.payment_kind in ('wallet_qr','bank_transfer') and nullif(btrim(coalesce(v_item->>'reference','')),'') is null then raise exception 'La referencia es obligatoria para desembolsos digitales.'; end if;
    v_total:=v_total+v_line_amount;
  end loop;
  if p_debt_type in ('loan','advance') and round(v_total,2)<>round(p_amount,2) then raise exception 'La suma de desembolsos debe coincidir exactamente con la deuda.'; end if;
  v_debt:=public.create_employee_debt(p_employee_id,p_branch_id,p_debt_type,p_amount,p_description);
  select id into v_category_id from public.cash_movement_categories where code='employee_debt_disbursement' and is_active limit 1;
  for v_item in select value from jsonb_array_elements(coalesce(p_disbursements,'[]'::jsonb)) loop
    select * into v_method from public.payment_methods where id=(v_item->>'paymentMethodId')::uuid and is_active;
    v_line_amount:=round((v_item->>'amount')::numeric,2); v_session:=null; v_cash_context:=nullif(v_item->>'cashContext','');
    if v_method.payment_kind='cash' and v_cash_context is distinct from 'external' then select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1 for update; end if;
    insert into public.employee_debt_disbursements(debt_id,payment_method_id,amount,payment_reference,evidence_url,notes,created_by,cash_context,reconciliation_status)
    values(v_debt.id,v_method.id,v_line_amount,nullif(btrim(coalesce(v_item->>'reference','')),''),nullif(btrim(coalesce(v_item->>'evidenceUrl','')),''),nullif(btrim(coalesce(v_item->>'notes','')),''),v_actor,
      case when v_method.payment_kind='cash' then case when v_cash_context='external' or v_session.id is null then 'external' else 'pos' end end,
      case when v_method.payment_kind='cash' then case when v_cash_context='external' or v_session.id is null then 'pending' else 'reconciled' end end) returning * into v_disbursement;
    if v_method.payment_kind='cash' and v_session.id is not null then
      insert into public.cash_movements(pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by,source_type,source_id,is_system_generated)
      values(v_session.id,p_branch_id,v_category_id,'expense',v_disbursement.amount,'Desembolso '||case when p_debt_type='advance' then 'adelanto' else 'préstamo' end||' empleado: '||v_debt.description,'active',v_actor,'employee_debt_disbursement',v_disbursement.id,true)
      on conflict(source_type,source_id) where status='active' do nothing;
      perform public.sync_pos_session_totals(v_session.id);
    end if;
  end loop;
  return v_debt;
end; $$;

create or replace function public.cancel_cash_movement(p_cash_movement_id uuid,p_cancelled_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public,pg_temp as $$
declare v_movement public.cash_movements%rowtype; v_session public.pos_sessions%rowtype;
begin
  if public.current_user_role() not in ('owner','admin','reception') then raise exception 'No tienes permisos para anular movimientos de caja.'; end if;
  if nullif(btrim(coalesce(p_cancelled_reason,'')),'') is null then raise exception 'Debes indicar el motivo de anulación.'; end if;
  select * into v_movement from public.cash_movements where id=p_cash_movement_id for update;
  if not found or v_movement.status<>'active' then raise exception 'El movimiento de caja no está disponible.'; end if;
  if exists (select 1 from public.cash_movement_applications where cash_movement_id = v_movement.id) then raise exception 'Este movimiento ya está vinculado a una operación y no puede anularse directamente.'; end if;
  if v_movement.is_system_generated then raise exception 'Este movimiento fue generado por su documento origen y debe revertirse desde allí.'; end if;
  select * into v_session from public.pos_sessions where id=v_movement.pos_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'No se puede anular un movimiento de una sesión cerrada.'; end if;
  if not public.can_access_branch(v_movement.branch_id) then raise exception 'No tienes permisos para anular este movimiento.'; end if;
  update public.cash_movements set status='cancelled',cancelled_by=public.current_employee_id(),cancelled_reason=btrim(p_cancelled_reason),cancelled_at=now() where id=v_movement.id returning * into v_movement;
  perform public.sync_pos_session_totals(v_session.id); return v_movement;
end; $$;

revoke all on table public.cash_movement_applications from anon;
revoke all on function public.create_employee_debt_from_pos_cash(uuid,uuid,text,numeric,text,uuid) from public, anon;
grant execute on function public.create_employee_debt_from_pos_cash(uuid,uuid,text,numeric,text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Product courtesy category eligibility
-- Origen: supabase/migrations/20261003004700_pos_product_courtesy_category_eligibility.sql
-- ============================================================
-- POS courtesy eligibility: explicit product, explicit category, then fallback.
-- No historical sale or courtesy row is changed by this migration.
create or replace function public.validate_completed_sale_courtesies()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_product_item record; v_courtesy_quantity numeric; v_item_capacity numeric; v_total_capacity numeric; v_total_amount_cap numeric; v_total_amount numeric; v_rule_id uuid; v_rule_name text;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if not exists (select 1 from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy) then return new; end if;
  with matched_services as (
    select si.id, si.quantity, rule.maximum_courtesy_items, rule.maximum_courtesy_amount
    from public.sale_items si cross join lateral (
      select r.* from public.courtesy_rules r
      where r.is_active and (r.branch_id is null or r.branch_id = new.branch_id)
        and (r.starts_at is null or r.starts_at <= new.closed_at) and (r.ends_at is null or r.ends_at >= new.closed_at)
        and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id)
        and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id))
        and coalesce(coalesce(si.original_total, si.quantity * si.unit_price) / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount
      order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc, r.priority desc, r.created_at desc limit 1
    ) rule where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
  ) select coalesce(sum(quantity * maximum_courtesy_items), 0), case when bool_or(maximum_courtesy_amount is null) then null else sum(quantity * maximum_courtesy_amount) end into v_total_capacity, v_total_amount_cap from matched_services;
  select coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_price), 0) into v_courtesy_quantity, v_total_amount from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy;
  if v_total_capacity = 0 or v_courtesy_quantity > v_total_capacity then raise exception 'La cantidad de productos en cortesía supera el cupo configurado para los servicios pagados.'; end if;
  if v_total_amount_cap is not null and v_total_amount > v_total_amount_cap then raise exception 'El importe de productos en cortesía supera el tope configurado.'; end if;
  for v_product_item in select * from public.sale_items where sale_id = new.id and item_type = 'product' and is_courtesy loop
    with matched_services as (
      select si.quantity, rule.id as rule_id, rule.name as rule_name, rule.maximum_courtesy_items from public.sale_items si cross join lateral (
        select r.* from public.courtesy_rules r
        where r.is_active and (r.branch_id is null or r.branch_id = new.branch_id)
          and (r.starts_at is null or r.starts_at <= new.closed_at) and (r.ends_at is null or r.ends_at >= new.closed_at)
          and (r.qualifying_service_id is null or r.qualifying_service_id = si.service_id)
          and (r.qualifying_service_category_id is null or r.qualifying_service_category_id = (select category_id from public.services where id = si.service_id))
          and coalesce(coalesce(si.original_total, si.quantity * si.unit_price) / nullif(si.quantity, 0), 0) >= r.minimum_unit_amount
        order by case when r.qualifying_service_id is not null then 2 when r.qualifying_service_category_id is not null then 1 else 0 end desc, r.priority desc, r.created_at desc limit 1
      ) rule where si.sale_id = new.id and si.item_type = 'service' and not si.is_courtesy
    )
    select ms.rule_id, ms.rule_name, coalesce(sum(ms.quantity * coalesce(benefit.max_quantity, ms.maximum_courtesy_items)), 0)
      into v_rule_id, v_rule_name, v_item_capacity
    from matched_services ms join public.products product on product.id = v_product_item.product_id
    left join lateral (
      select configured.* from public.courtesy_rule_benefits configured
      where configured.rule_id = ms.rule_id and configured.is_active and configured.benefit_item_type = 'product'
        and (configured.product_id = product.id or configured.product_category_id = product.category_id)
      order by case when configured.product_id = product.id then 2 else 1 end desc, configured.id limit 1
    ) benefit on true
    where (benefit.id is not null and (benefit.max_unit_amount is null or v_product_item.unit_price <= benefit.max_unit_amount))
      or (benefit.id is null and product.is_courtesy_allowed and not exists (
        select 1 from public.courtesy_rule_benefits configured
        where configured.rule_id = ms.rule_id and configured.is_active and configured.benefit_item_type = 'product'
      ))
    group by ms.rule_id, ms.rule_name
    order by sum(ms.quantity * coalesce(benefit.max_quantity, ms.maximum_courtesy_items)) desc limit 1;
    if not found or v_product_item.quantity > v_item_capacity then raise exception 'El producto en cortesía no está permitido o supera su máximo configurado.'; end if;
    update public.sale_items set courtesy_rule_id = v_rule_id, courtesy_rule_name_snapshot = v_rule_name where id = v_product_item.id;
  end loop;
  return new;
end;
$$;

revoke all on function public.validate_completed_sale_courtesies() from public;
grant execute on function public.validate_completed_sale_courtesies() to authenticated, service_role;
notify pgrst, 'reload schema';

-- ============================================================
-- BLOQUE: Loan Interest Snapshot B1.1
-- Origen: supabase/migrations/20261003010444_loan_interest_snapshot.sql
-- ============================================================
-- B1.1: immutable loan-interest snapshot. No historical debt is backfilled.
alter table public.employee_debts
  add column if not exists principal_amount numeric(12,2),
  add column if not exists interest_rate_percent numeric(9,4),
  add column if not exists interest_amount numeric(12,2);

alter table public.employee_debts
  add constraint employee_debts_principal_amount_check check (principal_amount is null or principal_amount > 0),
  add constraint employee_debts_interest_rate_percent_check check (interest_rate_percent is null or interest_rate_percent >= 0),
  add constraint employee_debts_interest_amount_check check (interest_amount is null or interest_amount >= 0);

create or replace function public.create_employee_debt_from_pos_cash_v2(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_principal_amount numeric,
  p_interest_rate_percent numeric,
  p_description text,
  p_cash_movement_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_movement public.cash_movements%rowtype; v_category_code text;
  v_applied_amount numeric(12,2) := 0; v_available_amount numeric(12,2) := 0;
  v_principal numeric(12,2); v_rate numeric(9,4); v_interest numeric(12,2); v_total numeric(12,2);
  v_debt public.employee_debts%rowtype; v_application public.cash_movement_applications%rowtype;
  v_actor uuid := public.current_employee_id(); v_employee_branch_id uuid;
begin
  if p_debt_type not in ('loan', 'advance') then raise exception 'Solo los adelantos y préstamos pueden usar una salida POS.'; end if;
  v_principal := round(coalesce(p_principal_amount, 0), 2);
  v_rate := coalesce(p_interest_rate_percent, 0);
  if v_principal = 'NaN'::numeric or v_principal <= 0 then raise exception 'El capital del préstamo debe ser mayor a cero.'; end if;
  if v_rate = 'NaN'::numeric or v_rate < 0 then raise exception 'El porcentaje de interés no puede ser negativo.'; end if;
  if p_debt_type = 'advance' and v_rate <> 0 then raise exception 'Los adelantos no admiten interés.'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'La descripción es obligatoria.'; end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda en esta sede.'; end if;
  select branch_id into v_employee_branch_id from public.employees where id = p_employee_id and status = 'active';
  if not found or v_employee_branch_id <> p_branch_id then raise exception 'El empleado debe estar activo y pertenecer a la sede de la deuda.'; end if;

  select * into v_movement from public.cash_movements where id = p_cash_movement_id for update;
  if not found then raise exception 'La salida POS seleccionada no existe.'; end if;
  if v_movement.branch_id <> p_branch_id then raise exception 'La salida POS pertenece a otra sede.'; end if;
  if v_movement.status <> 'active' or v_movement.movement_type <> 'expense' then raise exception 'La salida POS seleccionada no está disponible.'; end if;
  select code into v_category_code from public.cash_movement_categories where id = v_movement.category_id;
  if v_category_code <> 'cash_withdrawal' then raise exception 'El movimiento seleccionado no es una salida física de efectivo POS.'; end if;
  select coalesce(sum(amount), 0) into v_applied_amount from public.cash_movement_applications where cash_movement_id = v_movement.id;
  v_available_amount := greatest(v_movement.amount - v_applied_amount, 0);
  if v_principal > v_available_amount then raise exception 'Esta salida POS solo tiene S/% disponibles.', to_char(v_available_amount, 'FM999999990.00'); end if;

  v_interest := case when p_debt_type = 'loan' then round(v_principal * v_rate / 100, 2) else 0 end;
  v_total := round(v_principal + v_interest, 2);
  insert into public.employee_debts(employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by, principal_amount, interest_rate_percent, interest_amount)
  values(p_employee_id, p_branch_id, p_debt_type, v_total, v_total, btrim(p_description), v_actor, v_principal, case when p_debt_type = 'loan' then v_rate else 0 end, v_interest)
  returning * into v_debt;
  insert into public.employee_debt_movements(debt_id, movement_type, amount, notes, created_by)
  values(v_debt.id, 'charge', v_total, case when p_debt_type = 'loan' then 'Registro inicial de préstamo. Capital S/' || to_char(v_principal, 'FM999999990.00') || ' + interés ' || to_char(v_rate, 'FM999999990.####') || '% S/' || to_char(v_interest, 'FM999999990.00') || '.' else 'Registro inicial de adelanto. Capital S/' || to_char(v_principal, 'FM999999990.00') || '.' end, v_actor);
  insert into public.cash_movement_applications(cash_movement_id, application_type, source_id, amount, created_by)
  values(v_movement.id, case when p_debt_type = 'advance' then 'employee_advance' else 'employee_loan' end, v_debt.id, v_principal, v_actor)
  returning * into v_application;
  return jsonb_build_object('debt', to_jsonb(v_debt), 'application', to_jsonb(v_application), 'available_amount', v_available_amount - v_principal);
end;
$$;

create or replace function public.create_employee_debt_with_disbursements_v2(
  p_employee_id uuid,
  p_branch_id uuid,
  p_debt_type text,
  p_principal_amount numeric,
  p_interest_rate_percent numeric,
  p_description text,
  p_disbursements jsonb default '[]'::jsonb
)
returns public.employee_debts language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_debt public.employee_debts%rowtype; v_item jsonb; v_method public.payment_methods%rowtype;
  v_line_amount numeric(12,2); v_total_disbursed numeric(12,2) := 0;
  v_principal numeric(12,2); v_rate numeric(9,4); v_interest numeric(12,2); v_total_debt numeric(12,2);
  v_method_ids text[] := array[]::text[]; v_actor uuid := public.current_employee_id(); v_employee_branch_id uuid;
begin
  if p_debt_type not in ('loan', 'advance') then raise exception 'Solo préstamos y adelantos usan este flujo.'; end if;
  v_principal := round(coalesce(p_principal_amount, 0), 2); v_rate := coalesce(p_interest_rate_percent, 0);
  if v_principal = 'NaN'::numeric or v_principal <= 0 then raise exception 'El capital del préstamo debe ser mayor a cero.'; end if;
  if v_rate = 'NaN'::numeric or v_rate < 0 then raise exception 'El porcentaje de interés no puede ser negativo.'; end if;
  if p_debt_type = 'advance' and v_rate <> 0 then raise exception 'Los adelantos no admiten interés.'; end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'La descripción es obligatoria.'; end if;
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar esta deuda en esta sede.'; end if;
  select branch_id into v_employee_branch_id from public.employees where id = p_employee_id and status = 'active';
  if not found or v_employee_branch_id <> p_branch_id then raise exception 'El empleado debe estar activo y pertenecer a la sede de la deuda.'; end if;
  if jsonb_typeof(p_disbursements) <> 'array' or jsonb_array_length(p_disbursements) = 0 then raise exception 'Un préstamo o adelanto requiere uno o más desembolsos.'; end if;
  for v_item in select value from jsonb_array_elements(p_disbursements) loop
    v_line_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
    if v_line_amount <= 0 or nullif(v_item ->> 'paymentMethodId', '') is null then raise exception 'Cada desembolso requiere método y monto mayor a cero.'; end if;
    select * into v_method from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid and is_active and payment_kind in ('cash','wallet_qr','bank_transfer');
    if not found then raise exception 'Solo Efectivo, Yape/Plin o Transferencia son válidos para desembolsar.'; end if;
    if v_method.id::text = any(v_method_ids) then raise exception 'No se puede repetir el mismo método de desembolso.'; end if;
    if v_method.payment_kind in ('wallet_qr','bank_transfer') and nullif(btrim(coalesce(v_item ->> 'reference','')), '') is null then raise exception 'La referencia es obligatoria para desembolsos digitales.'; end if;
    v_method_ids := array_append(v_method_ids, v_method.id::text); v_total_disbursed := v_total_disbursed + v_line_amount;
  end loop;
  if round(v_total_disbursed, 2) <> v_principal then raise exception 'La suma de desembolsos debe coincidir exactamente con el capital entregado.'; end if;
  v_interest := case when p_debt_type = 'loan' then round(v_principal * v_rate / 100, 2) else 0 end;
  v_total_debt := round(v_principal + v_interest, 2);
  insert into public.employee_debts(employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by, principal_amount, interest_rate_percent, interest_amount)
  values(p_employee_id, p_branch_id, p_debt_type, v_total_debt, v_total_debt, btrim(p_description), v_actor, v_principal, case when p_debt_type = 'loan' then v_rate else 0 end, v_interest)
  returning * into v_debt;
  insert into public.employee_debt_movements(debt_id, movement_type, amount, notes, created_by)
  values(v_debt.id, 'charge', v_total_debt, case when p_debt_type = 'loan' then 'Registro inicial de préstamo. Capital S/' || to_char(v_principal, 'FM999999990.00') || ' + interés ' || to_char(v_rate, 'FM999999990.####') || '% S/' || to_char(v_interest, 'FM999999990.00') || '.' else 'Registro inicial de adelanto. Capital S/' || to_char(v_principal, 'FM999999990.00') || '.' end, v_actor);
  for v_item in select value from jsonb_array_elements(p_disbursements) loop
    insert into public.employee_debt_disbursements(debt_id, payment_method_id, amount, payment_reference, evidence_url, notes, created_by, cash_context, reconciliation_status)
    values(v_debt.id, (v_item ->> 'paymentMethodId')::uuid, round((v_item ->> 'amount')::numeric, 2), nullif(btrim(coalesce(v_item ->> 'reference','')), ''), nullif(btrim(coalesce(v_item ->> 'evidenceUrl','')), ''), nullif(btrim(coalesce(v_item ->> 'notes','')), ''), v_actor, case when (select payment_kind from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid) = 'cash' then 'external' else null end, case when (select payment_kind from public.payment_methods where id = (v_item ->> 'paymentMethodId')::uuid) = 'cash' then 'pending' else null end);
  end loop;
  return v_debt;
end;
$$;

revoke all on function public.create_employee_debt_from_pos_cash_v2(uuid,uuid,text,numeric,numeric,text,uuid), public.create_employee_debt_with_disbursements_v2(uuid,uuid,text,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.create_employee_debt_from_pos_cash_v2(uuid,uuid,text,numeric,numeric,text,uuid), public.create_employee_debt_with_disbursements_v2(uuid,uuid,text,numeric,numeric,text,jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
