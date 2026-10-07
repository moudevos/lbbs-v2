-- v170 historical P&L backfill (approved scope: 2026-10-01 through 2026-10-04).
--
-- This migration is deliberately additive and idempotent. It does not update
-- sales, POS sessions, stock, cash, settlements, finance entries, or existing
-- postings. It recreates only the canonical P&L postings that the v170
-- triggers/functions would have created for the same source facts:
--   * completed sales and product/courtesy COGS;
--   * approved/paid employee settlements (personnel cost); and
--   * active C&G manual entries (their configured financial category).
-- Every posting is labelled with a batch id so the companion reversal script
-- can compensate only this backfill if its approved preview is found incorrect.

do $$
declare
  v_from constant date := date '2026-10-01';
  v_to constant date := date '2026-10-04';
  v_batch constant text := 'v170_historical_pnl_20261001_20261004';
  v_open_sessions integer;
  v_unclassified_products integer;
begin
  if exists (
    select 1
    from public.financial_periods period
    where period.status = 'closed'
      and daterange(period.date_from, period.date_to, '[]')
        && daterange(v_from, v_to, '[]')
  ) then
    raise exception 'BACKFILL BLOCKED: el rango % a % contiene un periodo financiero cerrado.', v_from, v_to;
  end if;

  select count(*)
    into v_open_sessions
  from public.sales sale
  join public.pos_sessions session on session.id = sale.pos_session_id
  where sale.status = 'completed'
    and sale.accounting_date between v_from and v_to
    and session.status = 'open';

  if v_open_sessions > 0 then
    raise exception 'BACKFILL BLOCKED: % venta(s) completada(s) pertenecen a sesiones POS abiertas.', v_open_sessions;
  end if;

  select count(*)
    into v_unclassified_products
  from public.sales sale
  join public.sale_items item on item.sale_id = sale.id
  left join public.products product on product.id = item.product_id
  left join public.product_categories category on category.id = product.category_id
  where sale.status = 'completed'
    and sale.accounting_date between v_from and v_to
    and item.item_type = 'product'
    and coalesce(item.business_line_snapshot, category.business_line) not in ('barbershop_products', 'cafeteria_products');

  if v_unclassified_products > 0 then
    raise exception 'BACKFILL BLOCKED: % línea(s) de producto no tienen categoría financiera barbería/cafetería.', v_unclassified_products;
  end if;

  insert into public.financial_postings (
    accounting_date, branch_id, business_line, financial_group, effect_type,
    posting_code, amount, affects_profit, source_type, source_id,
    description, metadata, created_by
  )
  select
    sale.accounting_date,
    sale.branch_id,
    case
      when item.item_type = 'service' then 'services'
      else coalesce(item.business_line_snapshot, category.business_line)
    end,
    'operating_income',
    'income',
    'sale_revenue',
    round(item.total, 2),
    true,
    'sale_item',
    item.id,
    'Ingreso por venta histórica v170: ' || item.description_snapshot,
    jsonb_build_object('backfillBatch', v_batch, 'backfillReason', 'historical_sales_without_financial_postings'),
    sale.closed_by
  from public.sales sale
  join public.sale_items item on item.sale_id = sale.id
  left join public.products product on product.id = item.product_id
  left join public.product_categories category on category.id = product.category_id
  where sale.status = 'completed'
    and sale.accounting_date between v_from and v_to
    and not item.is_courtesy
    and item.total > 0
  on conflict (source_type, source_id, posting_code) where status = 'posted' do nothing;

  insert into public.financial_postings (
    accounting_date, branch_id, business_line, financial_group, effect_type,
    posting_code, amount, affects_profit, source_type, source_id,
    description, metadata, created_by
  )
  select
    sale.accounting_date,
    sale.branch_id,
    coalesce(item.business_line_snapshot, category.business_line),
    'cost_of_sales',
    'expense',
    case when item.is_courtesy then 'courtesy_actual_cost' else 'product_cost_of_sales' end,
    round(item.quantity * item.cost_snapshot, 2),
    true,
    'sale_item',
    item.id,
    case when item.is_courtesy then 'Costo real de cortesía histórica v170: ' else 'Costo de producto histórico v170: ' end || item.description_snapshot,
    jsonb_build_object('backfillBatch', v_batch, 'backfillReason', 'historical_sales_without_financial_postings'),
    sale.closed_by
  from public.sales sale
  join public.sale_items item on item.sale_id = sale.id
  left join public.products product on product.id = item.product_id
  left join public.product_categories category on category.id = product.category_id
  where sale.status = 'completed'
    and sale.accounting_date between v_from and v_to
    and item.item_type = 'product'
    and coalesce(item.cost_snapshot, 0) > 0
  on conflict (source_type, source_id, posting_code) where status = 'posted' do nothing;

  -- Same source and calculation as sync_settlement_personnel_cost(). A
  -- settlement in review/draft remains outside P&L until it is approved.
  insert into public.financial_postings (
    accounting_date, branch_id, payroll_period_id, financial_group, effect_type,
    posting_code, amount, affects_profit, source_type, source_id,
    description, metadata, created_by
  )
  select
    period.end_date,
    settlement.branch_id,
    settlement.payroll_period_id,
    'personnel_cost',
    'expense',
    'approved_settlement_personnel_cost',
    round(greatest(
      coalesce(settlement.gross_pay_amount, 0)
      + coalesce(settlement.manual_bonus_total, 0)
      - coalesce(settlement.other_deduction_total, 0)
      - coalesce(settlement.mandatory_discount_amount, 0),
      0
    ), 2),
    true,
    'employee_settlement',
    settlement.id,
    'Costo oficial de personal historico v170: ' || settlement.settlement_number,
    jsonb_build_object(
      'backfillBatch', v_batch,
      'backfillReason', 'historical_approved_settlement_without_financial_posting',
      'grossPay', settlement.gross_pay_amount,
      'mandatoryDiscount', settlement.mandatory_discount_amount,
      'debtRecoveries', settlement.debt_deduction_total
    ),
    settlement.approved_by
  from public.employee_settlements settlement
  join public.payroll_periods period on period.id = settlement.payroll_period_id
  where settlement.status in ('approved', 'paid')
    and period.end_date between v_from and v_to
  on conflict (source_type, source_id, posting_code) where status = 'posted' do nothing;

  -- Same category-driven posting as the v170 C&G entry path. This records
  -- only the financial fact: it deliberately does not reconstruct a treasury,
  -- payable, or POS cash movement for historical entries.
  insert into public.financial_postings (
    accounting_date, branch_id, financial_group, effect_type, posting_code,
    amount, affects_profit, source_type, source_id, description, metadata,
    created_by
  )
  select
    entry.entry_date,
    entry.branch_id,
    category.financial_group,
    case
      when category.financial_group = 'asset_movement' and category.direction = 'income' then 'asset_increase'
      when category.financial_group = 'asset_movement' then 'asset_decrease'
      when category.direction = 'income' then 'income'
      else 'expense'
    end,
    'finance_manual_entry',
    round(entry.amount, 2),
    category.affects_profit,
    'finance_manual_entry',
    entry.id,
    entry.description,
    jsonb_build_object(
      'backfillBatch', v_batch,
      'backfillReason', 'historical_finance_entry_without_financial_posting',
      'paymentStatus', entry.payment_status,
      'reference', entry.reference
    ),
    entry.created_by
  from public.finance_manual_entries entry
  join public.finance_categories category on category.id = entry.category_id
  where entry.status = 'active'
    and entry.entry_date between v_from and v_to
  on conflict (source_type, source_id, posting_code) where status = 'posted' do nothing;

  raise notice 'v170 historical P&L backfill completed for batch %.', v_batch;
end;
$$;
