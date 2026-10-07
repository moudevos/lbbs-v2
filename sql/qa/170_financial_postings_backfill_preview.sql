-- v170 historical-sales backfill preview — READ ONLY
-- Approved range: 2026-10-01 through 2026-10-04, all branches.

with params as (
  select date '2026-10-01' as date_from, date '2026-10-04' as date_to
), candidates as (
  select
    sale.id as sale_id,
    sale.accounting_date,
    sale.branch_id,
    item.id as sale_item_id,
    item.item_type,
    item.is_courtesy,
    item.quantity,
    item.total,
    item.cost_snapshot,
    case when item.item_type = 'service' then 'services'
      else coalesce(item.business_line_snapshot, category.business_line) end as business_line
  from public.sales sale
  join public.sale_items item on item.sale_id = sale.id
  left join public.products product on product.id = item.product_id
  left join public.product_categories category on category.id = product.category_id
  cross join params
  where sale.status = 'completed'
    and sale.accounting_date between params.date_from and params.date_to
)
select
  business_line,
  item_type,
  is_courtesy,
  count(*) as sale_items,
  round(sum(case when not is_courtesy then total else 0 end), 2) as revenue_to_post,
  round(sum(case when item_type = 'product' and cost_snapshot > 0 then quantity * cost_snapshot else 0 end), 2) as cost_to_post,
  count(*) filter (where item_type = 'product' and business_line not in ('barbershop_products', 'cafeteria_products')) as unclassified_products,
  count(*) filter (where item_type = 'product' and coalesce(cost_snapshot, 0) = 0) as zero_cost_products
from candidates
group by business_line, item_type, is_courtesy
order by business_line, item_type, is_courtesy;

-- Must return zero rows before the migration is approved.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-04' as date_to
)
select sale.id as sale_id, item.id as sale_item_id, item.description_snapshot,
  item.item_type, item.is_courtesy, item.business_line_snapshot,
  category.business_line as product_category_business_line, item.cost_snapshot
from public.sales sale
join public.sale_items item on item.sale_id = sale.id
left join public.products product on product.id = item.product_id
left join public.product_categories category on category.id = product.category_id
cross join params
where sale.status = 'completed'
  and sale.accounting_date between params.date_from and params.date_to
  and item.item_type = 'product'
  and coalesce(item.business_line_snapshot, category.business_line) not in ('barbershop_products', 'cafeteria_products')
order by sale.accounting_date, sale.id, item.id;

-- Personnel cost: mirrors sync_settlement_personnel_cost(). Only approved or
-- paid settlements belong to P&L; drafts/review rows are intentionally absent.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-04' as date_to
)
select
  settlement.status,
  period.end_date as accounting_date,
  branch.name as branch_name,
  count(*) as settlements,
  round(sum(greatest(
    coalesce(settlement.gross_pay_amount, 0)
    + coalesce(settlement.manual_bonus_total, 0)
    - coalesce(settlement.other_deduction_total, 0)
    - coalesce(settlement.mandatory_discount_amount, 0),
    0
  )), 2) as personnel_cost_to_post,
  count(*) filter (where exists (
    select 1
    from public.financial_postings posting
    where posting.source_type = 'employee_settlement'
      and posting.source_id = settlement.id
      and posting.posting_code = 'approved_settlement_personnel_cost'
      and posting.status = 'posted'
  )) as already_posted
from public.employee_settlements settlement
join public.payroll_periods period on period.id = settlement.payroll_period_id
left join public.branches branch on branch.id = settlement.branch_id
cross join params
where settlement.status in ('approved', 'paid')
  and period.end_date between params.date_from and params.date_to
group by settlement.status, period.end_date, branch.name
order by accounting_date, branch_name, settlement.status;

-- C&G entries: same category/effect semantics as the v170 entry path. Rows
-- with affects_profit = false are shown for audit but do not alter P&L.
with params as (
  select date '2026-10-01' as date_from, date '2026-10-04' as date_to
)
select
  entry.entry_date as accounting_date,
  branch.name as branch_name,
  category.code as category_code,
  category.financial_group,
  category.affects_profit,
  count(*) as entries,
  round(sum(entry.amount), 2) as amount_to_post,
  count(*) filter (where exists (
    select 1
    from public.financial_postings posting
    where posting.source_type = 'finance_manual_entry'
      and posting.source_id = entry.id
      and posting.posting_code = 'finance_manual_entry'
      and posting.status = 'posted'
  )) as already_posted
from public.finance_manual_entries entry
join public.finance_categories category on category.id = entry.category_id
left join public.branches branch on branch.id = entry.branch_id
cross join params
where entry.status = 'active'
  and entry.entry_date between params.date_from and params.date_to
group by entry.entry_date, branch.name, category.code,
  category.financial_group, category.affects_profit
order by accounting_date, branch_name, category_code;

-- Must return zero rows before approval: approved/paid settlements without a
-- valid payroll period cannot be assigned an accounting date safely.
select settlement.id, settlement.settlement_number, settlement.status,
  settlement.payroll_period_id
from public.employee_settlements settlement
left join public.payroll_periods period on period.id = settlement.payroll_period_id
where settlement.status in ('approved', 'paid')
  and period.id is null
order by settlement.created_at, settlement.id;
