-- LBBS v170 — validación de lectura de Ganancias y Pérdidas
--
-- SOLO LECTURA: no inserta, actualiza, borra, altera, concede ni revoca nada.
-- Ejecute cada bloque en Supabase SQL Editor. Cambie las fechas y, si desea
-- una sede, reemplace NULL::uuid por el UUID de esa sede.
--
-- El módulo visual llama:
-- GET /api/admin/finance/analysis-v2?from=...&to=...&branchId=...
-- El endpoint ejecuta:
-- public.get_financial_analysis_v2(p_date_from, p_date_to, p_branch_id)

-- 1) Objetos y permiso requeridos por el módulo.
select
  to_regprocedure('public.get_financial_analysis_v2(date,date,uuid)') is not null
    as analysis_rpc_exists,
  to_regclass('public.financial_postings') is not null as financial_postings_exists,
  to_regclass('public.vw_financial_postings_signed') is not null as signed_view_exists,
  has_function_privilege(
    'authenticated',
    'public.get_financial_analysis_v2(date,date,uuid)',
    'execute'
  ) as authenticated_can_execute;

-- 2) Fuente exacta que consume la función. Solo toma asientos posted que
-- afectan ganancia/pérdida. Si no hay filas, S/ 0.00 es el resultado esperado.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-31' as date_to, null::uuid as branch_id
)
select
  posting.accounting_date,
  branch.name as branch_name,
  posting.business_line,
  posting.financial_group,
  posting.posting_code,
  count(*) as postings,
  round(sum(posting.profit_signed_amount), 2) as signed_profit_amount
from public.vw_financial_postings_signed posting
cross join params
left join public.branches branch on branch.id = posting.branch_id
where posting.accounting_date between params.date_from and params.date_to
  and posting.affects_profit = true
  and (params.branch_id is null or posting.branch_id = params.branch_id)
group by
  posting.accounting_date,
  branch.name,
  posting.business_line,
  posting.financial_group,
  posting.posting_code
order by posting.accounting_date, branch.name, posting.financial_group, posting.posting_code;

-- 3) Totales con la MISMA agrupación usada por Ganancias y Pérdidas.
-- Deben corresponder a sales, directCosts, personnel y expenses del RPC.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-31' as date_to, null::uuid as branch_id
)
select
  round(coalesce(sum(profit_signed_amount) filter (
    where financial_group = 'operating_income' and business_line = 'services'
  ), 0), 2) as service_sales,
  round(coalesce(sum(profit_signed_amount) filter (
    where financial_group = 'operating_income' and business_line = 'barbershop_products'
  ), 0), 2) as barbershop_product_sales,
  round(coalesce(sum(profit_signed_amount) filter (
    where financial_group = 'operating_income' and business_line = 'cafeteria_products'
  ), 0), 2) as cafeteria_product_sales,
  round(coalesce(sum(profit_signed_amount) filter (
    where financial_group = 'operating_income' and coalesce(business_line, 'other') = 'other'
  ), 0), 2) as other_income,
  round(coalesce(-sum(profit_signed_amount) filter (
    where financial_group = 'cost_of_sales' and posting_code <> 'courtesy_actual_cost'
  ), 0), 2) as product_cogs,
  round(coalesce(-sum(profit_signed_amount) filter (
    where financial_group = 'cost_of_sales' and posting_code = 'courtesy_actual_cost'
  ), 0), 2) as courtesy_cost,
  round(coalesce(-sum(profit_signed_amount) filter (
    where financial_group = 'personnel_cost'
  ), 0), 2) as personnel_cost,
  round(coalesce(-sum(profit_signed_amount) filter (
    where financial_group = 'operating_expense'
  ), 0), 2) as operating_expenses
from public.vw_financial_postings_signed posting
cross join params
where posting.accounting_date between params.date_from and params.date_to
  and posting.affects_profit = true
  and (params.branch_id is null or posting.branch_id = params.branch_id);

-- 4) Diagnóstico para ceros: las ventas completadas de una sesión POS abierta
-- no se reflejan hasta que la sesión se cierre y se generen sus asientos.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-31' as date_to, null::uuid as branch_id
)
select
  count(distinct sale.id) filter (where sale.status = 'completed') as completed_sales,
  count(distinct sale.id) filter (
    where sale.status = 'completed' and session.status = 'open'
  ) as completed_sales_in_open_pos_sessions,
  count(distinct posting.id) as financial_postings_created,
  count(distinct posting.id) filter (where posting.status = 'posted') as posted_financial_postings
from public.sales sale
cross join params
left join public.pos_sessions session on session.id = sale.pos_session_id
left join public.sale_items item on item.sale_id = sale.id
left join public.financial_postings posting
  on posting.source_type = 'sale_item' and posting.source_id = item.id
where sale.accounting_date between params.date_from and params.date_to
  and (params.branch_id is null or sale.branch_id = params.branch_id);

-- 5) El trigger que crea los asientos debe estar instalado y habilitado.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'sales'
  and trigger_name = 'sales_financial_postings_sync';

-- 6) Este resumen identifica ventas históricas: v170 no hace backfill de
-- ventas cerradas antes de instalarse. Solo una venta que pase a completed
-- después de v170 activa el trigger y genera asientos por sale_item.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-31' as date_to, null::uuid as branch_id
)
select
  count(distinct sale.id) filter (where sale.status = 'completed') as completed_sales,
  count(item.id) as sale_items,
  count(item.id) filter (where item.business_line_snapshot is null) as items_without_business_line_snapshot,
  count(item.id) filter (where item.item_type = 'product' and item.cost_snapshot is null) as product_items_without_cost_snapshot,
  min(sale.created_at) filter (where sale.status = 'completed') as first_completed_sale_created_at,
  max(sale.created_at) filter (where sale.status = 'completed') as last_completed_sale_created_at
from public.sales sale
cross join params
left join public.sale_items item on item.sale_id = sale.id
where sale.accounting_date between params.date_from and params.date_to
  and (params.branch_id is null or sale.branch_id = params.branch_id);

-- 7) El SQL Editor no trae el JWT del navegador. Esta es la llamada exacta
-- que debe hacerse mediante la sesión autenticada de un owner/admin (la API
-- del dashboard ya lo hace). No intente usar service_role en el navegador.
--
-- select public.get_financial_analysis_v2(
--   date '2026-10-01',
--   date '2026-10-31',
--   null::uuid
-- ) as dashboard_payload;

-- 8) Política que provocó el error 42710: debe existir una sola por tabla.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'treasury_accounts',
    'treasury_movements',
    'employee_payout_methods',
    'employee_settlement_payments'
  )
order by tablename, policyname;
