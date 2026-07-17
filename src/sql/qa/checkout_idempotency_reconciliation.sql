-- QA Sprint 9. Solo lectura. Ejecutar manualmente en Supabase SQL Editor.
-- Detecta inconsistencias de idempotencia y efectos duplicados en ventas QA.

with qa_sales as (
  select
    s.id,
    s.pos_session_id,
    s.checkout_idempotency_key,
    s.status,
    s.notes
  from public.sales s
  where s.notes like 'QA_TEST_DATA %'
)
select
  pos_session_id,
  checkout_idempotency_key,
  count(*) as sale_count,
  array_agg(id order by id) as sale_ids
from qa_sales
where checkout_idempotency_key is not null
group by pos_session_id, checkout_idempotency_key
having count(*) > 1;

select
  id as sale_id,
  pos_session_id,
  status,
  checkout_idempotency_key
from qa_sales
where checkout_idempotency_key is null
order by id;

select
  s.id as sale_id,
  s.checkout_idempotency_key,
  count(si.id) as item_count,
  count(sp.id) as payment_count,
  count(sm.id) filter (where sm.movement_type in ('sale', 'courtesy')) as stock_movement_count,
  count(esp.id) as production_count,
  count(sds.id) as ticket_snapshot_count
from qa_sales s
left join public.sale_items si on si.sale_id = s.id
left join public.sale_payments sp on sp.sale_id = s.id
left join public.stock_movements sm on sm.reference_type = 'sale' and sm.reference_id = s.id
left join public.employee_service_production esp on esp.sale_id = s.id
left join public.sale_document_snapshots sds on sds.sale_id = s.id
group by s.id, s.checkout_idempotency_key
order by s.id;
