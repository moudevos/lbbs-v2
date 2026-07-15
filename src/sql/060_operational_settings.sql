create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courtesy_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_adjustment_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  movement_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_units_sort_order_check'
      and conrelid = 'public.product_units'::regclass
  ) then
    alter table public.product_units
      add constraint product_units_sort_order_check check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'courtesy_reasons_sort_order_check'
      and conrelid = 'public.courtesy_reasons'::regclass
  ) then
    alter table public.courtesy_reasons
      add constraint courtesy_reasons_sort_order_check check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_adjustment_reasons_sort_order_check'
      and conrelid = 'public.stock_adjustment_reasons'::regclass
  ) then
    alter table public.stock_adjustment_reasons
      add constraint stock_adjustment_reasons_sort_order_check check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_adjustment_reasons_movement_type_check'
      and conrelid = 'public.stock_adjustment_reasons'::regclass
  ) then
    alter table public.stock_adjustment_reasons
      add constraint stock_adjustment_reasons_movement_type_check check (
        movement_type is null
        or movement_type in (
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

drop trigger if exists product_units_set_updated_at on public.product_units;
create trigger product_units_set_updated_at
before update on public.product_units
for each row execute function public.set_updated_at();

drop trigger if exists courtesy_reasons_set_updated_at on public.courtesy_reasons;
create trigger courtesy_reasons_set_updated_at
before update on public.courtesy_reasons
for each row execute function public.set_updated_at();

drop trigger if exists stock_adjustment_reasons_set_updated_at on public.stock_adjustment_reasons;
create trigger stock_adjustment_reasons_set_updated_at
before update on public.stock_adjustment_reasons
for each row execute function public.set_updated_at();

alter table public.product_units enable row level security;
alter table public.courtesy_reasons enable row level security;
alter table public.stock_adjustment_reasons enable row level security;

drop policy if exists "product_units_select_active_or_team" on public.product_units;
drop policy if exists "product_units_insert_admin" on public.product_units;
drop policy if exists "product_units_update_admin" on public.product_units;
drop policy if exists "product_units_service_role_all" on public.product_units;

create policy "product_units_select_active_or_team"
on public.product_units
for select
to authenticated
using (public.is_admin() or is_active);

create policy "product_units_insert_admin"
on public.product_units
for insert
to authenticated
with check (public.is_admin());

create policy "product_units_update_admin"
on public.product_units
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "product_units_service_role_all"
on public.product_units
for all
to service_role
using (true)
with check (true);

drop policy if exists "courtesy_reasons_select_active_or_team" on public.courtesy_reasons;
drop policy if exists "courtesy_reasons_insert_admin" on public.courtesy_reasons;
drop policy if exists "courtesy_reasons_update_admin" on public.courtesy_reasons;
drop policy if exists "courtesy_reasons_service_role_all" on public.courtesy_reasons;

create policy "courtesy_reasons_select_active_or_team"
on public.courtesy_reasons
for select
to authenticated
using (public.is_admin() or is_active);

create policy "courtesy_reasons_insert_admin"
on public.courtesy_reasons
for insert
to authenticated
with check (public.is_admin());

create policy "courtesy_reasons_update_admin"
on public.courtesy_reasons
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "courtesy_reasons_service_role_all"
on public.courtesy_reasons
for all
to service_role
using (true)
with check (true);

drop policy if exists "stock_adjustment_reasons_select_active_or_team" on public.stock_adjustment_reasons;
drop policy if exists "stock_adjustment_reasons_insert_admin" on public.stock_adjustment_reasons;
drop policy if exists "stock_adjustment_reasons_update_admin" on public.stock_adjustment_reasons;
drop policy if exists "stock_adjustment_reasons_service_role_all" on public.stock_adjustment_reasons;

create policy "stock_adjustment_reasons_select_active_or_team"
on public.stock_adjustment_reasons
for select
to authenticated
using (public.is_admin() or is_active);

create policy "stock_adjustment_reasons_insert_admin"
on public.stock_adjustment_reasons
for insert
to authenticated
with check (public.is_admin());

create policy "stock_adjustment_reasons_update_admin"
on public.stock_adjustment_reasons
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "stock_adjustment_reasons_service_role_all"
on public.stock_adjustment_reasons
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.product_units to authenticated;
grant select, insert, update on public.courtesy_reasons to authenticated;
grant select, insert, update on public.stock_adjustment_reasons to authenticated;

grant all on public.product_units to service_role;
grant all on public.courtesy_reasons to service_role;
grant all on public.stock_adjustment_reasons to service_role;

revoke all on public.product_units from public;
revoke all on public.courtesy_reasons from public;
revoke all on public.stock_adjustment_reasons from public;

insert into public.product_units (code, name, description, sort_order, is_active)
values
  ('unidad', 'Unidad', 'Unidad individual.', 1, true),
  ('botella', 'Botella', 'Presentacion tipo botella.', 2, true),
  ('paquete', 'Paquete', 'Presentacion agrupada.', 3, true),
  ('porcion', 'Porcion', 'Uso por porciones.', 4, true),
  ('otro', 'Otro', 'Unidad operativa personalizada.', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.courtesy_reasons (code, name, description, sort_order, is_active)
values
  ('cliente_frecuente', 'Cliente frecuente', 'Atencion especial para clientes recurrentes.', 1, true),
  ('compensacion', 'Compensacion', 'Compensacion por inconveniente operativo.', 2, true),
  ('promocion', 'Promocion', 'Cortesia por campaña comercial.', 3, true),
  ('error_servicio', 'Error de servicio', 'Correccion por error detectado en el servicio.', 4, true),
  ('cortesia_admin', 'Cortesia autorizada', 'Cortesia aprobada por administracion.', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.stock_adjustment_reasons (code, name, description, movement_type, sort_order, is_active)
values
  ('conteo_fisico', 'Conteo fisico', 'Ajuste por diferencia encontrada en conteo.', 'adjustment', 1, true),
  ('merma', 'Merma', 'Ajuste por perdida o dano del producto.', 'waste', 2, true),
  ('vencimiento', 'Vencimiento', 'Salida por producto vencido.', 'waste', 3, true),
  ('error_registro', 'Error de registro', 'Correccion por registro previo incorrecto.', 'adjustment', 4, true),
  ('uso_interno', 'Uso interno', 'Salida para consumo interno.', 'adjustment', 5, true),
  ('reposicion', 'Reposicion', 'Ingreso por reposicion manual.', 'purchase', 6, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_type = excluded.movement_type,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

-- TODO: en un sprint posterior, vincular products.unit y courtesy_reason a catalogos con llaves foraneas sin romper compatibilidad actual.
