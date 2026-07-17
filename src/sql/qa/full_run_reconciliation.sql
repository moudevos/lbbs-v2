-- QA Sprint 9. Solo lectura. Resume integridad por run sin modificar evidencia.
with registered as (
  select qr.id as run_id, qr.run_code, qer.entity_table, qer.entity_id
  from public.qa_runs qr
  left join public.qa_entity_registry qer on qer.qa_run_id = qr.id
), registered_sales as (
  select r.run_id, r.run_code, s.*
  from registered r
  join public.sales s on r.entity_table = 'sales' and r.entity_id = s.id
), payment_totals as (
  select sp.sale_id, sum(sp.amount) as applied, sum(sp.tendered_amount) as tendered, sum(sp.change_amount) as change_amount
  from public.sale_payments sp
  group by sp.sale_id
)
select
  rs.run_code,
  count(distinct rs.id) as registered_sales,
  count(distinct rs.id) filter (where rs.status = 'completed') as completed_sales,
  count(distinct rs.id) filter (where rs.status = 'cancelled') as cancelled_sales,
  count(distinct rs.id) filter (
    where rs.status = 'completed'
      and abs(coalesce(pt.applied, 0) - rs.total) > 0.009
  ) as payment_differences,
  count(distinct rs.id) filter (
    where coalesce(pt.tendered, 0) - coalesce(pt.change_amount, 0) <> coalesce(pt.applied, 0)
  ) as tendered_change_differences,
  count(distinct rs.id) filter (
    where rs.status = 'completed' and not exists (
      select 1 from public.sale_document_snapshots sts where sts.sale_id = rs.id
    )
  ) as missing_ticket_snapshots,
  count(distinct rs.id) filter (
    where rs.status = 'completed' and rs.reservation_id is not null and not exists (
      select 1 from public.reservations r where r.id = rs.reservation_id and r.status = 'completed'
    )
  ) as reservation_differences
from registered_sales rs
left join payment_totals pt on pt.sale_id = rs.id
group by rs.run_code
order by rs.run_code;

-- Duplicados de idempotencia dentro de cada run.
select
  qr.run_code,
  s.pos_session_id,
  s.idempotency_key,
  count(*) as duplicate_count
from public.qa_runs qr
join public.qa_entity_registry qer on qer.qa_run_id = qr.id and qer.entity_table = 'sales'
join public.sales s on s.id = qer.entity_id
where s.idempotency_key is not null
group by qr.run_code, s.pos_session_id, s.idempotency_key
having count(*) > 1
order by qr.run_code;

-- Stock negativo relacionado con productos registrados en el laboratorio.
select qr.run_code, vps.product_id, vps.branch_id, vps.stock_quantity
from public.qa_runs qr
join public.qa_entity_registry qer on qer.qa_run_id = qr.id and qer.entity_table = 'products'
join public.vw_product_stock vps on vps.product_id = qer.entity_id
where vps.stock_quantity < 0
order by qr.run_code, vps.product_id, vps.branch_id;
