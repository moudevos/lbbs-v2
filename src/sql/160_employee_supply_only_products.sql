-- Productos de uso interno del personal: existen en inventario, pero no se
-- ofrecen ni se aceptan como artículos de venta en POS.
alter table public.products
  add column if not exists is_employee_supply_only boolean not null default false;

create index if not exists products_employee_supply_only_active_idx
  on public.products (is_employee_supply_only, is_active);

notify pgrst, 'reload schema';
