create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id) on delete set null,
  sku text unique,
  name text not null,
  slug text not null unique,
  description text,
  barcode text,
  unit text not null default 'unidad',
  cost_price numeric(12,2) not null default 0,
  base_sale_price numeric(12,2) not null default 0,
  is_stockable boolean not null default true,
  is_courtesy_allowed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_branch_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_price numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  movement_type text not null,
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_cost_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_cost_price_check check (cost_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_base_sale_price_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_base_sale_price_check check (base_sale_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_unit_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_unit_check check (
        unit in ('unidad', 'paquete', 'botella', 'porcion', 'otro')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_branch_prices_sale_price_check'
      and conrelid = 'public.product_branch_prices'::regclass
  ) then
    alter table public.product_branch_prices
      add constraint product_branch_prices_sale_price_check check (sale_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_branch_prices_product_id_branch_id_key'
      and conrelid = 'public.product_branch_prices'::regclass
  ) then
    alter table public.product_branch_prices
      add constraint product_branch_prices_product_id_branch_id_key unique (product_id, branch_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_movements_quantity_check'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_quantity_check check (quantity <> 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_movements_unit_cost_check'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_unit_cost_check check (
        unit_cost is null or unit_cost >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_movements_movement_type_check'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_movement_type_check check (
        movement_type in (
          'purchase',
          'sale',
          'courtesy',
          'adjustment',
          'waste',
          'transfer_in',
          'transfer_out'
        )
      );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

create or replace function public.stock_movement_signed_quantity(
  movement_type text,
  quantity numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when movement_type in ('purchase', 'transfer_in') then abs(quantity)
    when movement_type in ('sale', 'courtesy', 'waste', 'transfer_out') then abs(quantity) * -1
    when movement_type = 'adjustment' then quantity
    else 0
  end;
$$;

revoke all on function public.stock_movement_signed_quantity(text, numeric) from public;
grant execute on function public.stock_movement_signed_quantity(text, numeric) to authenticated, service_role;

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists product_branch_prices_set_updated_at on public.product_branch_prices;
create trigger product_branch_prices_set_updated_at
before update on public.product_branch_prices
for each row execute function public.set_updated_at();

create or replace view public.vw_product_stock
with (security_invoker = true)
as
select
  p.id as product_id,
  b.id as branch_id,
  p.name as product_name,
  p.sku,
  p.category_id,
  coalesce(stock.stock_quantity, 0::numeric) as stock_quantity,
  p.base_sale_price,
  pbp.sale_price as branch_sale_price,
  coalesce(pbp.sale_price, p.base_sale_price) as final_sale_price,
  p.cost_price,
  p.is_stockable,
  p.is_courtesy_allowed,
  p.is_active
from public.products p
cross join public.branches b
left join (
  select
    sm.product_id,
    sm.branch_id,
    sum(public.stock_movement_signed_quantity(sm.movement_type, sm.quantity)) as stock_quantity
  from public.stock_movements sm
  group by sm.product_id, sm.branch_id
) stock
  on stock.product_id = p.id
  and stock.branch_id = b.id
left join public.product_branch_prices pbp
  on pbp.product_id = p.id
  and pbp.branch_id = b.id
  and pbp.is_active = true;

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_branch_prices enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "product_categories_select_active_or_admin" on public.product_categories;
drop policy if exists "product_categories_insert_admin" on public.product_categories;
drop policy if exists "product_categories_update_admin" on public.product_categories;
drop policy if exists "product_categories_delete_admin" on public.product_categories;

create policy "product_categories_select_active_or_admin"
on public.product_categories
for select
to authenticated
using (public.is_admin() or is_active);

create policy "product_categories_insert_admin"
on public.product_categories
for insert
to authenticated
with check (public.is_admin());

create policy "product_categories_update_admin"
on public.product_categories
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product_categories_delete_admin"
on public.product_categories
for delete
to authenticated
using (public.is_admin());

drop policy if exists "products_select_active_or_admin" on public.products;
drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

create policy "products_select_active_or_admin"
on public.products
for select
to authenticated
using (public.is_admin() or is_active);

create policy "products_insert_admin"
on public.products
for insert
to authenticated
with check (public.is_admin());

create policy "products_update_admin"
on public.products
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "products_delete_admin"
on public.products
for delete
to authenticated
using (public.is_admin());

drop policy if exists "product_branch_prices_select_admin_or_branch" on public.product_branch_prices;
drop policy if exists "product_branch_prices_insert_admin" on public.product_branch_prices;
drop policy if exists "product_branch_prices_update_admin" on public.product_branch_prices;
drop policy if exists "product_branch_prices_delete_admin" on public.product_branch_prices;

create policy "product_branch_prices_select_admin_or_branch"
on public.product_branch_prices
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_branch(branch_id)
);

create policy "product_branch_prices_insert_admin"
on public.product_branch_prices
for insert
to authenticated
with check (public.is_admin());

create policy "product_branch_prices_update_admin"
on public.product_branch_prices
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product_branch_prices_delete_admin"
on public.product_branch_prices
for delete
to authenticated
using (public.is_admin());

drop policy if exists "stock_movements_select_admin_or_branch" on public.stock_movements;
drop policy if exists "stock_movements_insert_admin_or_reception" on public.stock_movements;
drop policy if exists "stock_movements_update_admin" on public.stock_movements;
drop policy if exists "stock_movements_delete_admin" on public.stock_movements;

create policy "stock_movements_select_admin_or_branch"
on public.stock_movements
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_branch(branch_id)
);

create policy "stock_movements_insert_admin_or_reception"
on public.stock_movements
for insert
to authenticated
with check (
  (
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(branch_id)
    )
  )
  and (
    created_by is null
    or created_by = public.current_employee_id()
    or public.is_admin()
  )
);

create policy "stock_movements_update_admin"
on public.stock_movements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "stock_movements_delete_admin"
on public.stock_movements
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_branch_prices to authenticated;
grant select, insert, update, delete on public.stock_movements to authenticated;

grant all on public.product_categories to service_role;
grant all on public.products to service_role;
grant all on public.product_branch_prices to service_role;
grant all on public.stock_movements to service_role;
grant select on public.vw_product_stock to authenticated;
grant select on public.vw_product_stock to service_role;

revoke all on public.product_categories from public;
revoke all on public.products from public;
revoke all on public.product_branch_prices from public;
revoke all on public.stock_movements from public;
revoke all on public.vw_product_stock from public;

insert into public.product_categories (name, slug, description, sort_order)
values
  ('Pomadas', 'pomadas', 'Productos para acabado y fijacion.', 1),
  ('Shampoos', 'shampoos', 'Limpieza y cuidado capilar.', 2),
  ('Barba', 'barba-productos', 'Cuidado y mantenimiento de barba.', 3),
  ('Accesorios', 'accesorios', 'Complementos de venta rapida.', 4)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

insert into public.products (
  category_id,
  sku,
  name,
  slug,
  description,
  unit,
  cost_price,
  base_sale_price,
  is_stockable,
  is_courtesy_allowed
)
values
  (
    (select id from public.product_categories where slug = 'pomadas'),
    'POM-001',
    'Pomada clasica',
    'pomada-clasica',
    'Pomada de acabado para uso diario.',
    'unidad',
    12.00,
    25.00,
    true,
    true
  ),
  (
    (select id from public.product_categories where slug = 'shampoos'),
    'SHA-001',
    'Shampoo premium',
    'shampoo-premium',
    'Shampoo de cuidado capilar para venta en mostrador.',
    'botella',
    18.00,
    35.00,
    true,
    false
  ),
  (
    (select id from public.product_categories where slug = 'barba-productos'),
    'BAR-001',
    'Aceite para barba',
    'aceite-para-barba',
    'Aceite de hidratacion para barba.',
    'botella',
    10.00,
    22.00,
    true,
    true
  )
on conflict (slug) do update
set category_id = excluded.category_id,
    sku = excluded.sku,
    name = excluded.name,
    description = excluded.description,
    unit = excluded.unit,
    cost_price = excluded.cost_price,
    base_sale_price = excluded.base_sale_price,
    is_stockable = excluded.is_stockable,
    is_courtesy_allowed = excluded.is_courtesy_allowed,
    is_active = true,
    updated_at = now();

-- Ejemplo opcional de precio especial por sede:
-- insert into public.product_branch_prices (product_id, branch_id, sale_price)
-- values (
--   (select id from public.products where slug = 'pomada-clasica'),
--   (select id from public.branches where slug = 'sede-principal'),
--   27.00
-- )
-- on conflict (product_id, branch_id) do update
-- set sale_price = excluded.sale_price,
--     is_active = true,
--     updated_at = now();
