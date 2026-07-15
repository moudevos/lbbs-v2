create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  base_price numeric(12,2) not null check (base_price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_branch_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_branch_prices_service_id_branch_id_key'
      and conrelid = 'public.service_branch_prices'::regclass
  ) then
    alter table public.service_branch_prices
      add constraint service_branch_prices_service_id_branch_id_key unique (service_id, branch_id);
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

drop trigger if exists service_categories_set_updated_at on public.service_categories;
create trigger service_categories_set_updated_at
before update on public.service_categories
for each row execute function public.set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists service_branch_prices_set_updated_at on public.service_branch_prices;
create trigger service_branch_prices_set_updated_at
before update on public.service_branch_prices
for each row execute function public.set_updated_at();

create or replace view public.vw_services_effective_prices
with (security_invoker = true)
as
select
  s.id as service_id,
  b.id as branch_id,
  s.category_id,
  s.name as service_name,
  s.slug as service_slug,
  s.description,
  s.duration_minutes,
  s.base_price,
  sbp.price as branch_price,
  coalesce(sbp.price, s.base_price) as final_price,
  s.is_active as service_is_active,
  s.allow_custom_price,
  sbp.is_active as branch_price_is_active
from public.services s
cross join public.branches b
left join public.service_branch_prices sbp
  on sbp.service_id = s.id
  and sbp.branch_id = b.id;

alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_branch_prices enable row level security;

drop policy if exists "service_categories_select_active_or_admin" on public.service_categories;
drop policy if exists "service_categories_insert_admin" on public.service_categories;
drop policy if exists "service_categories_update_admin" on public.service_categories;
drop policy if exists "service_categories_delete_admin" on public.service_categories;

create policy "service_categories_select_active_or_admin"
on public.service_categories
for select
to authenticated
using (public.is_admin() or is_active);

create policy "service_categories_insert_admin"
on public.service_categories
for insert
to authenticated
with check (public.is_admin());

create policy "service_categories_update_admin"
on public.service_categories
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "service_categories_delete_admin"
on public.service_categories
for delete
to authenticated
using (public.is_admin());

drop policy if exists "services_select_active_or_admin" on public.services;
drop policy if exists "services_insert_admin" on public.services;
drop policy if exists "services_update_admin" on public.services;
drop policy if exists "services_delete_admin" on public.services;

create policy "services_select_active_or_admin"
on public.services
for select
to authenticated
using (public.is_admin() or is_active);

create policy "services_insert_admin"
on public.services
for insert
to authenticated
with check (public.is_admin());

create policy "services_update_admin"
on public.services
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "services_delete_admin"
on public.services
for delete
to authenticated
using (public.is_admin());

drop policy if exists "service_branch_prices_select_admin_or_branch" on public.service_branch_prices;
drop policy if exists "service_branch_prices_insert_admin" on public.service_branch_prices;
drop policy if exists "service_branch_prices_update_admin" on public.service_branch_prices;
drop policy if exists "service_branch_prices_delete_admin" on public.service_branch_prices;

create policy "service_branch_prices_select_admin_or_branch"
on public.service_branch_prices
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_branch(branch_id)
);

create policy "service_branch_prices_insert_admin"
on public.service_branch_prices
for insert
to authenticated
with check (public.is_admin());

create policy "service_branch_prices_update_admin"
on public.service_branch_prices
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "service_branch_prices_delete_admin"
on public.service_branch_prices
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.service_categories to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.service_branch_prices to authenticated;

grant all on public.service_categories to service_role;
grant all on public.services to service_role;
grant all on public.service_branch_prices to service_role;

grant select on public.vw_services_effective_prices to authenticated;
grant select on public.vw_services_effective_prices to service_role;

revoke all on public.service_categories from public;
revoke all on public.services from public;
revoke all on public.service_branch_prices from public;
revoke all on public.vw_services_effective_prices from public;

insert into public.service_categories (name, slug, description, sort_order)
values
  ('Cortes', 'cortes', 'Servicios de corte y estilo.', 1),
  ('Barba', 'barba', 'Perfilado y mantenimiento de barba.', 2),
  ('Tratamientos', 'tratamientos', 'Tratamientos capilares y cuidado.', 3),
  ('Combos', 'combos', 'Paquetes de servicios combinados.', 4)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

insert into public.services (
  category_id,
  name,
  slug,
  description,
  base_price,
  duration_minutes
)
values
  (
    (select id from public.service_categories where slug = 'cortes'),
    'Corte clásico',
    'corte-clasico',
    'Corte tradicional para uso diario.',
    25.00,
    30
  ),
  (
    (select id from public.service_categories where slug = 'cortes'),
    'Corte fade',
    'corte-fade',
    'Corte degradado con acabado limpio.',
    35.00,
    45
  ),
  (
    (select id from public.service_categories where slug = 'barba'),
    'Perfilado de barba',
    'perfilado-de-barba',
    'Perfilado y definición de barba.',
    20.00,
    20
  ),
  (
    (select id from public.service_categories where slug = 'combos'),
    'Corte + barba',
    'corte-mas-barba',
    'Servicio combinado de corte y barba.',
    45.00,
    60
  )
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    base_price = excluded.base_price,
    duration_minutes = excluded.duration_minutes,
    is_active = true,
    updated_at = now();

-- Ejemplos opcionales de precios por sede:
-- insert into public.service_branch_prices (service_id, branch_id, price)
-- values
--   (
--     (select id from public.services where slug = 'corte-clasico'),
--     (select id from public.branches where slug = 'sede-principal'),
--     28.00
--   );
