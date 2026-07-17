-- QA Sprint 9. Solo lectura. Ejecutar manualmente en Supabase SQL Editor.
-- Compara el stock calculado por movimientos con la vista operativa.

with movement_stock as (
  select
    sm.product_id,
    sm.branch_id,
    sum(public.stock_movement_signed_quantity(sm.movement_type, sm.quantity)) as calculated_stock,
    count(*) as movement_count
  from public.stock_movements sm
  group by sm.product_id, sm.branch_id
)
select
  p.id as product_id,
  b.id as branch_id,
  p.name as product_name,
  coalesce(ms.calculated_stock, 0) as calculated_stock,
  coalesce(vps.stock_quantity, 0) as view_stock,
  coalesce(ms.calculated_stock, 0) - coalesce(vps.stock_quantity, 0) as difference,
  coalesce(ms.movement_count, 0) as movement_count
from public.products p
cross join public.branches b
left join movement_stock ms on ms.product_id = p.id and ms.branch_id = b.id
left join public.vw_product_stock vps on vps.product_id = p.id and vps.branch_id = b.id
where p.is_stockable = true
order by abs(coalesce(ms.calculated_stock, 0) - coalesce(vps.stock_quantity, 0)) desc, p.name;

-- Ventas y anulaciones con ítems de producto para revisar referencias de movimientos.
select
  s.id as sale_id,
  s.status as sale_status,
  s.branch_id,
  count(si.id) filter (where si.product_id is not null) as product_item_count,
  count(sm.id) filter (where sm.movement_type in ('sale', 'courtesy')) as linked_stock_movement_count
from public.sales s
left join public.sale_items si on si.sale_id = s.id
left join public.stock_movements sm on sm.reference_type = 'sale' and sm.reference_id = s.id
group by s.id, s.status, s.branch_id
having count(si.id) filter (where si.product_id is not null) > 0
order by s.created_at desc;
