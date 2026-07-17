-- QA Sprint 9. Solo lectura. Resume fuentes financieras manuales y ventas.

select
  fme.branch_id,
  fme.entry_date,
  fme.direction,
  fme.status,
  count(*) as entries,
  sum(fme.amount) as amount
from public.finance_manual_entries fme
group by fme.branch_id, fme.entry_date, fme.direction, fme.status
order by fme.entry_date desc, fme.branch_id, fme.direction;

-- Liquidaciones activas: cada una debe tener exactamente un egreso financiero enlazado.
select
  es.id as settlement_id,
  es.settlement_number,
  es.net_pay_amount,
  count(fme.id) as finance_entries,
  coalesce(sum(fme.amount), 0) as finance_amount
from public.employee_settlements es
join public.qa_entity_registry qer
  on qer.entity_table = 'employee_settlements'
 and qer.entity_id = es.id::text
 and qer.lifecycle_status = 'active'
left join public.finance_manual_entries fme
  on fme.source_type = 'employee_settlement'
 and fme.source_id = es.id
 and fme.status = 'active'
where es.status = 'paid'
group by es.id, es.settlement_number, es.net_pay_amount
having count(fme.id) <> 1
    or coalesce(sum(fme.amount), 0) <> es.net_pay_amount
order by es.settlement_number;

select
  s.branch_id,
  date(s.closed_at) as sale_date,
  s.status,
  count(*) as sales,
  sum(s.total) as total_amount,
  sum(s.paid_total) as paid_amount,
  sum(s.change_amount) as change_amount
from public.sales s
where s.closed_at is not null
group by s.branch_id, date(s.closed_at), s.status
order by sale_date desc, s.branch_id, s.status;

-- Revisa ventas completadas sin pagos y ventas anuladas con cobro no revertido.
select
  s.id as sale_id,
  s.status,
  s.total,
  s.paid_total,
  coalesce(sum(sp.amount), 0) as payment_rows_total
from public.sales s
left join public.sale_payments sp on sp.sale_id = s.id
group by s.id, s.status, s.total, s.paid_total
having (s.status = 'completed' and coalesce(sum(sp.amount), 0) <> s.paid_total)
    or (s.status = 'cancelled' and s.paid_total <> 0)
order by s.created_at desc;
