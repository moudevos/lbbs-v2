-- Visibilidad del producto: POS, interno o ambos.
-- Ejecutar después de 160_employee_supply_only_products.sql.
alter table public.products
  add column if not exists visibility_scope text not null default 'pos';

alter table public.products
  drop constraint if exists products_visibility_scope_check;
alter table public.products
  add constraint products_visibility_scope_check
  check (visibility_scope in ('pos', 'internal', 'both'));

-- Conserva el comportamiento de los insumos exclusivos ya creados y marca
-- como ambos los productos previamente habilitados para entregas internas.
update public.products product
set visibility_scope = case
  when product.is_employee_supply_only then 'internal'
  when exists (select 1 from public.employee_supply_catalog_items catalog where catalog.product_id = product.id) then 'both'
  else 'pos'
end;

create index if not exists products_visibility_scope_active_idx
  on public.products (visibility_scope, is_active);

notify pgrst, 'reload schema';
