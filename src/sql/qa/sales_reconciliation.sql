-- QA de solo lectura. Reemplaza los literales por la fecha/sede a revisar.
with params as (
  select date '2026-09-23' as accounting_date, null::uuid as branch_id
), canonical as (
  select sale.* from public.vw_sales_canonical sale cross join params p
  where sale.accounting_date = p.accounting_date
    and sale.status = 'completed'
    and (p.branch_id is null or sale.branch_id = p.branch_id)
)
select
  (select accounting_date from params) as accounting_date,
  count(*) as canonical_completed_sales,
  coalesce(sum(total), 0) as canonical_net_total,
  coalesce(sum(paid_total), 0) as canonical_paid_total,
  coalesce(sum(reward_discount_total), 0) as canonical_reward_discount,
  count(*) filter (where has_courtesy) as sales_with_courtesy,
  count(*) filter (where cardinality(responsible_employee_ids) > 0) as sales_with_responsible,
  coalesce(sum((payment ->> 'amount')::numeric) filter (where coalesce((payment ->> 'counts_as_cash')::boolean, false)), 0) as canonical_cash_payments
from canonical
left join lateral jsonb_array_elements(canonical.payment_rows) payment on true;

-- El JSON permite contrastar el mismo alcance con Control de ventas.
select public.get_sales_reconciliation(date '2026-09-23', null::uuid);
