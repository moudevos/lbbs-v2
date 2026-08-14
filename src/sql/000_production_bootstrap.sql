-- LBBS v2 - Instalador unico de base de datos de produccion.
-- Generado por scripts/build-production-sql.mjs. No editar este archivo a mano.
-- Ejecutar completo en Supabase SQL Editor sobre una base nueva.
--
-- Incluye: esquema, funciones, RLS, RPC, vistas, catalogos y seeds operativos.
-- Excluye: laboratorio QA, purgas, restauraciones, datos de prueba y correcciones historicas aisladas.
-- No crea usuarios Auth ni un owner. Crea primero el usuario owner en Supabase Auth
-- y registra su perfil de empleado owner despues de ejecutar este instalador.

begin;

-- ============================================================================
-- Fuente consolidada: 001_extensions.sql
-- ============================================================================
create extension if not exists pgcrypto;


-- ============================================================================
-- Fuente consolidada: 002_enums.sql
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'owner',
      'admin',
      'reception',
      'barber',
      'viewer'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type public.employee_status as enum (
      'active',
      'inactive',
      'blocked'
    );
  end if;
end $$;


-- ============================================================================
-- Fuente consolidada: 003_core_tables.sql
-- ============================================================================
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text not null,
  role public.app_role not null default 'viewer',
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employees_user_id_idx on public.employees(user_id);
create index if not exists employees_branch_id_idx on public.employees(branch_id);
create index if not exists audit_logs_branch_id_idx on public.audit_logs(branch_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant all on public.branches to service_role;
grant all on public.employees to service_role;
grant all on public.app_settings to service_role;
grant all on public.audit_logs to service_role;


-- ============================================================================
-- Fuente consolidada: 004_rls_helpers.sql
-- ============================================================================
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.role
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.branch_id
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('owner', 'admin'), false)
$$;

create or replace function public.can_access_branch(branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    or branch_id = public.current_branch_id()
$$;

revoke all on function public.current_employee_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_branch_id() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_branch(uuid) from public;

grant execute on function public.current_employee_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_branch_id() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_access_branch(uuid) to authenticated, service_role;


-- ============================================================================
-- Fuente consolidada: 005_rls_policies.sql
-- ============================================================================
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "branches_select_by_access" on public.branches;
drop policy if exists "branches_insert_by_admin" on public.branches;
drop policy if exists "branches_update_by_admin" on public.branches;
drop policy if exists "branches_delete_by_owner" on public.branches;

create policy "branches_select_by_access"
on public.branches for select
to authenticated
using (public.can_access_branch(id));

create policy "branches_insert_by_admin"
on public.branches for insert
to authenticated
with check (public.is_admin());

create policy "branches_update_by_admin"
on public.branches for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "branches_delete_by_owner"
on public.branches for delete
to authenticated
using (public.is_owner());

drop policy if exists "employees_select_by_role" on public.employees;
drop policy if exists "employees_insert_by_admin" on public.employees;
drop policy if exists "employees_update_by_admin" on public.employees;
drop policy if exists "employees_delete_by_owner" on public.employees;

create policy "employees_select_by_role"
on public.employees for select
to authenticated
using (
  public.is_admin()
  or id = public.current_employee_id()
);

create policy "employees_insert_by_admin"
on public.employees for insert
to authenticated
with check (public.is_admin());

create policy "employees_update_by_admin"
on public.employees for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees_delete_by_owner"
on public.employees for delete
to authenticated
using (public.is_owner());

drop policy if exists "app_settings_all_by_admin" on public.app_settings;

create policy "app_settings_all_by_admin"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "audit_logs_select_by_admin" on public.audit_logs;
drop policy if exists "audit_logs_insert_by_admin" on public.audit_logs;

create policy "audit_logs_select_by_admin"
on public.audit_logs for select
to authenticated
using (public.is_admin());

create policy "audit_logs_insert_by_admin"
on public.audit_logs for insert
to authenticated
with check (public.is_admin());


-- ============================================================================
-- Fuente consolidada: 006_seed_base.sql
-- ============================================================================
insert into public.app_settings (key, value, description)
values
  ('app.name', '"LBBS v2"'::jsonb, 'Nombre visible de la aplicacion'),
  ('app.sprint', '"sprint-0"'::jsonb, 'Sprint preparado en esta base')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

-- Pendiente: crear la primera sucursal y el primer empleado owner desde el panel de auth.


-- ============================================================================
-- Fuente consolidada: 007_branches_team.sql
-- ============================================================================
alter table public.branches
  add column if not exists code text,
  add column if not exists short_name text,
  add column if not exists city text,
  add column if not exists notes text;

alter table public.employees
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists position text,
  add column if not exists avatar_url text,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists can_login boolean not null default false,
  add column if not exists login_created_at timestamptz,
  add column if not exists notes text;

alter table public.employees
  alter column user_id drop not null;

alter table public.employees
  drop constraint if exists employees_user_id_key;

alter table public.branches
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.employees
  alter column role set default 'viewer',
  alter column status set default 'active',
  alter column must_change_password set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

create index if not exists branches_is_active_idx on public.branches (is_active);
create index if not exists employees_role_idx on public.employees (role);
create index if not exists employees_status_idx on public.employees (status);

create unique index if not exists branches_code_unique_idx
  on public.branches (code)
  where code is not null;

create unique index if not exists employees_email_lower_unique_idx
  on public.employees (lower(email))
  where email is not null;

create unique index if not exists employees_document_unique_idx
  on public.employees (document_type, document_number)
  where document_type is not null and document_number is not null;

create unique index if not exists employees_user_id_unique_idx
  on public.employees (user_id)
  where user_id is not null;

create index if not exists employees_user_id_idx on public.employees (user_id);
create index if not exists employees_branch_id_idx on public.employees (branch_id);

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

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

alter table public.branches enable row level security;
alter table public.employees enable row level security;

drop policy if exists "branches_select_team" on public.branches;
drop policy if exists "branches_insert_admin" on public.branches;
drop policy if exists "branches_update_admin" on public.branches;
drop policy if exists "branches_delete_admin" on public.branches;

create policy "branches_select_team"
on public.branches
for select
to authenticated
using (
  public.is_admin()
  or (
    is_active
    and public.can_access_branch(id)
  )
);

create policy "branches_insert_admin"
on public.branches
for insert
to authenticated
with check (public.is_admin());

create policy "branches_update_admin"
on public.branches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "branches_delete_admin"
on public.branches
for delete
to authenticated
using (public.is_admin());

drop policy if exists "employees_select_team" on public.employees;
drop policy if exists "employees_insert_admin" on public.employees;
drop policy if exists "employees_update_admin" on public.employees;
drop policy if exists "employees_delete_admin" on public.employees;

create policy "employees_select_team"
on public.employees
for select
to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
  )
  or id = public.current_employee_id()
);

create policy "employees_insert_admin"
on public.employees
for insert
to authenticated
with check (public.is_admin());

create policy "employees_update_admin"
on public.employees
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees_delete_admin"
on public.employees
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant all on public.branches to service_role;
grant all on public.employees to service_role;

revoke all on public.branches from public;
revoke all on public.employees from public;

insert into public.branches (
  code,
  name,
  slug,
  short_name,
  city,
  address,
  phone,
  notes,
  is_active
)
values
  ('PRINCIPAL', 'Sucursal Principal', 'sucursal-principal', 'Principal', 'Lima', null, null, 'Sucursal base del sistema.', true),
  ('NORTE', 'Sucursal Norte', 'sucursal-norte', 'Norte', 'Lima', null, null, 'Sucursal secundaria de ejemplo.', true)
on conflict (slug) do update
set code = excluded.code,
    name = excluded.name,
    short_name = excluded.short_name,
    city = excluded.city,
    address = excluded.address,
    phone = excluded.phone,
    notes = excluded.notes,
    is_active = excluded.is_active,
    updated_at = now();

-- Al ejecutar de nuevo, la tabla se reusa y no duplica registros.


-- Sedes operativas base para produccion.
insert into public.branches (name, slug, code, short_name, city, is_active)
values
  ('LA BAJADITA RICARDO PALMA', 'la-bajadita-ricardo-palma', 'LB-SRP', 'Ricardo Palma', 'Iquitos', true),
  ('LA BAJADITA SAN JUAN', 'la-bajadita-san-juan', 'LB-SSJ', 'San Juan', 'San Juan Bautista', true)
on conflict (code) where code is not null do update
set name = excluded.name,
    slug = excluded.slug,
    short_name = excluded.short_name,
    city = excluded.city,
    is_active = excluded.is_active,
    updated_at = now();


-- ============================================================================
-- Fuente consolidada: 010_services.sql
-- ============================================================================
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
  allow_custom_price boolean not null default false,
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


-- ============================================================================
-- Fuente consolidada: 020_customers.sql
-- ============================================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  phone_normalized text not null,
  email text,
  document_type text,
  document_number text,
  birthdate date,
  gender text,
  source text not null default 'manual',
  preferred_branch_id uuid references public.branches(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_full_name_not_empty check (length(btrim(full_name)) > 0),
  constraint customers_phone_not_empty check (length(btrim(phone)) > 0),
  constraint customers_source_check check (source in ('manual', 'reservation', 'sale', 'import')),
  constraint customers_gender_check check (
    gender is null or gender in ('male', 'female', 'other', 'unspecified')
  ),
  constraint customers_document_type_check check (
    document_type is null or document_type in ('DNI', 'CE', 'Pasaporte', 'RUC', 'Otro')
  )
);

create unique index if not exists customers_phone_normalized_unique_idx
  on public.customers (phone_normalized);

create index if not exists customers_full_name_idx
  on public.customers (full_name);

create index if not exists customers_phone_normalized_idx
  on public.customers (phone_normalized);

create index if not exists customers_document_idx
  on public.customers (document_type, document_number);

create index if not exists customers_preferred_branch_id_idx
  on public.customers (preferred_branch_id);

create index if not exists customers_is_active_idx
  on public.customers (is_active);

create index if not exists customers_created_at_desc_idx
  on public.customers (created_at desc);

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

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

drop policy if exists "customers_select_team" on public.customers;
drop policy if exists "customers_insert_team" on public.customers;
drop policy if exists "customers_update_team" on public.customers;
drop policy if exists "customers_delete_admin" on public.customers;

-- Policy historica omitida: customers_select_team. La definicion final se conserva mas adelante.

-- Policy historica omitida: customers_insert_team. La definicion final se conserva mas adelante.

-- Policy historica omitida: customers_update_team. La definicion final se conserva mas adelante.

-- Policy historica omitida: customers_delete_admin. La definicion final se conserva mas adelante.

grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
revoke all on public.customers from public;


-- ============================================================================
-- Fuente consolidada: 021_identity_lookup.sql
-- ============================================================================
create table if not exists public.identity_lookup_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apiperu',
  document_type text not null,
  document_number text not null,
  normalized_document text not null,
  full_name text,
  business_name text,
  raw_data jsonb not null default '{}'::jsonb,
  found boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_lookup_cache_document_type_check check (
    document_type in ('DNI', 'RUC')
  )
);

create unique index if not exists identity_lookup_cache_provider_doc_unique_idx
  on public.identity_lookup_cache (provider, document_type, normalized_document);

create index if not exists identity_lookup_cache_normalized_document_idx
  on public.identity_lookup_cache (normalized_document);

create index if not exists identity_lookup_cache_document_type_idx
  on public.identity_lookup_cache (document_type);

create index if not exists identity_lookup_cache_expires_at_idx
  on public.identity_lookup_cache (expires_at);

create table if not exists public.identity_lookup_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apiperu',
  document_type text not null,
  normalized_document_masked text not null,
  success boolean not null default false,
  status_code integer,
  message text,
  requested_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint identity_lookup_logs_document_type_check check (
    document_type in ('DNI', 'RUC')
  )
);

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

drop trigger if exists identity_lookup_cache_set_updated_at on public.identity_lookup_cache;
create trigger identity_lookup_cache_set_updated_at
before update on public.identity_lookup_cache
for each row execute function public.set_updated_at();

alter table public.identity_lookup_cache enable row level security;
alter table public.identity_lookup_logs enable row level security;

drop policy if exists "identity_lookup_cache_select_team" on public.identity_lookup_cache;
drop policy if exists "identity_lookup_cache_write_team" on public.identity_lookup_cache;
drop policy if exists "identity_lookup_cache_delete_admin" on public.identity_lookup_cache;

create policy "identity_lookup_cache_select_team"
on public.identity_lookup_cache
for select
to authenticated
using (
  public.is_admin()
  or public.current_user_role() = 'reception'
);

create policy "identity_lookup_cache_write_team"
on public.identity_lookup_cache
for all
to authenticated
using (
  public.is_admin()
  or public.current_user_role() = 'reception'
)
with check (
  public.is_admin()
  or public.current_user_role() = 'reception'
);

drop policy if exists "identity_lookup_logs_select_admin" on public.identity_lookup_logs;
drop policy if exists "identity_lookup_logs_insert_team" on public.identity_lookup_logs;

create policy "identity_lookup_logs_select_admin"
on public.identity_lookup_logs
for select
to authenticated
using (public.is_admin());

create policy "identity_lookup_logs_insert_team"
on public.identity_lookup_logs
for insert
to authenticated
with check (
  public.is_admin()
  or public.current_user_role() = 'reception'
);

grant select, insert, update, delete on public.identity_lookup_cache to authenticated;
grant select, insert on public.identity_lookup_logs to authenticated;
grant all on public.identity_lookup_cache to service_role;
grant all on public.identity_lookup_logs to service_role;

revoke all on public.identity_lookup_cache from public;
revoke all on public.identity_lookup_logs from public;


-- ============================================================================
-- Fuente consolidada: 022_customers_simplify.sql
-- ============================================================================
alter table public.customers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists business_name text;


-- ============================================================================
-- Fuente consolidada: 030_reservations.sql
-- ============================================================================
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  preferred_barber_id uuid references public.employees(id) on delete set null,
  service_interest_id uuid references public.services(id) on delete set null,
  scheduled_date date,
  scheduled_time time,
  status text not null default 'pending',
  source text not null default 'manual',
  channel text not null default 'reception',
  customer_message text,
  internal_notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.reservations
    drop constraint if exists reservations_status_check;

  alter table public.reservations
    add constraint reservations_status_check
    check (status in ('pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show'));

  alter table public.reservations
    drop constraint if exists reservations_source_check;

  alter table public.reservations
    add constraint reservations_source_check
    check (source in ('manual', 'public_form', 'whatsapp', 'phone'));

  alter table public.reservations
    drop constraint if exists reservations_channel_check;

  alter table public.reservations
    add constraint reservations_channel_check
    check (channel in ('reception', 'website', 'whatsapp', 'phone'));
end $$;

create table if not exists public.reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists reservations_customer_id_idx
  on public.reservations (customer_id);

create index if not exists reservations_branch_id_idx
  on public.reservations (branch_id);

create index if not exists reservations_preferred_barber_id_idx
  on public.reservations (preferred_barber_id);

create index if not exists reservations_service_interest_id_idx
  on public.reservations (service_interest_id);

create index if not exists reservations_status_idx
  on public.reservations (status);

create index if not exists reservations_scheduled_date_idx
  on public.reservations (scheduled_date);

create index if not exists reservations_created_at_desc_idx
  on public.reservations (created_at desc);

create index if not exists reservation_notes_reservation_created_at_desc_idx
  on public.reservation_notes (reservation_id, created_at desc);

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

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace function public.can_view_reservation(
  reservation_branch_id uuid,
  reservation_barber_id uuid,
  reservation_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and (
        reservation_created_by = public.current_employee_id()
        or public.can_access_branch(reservation_branch_id)
      )
    )
    or (
      public.current_user_role() = 'barber'
      and reservation_barber_id = public.current_employee_id()
    )
    or (
      public.current_user_role() = 'viewer'
      and public.can_access_branch(reservation_branch_id)
    ),
    false
  )
$$;

create or replace function public.can_write_reservation(
  reservation_branch_id uuid,
  reservation_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and (
        reservation_created_by = public.current_employee_id()
        or reservation_branch_id is null
        or public.can_access_branch(reservation_branch_id)
      )
    ),
    false
  )
$$;

create or replace function public.can_write_reservation_note(target_reservation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.reservations r
    where r.id = target_reservation_id
      and (
        public.is_admin()
        or (
          public.current_user_role() = 'reception'
          and (
            r.created_by = public.current_employee_id()
            or r.branch_id is null
            or public.can_access_branch(r.branch_id)
          )
        )
        or (
          public.current_user_role() = 'barber'
          and r.preferred_barber_id = public.current_employee_id()
        )
      )
  )
$$;

revoke all on function public.can_view_reservation(uuid, uuid, uuid) from public;
revoke all on function public.can_write_reservation(uuid, uuid) from public;
revoke all on function public.can_write_reservation_note(uuid) from public;

grant execute on function public.can_view_reservation(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_write_reservation(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_write_reservation_note(uuid) to authenticated, service_role;

alter table public.reservations enable row level security;
alter table public.reservation_notes enable row level security;

drop policy if exists "reservations_select_team" on public.reservations;
drop policy if exists "reservations_insert_team" on public.reservations;
drop policy if exists "reservations_update_team" on public.reservations;
drop policy if exists "reservations_delete_admin" on public.reservations;
drop policy if exists "reservations_service_role_all" on public.reservations;

create policy "reservations_select_team"
on public.reservations
for select
to authenticated
using (
  public.can_view_reservation(branch_id, preferred_barber_id, created_by)
);

create policy "reservations_insert_team"
on public.reservations
for insert
to authenticated
with check (
  public.can_write_reservation(branch_id, created_by)
);

create policy "reservations_update_team"
on public.reservations
for update
to authenticated
using (
  public.can_write_reservation(branch_id, created_by)
)
with check (
  public.can_write_reservation(branch_id, created_by)
);

create policy "reservations_delete_admin"
on public.reservations
for delete
to authenticated
using (public.is_admin());

create policy "reservations_service_role_all"
on public.reservations
for all
to service_role
using (true)
with check (true);

drop policy if exists "reservation_notes_select_team" on public.reservation_notes;
drop policy if exists "reservation_notes_insert_team" on public.reservation_notes;
drop policy if exists "reservation_notes_delete_admin" on public.reservation_notes;
drop policy if exists "reservation_notes_service_role_all" on public.reservation_notes;

create policy "reservation_notes_select_team"
on public.reservation_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and public.can_view_reservation(r.branch_id, r.preferred_barber_id, r.created_by)
  )
);

create policy "reservation_notes_insert_team"
on public.reservation_notes
for insert
to authenticated
with check (
  public.can_write_reservation_note(reservation_id)
);

create policy "reservation_notes_delete_admin"
on public.reservation_notes
for delete
to authenticated
using (public.is_admin());

create policy "reservation_notes_service_role_all"
on public.reservation_notes
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.reservations to authenticated;
grant select, insert, delete on public.reservation_notes to authenticated;

grant all on public.reservations to service_role;
grant all on public.reservation_notes to service_role;

revoke all on public.reservations from public;
revoke all on public.reservation_notes from public;


-- ============================================================================
-- Fuente consolidada: 040_products_stock.sql
-- ============================================================================
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

-- Policy historica omitida: stock_movements_insert_admin_or_reception. La definicion final se conserva mas adelante.

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


-- ============================================================================
-- Fuente consolidada: 050_pos_sales.sql
-- ============================================================================
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'customers'
  ) then
    alter table public.customers
      drop constraint if exists customers_source_check;

    alter table public.customers
      add constraint customers_source_check
      check (source in ('manual', 'reservation', 'sale', 'import', 'system'));
  end if;
end $$;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by uuid references public.employees(id) on delete set null,
  closed_by uuid references public.employees(id) on delete set null,
  reopened_by uuid references public.employees(id) on delete set null,
  business_date date not null default current_date,
  status text not null default 'open',
  opening_cash_amount numeric(12,2) not null default 0,
  expected_cash_amount numeric(12,2) not null default 0,
  counted_cash_amount numeric(12,2),
  cash_difference numeric(12,2),
  total_sales_amount numeric(12,2) not null default 0,
  total_cash_amount numeric(12,2) not null default 0,
  total_wallet_qr_amount numeric(12,2) not null default 0,
  total_card_pos_amount numeric(12,2) not null default 0,
  total_cancelled_amount numeric(12,2) not null default 0,
  sales_count integer not null default 0,
  cancelled_sales_count integer not null default 0,
  opening_notes text,
  closing_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  barber_id uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  courtesy_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  notes text,
  cancelled_reason text,
  created_by uuid references public.employees(id) on delete set null,
  closed_by uuid references public.employees(id) on delete set null,
  cancelled_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_type text not null,
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  description_snapshot text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  cost_snapshot numeric(12,2),
  barber_id uuid references public.employees(id) on delete set null,
  is_courtesy boolean not null default false,
  courtesy_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_session_events (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_status_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_status_check
      check (status in ('open', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_opening_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_opening_cash_amount_check
      check (opening_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_expected_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_expected_cash_amount_check
      check (expected_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_counted_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_counted_cash_amount_check
      check (counted_cash_amount is null or counted_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_status_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_status_check
      check (status in ('draft', 'completed', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_amounts_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_amounts_check
      check (
        subtotal >= 0
        and discount_total >= 0
        and courtesy_total >= 0
        and total >= 0
        and paid_total >= 0
        and change_amount >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_completed_requires_closed_at_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_completed_requires_closed_at_check
      check (status <> 'completed' or closed_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_cancelled_requires_cancelled_at_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_cancelled_requires_cancelled_at_check
      check (status <> 'cancelled' or cancelled_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_item_type_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_item_type_check
      check (item_type in ('service', 'product'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_amounts_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_amounts_check
      check (
        quantity > 0
        and unit_price >= 0
        and discount_amount >= 0
        and total >= 0
        and (cost_snapshot is null or cost_snapshot >= 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_reference_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_reference_check
      check (
        (
          item_type = 'service'
          and service_id is not null
          and product_id is null
        )
        or (
          item_type = 'product'
          and product_id is not null
          and service_id is null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_courtesy_total_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_courtesy_total_check
      check (is_courtesy = false or total = 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_amount_check
      check (amount > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_session_events_event_type_check'
      and conrelid = 'public.pos_session_events'::regclass
  ) then
    alter table public.pos_session_events
      add constraint pos_session_events_event_type_check
      check (event_type in ('opened', 'closed', 'reopened', 'sale_completed', 'sale_cancelled', 'note'));
  end if;
end $$;

create unique index if not exists payment_methods_code_idx
  on public.payment_methods (code);

create index if not exists pos_sessions_branch_status_idx
  on public.pos_sessions (branch_id, status);

create index if not exists pos_sessions_business_date_idx
  on public.pos_sessions (business_date);

create unique index if not exists pos_sessions_one_open_per_branch_idx
  on public.pos_sessions (branch_id)
  where status = 'open';

create index if not exists sales_pos_session_id_idx
  on public.sales (pos_session_id);

create index if not exists sales_branch_id_idx
  on public.sales (branch_id);

create index if not exists sales_customer_id_idx
  on public.sales (customer_id);

create index if not exists sales_reservation_id_idx
  on public.sales (reservation_id);

create index if not exists sales_barber_id_idx
  on public.sales (barber_id);

create index if not exists sales_status_idx
  on public.sales (status);

create index if not exists sales_created_at_desc_idx
  on public.sales (created_at desc);

create index if not exists sale_items_sale_id_idx
  on public.sale_items (sale_id);

create index if not exists sale_items_service_id_idx
  on public.sale_items (service_id);

create index if not exists sale_items_product_id_idx
  on public.sale_items (product_id);

create index if not exists sale_payments_sale_id_idx
  on public.sale_payments (sale_id);

create index if not exists pos_session_events_pos_session_created_at_desc_idx
  on public.pos_session_events (pos_session_id, created_at desc);

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

drop trigger if exists payment_methods_set_updated_at on public.payment_methods;
create trigger payment_methods_set_updated_at
before update on public.payment_methods
for each row execute function public.set_updated_at();

drop trigger if exists pos_sessions_set_updated_at on public.pos_sessions;
create trigger pos_sessions_set_updated_at
before update on public.pos_sessions
for each row execute function public.set_updated_at();

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists sale_items_set_updated_at on public.sale_items;
create trigger sale_items_set_updated_at
before update on public.sale_items
for each row execute function public.set_updated_at();

create or replace function public.can_view_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or public.can_access_branch(target_branch_id),
    false
  )
$$;

create or replace function public.can_manage_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(target_branch_id)
    ),
    false
  )
$$;

create or replace function public.can_view_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales s
    where s.id = target_sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
$$;

create or replace function public.can_view_pos_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pos_sessions ps
    where ps.id = target_session_id
      and public.can_view_pos_branch(ps.branch_id)
  )
$$;

create or replace function public.can_manage_pos_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pos_sessions ps
    where ps.id = target_session_id
      and public.can_manage_pos_branch(ps.branch_id)
  )
$$;

create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_total_sales numeric(12,2) := 0;
  v_total_cash numeric(12,2) := 0;
  v_total_wallet numeric(12,2) := 0;
  v_total_card numeric(12,2) := 0;
  v_total_cancelled numeric(12,2) := 0;
  v_sales_count integer := 0;
  v_cancelled_sales_count integer := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  select
    coalesce(sum(case when s.status = 'completed' then s.total else 0 end), 0),
    coalesce(sum(case when s.status = 'cancelled' then s.total else 0 end), 0),
    coalesce(count(*) filter (where s.status = 'completed'), 0),
    coalesce(count(*) filter (where s.status = 'cancelled'), 0)
  into
    v_total_sales,
    v_total_cancelled,
    v_sales_count,
    v_cancelled_sales_count
  from public.sales s
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(sp.amount) filter (where pm.code = 'cash' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'card_pos' and s.status = 'completed'), 0)
  into
    v_total_cash,
    v_total_wallet,
    v_total_card
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where s.pos_session_id = p_session_id;

  update public.pos_sessions
  set total_sales_amount = v_total_sales,
      total_cash_amount = v_total_cash,
      total_wallet_qr_amount = v_total_wallet,
      total_card_pos_amount = v_total_card,
      total_cancelled_amount = v_total_cancelled,
      sales_count = v_sales_count,
      cancelled_sales_count = v_cancelled_sales_count,
      expected_cash_amount = coalesce(opening_cash_amount, 0) + v_total_cash
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function public.get_open_pos_session(p_branch_id uuid)
returns public.pos_sessions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ps.*
  from public.pos_sessions ps
  where ps.branch_id = p_branch_id
    and ps.status = 'open'
  order by ps.opened_at desc
  limit 1
$$;

create or replace function public.recalculate_sale_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_courtesy_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(si.quantity * si.unit_price), 0),
    coalesce(sum(si.discount_amount), 0),
    coalesce(sum(case when si.is_courtesy then si.quantity * si.unit_price else 0 end), 0),
    coalesce(sum(si.total), 0)
  into
    v_subtotal,
    v_discount_total,
    v_courtesy_total,
    v_total
  from public.sale_items si
  where si.sale_id = p_sale_id;

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_discount_total,
      courtesy_total = v_courtesy_total,
      total = v_total,
      change_amount = greatest(paid_total - v_total, 0)
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.recalculate_sale_payment_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_paid_total numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select coalesce(sum(sp.amount), 0)
  into v_paid_total
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set paid_total = v_paid_total,
      change_amount = greatest(v_paid_total - total, 0)
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.sale_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_sale_totals(coalesce(new.sale_id, old.sale_id));
  return null;
end;
$$;

create or replace function public.sale_payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_sale_payment_totals(coalesce(new.sale_id, old.sale_id));
  return null;
end;
$$;

drop trigger if exists sale_items_after_write_trigger on public.sale_items;
create trigger sale_items_after_write_trigger
after insert or update or delete on public.sale_items
for each row execute function public.sale_items_after_write();

drop trigger if exists sale_payments_after_write_trigger on public.sale_payments;
create trigger sale_payments_after_write_trigger
after insert or update or delete on public.sale_payments
for each row execute function public.sale_payments_after_write();

create or replace function public.open_pos_session(
  p_branch_id uuid,
  p_opening_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  if not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para abrir una sesion POS en esta sede.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  if found then
    return v_session;
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  begin
    insert into public.pos_sessions (
      branch_id,
      opened_by,
      business_date,
      status,
      opening_cash_amount,
      expected_cash_amount,
      opening_notes,
      opened_at
    )
    values (
      p_branch_id,
      v_employee_id,
      current_date,
      'open',
      coalesce(p_opening_cash_amount, 0),
      coalesce(p_opening_cash_amount, 0),
      nullif(btrim(coalesce(p_notes, '')), ''),
      now()
    )
    returning *
    into v_session;
  exception
    when unique_violation then
      select *
      into v_session
      from public.pos_sessions
      where branch_id = p_branch_id
        and status = 'open'
      order by opened_at desc
      limit 1;
      return v_session;
  end;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'opened',
    'Sesion POS abierta.',
    jsonb_build_object(
      'opening_cash_amount', v_session.opening_cash_amount,
      'branch_id', v_session.branch_id
    )
  );

  return v_session;
end;
$$;

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_draft_count integer := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para cerrar esta sesion POS.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'La sesion POS ya esta cerrada.';
  end if;

  if coalesce(p_counted_cash_amount, 0) < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select count(*)
  into v_draft_count
  from public.sales s
  where s.pos_session_id = p_session_id
    and s.status = 'draft';

  if v_draft_count > 0 then
    raise exception 'No se puede cerrar la sesion mientras existan ventas en borrador.';
  end if;

  v_session := public.sync_pos_session_totals(p_session_id);

  update public.pos_sessions
  set status = 'closed',
      counted_cash_amount = coalesce(p_counted_cash_amount, 0),
      cash_difference = coalesce(p_counted_cash_amount, 0) - expected_cash_amount,
      closing_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      closed_by = v_employee_id,
      closed_at = now()
  where id = p_session_id
  returning *
  into v_session;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'closed',
    'Sesion POS cerrada.',
    jsonb_build_object(
      'counted_cash_amount', v_session.counted_cash_amount,
      'expected_cash_amount', v_session.expected_cash_amount,
      'cash_difference', v_session.cash_difference
    )
  );

  return v_session;
end;
$$;

create or replace function public.reopen_pos_session(
  p_session_id uuid,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden reabrir sesiones POS.';
  end if;

  if v_session.status <> 'closed' then
    raise exception 'Solo se pueden reabrir sesiones cerradas.';
  end if;

  if v_session.business_date <> public.pos_business_date() then
    raise exception 'Solo se puede reabrir una sesion cerrada del mismo dia.';
  end if;

  if exists (
    select 1
    from public.pos_sessions ps
    where ps.branch_id = v_session.branch_id
      and ps.status = 'open'
      and ps.id <> v_session.id
  ) then
    raise exception 'Ya existe otra sesion POS abierta para esta sede.';
  end if;

  update public.pos_sessions
  set status = 'open',
      reopened_by = v_employee_id,
      reopened_at = now(),
      closed_by = null,
      closed_at = null,
      counted_cash_amount = null,
      cash_difference = null,
      closing_notes = nullif(btrim(coalesce(p_notes, closing_notes, '')), '')
  where id = p_session_id
  returning *
  into v_session;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'reopened',
    'Sesion POS reabierta.',
    jsonb_build_object(
      'business_date', v_session.business_date
    )
  );

  return v_session;
end;
$$;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = greatest(paid_total - total, 0),
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;

create or replace function public.cancel_completed_sale(
  p_sale_id uuid,
  p_reason text
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para anular esta venta.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.status = 'open'
  ) then
    raise exception 'Solo se puede anular una venta mientras la sesion POS este abierta.';
  end if;

  if v_reason is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    'adjustment',
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale_cancellation',
    v_sale.id,
    'Reversion de stock por anulacion de venta completada.',
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_by = v_employee_id,
      cancelled_at = now()
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'checked_in',
        completed_at = null,
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_cancelled',
    'Venta anulada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'reason', v_reason
    )
  );

  return v_sale;
end;
$$;

revoke all on function public.can_view_pos_branch(uuid) from public;
revoke all on function public.can_manage_pos_branch(uuid) from public;
revoke all on function public.can_view_sale(uuid) from public;
revoke all on function public.can_view_pos_session(uuid) from public;
revoke all on function public.can_manage_pos_session(uuid) from public;
revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.get_open_pos_session(uuid) from public;
revoke all on function public.open_pos_session(uuid, numeric, text) from public;
revoke all on function public.close_pos_session(uuid, numeric, text) from public;
revoke all on function public.reopen_pos_session(uuid, text) from public;
revoke all on function public.recalculate_sale_totals(uuid) from public;
revoke all on function public.recalculate_sale_payment_totals(uuid) from public;
revoke all on function public.sale_items_after_write() from public;
revoke all on function public.sale_payments_after_write() from public;
revoke all on function public.complete_sale(uuid) from public;
revoke all on function public.cancel_completed_sale(uuid, text) from public;

grant execute on function public.can_view_pos_branch(uuid) to authenticated, service_role;
grant execute on function public.can_manage_pos_branch(uuid) to authenticated, service_role;
grant execute on function public.can_view_sale(uuid) to authenticated, service_role;
grant execute on function public.can_view_pos_session(uuid) to authenticated, service_role;
grant execute on function public.can_manage_pos_session(uuid) to authenticated, service_role;
grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.get_open_pos_session(uuid) to authenticated, service_role;
grant execute on function public.open_pos_session(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.close_pos_session(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.reopen_pos_session(uuid, text) to authenticated, service_role;
grant execute on function public.recalculate_sale_totals(uuid) to authenticated, service_role;
grant execute on function public.recalculate_sale_payment_totals(uuid) to authenticated, service_role;
grant execute on function public.complete_sale(uuid) to authenticated, service_role;
grant execute on function public.cancel_completed_sale(uuid, text) to authenticated, service_role;

alter table public.payment_methods enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.pos_session_events enable row level security;

drop policy if exists "payment_methods_select_team" on public.payment_methods;
drop policy if exists "payment_methods_write_admin" on public.payment_methods;
drop policy if exists "payment_methods_service_role_all" on public.payment_methods;

create policy "payment_methods_select_team"
on public.payment_methods
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception' or is_active);

create policy "payment_methods_write_admin"
on public.payment_methods
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "payment_methods_service_role_all"
on public.payment_methods
for all
to service_role
using (true)
with check (true);

drop policy if exists "pos_sessions_select_branch_scope" on public.pos_sessions;
drop policy if exists "pos_sessions_manage_branch_scope" on public.pos_sessions;
drop policy if exists "pos_sessions_service_role_all" on public.pos_sessions;

create policy "pos_sessions_select_branch_scope"
on public.pos_sessions
for select
to authenticated
using (public.can_view_pos_branch(branch_id));

create policy "pos_sessions_manage_branch_scope"
on public.pos_sessions
for all
to authenticated
using (public.can_manage_pos_branch(branch_id))
with check (public.can_manage_pos_branch(branch_id));

create policy "pos_sessions_service_role_all"
on public.pos_sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists "sales_select_branch_scope" on public.sales;
drop policy if exists "sales_manage_branch_scope" on public.sales;
drop policy if exists "sales_service_role_all" on public.sales;

create policy "sales_select_branch_scope"
on public.sales
for select
to authenticated
using (public.can_manage_pos_branch(branch_id));

create policy "sales_manage_branch_scope"
on public.sales
for all
to authenticated
using (public.can_manage_pos_branch(branch_id))
with check (public.can_manage_pos_branch(branch_id));

create policy "sales_service_role_all"
on public.sales
for all
to service_role
using (true)
with check (true);

drop policy if exists "sale_items_select_branch_scope" on public.sale_items;
drop policy if exists "sale_items_manage_branch_scope" on public.sale_items;
drop policy if exists "sale_items_service_role_all" on public.sale_items;

create policy "sale_items_select_branch_scope"
on public.sale_items
for select
to authenticated
using (public.can_view_sale(sale_id));

create policy "sale_items_manage_branch_scope"
on public.sale_items
for all
to authenticated
using (public.can_view_sale(sale_id))
with check (public.can_view_sale(sale_id));

create policy "sale_items_service_role_all"
on public.sale_items
for all
to service_role
using (true)
with check (true);

drop policy if exists "sale_payments_select_branch_scope" on public.sale_payments;
drop policy if exists "sale_payments_manage_branch_scope" on public.sale_payments;
drop policy if exists "sale_payments_service_role_all" on public.sale_payments;

create policy "sale_payments_select_branch_scope"
on public.sale_payments
for select
to authenticated
using (public.can_view_sale(sale_id));

create policy "sale_payments_manage_branch_scope"
on public.sale_payments
for all
to authenticated
using (public.can_view_sale(sale_id))
with check (public.can_view_sale(sale_id));

create policy "sale_payments_service_role_all"
on public.sale_payments
for all
to service_role
using (true)
with check (true);

drop policy if exists "pos_session_events_select_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_manage_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_service_role_all" on public.pos_session_events;

-- Policy historica omitida: pos_session_events_select_branch_scope. La definicion final se conserva mas adelante.

-- Policy historica omitida: pos_session_events_manage_branch_scope. La definicion final se conserva mas adelante.

create policy "pos_session_events_service_role_all"
on public.pos_session_events
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.payment_methods to authenticated;
grant select, insert, update, delete on public.pos_sessions to authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update, delete on public.sale_items to authenticated;
grant select, insert, update, delete on public.sale_payments to authenticated;
grant select, insert, update, delete on public.pos_session_events to authenticated;

grant all on public.payment_methods to service_role;
grant all on public.pos_sessions to service_role;
grant all on public.sales to service_role;
grant all on public.sale_items to service_role;
grant all on public.sale_payments to service_role;
grant all on public.pos_session_events to service_role;

revoke all on public.payment_methods from public;
revoke all on public.pos_sessions from public;
revoke all on public.sales from public;
revoke all on public.sale_items from public;
revoke all on public.sale_payments from public;
revoke all on public.pos_session_events from public;

insert into public.payment_methods (code, name, description, sort_order, is_active)
values
  ('cash', 'Efectivo', 'Cobro en efectivo.', 1, true),
  ('wallet_qr', 'QR billetera', 'Cobro con billetera digital o QR.', 2, true),
  ('card_pos', 'POS tarjeta', 'Cobro con POS de tarjetas.', 3, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

do $$
declare
  v_customer_id uuid;
begin
  select c.id
  into v_customer_id
  from public.customers c
  where c.phone_normalized = '000000000'
     or lower(c.full_name) = 'cliente varios'
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      full_name,
      first_name,
      last_name,
      business_name,
      phone,
      phone_normalized,
      source,
      is_active
    )
    values (
      'Cliente varios',
      'Cliente',
      'varios',
      null,
      '000000000',
      '000000000',
      'system',
      true
    );
  else
    update public.customers
    set full_name = 'Cliente varios',
        first_name = 'Cliente',
        last_name = 'varios',
        phone = '000000000',
        phone_normalized = '000000000',
        source = 'system',
        is_active = true
    where id = v_customer_id;
  end if;
end $$;

-- TODO: si la validacion de barbero por servicio se vuelve mas compleja,
-- mantener la verificacion principal tambien en backend durante el Sprint 5C.
-- TODO: en una fase posterior, registrar asientos de caja operativa separados
-- para anulaciones y ajustes fuera del flujo de venta.


-- ============================================================================
-- Fuente consolidada: 052_sales_cash_change_patch.sql
-- ============================================================================
alter table public.sale_payments
  add column if not exists tendered_amount numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0;

update public.sale_payments
set tendered_amount = amount
where tendered_amount is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_tendered_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_tendered_amount_check
      check (tendered_amount is null or tendered_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_change_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_change_amount_check
      check (change_amount >= 0);
  end if;
end $$;

create or replace function public.recalculate_sale_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_courtesy_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_change_amount numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(si.quantity * si.unit_price), 0),
    coalesce(sum(si.discount_amount), 0),
    coalesce(sum(case when si.is_courtesy then si.quantity * si.unit_price else 0 end), 0),
    coalesce(sum(si.total), 0)
  into
    v_subtotal,
    v_discount_total,
    v_courtesy_total,
    v_total
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(sum(sp.change_amount), 0)
  into v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_discount_total,
      courtesy_total = v_courtesy_total,
      total = v_total,
      change_amount = v_change_amount
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.recalculate_sale_payment_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_change_amount numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(sp.amount), 0),
    coalesce(sum(sp.change_amount), 0)
  into
    v_paid_total,
    v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set paid_total = v_paid_total,
      change_amount = v_change_amount
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
  v_change_amount numeric(12,2) := 0;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  select coalesce(sum(sp.change_amount), 0)
  into v_change_amount
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = v_change_amount,
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;


-- ============================================================================
-- Fuente consolidada: 060_operational_settings.sql
-- ============================================================================
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


-- ============================================================================
-- Fuente consolidada: 070_cash_operations.sql
-- ============================================================================
create table if not exists public.cash_movement_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  movement_direction text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_id uuid references public.cash_movement_categories(id) on delete set null,
  movement_type text not null,
  amount numeric(12,2) not null,
  description text not null,
  evidence_url text,
  status text not null default 'active',
  created_by uuid references public.employees(id) on delete set null,
  cancelled_by uuid references public.employees(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movement_categories_direction_check'
      and conrelid = 'public.cash_movement_categories'::regclass
  ) then
    alter table public.cash_movement_categories
      add constraint cash_movement_categories_direction_check
      check (movement_direction in ('income', 'expense', 'adjustment'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movement_categories_sort_order_check'
      and conrelid = 'public.cash_movement_categories'::regclass
  ) then
    alter table public.cash_movement_categories
      add constraint cash_movement_categories_sort_order_check
      check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_type_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_type_check
      check (movement_type in ('income', 'expense', 'adjustment'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_status_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_status_check
      check (status in ('active', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_amount_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_amount_check
      check (amount > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_description_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_description_check
      check (nullif(btrim(description), '') is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_cancelled_at_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_cancelled_at_check
      check (status <> 'cancelled' or cancelled_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_cancelled_reason_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_cancelled_reason_check
      check (status <> 'cancelled' or nullif(btrim(cancelled_reason), '') is not null);
  end if;
end $$;

create index if not exists cash_movement_categories_code_idx
  on public.cash_movement_categories (code);

create index if not exists cash_movements_pos_session_id_idx
  on public.cash_movements (pos_session_id);

create index if not exists cash_movements_branch_id_idx
  on public.cash_movements (branch_id);

create index if not exists cash_movements_status_idx
  on public.cash_movements (status);

create index if not exists cash_movements_created_at_desc_idx
  on public.cash_movements (created_at desc);

create index if not exists cash_movements_movement_type_idx
  on public.cash_movements (movement_type);

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

drop trigger if exists cash_movement_categories_set_updated_at on public.cash_movement_categories;
create trigger cash_movement_categories_set_updated_at
before update on public.cash_movement_categories
for each row execute function public.set_updated_at();

drop trigger if exists cash_movements_set_updated_at on public.cash_movements;
create trigger cash_movements_set_updated_at
before update on public.cash_movements
for each row execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pos_session_events_event_type_check'
      and conrelid = 'public.pos_session_events'::regclass
  ) then
    alter table public.pos_session_events
      drop constraint pos_session_events_event_type_check;
  end if;

  alter table public.pos_session_events
    add constraint pos_session_events_event_type_check
    check (
      event_type in (
        'opened',
        'closed',
        'reopened',
        'sale_completed',
        'sale_cancelled',
        'cash_movement_created',
        'cash_movement_cancelled',
        'note'
      )
    );
exception
  when duplicate_object then
    null;
end $$;

create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_total_sales numeric(12,2) := 0;
  v_total_cash numeric(12,2) := 0;
  v_total_wallet numeric(12,2) := 0;
  v_total_card numeric(12,2) := 0;
  v_total_cancelled numeric(12,2) := 0;
  v_sales_count integer := 0;
  v_cancelled_sales_count integer := 0;
  v_cash_income numeric(12,2) := 0;
  v_cash_expense numeric(12,2) := 0;
  v_cash_adjustment numeric(12,2) := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  select
    coalesce(sum(case when s.status = 'completed' then s.total else 0 end), 0),
    coalesce(sum(case when s.status = 'cancelled' then s.total else 0 end), 0),
    coalesce(count(*) filter (where s.status = 'completed'), 0),
    coalesce(count(*) filter (where s.status = 'cancelled'), 0)
  into
    v_total_sales,
    v_total_cancelled,
    v_sales_count,
    v_cancelled_sales_count
  from public.sales s
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(sp.amount) filter (where pm.code = 'cash' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'card_pos' and s.status = 'completed'), 0)
  into
    v_total_cash,
    v_total_wallet,
    v_total_card
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(case when cm.movement_type = 'income' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'expense' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'adjustment' then cm.amount else 0 end), 0)
  into
    v_cash_income,
    v_cash_expense,
    v_cash_adjustment
  from public.cash_movements cm
  where cm.pos_session_id = p_session_id
    and cm.status = 'active';

  update public.pos_sessions
  set total_sales_amount = v_total_sales,
      total_cash_amount = v_total_cash,
      total_wallet_qr_amount = v_total_wallet,
      total_card_pos_amount = v_total_card,
      total_cancelled_amount = v_total_cancelled,
      sales_count = v_sales_count,
      cancelled_sales_count = v_cancelled_sales_count,
      expected_cash_amount = coalesce(opening_cash_amount, 0)
        + v_total_cash
        + v_cash_income
        - v_cash_expense
        + v_cash_adjustment
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function public.create_cash_movement(
  p_pos_session_id uuid,
  p_category_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text,
  p_evidence_url text default null
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_category public.cash_movement_categories%rowtype;
  v_movement public.cash_movements%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_role public.app_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para registrar movimientos de caja.';
  end if;

  if p_movement_type not in ('income', 'expense', 'adjustment') then
    raise exception 'El tipo de movimiento no es valido.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'La descripcion es obligatoria.';
  end if;

  if p_category_id is null then
    raise exception 'Selecciona una categoria para continuar.';
  end if;

  select *
  into v_category
  from public.cash_movement_categories
  where id = p_category_id;

  if not found or not v_category.is_active then
    raise exception 'La categoria seleccionada no esta disponible.';
  end if;

  if v_category.movement_direction <> p_movement_type then
    raise exception 'La categoria no corresponde al tipo de movimiento seleccionado.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where id = p_pos_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_access_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para registrar movimientos en esta sede.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'No se pueden registrar movimientos en una sesion cerrada.';
  end if;

  insert into public.cash_movements (
    pos_session_id,
    branch_id,
    category_id,
    movement_type,
    amount,
    description,
    evidence_url,
    status,
    created_by
  )
  values (
    v_session.id,
    v_session.branch_id,
    v_category.id,
    p_movement_type,
    round(p_amount::numeric, 2),
    btrim(p_description),
    nullif(btrim(coalesce(p_evidence_url, '')), ''),
    'active',
    v_employee_id
  )
  returning *
  into v_movement;

  perform public.sync_pos_session_totals(v_session.id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'cash_movement_created',
    'Movimiento operativo de caja registrado.',
    jsonb_build_object(
      'cash_movement_id', v_movement.id,
      'movement_type', v_movement.movement_type,
      'amount', v_movement.amount,
      'category_id', v_movement.category_id
    )
  );

  return v_movement;
end;
$$;

create or replace function public.cancel_cash_movement(
  p_cash_movement_id uuid,
  p_cancelled_reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.cash_movements%rowtype;
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_role public.app_role := public.current_user_role();
begin
  if v_role is null or v_role not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para anular movimientos de caja.';
  end if;

  if nullif(btrim(coalesce(p_cancelled_reason, '')), '') is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  select *
  into v_movement
  from public.cash_movements
  where id = p_cash_movement_id
  for update;

  if not found then
    raise exception 'El movimiento de caja no existe.';
  end if;

  if not public.can_access_branch(v_movement.branch_id) then
    raise exception 'No tienes permisos para anular este movimiento.';
  end if;

  if v_movement.status <> 'active' then
    raise exception 'El movimiento ya fue anulado.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where id = v_movement.pos_session_id
  for update;

  if not found then
    raise exception 'La sesion POS vinculada no existe.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'No se puede anular un movimiento de una sesion cerrada.';
  end if;

  update public.cash_movements
  set status = 'cancelled',
      cancelled_by = v_employee_id,
      cancelled_reason = btrim(p_cancelled_reason),
      cancelled_at = now()
  where id = p_cash_movement_id
  returning *
  into v_movement;

  perform public.sync_pos_session_totals(v_session.id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'cash_movement_cancelled',
    'Movimiento operativo de caja anulado.',
    jsonb_build_object(
      'cash_movement_id', v_movement.id,
      'movement_type', v_movement.movement_type,
      'amount', v_movement.amount
    )
  );

  return v_movement;
end;
$$;

revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.create_cash_movement(uuid, uuid, text, numeric, text, text) from public;
revoke all on function public.cancel_cash_movement(uuid, text) from public;

grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.create_cash_movement(uuid, uuid, text, numeric, text, text) to authenticated, service_role;
grant execute on function public.cancel_cash_movement(uuid, text) to authenticated, service_role;

alter table public.cash_movement_categories enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "cash_movement_categories_select_scope" on public.cash_movement_categories;
drop policy if exists "cash_movement_categories_manage_admin" on public.cash_movement_categories;
drop policy if exists "cash_movement_categories_service_role_all" on public.cash_movement_categories;

create policy "cash_movement_categories_select_scope"
on public.cash_movement_categories
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "cash_movement_categories_manage_admin"
on public.cash_movement_categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "cash_movement_categories_service_role_all"
on public.cash_movement_categories
for all
to service_role
using (true)
with check (true);

drop policy if exists "cash_movements_select_scope" on public.cash_movements;
drop policy if exists "cash_movements_insert_scope" on public.cash_movements;
drop policy if exists "cash_movements_update_scope" on public.cash_movements;
drop policy if exists "cash_movements_service_role_all" on public.cash_movements;

-- Policy historica omitida: cash_movements_select_scope. La definicion final se conserva mas adelante.

create policy "cash_movements_insert_scope"
on public.cash_movements
for insert
to authenticated
with check (
  (public.is_admin() or public.current_user_role() = 'reception')
  and public.can_access_branch(branch_id)
  and exists (
    select 1
    from public.pos_sessions ps
    where ps.id = pos_session_id
      and ps.branch_id = cash_movements.branch_id
      and ps.status = 'open'
  )
);

-- Policy historica omitida: cash_movements_update_scope. La definicion final se conserva mas adelante.

create policy "cash_movements_service_role_all"
on public.cash_movements
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.cash_movement_categories to authenticated;
grant select, insert, update on public.cash_movements to authenticated;

grant all on public.cash_movement_categories to service_role;
grant all on public.cash_movements to service_role;

revoke all on public.cash_movement_categories from public;
revoke all on public.cash_movements from public;

insert into public.cash_movement_categories (
  code,
  name,
  description,
  movement_direction,
  sort_order,
  is_active
)
values
  ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
  ('operational_expense', 'Egreso operativo', 'Egreso manual fuera de ventas.', 'expense', 2, true),
  ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 3, true),
  ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 4, true),
  ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

-- TODO: si se necesita un ajuste que reste sin usar "egreso", agregar un campo explicito de signo u operacion en caja.


-- ============================================================================
-- Fuente consolidada: 080_rewards.sql
-- ============================================================================
create table if not exists public.reward_benefits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  benefit_type text not null,
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  voucher_amount numeric(12,2),
  discount_percent numeric(5,2),
  applies_to text not null default 'all',
  max_discount_amount numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  metric_type text not null,
  threshold_value numeric(12,2) not null,
  benefit_id uuid references public.reward_benefits(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  applies_to text not null default 'global',
  starts_at timestamptz,
  ends_at timestamptz,
  expires_days integer,
  is_repeatable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reward_rules
  add column if not exists service_id uuid references public.services(id) on delete set null;

create table if not exists public.customer_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  rule_id uuid references public.reward_rules(id) on delete set null,
  movement_type text not null,
  metric_type text not null,
  quantity numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  rule_id uuid references public.reward_rules(id) on delete set null,
  benefit_id uuid not null references public.reward_benefits(id) on delete restrict,
  source_ledger_id uuid references public.customer_reward_ledger(id) on delete set null,
  status text not null default 'available',
  earned_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_sale_id uuid references public.sales(id) on delete set null,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  entitlement_id uuid not null references public.customer_reward_entitlements(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  benefit_id uuid not null references public.reward_benefits(id) on delete restrict,
  discount_amount numeric(12,2) not null default 0,
  status text not null default 'applied',
  applied_by uuid references public.employees(id) on delete set null,
  applied_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_metric_type_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_metric_type_check
      check (
        metric_type in (
          'service_visit_count',
          'sale_count',
          'product_purchase_count',
          'amount_spent',
          'specific_service_count'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_applies_to_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_applies_to_check
      check (
        applies_to in (
          'global',
          'products_only',
          'services_only',
          'specific_service',
          'specific_product'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_threshold_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_threshold_check
      check (threshold_value > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_expires_days_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_expires_days_check
      check (expires_days is null or expires_days >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_rules_specific_service_check'
      and conrelid = 'public.reward_rules'::regclass
  ) then
    alter table public.reward_rules
      add constraint reward_rules_specific_service_check
      check (
        (
          metric_type <> 'specific_service_count'
          and applies_to <> 'specific_service'
        )
        or service_id is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_type_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_type_check
      check (
        benefit_type in (
          'free_service',
          'voucher_amount',
          'product_discount_percent'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_applies_to_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_applies_to_check
      check (
        applies_to in (
          'all',
          'products_only',
          'services_only',
          'specific_service',
          'specific_product'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_amounts_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_amounts_check
      check (
        (voucher_amount is null or voucher_amount >= 0)
        and (discount_percent is null or (discount_percent > 0 and discount_percent <= 100))
        and (max_discount_amount is null or max_discount_amount >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_benefits_logic_check'
      and conrelid = 'public.reward_benefits'::regclass
  ) then
    alter table public.reward_benefits
      add constraint reward_benefits_logic_check
      check (
        (benefit_type = 'free_service' and service_id is not null)
        or (benefit_type = 'voucher_amount' and voucher_amount is not null and voucher_amount > 0)
        or (
          benefit_type = 'product_discount_percent'
          and discount_percent is not null
          and discount_percent > 0
          and discount_percent <= 100
          and applies_to in ('products_only', 'specific_product')
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_ledger_movement_type_check'
      and conrelid = 'public.customer_reward_ledger'::regclass
  ) then
    alter table public.customer_reward_ledger
      add constraint customer_reward_ledger_movement_type_check
      check (
        movement_type in (
          'accrual',
          'reversal',
          'manual_migration',
          'manual_adjustment'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_ledger_metric_type_check'
      and conrelid = 'public.customer_reward_ledger'::regclass
  ) then
    alter table public.customer_reward_ledger
      add constraint customer_reward_ledger_metric_type_check
      check (
        metric_type in (
          'service_visit_count',
          'sale_count',
          'product_purchase_count',
          'amount_spent',
          'specific_service_count'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_reward_entitlements_status_check'
      and conrelid = 'public.customer_reward_entitlements'::regclass
  ) then
    alter table public.customer_reward_entitlements
      add constraint customer_reward_entitlements_status_check
      check (status in ('available', 'redeemed', 'expired', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_redemptions_status_check'
      and conrelid = 'public.reward_redemptions'::regclass
  ) then
    alter table public.reward_redemptions
      add constraint reward_redemptions_status_check
      check (status in ('applied', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_redemptions_discount_amount_check'
      and conrelid = 'public.reward_redemptions'::regclass
  ) then
    alter table public.reward_redemptions
      add constraint reward_redemptions_discount_amount_check
      check (discount_amount >= 0);
  end if;
end $$;

create index if not exists customer_reward_ledger_customer_created_at_desc_idx
  on public.customer_reward_ledger (customer_id, created_at desc);
create index if not exists customer_reward_ledger_sale_id_idx
  on public.customer_reward_ledger (sale_id);
create index if not exists customer_reward_entitlements_customer_status_idx
  on public.customer_reward_entitlements (customer_id, status);
create index if not exists customer_reward_entitlements_expires_at_idx
  on public.customer_reward_entitlements (expires_at);
create index if not exists reward_redemptions_customer_id_idx
  on public.reward_redemptions (customer_id);
create index if not exists reward_redemptions_sale_id_idx
  on public.reward_redemptions (sale_id);
create unique index if not exists reward_redemptions_one_applied_per_sale_idx
  on public.reward_redemptions (sale_id)
  where status = 'applied';
create index if not exists reward_rules_is_active_idx
  on public.reward_rules (is_active);
create index if not exists reward_benefits_is_active_idx
  on public.reward_benefits (is_active);

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

drop trigger if exists reward_rules_set_updated_at on public.reward_rules;
create trigger reward_rules_set_updated_at
before update on public.reward_rules
for each row execute function public.set_updated_at();

drop trigger if exists reward_benefits_set_updated_at on public.reward_benefits;
create trigger reward_benefits_set_updated_at
before update on public.reward_benefits
for each row execute function public.set_updated_at();

drop trigger if exists customer_reward_entitlements_set_updated_at on public.customer_reward_entitlements;
create trigger customer_reward_entitlements_set_updated_at
before update on public.customer_reward_entitlements
for each row execute function public.set_updated_at();

create or replace function public.mark_expired_reward_entitlements(
  p_customer_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.customer_reward_entitlements
  set status = 'expired',
      updated_at = now()
  where status = 'available'
    and expires_at is not null
    and expires_at < now()
    and (p_customer_id is null or customer_id = p_customer_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.is_rewards_customer_eligible(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and coalesce(c.phone_normalized, '') <> '000000000'
      and lower(coalesce(c.full_name, '')) <> 'cliente varios'
  )
$$;

drop function if exists public.get_reward_metric_total(uuid, text);

create or replace function public.get_reward_metric_total(
  p_customer_id uuid,
  p_metric_type text,
  p_service_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    sum(
      case
        when p_metric_type = 'amount_spent' then amount
        else quantity
      end
    ),
    0
  )
  from public.customer_reward_ledger
  where customer_id = p_customer_id
    and metric_type = p_metric_type
    and (
      p_metric_type <> 'specific_service_count'
      or (
        p_service_id is not null
        and coalesce(metadata ->> 'service_id', '') = p_service_id::text
      )
    )
$$;

create or replace function public.recalculate_customer_rewards(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.reward_rules%rowtype;
  v_total numeric(12,2);
  v_should_have integer := 0;
  v_existing_count integer := 0;
  v_missing_count integer := 0;
  v_created integer := 0;
  v_expires_at timestamptz;
  v_source_ledger_id uuid;
begin
  if not public.is_rewards_customer_eligible(p_customer_id) then
    return 0;
  end if;

  perform public.mark_expired_reward_entitlements(p_customer_id);

  for v_rule in
    select rr.*
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rr.benefit_id is not null
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
  loop
    v_total := public.get_reward_metric_total(
      p_customer_id,
      v_rule.metric_type,
      v_rule.service_id
    );

    if v_rule.is_repeatable then
      v_should_have := floor(v_total / v_rule.threshold_value);
    else
      v_should_have := case when v_total >= v_rule.threshold_value then 1 else 0 end;
    end if;

    select count(*)
    into v_existing_count
    from public.customer_reward_entitlements cre
    where cre.customer_id = p_customer_id
      and cre.rule_id = v_rule.id
      and cre.status <> 'cancelled';

    v_missing_count := greatest(v_should_have - v_existing_count, 0);

    if v_missing_count <= 0 then
      continue;
    end if;

    select l.id
    into v_source_ledger_id
    from public.customer_reward_ledger l
    where l.customer_id = p_customer_id
      and l.metric_type = v_rule.metric_type
      and (
        v_rule.metric_type <> 'specific_service_count'
        or coalesce(l.metadata ->> 'service_id', '') = v_rule.service_id::text
      )
    order by l.created_at desc, l.id desc
    limit 1;

    for i in 1..v_missing_count loop
      v_expires_at := case
        when v_rule.expires_days is null then null
        else now() + make_interval(days => v_rule.expires_days)
      end;

      insert into public.customer_reward_entitlements (
        customer_id,
        rule_id,
        benefit_id,
        source_ledger_id,
        status,
        earned_at,
        expires_at,
        notes
      )
      values (
        p_customer_id,
        v_rule.id,
        v_rule.benefit_id,
        v_source_ledger_id,
        'available',
        now(),
        v_expires_at,
        'Reward recalculado automaticamente.'
      );

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

create or replace function public.issue_reward_entitlements_for_metric(
  p_customer_id uuid,
  p_metric_type text,
  p_delta_value numeric,
  p_source_ledger_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.reward_rules%rowtype;
  v_total numeric(12,2);
  v_previous_total numeric(12,2);
  v_earned_count integer;
  v_created integer := 0;
  v_expires_at timestamptz;
begin
  if coalesce(p_delta_value, 0) <= 0 then
    return 0;
  end if;

  if not public.is_rewards_customer_eligible(p_customer_id) then
    return 0;
  end if;

  perform public.mark_expired_reward_entitlements(p_customer_id);

  v_total := public.get_reward_metric_total(p_customer_id, p_metric_type, null);
  v_previous_total := greatest(v_total - p_delta_value, 0);

  for v_rule in
    select rr.*
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.metric_type = p_metric_type
      and rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
  loop
    if v_rule.is_repeatable then
      v_earned_count :=
        floor(v_total / v_rule.threshold_value)
        - floor(v_previous_total / v_rule.threshold_value);
    else
      if exists (
        select 1
        from public.customer_reward_entitlements cre
        where cre.customer_id = p_customer_id
          and cre.rule_id = v_rule.id
      ) then
        v_earned_count := 0;
      elsif v_previous_total < v_rule.threshold_value and v_total >= v_rule.threshold_value then
        v_earned_count := 1;
      else
        v_earned_count := 0;
      end if;
    end if;

    if v_earned_count <= 0 then
      continue;
    end if;

    for i in 1..v_earned_count loop
      v_expires_at := case
        when v_rule.expires_days is null then null
        else now() + make_interval(days => v_rule.expires_days)
      end;

      insert into public.customer_reward_entitlements (
        customer_id,
        rule_id,
        benefit_id,
        source_ledger_id,
        status,
        earned_at,
        expires_at,
        notes
      )
      values (
        p_customer_id,
        v_rule.id,
        v_rule.benefit_id,
        p_source_ledger_id,
        'available',
        now(),
        v_expires_at,
        'Reward generado automaticamente.'
      );

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

create or replace function public.process_rewards_for_completed_sale(p_sale_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_service_count integer := 0;
  v_product_count integer := 0;
  v_ledger_id uuid;
  v_created integer := 0;
  v_service_row record;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id;

  if not found or v_sale.status <> 'completed' then
    return 0;
  end if;

  if not public.is_rewards_customer_eligible(v_sale.customer_id) then
    return 0;
  end if;

  select count(*)
  into v_service_count
  from public.sale_items
  where sale_id = p_sale_id
    and item_type = 'service';

  select count(*)
  into v_product_count
  from public.sale_items
  where sale_id = p_sale_id
    and item_type = 'product';

  if v_service_count > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'service_visit_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'service_visit_count',
      1,
      0,
      'Acumulacion por atencion con servicio.',
      jsonb_build_object('service_count', v_service_count),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  for v_service_row in
    select
      si.service_id,
      sum(si.quantity) as total_quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.item_type = 'service'
      and si.service_id is not null
    group by si.service_id
  loop
    if exists (
      select 1
      from public.customer_reward_ledger
      where sale_id = p_sale_id
        and movement_type = 'accrual'
        and metric_type = 'specific_service_count'
        and coalesce(metadata ->> 'service_id', '') = v_service_row.service_id::text
    ) then
      continue;
    end if;

    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'specific_service_count',
      coalesce(v_service_row.total_quantity, 0),
      0,
      'Acumulacion por atenciones de un servicio especifico.',
      jsonb_build_object('service_id', v_service_row.service_id),
      v_employee_id
    );
  end loop;

  if not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'sale_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'sale_count',
      1,
      0,
      'Acumulacion por venta completada.',
      jsonb_build_object('has_services', v_service_count > 0, 'has_products', v_product_count > 0),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  if v_product_count > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'product_purchase_count'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'product_purchase_count',
      1,
      0,
      'Acumulacion por compra con productos.',
      jsonb_build_object('product_count', v_product_count),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  if coalesce(v_sale.total, 0) > 0 and not exists (
    select 1
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
      and metric_type = 'amount_spent'
  ) then
    insert into public.customer_reward_ledger (
      customer_id,
      sale_id,
      movement_type,
      metric_type,
      quantity,
      amount,
      description,
      metadata,
      created_by
    )
    values (
      v_sale.customer_id,
      p_sale_id,
      'accrual',
      'amount_spent',
      0,
      v_sale.total,
      'Acumulacion por monto gastado.',
      jsonb_build_object('sale_total', v_sale.total),
      v_employee_id
    )
    returning id into v_ledger_id;

  end if;

  v_created := v_created + public.recalculate_customer_rewards(v_sale.customer_id);

  return v_created;
end;
$$;

create or replace function public.reverse_rewards_for_cancelled_sale(p_sale_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_row record;
  v_count integer := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id;

  if not found then
    return 0;
  end if;

  for v_row in
    select *
    from public.customer_reward_ledger
    where sale_id = p_sale_id
      and movement_type = 'accrual'
  loop
    if not exists (
      select 1
      from public.customer_reward_ledger rl
      where rl.sale_id = p_sale_id
        and rl.movement_type = 'reversal'
        and rl.metric_type = v_row.metric_type
        and rl.metadata ->> 'reverses_ledger_id' = v_row.id::text
    ) then
      insert into public.customer_reward_ledger (
        customer_id,
        sale_id,
        rule_id,
        movement_type,
        metric_type,
        quantity,
        amount,
        description,
        metadata,
        created_by
      )
      values (
        v_row.customer_id,
        p_sale_id,
        v_row.rule_id,
        'reversal',
        v_row.metric_type,
        -1 * coalesce(v_row.quantity, 0),
        -1 * coalesce(v_row.amount, 0),
        'Reversion por anulacion de venta.',
        jsonb_build_object('reverses_ledger_id', v_row.id),
        v_employee_id
      );

      v_count := v_count + 1;
    end if;
  end loop;

  update public.customer_reward_entitlements
  set status = 'cancelled',
      cancelled_at = now(),
      notes = coalesce(notes, '') || case when notes is null then '' else ' ' end || 'Cancelado por anulacion de venta.',
      updated_at = now()
  where source_ledger_id in (
      select id
      from public.customer_reward_ledger
      where sale_id = p_sale_id
        and movement_type = 'accrual'
    )
    and status = 'available';

  update public.reward_redemptions
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'Venta anulada'
  where sale_id = p_sale_id
    and status = 'applied';

  update public.customer_reward_entitlements
  set status = case
        when expires_at is not null and expires_at < now() then 'expired'
        else 'available'
      end,
      redeemed_at = null,
      redeemed_sale_id = null,
      updated_at = now()
  where id in (
      select entitlement_id
      from public.reward_redemptions
      where sale_id = p_sale_id
    )
    and status = 'redeemed';

  return v_count;
end;
$$;

create or replace function public.apply_reward_to_sale(
  p_sale_id uuid,
  p_entitlement_id uuid
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_entitlement public.customer_reward_entitlements%rowtype;
  v_benefit public.reward_benefits%rowtype;
  v_discount_remaining numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_item record;
  v_item_total numeric(12,2);
  v_available numeric(12,2);
  v_extra numeric(12,2);
  v_has_eligible boolean := false;
  v_employee_id uuid := public.current_employee_id();
begin
  perform public.mark_expired_reward_entitlements(null);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo se puede aplicar rewards a una venta en borrador.';
  end if;

  if not public.is_rewards_customer_eligible(v_sale.customer_id) then
    raise exception 'Cliente varios no puede usar rewards.';
  end if;

  if exists (
    select 1
    from public.reward_redemptions rr
    where rr.sale_id = p_sale_id
      and rr.status = 'applied'
  ) then
    raise exception 'La venta ya tiene un reward aplicado.';
  end if;

  select *
  into v_entitlement
  from public.customer_reward_entitlements
  where id = p_entitlement_id
  for update;

  if not found then
    raise exception 'El reward seleccionado no existe.';
  end if;

  if v_entitlement.customer_id <> v_sale.customer_id then
    raise exception 'El reward no pertenece al cliente seleccionado.';
  end if;

  if v_entitlement.status <> 'available' then
    raise exception 'El reward ya no esta disponible.';
  end if;

  if v_entitlement.expires_at is not null and v_entitlement.expires_at < now() then
    update public.customer_reward_entitlements
    set status = 'expired',
        updated_at = now()
    where id = v_entitlement.id;

    raise exception 'El reward seleccionado ya vencio.';
  end if;

  select *
  into v_benefit
  from public.reward_benefits
  where id = v_entitlement.benefit_id;

  if not found or not v_benefit.is_active then
    raise exception 'El beneficio asociado ya no esta disponible.';
  end if;

  if v_benefit.benefit_type = 'voucher_amount' then
    v_discount_remaining := coalesce(v_benefit.voucher_amount, 0);
  elsif v_benefit.benefit_type = 'free_service' then
    v_discount_remaining := 999999;
  else
    v_discount_remaining := coalesce(v_benefit.max_discount_amount, 999999);
  end if;

  for v_item in
    select *
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.is_courtesy = false
    order by si.created_at, si.id
  loop
    if v_benefit.benefit_type = 'free_service' then
      if v_item.item_type <> 'service' or v_item.service_id is distinct from v_benefit.service_id then
        continue;
      end if;
    elsif v_benefit.benefit_type = 'product_discount_percent' then
      if v_item.item_type <> 'product' then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_product'
         and v_item.product_id is distinct from v_benefit.product_id then
        continue;
      end if;
    else
      if v_benefit.applies_to = 'products_only' and v_item.item_type <> 'product' then
        continue;
      end if;

      if v_benefit.applies_to = 'services_only' and v_item.item_type <> 'service' then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_service'
         and v_item.service_id is distinct from v_benefit.service_id then
        continue;
      end if;

      if v_benefit.applies_to = 'specific_product'
         and v_item.product_id is distinct from v_benefit.product_id then
        continue;
      end if;
    end if;

    v_has_eligible := true;
    v_item_total := round(v_item.quantity * v_item.unit_price, 2);
    v_available := greatest(v_item_total - coalesce(v_item.discount_amount, 0), 0);

    if v_available <= 0 then
      continue;
    end if;

    if v_benefit.benefit_type = 'free_service' then
      v_extra := least(v_item.unit_price, v_available, v_discount_remaining);
    elsif v_benefit.benefit_type = 'voucher_amount' then
      v_extra := least(v_available, v_discount_remaining);
    else
      v_extra := least(
        round(v_item_total * coalesce(v_benefit.discount_percent, 0) / 100.0, 2),
        v_available,
        v_discount_remaining
      );
    end if;

    if v_extra <= 0 then
      continue;
    end if;

    update public.sale_items
    set discount_amount = coalesce(discount_amount, 0) + v_extra,
        total = greatest((quantity * unit_price) - (coalesce(discount_amount, 0) + v_extra), 0)
    where id = v_item.id;

    v_discount_total := v_discount_total + v_extra;
    v_discount_remaining := greatest(v_discount_remaining - v_extra, 0);

    if v_benefit.benefit_type in ('free_service', 'voucher_amount') and v_discount_remaining <= 0 then
      exit;
    end if;
  end loop;

  if not v_has_eligible or v_discount_total <= 0 then
    raise exception 'Este reward no aplica a los items actuales de la venta.';
  end if;

  v_sale := public.recalculate_sale_totals(p_sale_id);

  insert into public.reward_redemptions (
    customer_id,
    entitlement_id,
    sale_id,
    benefit_id,
    discount_amount,
    status,
    applied_by,
    metadata
  )
  values (
    v_sale.customer_id,
    v_entitlement.id,
    v_sale.id,
    v_benefit.id,
    v_discount_total,
    'applied',
    v_employee_id,
    jsonb_build_object(
      'benefit_type', v_benefit.benefit_type,
      'applies_to', v_benefit.applies_to
    )
  );

  update public.customer_reward_entitlements
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_sale_id = v_sale.id,
      updated_at = now()
  where id = v_entitlement.id;

  return v_sale;
end;
$$;

drop function if exists public.register_reward_card_migration(uuid, numeric, text);

create or replace function public.register_reward_card_migration(
  p_customer_id uuid,
  p_stickers numeric,
  p_note text,
  p_service_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_ledger_id uuid;
  v_created integer := 0;
begin
  if not public.is_rewards_customer_eligible(p_customer_id) then
    raise exception 'Cliente varios no puede migrar rewards.';
  end if;

  if coalesce(public.current_user_role(), 'viewer') not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para registrar migraciones de rewards.';
  end if;

  if coalesce(p_stickers, 0) <= 0 then
    raise exception 'La cantidad de stickers debe ser mayor a cero.';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Debes registrar una nota para la migracion.';
  end if;

  insert into public.customer_reward_ledger (
    customer_id,
    movement_type,
    metric_type,
    quantity,
    amount,
    description,
    metadata,
    created_by
  )
  values (
    p_customer_id,
    'manual_migration',
    case
      when p_service_id is null then 'service_visit_count'
      else 'specific_service_count'
    end,
    p_stickers,
    0,
    case
      when p_service_id is null then 'Migracion de tarjeta fisica con stickers generales.'
      else 'Migracion de tarjeta fisica con stickers de un servicio especifico.'
    end,
    jsonb_build_object('note', p_note, 'service_id', p_service_id),
    v_employee_id
  )
  returning id into v_ledger_id;

  v_created := public.recalculate_customer_rewards(p_customer_id);

  return v_created;
end;
$$;

create or replace view public.vw_customer_rewards_summary
with (security_invoker = true) as
select
  c.id as customer_id,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'service_visit_count'
  ), 0) as total_service_visits,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'sale_count'
  ), 0) as total_sales_count,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'product_purchase_count'
  ), 0) as total_product_purchases,
  coalesce((
    select sum(l.amount)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'amount_spent'
  ), 0) as total_amount_spent,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'available'
      and (e.expires_at is null or e.expires_at >= now())
  ), 0) as available_rewards_count,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'redeemed'
  ), 0) as redeemed_rewards_count,
  (
    select rb.name
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end
      ) > 0
    order by
      case
        when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
          select sum(l.amount)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'amount_spent'
        ), 0)
        when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'specific_service_count'
            and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
        ), 0)
        else rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = rr.metric_type
        ), 0)
      end asc,
      rr.created_at asc
    limit 1
  ) as next_reward_name,
  (
    select least(
      greatest(
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end,
        0
      ),
      rr.threshold_value
    )
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        case
          when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
            select sum(l.amount)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'amount_spent'
          ), 0)
          when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = 'specific_service_count'
              and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
          ), 0)
          else rr.threshold_value - coalesce((
            select sum(l.quantity)
            from public.customer_reward_ledger l
            where l.customer_id = c.id
              and l.metric_type = rr.metric_type
          ), 0)
        end
      ) > 0
    order by
      case
        when rr.metric_type = 'amount_spent' then rr.threshold_value - coalesce((
          select sum(l.amount)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'amount_spent'
        ), 0)
        when rr.metric_type = 'specific_service_count' then rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = 'specific_service_count'
            and coalesce(l.metadata ->> 'service_id', '') = rr.service_id::text
        ), 0)
        else rr.threshold_value - coalesce((
          select sum(l.quantity)
          from public.customer_reward_ledger l
          where l.customer_id = c.id
            and l.metric_type = rr.metric_type
        ), 0)
      end asc,
      rr.created_at asc
    limit 1
  ) as next_reward_remaining
from public.customers c;

alter table public.reward_rules enable row level security;
alter table public.reward_benefits enable row level security;
alter table public.customer_reward_ledger enable row level security;
alter table public.customer_reward_entitlements enable row level security;
alter table public.reward_redemptions enable row level security;

drop policy if exists "reward_rules_select_scope" on public.reward_rules;
drop policy if exists "reward_rules_manage_admin" on public.reward_rules;
drop policy if exists "reward_rules_service_role_all" on public.reward_rules;

create policy "reward_rules_select_scope"
on public.reward_rules
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "reward_rules_manage_admin"
on public.reward_rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reward_rules_service_role_all"
on public.reward_rules
for all
to service_role
using (true)
with check (true);

drop policy if exists "reward_benefits_select_scope" on public.reward_benefits;
drop policy if exists "reward_benefits_manage_admin" on public.reward_benefits;
drop policy if exists "reward_benefits_service_role_all" on public.reward_benefits;

create policy "reward_benefits_select_scope"
on public.reward_benefits
for select
to authenticated
using (
  public.is_admin()
  or (public.current_user_role() = 'reception' and is_active)
);

create policy "reward_benefits_manage_admin"
on public.reward_benefits
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "reward_benefits_service_role_all"
on public.reward_benefits
for all
to service_role
using (true)
with check (true);

drop policy if exists "customer_reward_ledger_select_scope" on public.customer_reward_ledger;
drop policy if exists "customer_reward_ledger_insert_scope" on public.customer_reward_ledger;
drop policy if exists "customer_reward_ledger_service_role_all" on public.customer_reward_ledger;

create policy "customer_reward_ledger_select_scope"
on public.customer_reward_ledger
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "customer_reward_ledger_insert_scope"
on public.customer_reward_ledger
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and movement_type in ('manual_migration', 'manual_adjustment')
  )
);

create policy "customer_reward_ledger_service_role_all"
on public.customer_reward_ledger
for all
to service_role
using (true)
with check (true);

drop policy if exists "customer_reward_entitlements_select_scope" on public.customer_reward_entitlements;
drop policy if exists "customer_reward_entitlements_manage_admin" on public.customer_reward_entitlements;
drop policy if exists "customer_reward_entitlements_service_role_all" on public.customer_reward_entitlements;

create policy "customer_reward_entitlements_select_scope"
on public.customer_reward_entitlements
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "customer_reward_entitlements_manage_admin"
on public.customer_reward_entitlements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "customer_reward_entitlements_service_role_all"
on public.customer_reward_entitlements
for all
to service_role
using (true)
with check (true);

drop policy if exists "reward_redemptions_select_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_insert_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_update_scope" on public.reward_redemptions;
drop policy if exists "reward_redemptions_service_role_all" on public.reward_redemptions;

create policy "reward_redemptions_select_scope"
on public.reward_redemptions
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_insert_scope"
on public.reward_redemptions
for insert
to authenticated
with check (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_update_scope"
on public.reward_redemptions
for update
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception')
with check (public.is_admin() or public.current_user_role() = 'reception');

create policy "reward_redemptions_service_role_all"
on public.reward_redemptions
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.reward_rules to authenticated;
grant select, insert, update on public.reward_benefits to authenticated;
grant select, insert on public.customer_reward_ledger to authenticated;
grant select, update on public.customer_reward_entitlements to authenticated;
grant select, insert, update on public.reward_redemptions to authenticated;

grant all on public.reward_rules to service_role;
grant all on public.reward_benefits to service_role;
grant all on public.customer_reward_ledger to service_role;
grant all on public.customer_reward_entitlements to service_role;
grant all on public.reward_redemptions to service_role;

revoke all on public.reward_rules from public;
revoke all on public.reward_benefits from public;
revoke all on public.customer_reward_ledger from public;
revoke all on public.customer_reward_entitlements from public;
revoke all on public.reward_redemptions from public;

revoke all on function public.mark_expired_reward_entitlements(uuid) from public;
revoke all on function public.is_rewards_customer_eligible(uuid) from public;
revoke all on function public.get_reward_metric_total(uuid, text, uuid) from public;
revoke all on function public.issue_reward_entitlements_for_metric(uuid, text, numeric, uuid) from public;
revoke all on function public.process_rewards_for_completed_sale(uuid) from public;
revoke all on function public.reverse_rewards_for_cancelled_sale(uuid) from public;
revoke all on function public.apply_reward_to_sale(uuid, uuid) from public;
revoke all on function public.recalculate_customer_rewards(uuid) from public;
revoke all on function public.register_reward_card_migration(uuid, numeric, text, uuid) from public;

grant execute on function public.mark_expired_reward_entitlements(uuid) to authenticated, service_role;
grant execute on function public.is_rewards_customer_eligible(uuid) to authenticated, service_role;
grant execute on function public.get_reward_metric_total(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.issue_reward_entitlements_for_metric(uuid, text, numeric, uuid) to authenticated, service_role;
grant execute on function public.process_rewards_for_completed_sale(uuid) to authenticated, service_role;
grant execute on function public.reverse_rewards_for_cancelled_sale(uuid) to authenticated, service_role;
grant execute on function public.apply_reward_to_sale(uuid, uuid) to authenticated, service_role;
grant execute on function public.recalculate_customer_rewards(uuid) to authenticated, service_role;
grant execute on function public.register_reward_card_migration(uuid, numeric, text, uuid) to authenticated, service_role;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = greatest(paid_total - total, 0),
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.process_rewards_for_completed_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;

create or replace function public.cancel_completed_sale(
  p_sale_id uuid,
  p_reason text
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para anular esta venta.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.status = 'open'
  ) then
    raise exception 'Solo se puede anular una venta mientras la sesion POS este abierta.';
  end if;

  if v_reason is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    'adjustment',
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale_cancellation',
    v_sale.id,
    'Reversion de stock por anulacion de venta completada.',
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_by = v_employee_id,
      cancelled_at = now()
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'checked_in',
        completed_at = null,
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.reverse_rewards_for_cancelled_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_cancelled',
    'Venta anulada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'reason', v_reason
    )
  );

  return v_sale;
end;
$$;


-- ============================================================================
-- Fuente consolidada: 081_rewards_consumption_patch.sql
-- ============================================================================
-- Sprint 8.5
-- Ejecutar manualmente en Supabase SQL Editor.

create or replace function public.get_reward_issued_count(
  p_customer_id uuid,
  p_rule_id uuid
)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.customer_reward_entitlements cre
  where cre.customer_id = p_customer_id
    and cre.rule_id = p_rule_id
    and cre.status in ('available', 'redeemed', 'expired')
$$;

create or replace function public.get_reward_effective_balance(
  p_customer_id uuid,
  p_rule_id uuid,
  p_metric_type text,
  p_service_id uuid,
  p_threshold numeric
)
returns numeric
language sql
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    public.get_reward_metric_total(
      p_customer_id,
      p_metric_type,
      p_service_id
    ) - (public.get_reward_issued_count(p_customer_id, p_rule_id) * p_threshold),
    0
  )
$$;

create or replace function public.recalculate_customer_rewards(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.reward_rules%rowtype;
  v_total numeric(12,2);
  v_should_have integer := 0;
  v_existing_count integer := 0;
  v_missing_count integer := 0;
  v_created integer := 0;
  v_expires_at timestamptz;
  v_source_ledger_id uuid;
begin
  if not public.is_rewards_customer_eligible(p_customer_id) then
    return 0;
  end if;

  perform public.mark_expired_reward_entitlements(p_customer_id);

  for v_rule in
    select rr.*
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rr.benefit_id is not null
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
  loop
    v_total := public.get_reward_metric_total(
      p_customer_id,
      v_rule.metric_type,
      v_rule.service_id
    );

    if v_rule.is_repeatable then
      v_should_have := floor(v_total / v_rule.threshold_value);
    else
      v_should_have := case when v_total >= v_rule.threshold_value then 1 else 0 end;
    end if;

    v_existing_count := public.get_reward_issued_count(p_customer_id, v_rule.id);
    v_missing_count := greatest(v_should_have - v_existing_count, 0);

    if v_missing_count <= 0 then
      continue;
    end if;

    select l.id
    into v_source_ledger_id
    from public.customer_reward_ledger l
    where l.customer_id = p_customer_id
      and l.metric_type = v_rule.metric_type
      and (
        v_rule.metric_type <> 'specific_service_count'
        or coalesce(l.metadata ->> 'service_id', '') = v_rule.service_id::text
      )
    order by l.created_at desc, l.id desc
    limit 1;

    for i in 1..v_missing_count loop
      v_expires_at := case
        when v_rule.expires_days is null then null
        else now() + make_interval(days => v_rule.expires_days)
      end;

      insert into public.customer_reward_entitlements (
        customer_id,
        rule_id,
        benefit_id,
        source_ledger_id,
        status,
        earned_at,
        expires_at,
        notes
      )
      values (
        p_customer_id,
        v_rule.id,
        v_rule.benefit_id,
        v_source_ledger_id,
        'available',
        now(),
        v_expires_at,
        'Reward recalculado automaticamente.'
      );

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

create or replace view public.vw_customer_rewards_summary
with (security_invoker = true) as
select
  c.id as customer_id,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'service_visit_count'
  ), 0) as total_service_visits,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'sale_count'
  ), 0) as total_sales_count,
  coalesce((
    select sum(l.quantity)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'product_purchase_count'
  ), 0) as total_product_purchases,
  coalesce((
    select sum(l.amount)
    from public.customer_reward_ledger l
    where l.customer_id = c.id
      and l.metric_type = 'amount_spent'
  ), 0) as total_amount_spent,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'available'
      and (e.expires_at is null or e.expires_at >= now())
  ), 0) as available_rewards_count,
  coalesce((
    select count(*)
    from public.customer_reward_entitlements e
    where e.customer_id = c.id
      and e.status = 'redeemed'
  ), 0) as redeemed_rewards_count,
  (
    select rb.name
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) > 0
    order by
      (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) asc,
      rr.created_at asc
    limit 1
  ) as next_reward_name,
  (
    select least(
      greatest(
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        ),
        0
      ),
      rr.threshold_value
    )
    from public.reward_rules rr
    join public.reward_benefits rb on rb.id = rr.benefit_id
    where rr.is_active = true
      and rb.is_active = true
      and (rr.starts_at is null or rr.starts_at <= now())
      and (rr.ends_at is null or rr.ends_at >= now())
      and (
        rr.metric_type <> 'specific_service_count'
        or rr.service_id is not null
      )
      and (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) > 0
    order by
      (
        rr.threshold_value - public.get_reward_effective_balance(
          c.id,
          rr.id,
          rr.metric_type,
          rr.service_id,
          rr.threshold_value
        )
      ) asc,
      rr.created_at asc
    limit 1
  ) as next_reward_remaining
from public.customers c
where lower(trim(c.full_name)) <> 'cliente varios';


-- ============================================================================
-- Fuente consolidada: 082_products_custom_price_patch.sql
-- ============================================================================
-- Sprint 8.5
-- Ejecutar manualmente en Supabase SQL Editor.

alter table if exists public.products
  add column if not exists allow_custom_price boolean not null default false;


-- ============================================================================
-- Fuente consolidada: 083_services_custom_price_patch.sql
-- ============================================================================
alter table if exists public.services
  add column if not exists allow_custom_price boolean not null default false;


-- ============================================================================
-- Fuente consolidada: 085_pos_session_history_and_closure.sql
-- ============================================================================
-- Sprint 8.7: historial y cierre de sesiones POS por metodo de pago.
-- Ejecutar manualmente despues de 083_services_custom_price_patch.sql.

alter table public.pos_sessions
  add column if not exists expected_cash_amount numeric(12,2) not null default 0,
  add column if not exists counted_cash_amount numeric(12,2),
  add column if not exists cash_difference numeric(12,2),
  add column if not exists closing_notes text,
  add column if not exists closed_at timestamptz;

alter table public.pos_sessions
  drop constraint if exists pos_sessions_status_check;

alter table public.pos_sessions
  add constraint pos_sessions_status_check
  check (status in ('open', 'pending_close', 'closed', 'cancelled'));

drop index if exists public.pos_sessions_one_open_per_branch_idx;
create unique index if not exists pos_sessions_one_active_per_branch_idx
  on public.pos_sessions (branch_id)
  where status in ('open', 'pending_close');

create index if not exists pos_sessions_history_idx
  on public.pos_sessions (business_date desc, status, branch_id);

create table if not exists public.pos_session_payment_closures (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  expected_amount numeric(12,2) not null default 0,
  counted_amount numeric(12,2) not null default 0,
  difference_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pos_session_id, payment_method_id),
  check (expected_amount >= 0),
  check (counted_amount >= 0)
);

create index if not exists pos_session_payment_closures_session_idx
  on public.pos_session_payment_closures (pos_session_id);

alter table public.pos_session_payment_closures enable row level security;

drop policy if exists "pos_session_payment_closures_select_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_manage_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_service_role_all"
  on public.pos_session_payment_closures;

-- Policy historica omitida: pos_session_payment_closures_select_scope. La definicion final se conserva mas adelante.

create policy "pos_session_payment_closures_manage_scope"
on public.pos_session_payment_closures
for all
to authenticated
using (public.can_manage_pos_session(pos_session_id))
with check (public.can_manage_pos_session(pos_session_id));

create policy "pos_session_payment_closures_service_role_all"
on public.pos_session_payment_closures
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.pos_session_payment_closures to authenticated;
grant all on public.pos_session_payment_closures to service_role;
revoke all on public.pos_session_payment_closures from anon, public;

-- La jornada operativa se rige por Lima independientemente del timezone de
-- la conexión o del servidor PostgreSQL.
create or replace function public.pos_business_date()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select timezone('America/Lima', now())::date;
$$;

create or replace function public.mark_overdue_pos_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.pos_sessions
  set status = 'pending_close',
      updated_at = now()
  where status = 'open'
    and business_date < public.pos_business_date()
    and public.can_manage_pos_branch(branch_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.open_pos_session(
  p_branch_id uuid,
  p_opening_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  if not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para abrir una sesion POS en esta sede.';
  end if;

  perform public.mark_overdue_pos_sessions();

  select * into v_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status in ('open', 'pending_close')
  order by opened_at desc
  limit 1;

  if found then
    raise exception 'Hay una sesion pendiente de cierre en esta sede.';
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  insert into public.pos_sessions (
    branch_id, opened_by, business_date, status, opening_cash_amount,
    expected_cash_amount, opening_notes, opened_at
  ) values (
    p_branch_id, v_employee_id, current_date, 'open',
    coalesce(p_opening_cash_amount, 0), coalesce(p_opening_cash_amount, 0),
    nullif(btrim(coalesce(p_notes, '')), ''), now()
  )
  returning * into v_session;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    v_session.id, v_employee_id, 'opened', 'Sesion POS abierta.',
    jsonb_build_object('opening_cash_amount', v_session.opening_cash_amount)
  );

  return v_session;
end;
$$;

create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_sales jsonb;
  v_payments jsonb;
  v_movements jsonb;
  v_rewards jsonb;
  v_closures jsonb;
  v_gross numeric(12,2) := 0;
  v_discounts numeric(12,2) := 0;
  v_rewards_total numeric(12,2) := 0;
  v_courtesies numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_completed integer := 0;
  v_cancelled integer := 0;
  v_drafts integer := 0;
begin
  select * into v_session
  from public.pos_sessions
  where id = p_session_id;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para ver esta sesion POS.';
  end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'draft'),
    coalesce(sum(subtotal) filter (where status = 'completed'), 0),
    coalesce(sum(discount_total) filter (where status = 'completed'), 0),
    coalesce(sum(courtesy_total) filter (where status = 'completed'), 0),
    coalesce(sum(total) filter (where status = 'completed'), 0)
  into v_completed, v_cancelled, v_drafts, v_gross, v_discounts, v_courtesies, v_net
  from public.sales
  where pos_session_id = p_session_id;

  select coalesce(sum(rr.discount_amount), 0)
  into v_rewards_total
  from public.reward_redemptions rr
  join public.sales s on s.id = rr.sale_id
  where s.pos_session_id = p_session_id
    and s.status = 'completed'
    and rr.status = 'applied';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'reference', 'VTA-' || upper(left(s.id::text, 8)),
    'status', s.status,
    'customer_name', coalesce(c.full_name, 'Cliente varios'),
    'subtotal', s.subtotal,
    'discount_total', s.discount_total,
    'courtesy_total', s.courtesy_total,
    'total', s.total,
    'created_at', s.created_at,
    'closed_at', s.closed_at
  ) order by s.created_at desc), '[]'::jsonb)
  into v_sales
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  where s.pos_session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', pm.id,
    'code', pm.code,
    'name', pm.name,
    'is_active', pm.is_active,
    'expected_amount', case
      when pm.code = 'cash' then
        v_session.opening_cash_amount
        + coalesce((select sum(sp.amount) from public.sale_payments sp join public.sales s on s.id = sp.sale_id where s.pos_session_id = p_session_id and s.status = 'completed' and sp.payment_method_id = pm.id), 0)
        + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'income'), 0)
        - coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'expense'), 0)
        + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'adjustment'), 0)
      else coalesce((select sum(sp.amount) from public.sale_payments sp join public.sales s on s.id = sp.sale_id where s.pos_session_id = p_session_id and s.status = 'completed' and sp.payment_method_id = pm.id), 0)
    end
  ) order by pm.sort_order, pm.name), '[]'::jsonb)
  into v_payments
  from public.payment_methods pm
  where pm.is_active
     or exists (select 1 from public.pos_session_payment_closures pc where pc.pos_session_id = p_session_id and pc.payment_method_id = pm.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cm.id,
    'movement_type', cm.movement_type,
    'category_name', coalesce(cmc.name, 'Movimiento'),
    'amount', cm.amount,
    'description', cm.description,
    'status', cm.status,
    'created_at', cm.created_at
  ) order by cm.created_at), '[]'::jsonb)
  into v_movements
  from public.cash_movements cm
  left join public.cash_movement_categories cmc on cmc.id = cm.category_id
  where cm.pos_session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rr.id,
    'sale_id', s.id,
    'sale_reference', 'VTA-' || upper(left(s.id::text, 8)),
    'customer_name', coalesce(c.full_name, 'Cliente'),
    'reward_name', coalesce(rb.name, 'Reward'),
    'discount_amount', rr.discount_amount,
    'applied_at', rr.applied_at
  ) order by rr.applied_at), '[]'::jsonb)
  into v_rewards
  from public.reward_redemptions rr
  join public.sales s on s.id = rr.sale_id
  left join public.customers c on c.id = rr.customer_id
  left join public.reward_benefits rb on rb.id = rr.benefit_id
  where s.pos_session_id = p_session_id
    and rr.status = 'applied';

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', pc.payment_method_id,
    'expected_amount', pc.expected_amount,
    'counted_amount', pc.counted_amount,
    'difference_amount', pc.difference_amount,
    'notes', pc.notes
  )), '[]'::jsonb)
  into v_closures
  from public.pos_session_payment_closures pc
  where pc.pos_session_id = p_session_id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'is_overdue', v_session.business_date < public.pos_business_date() and v_session.status in ('open', 'pending_close'),
    'business_date', v_session.business_date,
    'branch_id', v_session.branch_id,
    'branch_name', (select b.name from public.branches b where b.id = v_session.branch_id),
    'opened_at', v_session.opened_at,
    'opened_by_name', (select e.full_name from public.employees e where e.id = v_session.opened_by),
    'opening_cash_amount', v_session.opening_cash_amount,
    'opening_notes', v_session.opening_notes,
    'closed_at', v_session.closed_at,
    'closed_by_name', (select e.full_name from public.employees e where e.id = v_session.closed_by),
    'closing_notes', v_session.closing_notes,
    'completed_sales_count', v_completed,
    'cancelled_sales_count', v_cancelled,
    'draft_sales_count', v_drafts,
    'gross_total', v_gross,
    'discount_total', v_discounts,
    'reward_total', v_rewards_total,
    'manual_discount_total', greatest(v_discounts - v_rewards_total, 0),
    'courtesy_total', v_courtesies,
    'net_total', v_net,
    'sales', v_sales,
    'payment_methods', v_payments,
    'movements', v_movements,
    'rewards', v_rewards,
    'closures', v_closures
  );
end;
$$;

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_amounts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_summary jsonb;
  v_method record;
  v_counted numeric(12,2);
  v_difference numeric(12,2);
  v_has_difference boolean := false;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  select * into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para cerrar esta sesion POS.';
  end if;

  if v_session.status not in ('open', 'pending_close') then
    raise exception 'La sesion POS ya no esta disponible para cierre.';
  end if;

  v_summary := public.get_pos_session_closure_summary(p_session_id);

  if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
    raise exception 'No puedes cerrar la sesion con ventas en borrador.';
  end if;

  delete from public.pos_session_payment_closures
  where pos_session_id = p_session_id;

  for v_method in
    select
      (item ->> 'payment_method_id')::uuid as payment_method_id,
      item ->> 'code' as code,
      (item ->> 'expected_amount')::numeric as expected_amount
    from jsonb_array_elements(v_summary -> 'payment_methods') item
  loop
    if not (coalesce(p_counted_amounts, '{}'::jsonb) ? v_method.payment_method_id::text) then
      raise exception 'Debes ingresar el monto real para todos los metodos activos.';
    end if;

    begin
      v_counted := (p_counted_amounts ->> v_method.payment_method_id::text)::numeric;
    exception when others then
      raise exception 'Uno de los montos reales no es valido.';
    end;

    if v_counted is null or v_counted < 0 then
      raise exception 'Los montos reales deben ser mayores o iguales a cero.';
    end if;

    v_counted := round(v_counted, 2);
    v_difference := v_counted - round(v_method.expected_amount, 2);
    v_has_difference := v_has_difference or v_difference <> 0;

    insert into public.pos_session_payment_closures (
      pos_session_id, payment_method_id, expected_amount, counted_amount,
      difference_amount, notes, created_by
    ) values (
      p_session_id, v_method.payment_method_id, round(v_method.expected_amount, 2),
      v_counted, v_difference, v_notes, auth.uid()
    );
  end loop;

  if (v_has_difference or v_session.status = 'pending_close' or v_session.business_date < public.pos_business_date())
     and v_notes is null then
    raise exception 'Debes registrar una observacion para este cierre.';
  end if;

  update public.pos_sessions
  set status = 'closed',
      expected_cash_amount = coalesce((
        select pc.expected_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      counted_cash_amount = coalesce((
        select pc.counted_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      cash_difference = coalesce((
        select pc.difference_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      closing_notes = v_notes,
      closed_by = v_employee_id,
      closed_at = now(),
      updated_at = now()
  where id = p_session_id;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    p_session_id, v_employee_id, 'closed', 'Sesion POS cerrada por metodo.',
    jsonb_build_object('has_difference', v_has_difference)
  );

  return public.get_pos_session_closure_summary(p_session_id);
end;
$$;

revoke all on function public.mark_overdue_pos_sessions() from public;
revoke all on function public.get_pos_session_closure_summary(uuid) from public;
revoke all on function public.close_pos_session(uuid, jsonb, text) from public;

grant execute on function public.mark_overdue_pos_sessions() to authenticated, service_role;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;
grant execute on function public.close_pos_session(uuid, jsonb, text) to authenticated, service_role;


-- ============================================================================
-- Fuente consolidada: 086_payroll_periods.sql
-- ============================================================================
-- Sprint 8.8: periodos quincenales y aportes operativos.
-- Ejecutar despues de 085_pos_session_history_and_closure.sql.

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_year integer not null check (period_year between 2020 and 2200),
  period_month integer not null check (period_month between 1 and 12),
  period_half integer not null check (period_half in (1, 2)),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'processing', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.employees(id) on delete set null,
  unique (period_year, period_month, period_half),
  check (end_date >= start_date)
);

create table if not exists public.production_operational_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  minimum_amount numeric(12,2) not null default 0 check (minimum_amount >= 0),
  maximum_amount numeric(12,2) check (maximum_amount is null or maximum_amount >= minimum_amount),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage')),
  calculation_value numeric(12,4) not null check (calculation_value >= 0),
  priority integer not null default 0,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists production_operational_rules_lookup_idx
  on public.production_operational_rules (is_active, effective_from, effective_to, priority desc);

create or replace function public.get_or_create_payroll_period(p_date date)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_half integer := case when extract(day from v_date) <= 15 then 1 else 2 end;
  v_start date;
  v_end date;
  v_period public.payroll_periods%rowtype;
begin
  if public.current_user_role() not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para consultar periodos de produccion.';
  end if;

  v_start := make_date(extract(year from v_date)::integer, extract(month from v_date)::integer, case when v_half = 1 then 1 else 16 end);
  v_end := case when v_half = 1 then make_date(extract(year from v_date)::integer, extract(month from v_date)::integer, 15) else (date_trunc('month', v_date) + interval '1 month - 1 day')::date end;

  insert into public.payroll_periods (
    period_year, period_month, period_half, start_date, end_date, created_by
  ) values (
    extract(year from v_date)::integer, extract(month from v_date)::integer,
    v_half, v_start, v_end, public.current_employee_id()
  )
  on conflict (period_year, period_month, period_half) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date
  returning * into v_period;

  return v_period;
end;
$$;

insert into public.production_operational_rules (
  name, minimum_amount, maximum_amount, calculation_type, calculation_value,
  priority, is_active, effective_from
)
select 'Aporte servicios menores a S/ 60', 0, 59.99, 'fixed', 2, 20, true, date '2000-01-01'
where not exists (
  select 1 from public.production_operational_rules
  where name = 'Aporte servicios menores a S/ 60'
);

insert into public.production_operational_rules (
  name, minimum_amount, maximum_amount, calculation_type, calculation_value,
  priority, is_active, effective_from
)
select 'Aporte servicios desde S/ 60', 60, null, 'fixed', 10, 10, true, date '2000-01-01'
where not exists (
  select 1 from public.production_operational_rules
  where name = 'Aporte servicios desde S/ 60'
);

revoke all on function public.get_or_create_payroll_period(date) from public;
grant execute on function public.get_or_create_payroll_period(date) to authenticated, service_role;


-- ============================================================================
-- Fuente consolidada: 087_employee_production.sql
-- ============================================================================
-- Sprint 8.8: snapshots de produccion y bonos por venta.

create table if not exists public.employee_service_production (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  production_date timestamptz not null,
  production_source text not null check (production_source in ('normal', 'reward', 'courtesy', 'commercial_discount')),
  quantity numeric(12,2) not null check (quantity > 0),
  original_unit_price numeric(12,2) not null check (original_unit_price >= 0),
  original_line_total numeric(12,2) not null check (original_line_total >= 0),
  commercial_discount_amount numeric(12,2) not null default 0 check (commercial_discount_amount >= 0),
  reward_discount_amount numeric(12,2) not null default 0 check (reward_discount_amount >= 0),
  courtesy_discount_amount numeric(12,2) not null default 0 check (courtesy_discount_amount >= 0),
  collected_amount numeric(12,2) not null default 0 check (collected_amount >= 0),
  operational_contribution_amount numeric(12,2) not null default 0 check (operational_contribution_amount >= 0),
  commissionable_amount numeric(12,2) not null default 0 check (commissionable_amount >= 0),
  fixed_commission_amount numeric(12,2) not null default 0 check (fixed_commission_amount >= 0),
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sale_item_id)
);

create table if not exists public.employee_product_bonus_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_category_id uuid references public.product_categories(id) on delete set null,
  service_id uuid references public.services(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete set null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_bonus_amount numeric(12,2) not null default 0 check (unit_bonus_amount >= 0),
  total_bonus_amount numeric(12,2) not null default 0 check (total_bonus_amount >= 0),
  bonus_rule_id uuid,
  status text not null default 'active' check (status in ('active', 'pending_review', 'reversed')),
  reversed_at timestamptz,
  reversed_reason text,
  created_at timestamptz not null default now(),
  unique (sale_item_id),
  check (num_nonnulls(product_id, service_id) = 1)
);

create index if not exists employee_service_production_period_employee_idx
  on public.employee_service_production (payroll_period_id, employee_id, status);
create index if not exists employee_product_bonus_period_employee_idx
  on public.employee_product_bonus_entries (payroll_period_id, employee_id, status);


-- ============================================================================
-- Fuente consolidada: 088_employee_bonus_rules.sql
-- ============================================================================
-- Sprint 8.8: reglas de comisiones fijas, bonos y recargos.

create table if not exists public.reward_service_commission_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  service_id uuid references public.services(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete cascade,
  fixed_commission_amount numeric(12,2) not null check (fixed_commission_amount >= 0),
  priority integer not null default 0, is_active boolean not null default true,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (not (service_id is not null and service_category_id is not null)),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.courtesy_service_commission_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  service_id uuid references public.services(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete cascade,
  fixed_commission_amount numeric(12,2) not null check (fixed_commission_amount >= 0),
  priority integer not null default 0, is_active boolean not null default true,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (not (service_id is not null and service_category_id is not null)),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.product_bonus_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  product_id uuid references public.products(id) on delete cascade,
  product_category_id uuid references public.product_categories(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete cascade,
  bonus_type text not null default 'fixed_per_unit' check (bonus_type = 'fixed_per_unit'),
  bonus_value numeric(12,2) not null check (bonus_value >= 0),
  priority integer not null default 0, is_active boolean not null default true,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (num_nonnulls(product_id, product_category_id, service_id, service_category_id) = 1),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.employee_supply_markup_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  product_id uuid references public.products(id) on delete cascade,
  markup_type text not null check (markup_type in ('fixed', 'percentage')),
  markup_value numeric(12,4) not null check (markup_value >= 0),
  priority integer not null default 0, is_active boolean not null default true,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists reward_service_commission_rules_lookup_idx on public.reward_service_commission_rules (is_active, service_id, service_category_id, priority desc);
create index if not exists courtesy_service_commission_rules_lookup_idx on public.courtesy_service_commission_rules (is_active, service_id, service_category_id, priority desc);
create index if not exists product_bonus_rules_lookup_idx on public.product_bonus_rules (is_active, product_id, product_category_id, priority desc);
create index if not exists product_bonus_rules_service_lookup_idx on public.product_bonus_rules (is_active, service_id, service_category_id, priority desc);
create index if not exists employee_supply_markup_rules_lookup_idx on public.employee_supply_markup_rules (is_active, product_id, priority desc);

alter table public.employee_product_bonus_entries
  drop constraint if exists employee_product_bonus_entries_bonus_rule_id_fkey;
alter table public.employee_product_bonus_entries
  add constraint employee_product_bonus_entries_bonus_rule_id_fkey
  foreign key (bonus_rule_id) references public.product_bonus_rules(id) on delete set null;


-- ============================================================================
-- Fuente consolidada: 089_employee_accounts.sql
-- ============================================================================
-- Sprint 8.8: cuenta corriente e insumos de empleados.

create table if not exists public.employee_debts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  debt_type text not null check (debt_type in ('loan', 'advance', 'supply', 'other')),
  original_amount numeric(12,2) not null check (original_amount > 0),
  outstanding_amount numeric(12,2) not null check (outstanding_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'written_off', 'cancelled')),
  description text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  settled_at timestamptz,
  written_off_at timestamptz,
  written_off_by uuid references public.employees(id) on delete set null,
  written_off_reason text,
  check (outstanding_amount <= original_amount)
);

create table if not exists public.employee_debt_movements (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.employee_debts(id) on delete restrict,
  movement_type text not null check (movement_type in ('charge', 'immediate_payment', 'settlement_deduction', 'manual_payment', 'adjustment', 'write_off', 'cancellation')),
  amount numeric(12,2) not null check (amount > 0),
  settlement_id uuid,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null
);

create table if not exists public.employee_supply_deliveries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost_snapshot numeric(12,2) not null check (unit_cost_snapshot >= 0),
  markup_type text not null check (markup_type in ('fixed', 'percentage')),
  markup_value numeric(12,4) not null check (markup_value >= 0),
  unit_charge_amount numeric(12,2) not null check (unit_charge_amount >= 0),
  total_charge_amount numeric(12,2) not null check (total_charge_amount >= 0),
  payment_mode text not null check (payment_mode in ('immediate', 'credit')),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_reference text,
  stock_movement_id uuid references public.stock_movements(id) on delete set null,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  employee_debt_id uuid references public.employee_debts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null
);

create index if not exists employee_debts_employee_status_idx on public.employee_debts (employee_id, status);
create index if not exists employee_debt_movements_debt_idx on public.employee_debt_movements (debt_id, created_at);
create index if not exists employee_supply_deliveries_employee_idx on public.employee_supply_deliveries (employee_id, created_at desc);


-- ============================================================================
-- Fuente consolidada: 090_employee_benefits.sql
-- ============================================================================
-- Sprint 8.8: beneficio mensual de empleados fuera del POS.

create table if not exists public.employee_benefit_usages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  benefit_type text not null check (benefit_type = 'monthly_free_haircut'),
  benefit_month date not null,
  service_id uuid references public.services(id) on delete set null,
  provider_employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  used_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'used' check (status in ('used', 'cancelled')),
  check (benefit_month = date_trunc('month', benefit_month)::date)
);

create unique index if not exists employee_benefit_usages_one_active_month_idx
  on public.employee_benefit_usages (employee_id, benefit_type, benefit_month)
  where status = 'used';

create index if not exists employee_benefit_usages_employee_idx
  on public.employee_benefit_usages (employee_id, benefit_month desc);


-- ============================================================================
-- Fuente consolidada: 091_employee_settlements.sql
-- ============================================================================
-- Sprint 8.8: liquidaciones quincenales y snapshots de detalle.

create table if not exists public.employee_settlements (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  settlement_number text not null unique,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'paid', 'cancelled')),
  commission_rate numeric(7,4) not null check (commission_rate >= 0),
  commissionable_base_total numeric(12,2) not null default 0,
  percentage_commission_total numeric(12,2) not null default 0,
  reward_fixed_commission_total numeric(12,2) not null default 0,
  courtesy_fixed_commission_total numeric(12,2) not null default 0,
  product_bonus_total numeric(12,2) not null default 0,
  manual_bonus_total numeric(12,2) not null default 0,
  gross_pay_amount numeric(12,2) not null default 0,
  debt_deduction_total numeric(12,2) not null default 0,
  other_deduction_total numeric(12,2) not null default 0,
  net_pay_amount numeric(12,2) not null default 0 check (net_pay_amount >= 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_reference text,
  payment_evidence_path text,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  notes text,
  high_rate_authorization_note text,
  high_rate_authorized_by uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references public.employees(id) on delete set null,
  paid_at timestamptz,
  cancelled_by uuid references public.employees(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  replacement_of_id uuid references public.employee_settlements(id) on delete set null
);

create unique index if not exists employee_settlements_one_active_idx
  on public.employee_settlements (payroll_period_id, employee_id)
  where status <> 'cancelled';

create table if not exists public.employee_settlement_service_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  production_entry_id uuid not null references public.employee_service_production(id) on delete restrict,
  service_name_snapshot text not null,
  production_date_snapshot timestamptz not null,
  commissionable_amount numeric(12,2) not null default 0,
  commission_rate numeric(7,4) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  fixed_commission_amount numeric(12,2) not null default 0,
  unique (settlement_id, production_entry_id)
);

create table if not exists public.employee_settlement_bonus_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  product_bonus_entry_id uuid not null references public.employee_product_bonus_entries(id) on delete restrict,
  product_name_snapshot text not null,
  bonus_amount numeric(12,2) not null default 0,
  unique (settlement_id, product_bonus_entry_id)
);

create table if not exists public.employee_settlement_deductions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  employee_debt_id uuid not null references public.employee_debts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null check (balance_after >= 0),
  notes text,
  unique (settlement_id, employee_debt_id)
);

create table if not exists public.employee_settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.employee_settlements(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('bonus', 'deduction')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.employee_debt_movements
  drop constraint if exists employee_debt_movements_settlement_id_fkey;
alter table public.employee_debt_movements
  add constraint employee_debt_movements_settlement_id_fkey
  foreign key (settlement_id) references public.employee_settlements(id) on delete set null;

create index if not exists employee_settlements_period_idx on public.employee_settlements (payroll_period_id, status);


-- ============================================================================
-- Fuente consolidada: 092_employee_compensation_functions.sql
-- ============================================================================
-- Sprint 8.8: funciones transaccionales de produccion, cuentas y liquidaciones.

create or replace function public.calculate_operational_contribution(
  p_amount numeric,
  p_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.production_operational_rules%rowtype;
begin
  select * into v_rule
  from public.production_operational_rules
  where is_active
    and coalesce(p_amount, 0) >= minimum_amount
    and (maximum_amount is null or coalesce(p_amount, 0) <= maximum_amount)
    and effective_from <= coalesce(p_date, current_date)
    and (effective_to is null or effective_to >= coalesce(p_date, current_date))
  order by priority desc, minimum_amount desc
  limit 1;

  if not found then return 0; end if;
  return round(case when v_rule.calculation_type = 'percentage'
    then coalesce(p_amount, 0) * v_rule.calculation_value / 100
    else v_rule.calculation_value end, 2);
end;
$$;

create or replace function public.get_service_fixed_commission(
  p_kind text,
  p_service_id uuid,
  p_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(12,2) := 0;
  v_category_id uuid;
begin
  select category_id into v_category_id from public.services where id = p_service_id;

  if p_kind = 'reward' then
    select fixed_commission_amount into v_amount
    from public.reward_service_commission_rules
    where is_active
      and effective_from <= coalesce(p_date, current_date)
      and (effective_to is null or effective_to >= coalesce(p_date, current_date))
      and (service_id = p_service_id or (service_id is null and service_category_id = v_category_id) or (service_id is null and service_category_id is null))
    order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc, priority desc
    limit 1;
  elsif p_kind = 'courtesy' then
    select fixed_commission_amount into v_amount
    from public.courtesy_service_commission_rules
    where is_active
      and effective_from <= coalesce(p_date, current_date)
      and (effective_to is null or effective_to >= coalesce(p_date, current_date))
      and (service_id = p_service_id or (service_id is null and service_category_id = v_category_id) or (service_id is null and service_category_id is null))
    order by case when service_id is not null then 3 when service_category_id is not null then 2 else 1 end desc, priority desc
    limit 1;
  end if;

  return coalesce(v_amount, 0);
end;
$$;

create or replace function public.generate_employee_production_for_sale(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_period public.payroll_periods%rowtype;
  v_item record;
  v_employee_id uuid;
  v_source text;
  v_reward_discount numeric(12,2);
  v_commercial_discount numeric(12,2);
  v_courtesy_discount numeric(12,2);
  v_collected numeric(12,2);
  v_contribution numeric(12,2);
  v_fixed numeric(12,2);
  v_rule public.product_bonus_rules%rowtype;
  v_services integer := 0;
  v_bonuses integer := 0;
  v_reversed integer := 0;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'La venta no existe.'; end if;

  if not (public.is_admin() or public.can_manage_pos_branch(v_sale.branch_id)) then
    raise exception 'No tienes permisos para generar produccion de esta venta.';
  end if;

  if v_sale.status = 'cancelled' then
    update public.employee_service_production set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.', updated_at = now()
    where sale_id = p_sale_id and status <> 'reversed';
    get diagnostics v_reversed = row_count;
    update public.employee_product_bonus_entries set status = 'reversed', reversed_at = now(), reversed_reason = 'Venta anulada.'
    where sale_id = p_sale_id and status <> 'reversed';
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', v_reversed);
  end if;

  if v_sale.status <> 'completed' then
    return jsonb_build_object('services_generated', 0, 'bonuses_generated', 0, 'reversed', 0, 'omitted', 1);
  end if;

  v_period := public.get_or_create_payroll_period(coalesce(v_sale.closed_at, v_sale.created_at)::date);

  for v_item in
    select si.*, s.category_id as service_category_id
    from public.sale_items si
    left join public.services s on s.id = si.service_id
    where si.sale_id = p_sale_id
    order by si.created_at
  loop
    if v_item.item_type = 'service' then
      v_employee_id := coalesce(v_item.barber_id, v_sale.barber_id);
      if v_employee_id is null then continue; end if;

      v_reward_discount := case when exists (
        select 1 from public.reward_redemptions rr
        where rr.sale_id = p_sale_id and rr.status = 'applied'
      ) and v_item.discount_amount > 0 then v_item.discount_amount else 0 end;
      v_courtesy_discount := case when v_item.is_courtesy then v_item.quantity * v_item.unit_price else 0 end;
      v_commercial_discount := case when v_reward_discount = 0 and not v_item.is_courtesy then v_item.discount_amount else 0 end;
      v_collected := greatest(v_item.total, 0);
      v_source := case when v_item.is_courtesy then 'courtesy' when v_reward_discount > 0 then 'reward' when v_commercial_discount > 0 then 'commercial_discount' else 'normal' end;
      v_contribution := case when v_source in ('reward', 'courtesy') then 0 else least(v_collected, public.calculate_operational_contribution(v_collected, v_sale.closed_at::date)) end;
      v_fixed := case when v_source in ('reward', 'courtesy') then public.get_service_fixed_commission(v_source, v_item.service_id, v_sale.closed_at::date) else 0 end;

      insert into public.employee_service_production (
        payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, service_id,
        production_date, production_source, quantity, original_unit_price,
        original_line_total, commercial_discount_amount, reward_discount_amount,
        courtesy_discount_amount, collected_amount, operational_contribution_amount,
        commissionable_amount, fixed_commission_amount, status
      ) values (
        v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id, v_item.service_id,
        coalesce(v_sale.closed_at, v_sale.created_at), v_source, v_item.quantity, v_item.unit_price,
        v_item.quantity * v_item.unit_price, v_commercial_discount, v_reward_discount,
        v_courtesy_discount, v_collected, v_contribution,
        case when v_source in ('reward', 'courtesy') then 0 else greatest(v_collected - v_contribution, 0) end,
        v_fixed, 'active'
      )
      on conflict (sale_item_id) do update set
        payroll_period_id = excluded.payroll_period_id, employee_id = excluded.employee_id,
        production_source = excluded.production_source, commercial_discount_amount = excluded.commercial_discount_amount,
        reward_discount_amount = excluded.reward_discount_amount, courtesy_discount_amount = excluded.courtesy_discount_amount,
        collected_amount = excluded.collected_amount, operational_contribution_amount = excluded.operational_contribution_amount,
        commissionable_amount = excluded.commissionable_amount, fixed_commission_amount = excluded.fixed_commission_amount,
        status = 'active', reversed_at = null, reversed_reason = null, updated_at = now();
      v_services := v_services + 1;
    elsif v_item.item_type = 'product' and not v_item.is_courtesy then
      v_employee_id := case when exists (select 1 from public.sale_items sx where sx.sale_id = p_sale_id and sx.item_type = 'service') then v_sale.barber_id else v_sale.closed_by end;

      select * into v_rule from public.product_bonus_rules
      where is_active
        and effective_from <= v_sale.closed_at::date
        and (effective_to is null or effective_to >= v_sale.closed_at::date)
        and (product_id = v_item.product_id or (product_id is null and product_category_id = (select category_id from public.products where id = v_item.product_id)))
      order by case when product_id is not null then 2 else 1 end desc, priority desc
      limit 1;

      if found then
        insert into public.employee_product_bonus_entries (
          payroll_period_id, employee_id, branch_id, sale_id, sale_item_id, product_id,
          product_category_id, quantity, unit_bonus_amount, total_bonus_amount,
          bonus_rule_id, status
        ) values (
          v_period.id, v_employee_id, v_sale.branch_id, v_sale.id, v_item.id, v_item.product_id,
          (select category_id from public.products where id = v_item.product_id), v_item.quantity,
          v_rule.bonus_value, round(v_rule.bonus_value * v_item.quantity, 2), v_rule.id,
          case when v_employee_id is null then 'pending_review' else 'active' end
        )
        on conflict (sale_item_id) do update set
          employee_id = excluded.employee_id, quantity = excluded.quantity,
          unit_bonus_amount = excluded.unit_bonus_amount, total_bonus_amount = excluded.total_bonus_amount,
          bonus_rule_id = excluded.bonus_rule_id, status = excluded.status,
          reversed_at = null, reversed_reason = null;
        v_bonuses := v_bonuses + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('services_generated', v_services, 'bonuses_generated', v_bonuses, 'reversed', 0, 'omitted', 0);
end;
$$;

create or replace function public.generate_production_for_period(p_period_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_sale record;
  v_result jsonb;
  v_sales integer := 0; v_services integer := 0; v_bonuses integer := 0; v_reversals integer := 0; v_errors integer := 0;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden generar produccion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id;
  if not found then raise exception 'El periodo no existe.'; end if;

  for v_sale in select id from public.sales where coalesce(closed_at, created_at)::date between v_period.start_date and v_period.end_date and (p_branch_id is null or branch_id = p_branch_id) and status in ('completed', 'cancelled') loop
    begin
      v_result := public.generate_employee_production_for_sale(v_sale.id);
      v_sales := v_sales + 1;
      v_services := v_services + coalesce((v_result ->> 'services_generated')::integer, 0);
      v_bonuses := v_bonuses + coalesce((v_result ->> 'bonuses_generated')::integer, 0);
      v_reversals := v_reversals + coalesce((v_result ->> 'reversed')::integer, 0);
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object('sales_reviewed', v_sales, 'services_generated', v_services, 'bonuses_generated', v_bonuses, 'reversed', v_reversals, 'errors', v_errors);
end;
$$;

create or replace function public.sales_production_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('completed', 'cancelled') and new.status is distinct from old.status then
    perform public.generate_employee_production_for_sale(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_production_sync on public.sales;
create trigger sales_production_sync after update of status on public.sales
for each row execute function public.sales_production_sync_trigger();

create or replace function public.create_employee_debt(
  p_employee_id uuid, p_branch_id uuid, p_debt_type text, p_amount numeric, p_description text
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_debt public.employee_debts%rowtype; v_creator uuid := public.current_employee_id();
begin
  if not (
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and p_debt_type = 'supply'
      and public.can_access_branch(p_branch_id)
    )
  ) then raise exception 'No tienes permisos para registrar esta deuda.'; end if;
  if coalesce(p_amount, 0) <= 0 or nullif(btrim(coalesce(p_description, '')), '') is null then raise exception 'Monto y descripcion son obligatorios.'; end if;
  insert into public.employee_debts (employee_id, branch_id, debt_type, original_amount, outstanding_amount, description, created_by)
  values (p_employee_id, p_branch_id, p_debt_type, round(p_amount, 2), round(p_amount, 2), btrim(p_description), v_creator) returning * into v_debt;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, notes, created_by) values (v_debt.id, 'charge', v_debt.original_amount, 'Registro inicial de deuda.', v_creator);
  return v_debt;
end;
$$;

create or replace function public.apply_employee_debt_payment(
  p_debt_id uuid, p_amount numeric, p_movement_type text, p_notes text default null,
  p_payment_method_id uuid default null, p_payment_reference text default null
)
returns public.employee_debts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_debt public.employee_debts%rowtype; v_creator uuid := public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden registrar pagos de deuda.'; end if;
  select * into v_debt from public.employee_debts where id = p_debt_id for update;
  if not found or v_debt.status not in ('pending', 'partial') then raise exception 'La deuda no esta disponible para pago.'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > v_debt.outstanding_amount then raise exception 'El pago no puede superar el saldo pendiente.'; end if;
  insert into public.employee_debt_movements (debt_id, movement_type, amount, payment_method_id, payment_reference, notes, created_by)
  values (p_debt_id, p_movement_type, round(p_amount, 2), p_payment_method_id, nullif(btrim(coalesce(p_payment_reference, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), v_creator);
  update public.employee_debts set outstanding_amount = outstanding_amount - round(p_amount, 2), status = case when outstanding_amount - round(p_amount, 2) = 0 then 'paid' else 'partial' end, settled_at = case when outstanding_amount - round(p_amount, 2) = 0 then now() else null end where id = p_debt_id returning * into v_debt;
  return v_debt;
end;
$$;

create or replace function public.register_employee_benefit_usage(
  p_employee_id uuid, p_branch_id uuid, p_service_id uuid default null,
  p_provider_employee_id uuid default null, p_notes text default null
)
returns public.employee_benefit_usages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_usage public.employee_benefit_usages%rowtype; v_creator uuid := public.current_employee_id(); v_month date := date_trunc('month', current_date)::date;
begin
  if not (public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para registrar este beneficio.'; end if;
  insert into public.employee_benefit_usages (employee_id, benefit_type, benefit_month, service_id, provider_employee_id, branch_id, notes, created_by)
  values (p_employee_id, 'monthly_free_haircut', v_month, p_service_id, p_provider_employee_id, p_branch_id, nullif(btrim(coalesce(p_notes, '')), ''), v_creator)
  returning * into v_usage;
  return v_usage;
exception when unique_violation then raise exception 'El empleado ya utilizo su corte gratuito de este mes.';
end;
$$;

create or replace function public.prepare_employee_settlement(
  p_period_id uuid, p_employee_id uuid, p_commission_rate numeric,
  p_debt_deductions jsonb default '[]'::jsonb, p_notes text default null,
  p_high_rate_note text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype; v_period public.payroll_periods%rowtype; v_employee public.employees%rowtype;
  v_base numeric(12,2); v_reward numeric(12,2); v_courtesy numeric(12,2); v_bonus numeric(12,2); v_percentage numeric(12,2); v_gross numeric(12,2); v_deductions numeric(12,2) := 0;
  v_item jsonb; v_debt public.employee_debts%rowtype; v_amount numeric(12,2); v_creator uuid := public.current_employee_id();
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden preparar liquidaciones.'; end if;
  if coalesce(p_commission_rate, -1) < 0 then raise exception 'El porcentaje no es valido.'; end if;
  if p_commission_rate > 60 and nullif(btrim(coalesce(p_high_rate_note, '')), '') is null then raise exception 'Un porcentaje mayor a 60 requiere observacion de autorizacion.'; end if;
  select * into v_period from public.payroll_periods where id = p_period_id and status <> 'cancelled'; if not found then raise exception 'El periodo no esta disponible.'; end if;
  select * into v_employee from public.employees where id = p_employee_id; if not found then raise exception 'El empleado no existe.'; end if;

  select coalesce(sum(commissionable_amount), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'reward'), 0), coalesce(sum(fixed_commission_amount) filter (where production_source = 'courtesy'), 0)
  into v_base, v_reward, v_courtesy from public.employee_service_production where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  select coalesce(sum(total_bonus_amount), 0) into v_bonus from public.employee_product_bonus_entries where payroll_period_id = p_period_id and employee_id = p_employee_id and status = 'active';
  v_percentage := round(v_base * p_commission_rate / 100, 2); v_gross := v_percentage + v_reward + v_courtesy + v_bonus;

  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid and employee_id = p_employee_id and status in ('pending', 'partial');
    if not found then raise exception 'Una deuda seleccionada ya no esta disponible.'; end if;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_amount <= 0 or v_amount > v_debt.outstanding_amount then raise exception 'Un descuento de deuda no es valido.'; end if;
    v_deductions := v_deductions + v_amount;
  end loop;
  if v_deductions > v_gross then raise exception 'Los descuentos no pueden superar la ganancia disponible.'; end if;

  select * into v_settlement from public.employee_settlements where payroll_period_id = p_period_id and employee_id = p_employee_id and status <> 'cancelled' for update;
  if found and v_settlement.status <> 'draft' then raise exception 'Solo una liquidacion borrador puede recalcularse.'; end if;
  if not found then
    insert into public.employee_settlements (payroll_period_id, employee_id, branch_id, settlement_number, commission_rate, commissionable_base_total, percentage_commission_total, reward_fixed_commission_total, courtesy_fixed_commission_total, product_bonus_total, gross_pay_amount, debt_deduction_total, net_pay_amount, notes, high_rate_authorization_note, high_rate_authorized_by, replacement_of_id, created_by)
    values (p_period_id, p_employee_id, v_employee.branch_id, 'LIQ-' || to_char(v_period.start_date, 'YYYYMMDD') || '-' || upper(left(p_employee_id::text, 6)) || '-' || lpad(((select count(*) from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id)+1)::text,2,'0'), p_commission_rate, v_base, v_percentage, v_reward, v_courtesy, v_bonus, v_gross, v_deductions, greatest(v_gross - v_deductions, 0), nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_high_rate_note, '')), ''), case when p_commission_rate > 60 then v_creator else null end, (select id from public.employee_settlements where payroll_period_id=p_period_id and employee_id=p_employee_id and status='cancelled' order by cancelled_at desc nulls last limit 1), v_creator)
    returning * into v_settlement;
  else
    update public.employee_settlements set commission_rate = p_commission_rate, commissionable_base_total = v_base, percentage_commission_total = v_percentage, reward_fixed_commission_total = v_reward, courtesy_fixed_commission_total = v_courtesy, product_bonus_total = v_bonus, gross_pay_amount = v_gross, debt_deduction_total = v_deductions, net_pay_amount = greatest(v_gross - v_deductions, 0), notes = nullif(btrim(coalesce(p_notes, '')), ''), high_rate_authorization_note = nullif(btrim(coalesce(p_high_rate_note, '')), ''), high_rate_authorized_by = case when p_commission_rate > 60 then v_creator else null end where id = v_settlement.id returning * into v_settlement;
    delete from public.employee_settlement_service_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_bonus_lines where settlement_id = v_settlement.id;
    delete from public.employee_settlement_deductions where settlement_id = v_settlement.id;
  end if;

  insert into public.employee_settlement_service_lines (settlement_id, production_entry_id, service_name_snapshot, production_date_snapshot, commissionable_amount, commission_rate, commission_amount, fixed_commission_amount)
  select v_settlement.id, esp.id, s.name, esp.production_date, esp.commissionable_amount, case when esp.production_source in ('reward', 'courtesy') then 0 else p_commission_rate end, case when esp.production_source in ('reward', 'courtesy') then 0 else round(esp.commissionable_amount * p_commission_rate / 100, 2) end, esp.fixed_commission_amount from public.employee_service_production esp join public.services s on s.id = esp.service_id where esp.payroll_period_id = p_period_id and esp.employee_id = p_employee_id and esp.status = 'active';
  insert into public.employee_settlement_bonus_lines (settlement_id, product_bonus_entry_id, product_name_snapshot, bonus_amount)
  select v_settlement.id, epb.id, coalesce(p.name, s.name), epb.total_bonus_amount
  from public.employee_product_bonus_entries epb
  left join public.products p on p.id = epb.product_id
  left join public.services s on s.id = epb.service_id
  where epb.payroll_period_id = p_period_id
    and epb.employee_id = p_employee_id
    and epb.status = 'active';
  for v_item in select * from jsonb_array_elements(coalesce(p_debt_deductions, '[]'::jsonb)) loop
    select * into v_debt from public.employee_debts where id = (v_item ->> 'debt_id')::uuid; v_amount := round((v_item ->> 'amount')::numeric, 2);
    insert into public.employee_settlement_deductions (settlement_id, employee_debt_id, amount, balance_before, balance_after) values (v_settlement.id, v_debt.id, v_amount, v_debt.outstanding_amount, v_debt.outstanding_amount - v_amount);
  end loop;
  return v_settlement;
end;
$$;

create or replace function public.transition_employee_settlement(p_settlement_id uuid, p_action text, p_reason text default null)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.employee_settlements%rowtype; v_employee uuid := public.current_employee_id(); v_deduction record;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden gestionar liquidaciones.'; end if;
  select * into v_row from public.employee_settlements where id = p_settlement_id for update; if not found then raise exception 'La liquidacion no existe.'; end if;
  if p_action = 'review' and v_row.status = 'draft' then update public.employee_settlements set status='review', reviewed_by=v_employee, reviewed_at=now() where id=p_settlement_id returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60 and nullif(btrim(coalesce(v_row.high_rate_authorization_note,'')),'') is null then raise exception 'La autorizacion del porcentaje excepcional esta incompleta.'; end if;
    update public.employee_settlements set status='approved', approved_by=v_employee, approved_at=now() where id=p_settlement_id returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft','review','approved','paid') then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'El motivo de anulacion es obligatorio.'; end if;
    if v_row.status = 'paid' then
      for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id loop
        update public.employee_debts set outstanding_amount=least(original_amount,outstanding_amount+v_deduction.amount), status=case when outstanding_amount+v_deduction.amount>=original_amount then 'pending' else 'partial' end, settled_at=null where id=v_deduction.employee_debt_id;
        insert into public.employee_debt_movements (debt_id,movement_type,amount,settlement_id,notes,created_by) values (v_deduction.employee_debt_id,'adjustment',v_deduction.amount,p_settlement_id,'Reversion por anulacion de liquidacion pagada.',v_employee);
      end loop;
      if v_row.cash_movement_id is not null then
        update public.cash_movements set status='cancelled',cancelled_by=v_employee,cancelled_at=now(),cancelled_reason='Liquidacion anulada: '||btrim(p_reason),updated_at=now() where id=v_row.cash_movement_id and status='active';
      end if;
    end if;
    update public.employee_settlements set status='cancelled', cancelled_by=v_employee, cancelled_at=now(), cancellation_reason=btrim(p_reason) where id=p_settlement_id returning * into v_row;
  else raise exception 'La transicion solicitada no esta permitida.'; end if;
  return v_row;
end;
$$;

create or replace function public.register_employee_supply_delivery(
  p_employee_id uuid, p_branch_id uuid, p_product_id uuid, p_quantity numeric,
  p_payment_mode text, p_payment_method_id uuid default null,
  p_payment_reference text default null, p_notes text default null
)
returns public.employee_supply_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype; v_rule public.employee_supply_markup_rules%rowtype;
  v_delivery public.employee_supply_deliveries%rowtype; v_debt public.employee_debts%rowtype;
  v_employee uuid := public.current_employee_id(); v_unit_charge numeric(12,2); v_total numeric(12,2);
  v_stock numeric(12,2); v_stock_id uuid; v_cash_id uuid; v_session public.pos_sessions%rowtype;
  v_method public.payment_methods%rowtype; v_category_id uuid;
begin
  if not (public.is_admin() or (public.current_user_role()='reception' and public.can_access_branch(p_branch_id))) then raise exception 'No tienes permisos para entregar insumos en esta sede.'; end if;
  if coalesce(p_quantity,0)<=0 or p_payment_mode not in ('immediate','credit') then raise exception 'Cantidad o forma de pago no valida.'; end if;
  select * into v_product from public.products where id=p_product_id and is_active for share; if not found then raise exception 'El producto no esta disponible.'; end if;
  select coalesce(stock_quantity,0) into v_stock from public.vw_product_stock where product_id=p_product_id and branch_id=p_branch_id; if coalesce(v_stock,0)<p_quantity then raise exception 'Stock insuficiente para entregar el insumo.'; end if;
  select * into v_rule from public.employee_supply_markup_rules where is_active and (product_id=p_product_id or product_id is null) and effective_from<=current_date and (effective_to is null or effective_to>=current_date) order by case when product_id is not null then 2 else 1 end desc,priority desc limit 1;
  if found then v_unit_charge:=round(v_product.cost_price+case when v_rule.markup_type='percentage' then v_product.cost_price*v_rule.markup_value/100 else v_rule.markup_value end,2); else v_rule.markup_type:='fixed';v_rule.markup_value:=0;v_unit_charge:=v_product.cost_price; end if;
  v_total:=round(v_unit_charge*p_quantity,2);
  if p_payment_mode='immediate' then
    select * into v_method from public.payment_methods where id=p_payment_method_id and is_active; if not found then raise exception 'Selecciona un metodo de pago activo.'; end if;
    select * into v_session from public.pos_sessions where branch_id=p_branch_id and status='open' order by opened_at desc limit 1; if not found then raise exception 'No existe una sesion POS activa para registrar el ingreso inmediato.'; end if;
  end if;
  insert into public.stock_movements (product_id,branch_id,movement_type,quantity,unit_cost,reference_type,notes,created_by) values (p_product_id,p_branch_id,'adjustment',p_quantity*-1,v_product.cost_price,'employee_supply','Entrega de insumo a empleado.',v_employee) returning id into v_stock_id;
  if p_payment_mode='credit' then v_debt:=public.create_employee_debt(p_employee_id,p_branch_id,'supply',v_total,'Entrega de insumo: '||v_product.name); end if;
  if p_payment_mode='immediate' and v_method.code='cash' then
    select id into v_category_id from public.cash_movement_categories where code='employee_supply_payment' limit 1;
    insert into public.cash_movements (pos_session_id,branch_id,category_id,movement_type,amount,description,status,created_by) values (v_session.id,p_branch_id,v_category_id,'income',v_total,'Pago inmediato de insumo de empleado.','active',v_employee) returning id into v_cash_id;
  end if;
  insert into public.employee_supply_deliveries (employee_id,branch_id,product_id,quantity,unit_cost_snapshot,markup_type,markup_value,unit_charge_amount,total_charge_amount,payment_mode,payment_method_id,payment_reference,stock_movement_id,cash_movement_id,employee_debt_id,notes,created_by)
  values (p_employee_id,p_branch_id,p_product_id,p_quantity,v_product.cost_price,v_rule.markup_type,v_rule.markup_value,v_unit_charge,v_total,p_payment_mode,p_payment_method_id,nullif(btrim(coalesce(p_payment_reference,'')),''),v_stock_id,v_cash_id,v_debt.id,nullif(btrim(coalesce(p_notes,'')),''),v_employee) returning * into v_delivery;
  update public.stock_movements set reference_id=v_delivery.id where id=v_stock_id;
  return v_delivery;
end;
$$;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid, p_payment_method_id uuid, p_amount numeric,
  p_reference text default null, p_evidence_path text default null,
  p_notes text default null, p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.employee_settlements%rowtype; v_method public.payment_methods%rowtype; v_employee uuid := public.current_employee_id(); v_deduction record; v_cash_id uuid; v_category_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo owner o admin pueden pagar liquidaciones.'; end if;
  select * into v_row from public.employee_settlements where id=p_settlement_id for update; if not found or v_row.status <> 'approved' then raise exception 'La liquidacion debe estar aprobada antes de pagar.'; end if;
  if round(coalesce(p_amount,0),2) <> round(v_row.net_pay_amount,2) then raise exception 'El monto debe coincidir con el neto de la liquidacion.'; end if;
  select * into v_method from public.payment_methods where id=p_payment_method_id and is_active; if not found then raise exception 'El metodo de pago no esta disponible.'; end if;
  if v_method.code = 'cash' then
    if p_pos_session_id is null or not exists (select 1 from public.pos_sessions where id=p_pos_session_id and branch_id=v_row.branch_id and status='open') then raise exception 'No existe una sesion POS activa para registrar el pago en efectivo.'; end if;
    select id into v_category_id from public.cash_movement_categories where code='employee_settlement_payment' limit 1;
    insert into public.cash_movements (pos_session_id, branch_id, category_id, movement_type, amount, description, status, created_by)
    values (p_pos_session_id, v_row.branch_id, v_category_id, 'expense', v_row.net_pay_amount, 'Pago de liquidacion ' || v_row.settlement_number, 'active', v_employee) returning id into v_cash_id;
  end if;
  for v_deduction in select * from public.employee_settlement_deductions where settlement_id=p_settlement_id loop
    update public.employee_debts set outstanding_amount=v_deduction.balance_after, status=case when v_deduction.balance_after=0 then 'paid' else 'partial' end, settled_at=case when v_deduction.balance_after=0 then now() else null end where id=v_deduction.employee_debt_id;
    insert into public.employee_debt_movements (debt_id,movement_type,amount,settlement_id,notes,created_by) values (v_deduction.employee_debt_id,'settlement_deduction',v_deduction.amount,p_settlement_id,'Descuento aplicado en liquidacion.',v_employee);
  end loop;
  update public.employee_settlements set status='paid', payment_method_id=p_payment_method_id, payment_reference=nullif(btrim(coalesce(p_reference,'')),''), payment_evidence_path=nullif(btrim(coalesce(p_evidence_path,'')),''), cash_movement_id=v_cash_id, notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes), paid_by=v_employee, paid_at=now() where id=p_settlement_id returning * into v_row;
  return v_row;
end;
$$;

insert into public.cash_movement_categories (code,name,description,movement_direction,sort_order,is_active)
values ('employee_settlement_payment','Pago de liquidacion','Salida de efectivo por liquidacion de empleado.','expense',50,true)
on conflict (code) do update set name=excluded.name, description=excluded.description, movement_direction=excluded.movement_direction;

insert into public.cash_movement_categories (code,name,description,movement_direction,sort_order,is_active)
values ('employee_supply_payment','Pago de insumo','Ingreso en efectivo por insumo entregado a empleado.','income',51,true)
on conflict (code) do update set name=excluded.name, description=excluded.description, movement_direction=excluded.movement_direction;

revoke all on function public.calculate_operational_contribution(numeric,date) from public;
revoke all on function public.get_service_fixed_commission(text,uuid,date) from public;
revoke all on function public.generate_employee_production_for_sale(uuid) from public;
revoke all on function public.generate_production_for_period(uuid,uuid) from public;
revoke all on function public.sales_production_sync_trigger() from public;
revoke all on function public.create_employee_debt(uuid,uuid,text,numeric,text) from public;
revoke all on function public.apply_employee_debt_payment(uuid,numeric,text,text,uuid,text) from public;
revoke all on function public.register_employee_benefit_usage(uuid,uuid,uuid,uuid,text) from public;
revoke all on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) from public;
revoke all on function public.transition_employee_settlement(uuid,text,text) from public;
revoke all on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid) from public;
revoke all on function public.register_employee_supply_delivery(uuid,uuid,uuid,numeric,text,uuid,text,text) from public;

grant execute on function public.generate_production_for_period(uuid,uuid) to authenticated,service_role;
grant execute on function public.create_employee_debt(uuid,uuid,text,numeric,text) to authenticated,service_role;
grant execute on function public.apply_employee_debt_payment(uuid,numeric,text,text,uuid,text) to authenticated,service_role;
grant execute on function public.register_employee_benefit_usage(uuid,uuid,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.prepare_employee_settlement(uuid,uuid,numeric,jsonb,text,text) to authenticated,service_role;
grant execute on function public.transition_employee_settlement(uuid,text,text) to authenticated,service_role;
grant execute on function public.pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid) to authenticated,service_role;
grant execute on function public.register_employee_supply_delivery(uuid,uuid,uuid,numeric,text,uuid,text,text) to authenticated,service_role;
grant execute on function public.generate_employee_production_for_sale(uuid) to service_role;
grant execute on function public.calculate_operational_contribution(numeric,date) to service_role;
grant execute on function public.get_service_fixed_commission(text,uuid,date) to service_role;


-- ============================================================================
-- Fuente consolidada: 093_employee_compensation_rls.sql
-- ============================================================================
-- Sprint 8.8: RLS y permisos de compensacion de empleados.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'payroll_periods','production_operational_rules','reward_service_commission_rules',
    'courtesy_service_commission_rules','product_bonus_rules','employee_supply_markup_rules',
    'employee_service_production','employee_product_bonus_entries','employee_debts',
    'employee_debt_movements','employee_supply_deliveries','employee_benefit_usages',
    'employee_settlements','employee_settlement_service_lines','employee_settlement_bonus_lines',
    'employee_settlement_deductions','employee_settlement_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_admin_all', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_service_role_all', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      v_table || '_admin_all', v_table
    );
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      v_table || '_service_role_all', v_table
    );
    execute format('revoke all on public.%I from anon, public', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end $$;

drop policy if exists "employee_benefit_usages_reception_scope" on public.employee_benefit_usages;
create policy "employee_benefit_usages_reception_scope"
on public.employee_benefit_usages
for select to authenticated
using (
  public.current_user_role() = 'reception'
  and public.can_access_branch(branch_id)
);

drop policy if exists "employee_supply_deliveries_reception_scope" on public.employee_supply_deliveries;
create policy "employee_supply_deliveries_reception_scope"
on public.employee_supply_deliveries
for select to authenticated
using (
  public.current_user_role() = 'reception'
  and public.can_access_branch(branch_id)
);

grant insert on public.employee_benefit_usages to authenticated;

grant insert, update on public.production_operational_rules to authenticated;
grant insert, update on public.reward_service_commission_rules to authenticated;
grant insert, update on public.courtesy_service_commission_rules to authenticated;
grant insert, update on public.product_bonus_rules to authenticated;
grant insert, update on public.employee_supply_markup_rules to authenticated;


-- ============================================================================
-- Fuente consolidada: 094_sale_documents_and_reward_guards.sql
-- ============================================================================
-- Sprint 8.9: snapshots internos de ticket y garantias de canje de rewards.
-- Ejecutar despues de 093_employee_compensation_rls.sql.

create table if not exists public.sale_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  document_type text not null check (document_type = 'internal_ticket'),
  schema_version text not null default '1.0',
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.employees(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_at timestamptz not null default now()
);

create unique index if not exists sale_document_snapshots_active_version_idx
  on public.sale_document_snapshots (sale_id, document_type, schema_version)
  where status = 'active';

create index if not exists sale_document_snapshots_sale_idx
  on public.sale_document_snapshots (sale_id, generated_at desc);

create unique index if not exists reward_redemptions_one_active_per_entitlement_idx
  on public.reward_redemptions (entitlement_id)
  where status = 'applied';

alter table public.sale_document_snapshots enable row level security;

drop policy if exists "sale_document_snapshots_select_scope" on public.sale_document_snapshots;
drop policy if exists "sale_document_snapshots_manage_scope" on public.sale_document_snapshots;
drop policy if exists "sale_document_snapshots_service_role_all" on public.sale_document_snapshots;

create policy "sale_document_snapshots_select_scope"
on public.sale_document_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
);

create policy "sale_document_snapshots_manage_scope"
on public.sale_document_snapshots
for all to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
);

create policy "sale_document_snapshots_service_role_all"
on public.sale_document_snapshots
for all to service_role using (true) with check (true);

grant select, insert on public.sale_document_snapshots to authenticated;
grant all on public.sale_document_snapshots to service_role;
revoke all on public.sale_document_snapshots from anon, public;


-- ============================================================================
-- Fuente consolidada: 095_operational_contacts_and_reservations.sql
-- ============================================================================
-- Sprint 8.10: categorias operativas de caja, contactos manuales y vinculo unico reserva-venta.

  insert into public.cash_movement_categories (code, name, description, movement_direction, sort_order, is_active)
  values
    ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
    ('employee_supply_collection', 'Cobro de insumo a empleado', 'Cobro manual por insumos entregados.', 'income', 2, true),
    ('cash_replenishment', 'Reposicion de caja', 'Ingreso para reponer efectivo operativo.', 'income', 3, true),
    ('other_income', 'Otro ingreso', 'Ingreso operativo no clasificado.', 'income', 4, true),
    ('operational_purchase', 'Compra operativa', 'Compra pagada desde caja sin afectar stock.', 'expense', 10, true),
    ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 11, true),
    ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 12, true),
    ('settlement_payment', 'Pago de liquidacion', 'Pago operativo de liquidacion a empleado.', 'expense', 13, true),
    ('other_expense', 'Otro egreso', 'Egreso operativo no clasificado.', 'expense', 14, true),
    ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 20, true),
    ('positive_adjustment', 'Ajuste positivo', 'Correccion positiva de caja.', 'adjustment', 21, true),
    ('negative_adjustment', 'Ajuste negativo', 'Correccion negativa de caja.', 'adjustment', 22, true)
  on conflict (code) do update
  set name = excluded.name, description = excluded.description, movement_direction = excluded.movement_direction,
      sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();

  create table if not exists public.whatsapp_templates (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    contact_type text not null check (contact_type in ('reservation_reminder', 'post_service_thanks', 'manual')),
    body text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  insert into public.whatsapp_templates (code, name, contact_type, body)
  values
    ('reservation_reminder_default', 'Recordatorio de reserva', 'reservation_reminder', 'Hola {{cliente}}, te recordamos tu reserva para {{fecha}} a las {{hora}} en {{sede}}. {{direccion}}. Barbero: {{barbero}}. Servicio de interes: {{servicio}}.'),
    ('post_service_thanks_default', 'Agradecimiento post servicio', 'post_service_thanks', 'Gracias por visitarnos, {{cliente}}. Esperamos verte pronto en {{sede}}. Te atendio {{barbero}}. Servicios: {{servicios}}.')
  on conflict (code) do update set name = excluded.name, body = excluded.body, is_active = true, updated_at = now();

  alter table public.whatsapp_templates enable row level security;
  drop policy if exists "whatsapp_templates_select_scope" on public.whatsapp_templates;
  drop policy if exists "whatsapp_templates_manage_admin" on public.whatsapp_templates;
  drop policy if exists "whatsapp_templates_service_role_all" on public.whatsapp_templates;
  create policy "whatsapp_templates_select_scope" on public.whatsapp_templates for select to authenticated using (is_active and (public.is_admin() or public.current_user_role() = 'reception'));
  create policy "whatsapp_templates_manage_admin" on public.whatsapp_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
  create policy "whatsapp_templates_service_role_all" on public.whatsapp_templates for all to service_role using (true) with check (true);
  grant select on public.whatsapp_templates to authenticated;
  grant all on public.whatsapp_templates to service_role;
  revoke all on public.whatsapp_templates from public;

  create table if not exists public.whatsapp_contact_logs (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    reservation_id uuid references public.reservations(id) on delete set null,
    sale_id uuid references public.sales(id) on delete set null,
    branch_id uuid not null references public.branches(id) on delete restrict,
    contact_type text not null check (contact_type in ('reservation_reminder', 'post_service_thanks', 'manual')),
    template_id uuid references public.whatsapp_templates(id) on delete set null,
    phone text not null,
    message_snapshot text not null,
    status text not null default 'opened' check (status in ('opened', 'marked_sent', 'cancelled')),
    contacted_at timestamptz,
    contacted_by uuid references public.employees(id) on delete set null,
    created_at timestamptz not null default now()
  );

  create index if not exists whatsapp_contact_logs_reservation_idx on public.whatsapp_contact_logs (reservation_id, created_at desc);
  create index if not exists whatsapp_contact_logs_sale_idx on public.whatsapp_contact_logs (sale_id, created_at desc);
  create index if not exists whatsapp_contact_logs_branch_created_idx on public.whatsapp_contact_logs (branch_id, created_at desc);

  alter table public.whatsapp_contact_logs enable row level security;
  drop policy if exists "whatsapp_contact_logs_select_scope" on public.whatsapp_contact_logs;
  drop policy if exists "whatsapp_contact_logs_write_scope" on public.whatsapp_contact_logs;
  drop policy if exists "whatsapp_contact_logs_service_role_all" on public.whatsapp_contact_logs;
  create policy "whatsapp_contact_logs_select_scope" on public.whatsapp_contact_logs for select to authenticated
  using ((public.is_admin() or public.current_user_role() = 'reception') and public.can_access_branch(branch_id));
  create policy "whatsapp_contact_logs_write_scope" on public.whatsapp_contact_logs for insert to authenticated
  with check ((public.is_admin() or public.current_user_role() = 'reception') and public.can_access_branch(branch_id));
  create policy "whatsapp_contact_logs_service_role_all" on public.whatsapp_contact_logs for all to service_role using (true) with check (true);
  grant select, insert on public.whatsapp_contact_logs to authenticated;
  grant all on public.whatsapp_contact_logs to service_role;
  revoke all on public.whatsapp_contact_logs from public;

  create unique index if not exists sales_one_completed_reservation_idx
    on public.sales (reservation_id)
    where status = 'completed' and reservation_id is not null;


-- ============================================================================
-- Fuente consolidada: 096_sale_cancellation_reasons.sql
-- ============================================================================
-- Sprint 8.11: catalogo de motivos para anulaciones de venta.
-- Ejecutar despues de 095_operational_contacts_and_reservations.sql.

create table if not exists public.sale_cancellation_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales
  add column if not exists cancellation_reason_id uuid references public.sale_cancellation_reasons(id) on delete set null,
  add column if not exists cancellation_notes text;

create index if not exists sales_cancellation_reason_id_idx on public.sales (cancellation_reason_id);

insert into public.sale_cancellation_reasons (code, name, description, sort_order)
values
  ('error_de_registro', 'Error de registro', 'Datos incorrectos durante el registro.', 1),
  ('cliente_desistio', 'Cliente desistio', 'El cliente decidio no continuar.', 2),
  ('pago_no_completado', 'Pago no completado', 'No se completo el pago de la venta.', 3),
  ('servicio_no_realizado', 'Servicio no realizado', 'El servicio finalmente no fue realizado.', 4),
  ('venta_duplicada', 'Venta duplicada', 'La venta fue registrada mas de una vez.', 5),
  ('otro', 'Otro motivo', 'Motivo no incluido en el catalogo.', 99)
on conflict (code) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
    is_active = true, updated_at = now();

alter table public.sale_cancellation_reasons enable row level security;
drop policy if exists "sale_cancellation_reasons_select_scope" on public.sale_cancellation_reasons;
drop policy if exists "sale_cancellation_reasons_manage_admin" on public.sale_cancellation_reasons;
drop policy if exists "sale_cancellation_reasons_service_role_all" on public.sale_cancellation_reasons;
create policy "sale_cancellation_reasons_select_scope" on public.sale_cancellation_reasons for select to authenticated
using (is_active and public.current_user_role() in ('owner', 'admin', 'reception'));
create policy "sale_cancellation_reasons_manage_admin" on public.sale_cancellation_reasons for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "sale_cancellation_reasons_service_role_all" on public.sale_cancellation_reasons for all to service_role using (true) with check (true);
grant select on public.sale_cancellation_reasons to authenticated;
grant all on public.sale_cancellation_reasons to service_role;
revoke all on public.sale_cancellation_reasons from public;


-- ============================================================================
-- Fuente consolidada: 097_sale_cancellation_schema_patch.sql
-- ============================================================================
-- Sprint 8.11: compatibilidad de anulaciones para tickets y ventas historicas.
-- Ejecutar despues de 096_sale_cancellation_reasons.sql. Es idempotente.

create table if not exists public.sale_cancellation_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales
  add column if not exists cancellation_reason_id uuid,
  add column if not exists cancellation_notes text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_cancellation_reason_id_fkey') then
    alter table public.sales add constraint sales_cancellation_reason_id_fkey foreign key (cancellation_reason_id) references public.sale_cancellation_reasons(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_cancelled_by_fkey') then
    alter table public.sales add constraint sales_cancelled_by_fkey foreign key (cancelled_by) references public.employees(id) on delete set null;
  end if;
end $$;

create index if not exists sales_cancellation_reason_id_idx on public.sales (cancellation_reason_id);


-- ============================================================================
-- Fuente consolidada: 098_sale_document_snapshots_schema_reload.sql
-- ============================================================================
-- Sprint 8.11: verificacion idempotente y recarga de PostgREST para tickets.
create table if not exists public.sale_document_snapshots (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete restrict,
  document_type text not null, schema_version text not null, payload jsonb not null, status text not null default 'active',
  generated_at timestamptz not null default now(), generated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists sale_document_snapshots_active_version_idx on public.sale_document_snapshots (sale_id, document_type, schema_version) where status = 'active';
create index if not exists sale_document_snapshots_sale_idx on public.sale_document_snapshots (sale_id, generated_at desc);
notify pgrst, 'reload schema';
select to_regclass('public.sale_document_snapshots');
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sale_document_snapshots' order by ordinal_position;


-- ============================================================================
-- Fuente consolidada: 099_sale_document_snapshots_actor_fk.sql
-- ============================================================================
-- Sprint 8.12: alinea el actor del snapshot con la convencion de empleados.
do $$
begin
  if exists (
    select 1
    from public.sale_document_snapshots snapshot
    left join public.employees employee on employee.id = snapshot.generated_by
    where snapshot.generated_by is not null
      and employee.id is null
  ) then
    raise exception 'No se puede alinear generated_by: existen actores que no corresponden a empleados.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'sale_document_snapshots_generated_by_fkey'
      and conrelid = 'public.sale_document_snapshots'::regclass
      and pg_get_constraintdef(oid) not like '%REFERENCES employees(id)%'
  ) then
    alter table public.sale_document_snapshots
      drop constraint sale_document_snapshots_generated_by_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_document_snapshots_generated_by_fkey'
      and conrelid = 'public.sale_document_snapshots'::regclass
  ) then
    alter table public.sale_document_snapshots
      add constraint sale_document_snapshots_generated_by_fkey
      foreign key (generated_by) references public.employees(id) on delete set null;
  end if;
end;
$$;

notify pgrst, 'reload schema';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'sale_document_snapshots_generated_by_fkey';


-- ============================================================================
-- Fuente consolidada: 100_courtesy_rules.sql
-- ============================================================================
-- Sprint 8.13: reglas auditables para cortesias operativas.
create table if not exists public.courtesy_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  branch_id uuid references public.branches(id) on delete cascade,
  is_active boolean not null default true,
  priority integer not null default 0,
  qualifying_item_type text not null default 'service' check (qualifying_item_type = 'service'),
  qualifying_service_id uuid references public.services(id) on delete restrict,
  qualifying_service_category_id uuid references public.service_categories(id) on delete restrict,
  minimum_unit_amount numeric(12,2) not null default 0 check (minimum_unit_amount >= 0),
  amount_basis text not null default 'effective_unit_price' check (amount_basis in ('effective_unit_price', 'catalog_unit_price')),
  maximum_courtesy_items integer not null default 1 check (maximum_courtesy_items > 0),
  maximum_courtesy_amount numeric(12,2) check (maximum_courtesy_amount is null or maximum_courtesy_amount >= 0),
  allow_with_reward boolean not null default false,
  reward_covered_service_qualifies boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (qualifying_service_id is null or qualifying_service_category_id is null)
);

create table if not exists public.courtesy_rule_benefits (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.courtesy_rules(id) on delete cascade,
  benefit_item_type text not null check (benefit_item_type in ('service', 'product')),
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  service_category_id uuid references public.service_categories(id) on delete restrict,
  product_category_id uuid references public.product_categories(id) on delete restrict,
  max_quantity integer not null default 1 check (max_quantity > 0),
  max_unit_amount numeric(12,2) check (max_unit_amount is null or max_unit_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(service_id, product_id, service_category_id, product_category_id) = 1)
);

alter table public.sale_items
  add column if not exists courtesy_rule_id uuid references public.courtesy_rules(id) on delete set null,
  add column if not exists courtesy_rule_name_snapshot text,
  add column if not exists original_unit_price numeric(12,2),
  add column if not exists original_total numeric(12,2),
  add column if not exists courtesy_amount numeric(12,2),
  add column if not exists qualifying_sale_item_id uuid references public.sale_items(id) on delete set null,
  add column if not exists courtesy_authorized_by uuid references public.employees(id) on delete set null;

create index if not exists courtesy_rules_scope_idx on public.courtesy_rules (branch_id, is_active, priority desc);
create index if not exists courtesy_rule_benefits_rule_idx on public.courtesy_rule_benefits (rule_id, is_active);

alter table public.courtesy_rules enable row level security;
alter table public.courtesy_rule_benefits enable row level security;

drop policy if exists "courtesy_rules_select" on public.courtesy_rules;
drop policy if exists "courtesy_rules_manage" on public.courtesy_rules;
drop policy if exists "courtesy_rule_benefits_select" on public.courtesy_rule_benefits;
drop policy if exists "courtesy_rule_benefits_manage" on public.courtesy_rule_benefits;

create policy "courtesy_rules_select" on public.courtesy_rules for select to authenticated using (public.is_admin() or public.is_owner() or branch_id is null or public.can_access_branch(branch_id));
create policy "courtesy_rules_manage" on public.courtesy_rules for all to authenticated using (public.is_admin() or public.is_owner()) with check (public.is_admin() or public.is_owner());
create policy "courtesy_rule_benefits_select" on public.courtesy_rule_benefits for select to authenticated using (exists (select 1 from public.courtesy_rules rule where rule.id = courtesy_rule_benefits.rule_id and (public.is_admin() or public.is_owner() or rule.branch_id is null or public.can_access_branch(rule.branch_id))));
create policy "courtesy_rule_benefits_manage" on public.courtesy_rule_benefits for all to authenticated using (public.is_admin() or public.is_owner()) with check (public.is_admin() or public.is_owner());

grant select on public.courtesy_rules, public.courtesy_rule_benefits to authenticated;
grant insert, update on public.courtesy_rules, public.courtesy_rule_benefits to authenticated;
grant all on public.courtesy_rules, public.courtesy_rule_benefits to service_role;
revoke all on public.courtesy_rules, public.courtesy_rule_benefits from anon, public;
notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 101_payment_method_operational_properties.sql
-- ============================================================================
-- Sprint 8.13: propiedades operativas de metodos de pago configurables.
alter table public.payment_methods
  add column if not exists payment_kind text,
  add column if not exists allows_change boolean not null default false,
  add column if not exists counts_as_cash boolean not null default false;

update public.payment_methods
set payment_kind = case
  when code = 'cash' then 'cash'
  when code = 'wallet_qr' then 'wallet_qr'
  when code = 'card_pos' then 'card'
  else coalesce(payment_kind, 'other_digital')
end;

update public.payment_methods
set allows_change = payment_kind = 'cash',
    counts_as_cash = payment_kind = 'cash';

alter table public.payment_methods
  alter column payment_kind set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_methods_payment_kind_check') then
    alter table public.payment_methods add constraint payment_methods_payment_kind_check check (payment_kind in ('cash', 'wallet_qr', 'card', 'bank_transfer', 'other_digital'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_methods_operational_flags_check') then
    alter table public.payment_methods add constraint payment_methods_operational_flags_check check ((payment_kind = 'cash' and allows_change and counts_as_cash) or (payment_kind <> 'cash' and not allows_change and not counts_as_cash));
  end if;
end $$;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 102_search_normalization.sql
-- ============================================================================
-- Busqueda operativa insensible a mayusculas, minusculas y acentos.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function public.normalize_search_text(value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select lower(unaccent('unaccent', coalesce(value, ''))) $$;

alter table public.customers add column if not exists search_normalized text;

update public.customers
set search_normalized = public.normalize_search_text(concat_ws(' ', full_name, first_name, last_name, business_name, phone, phone_normalized, document_number, email));

create or replace function public.set_customer_search_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_normalized := public.normalize_search_text(concat_ws(' ', new.full_name, new.first_name, new.last_name, new.business_name, new.phone, new.phone_normalized, new.document_number, new.email));
  return new;
end;
$$;

drop trigger if exists customers_search_normalized on public.customers;
create trigger customers_search_normalized before insert or update of full_name, first_name, last_name, business_name, phone, phone_normalized, document_number, email on public.customers for each row execute function public.set_customer_search_normalized();

create index if not exists customers_search_normalized_idx on public.customers using gin (search_normalized gin_trgm_ops);
notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 103_settlement_mandatory_discount.sql
-- ============================================================================
-- Sprint 8.14: snapshot del descuento obligatorio aplicado despues de deducciones.
alter table public.employee_settlements
  add column if not exists net_before_mandatory_discount numeric(12,2) not null default 0,
  add column if not exists mandatory_discount_rate numeric(7,4) not null default 1,
  add column if not exists mandatory_discount_amount numeric(12,2) not null default 0;

create or replace function public.apply_settlement_mandatory_discount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.mandatory_discount_rate := greatest(coalesce(new.mandatory_discount_rate, 1), 0);
  new.net_before_mandatory_discount := greatest(round(coalesce(new.gross_pay_amount, 0) - coalesce(new.debt_deduction_total, 0), 2), 0);
  new.mandatory_discount_amount := round(new.net_before_mandatory_discount * new.mandatory_discount_rate / 100, 2);
  new.net_pay_amount := greatest(new.net_before_mandatory_discount - new.mandatory_discount_amount, 0);
  return new;
end;
$$;

drop trigger if exists employee_settlements_mandatory_discount on public.employee_settlements;
create trigger employee_settlements_mandatory_discount
before insert or update of gross_pay_amount, debt_deduction_total, mandatory_discount_rate
on public.employee_settlements
for each row execute function public.apply_settlement_mandatory_discount();

update public.employee_settlements
set mandatory_discount_rate = 1;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 104_finance_manual_entries.sql
-- ============================================================================
-- Sprint 8.14: registros manuales para el libro financiero administrativo.
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  direction text not null check (direction in ('income', 'expense')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_manual_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  entry_date date not null default current_date,
  direction text not null check (direction in ('income', 'expense')),
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  description text not null,
  reference text,
  evidence_url text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_manual_entries_date_idx on public.finance_manual_entries (entry_date, status);
create index if not exists finance_manual_entries_branch_idx on public.finance_manual_entries (branch_id, entry_date);

alter table public.finance_categories enable row level security;
alter table public.finance_manual_entries enable row level security;

drop policy if exists "finance_categories_select" on public.finance_categories;
drop policy if exists "finance_categories_manage" on public.finance_categories;
drop policy if exists "finance_manual_entries_select" on public.finance_manual_entries;
drop policy if exists "finance_manual_entries_manage" on public.finance_manual_entries;

create policy "finance_categories_select" on public.finance_categories for select to authenticated using (public.is_owner() or public.is_admin());
create policy "finance_categories_manage" on public.finance_categories for all to authenticated using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());
create policy "finance_manual_entries_select" on public.finance_manual_entries for select to authenticated using (public.is_owner() or public.is_admin());
create policy "finance_manual_entries_manage" on public.finance_manual_entries for all to authenticated using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

grant select, insert, update on public.finance_categories, public.finance_manual_entries to authenticated;
grant all on public.finance_categories, public.finance_manual_entries to service_role;
revoke all on public.finance_categories, public.finance_manual_entries from anon, public;
notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 105_payment_method_cash_semantics.sql
-- ============================================================================
-- Sprint 8.14: el efectivo se determina por propiedades operativas, no por codigo.
-- Ejecutar despues de 101_payment_method_operational_properties.sql.

do $$
declare
  v_function_oid oid;
  v_definition text;
begin
  for v_function_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('close_pos_session', 'pay_employee_settlement', 'register_employee_supply')
  loop
    v_definition := pg_get_functiondef(v_function_oid);
    v_definition := replace(v_definition, 'pm.code = ''cash''', 'pm.counts_as_cash');
    v_definition := replace(v_definition, 'pm.code=''cash''', 'pm.counts_as_cash');
    v_definition := replace(v_definition, 'v_method.code = ''cash''', 'v_method.counts_as_cash');
    v_definition := replace(v_definition, 'v_method.code=''cash''', 'v_method.counts_as_cash');
    execute v_definition;
  end loop;
end $$;

-- Categorias iniciales para movimientos manuales. No duplica codigos existentes.
insert into public.finance_categories (name, code, direction, sort_order)
values
  ('Otros ingresos', 'other_income', 'income', 100),
  ('Gastos operativos', 'operating_expense', 'expense', 100)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    sort_order = excluded.sort_order,
    updated_at = now();

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 106_settlement_review_adjustments.sql
-- ============================================================================
-- Revisión previa de liquidación con ajustes auditables.
-- Ejecutar después de 103_settlement_mandatory_discount.sql.

create or replace function public.review_employee_settlement(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_adjustment jsonb;
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_bonus numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_before numeric(12,2);
  v_mandatory numeric(12,2);
  v_employee uuid := public.current_employee_id();
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Solo owner o admin pueden revisar liquidaciones.';
  end if;

  select * into v_settlement from public.employee_settlements where id = p_settlement_id for update;
  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidación en borrador puede revisarse.';
  end if;

  delete from public.employee_settlement_adjustments where settlement_id = p_settlement_id;
  for v_adjustment in select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) loop
    v_type := v_adjustment ->> 'adjustment_type';
    v_description := nullif(btrim(coalesce(v_adjustment ->> 'description', '')), '');
    v_amount := round(coalesce((v_adjustment ->> 'amount')::numeric, 0), 2);
    if v_type not in ('bonus', 'deduction') or v_description is null or v_amount <= 0 then
      raise exception 'Cada ajuste necesita tipo, motivo y monto mayor a cero.';
    end if;
    insert into public.employee_settlement_adjustments (settlement_id, adjustment_type, description, amount, created_by)
    values (p_settlement_id, v_type, v_description, v_amount, v_employee);
    if v_type = 'bonus' then v_bonus := v_bonus + v_amount; else v_deduction := v_deduction + v_amount; end if;
  end loop;

  v_before := greatest(v_settlement.gross_pay_amount + v_bonus - v_settlement.debt_deduction_total - v_deduction, 0);
  v_mandatory := round(v_before * coalesce(v_settlement.mandatory_discount_rate, 1) / 100, 2);
  update public.employee_settlements
  set manual_bonus_total = v_bonus,
      other_deduction_total = v_deduction,
      net_before_mandatory_discount = v_before,
      mandatory_discount_amount = v_mandatory,
      net_pay_amount = greatest(v_before - v_mandatory, 0),
      status = 'review',
      reviewed_by = v_employee,
      reviewed_at = now()
  where id = p_settlement_id
  returning * into v_settlement;
  return v_settlement;
end;
$$;

revoke all on function public.review_employee_settlement(uuid, jsonb) from public;
grant execute on function public.review_employee_settlement(uuid, jsonb) to authenticated, service_role;


-- ============================================================================
-- Fuente consolidada: 107_auth_password_security.sql
-- ============================================================================
-- Sprint 8.15: metadatos seguros para cambio y recuperación de contraseña.
-- No guarda contraseñas, tokens ni enlaces de recuperación.

alter table public.employees
  add column if not exists password_changed_at timestamptz,
  add column if not exists password_recovery_sent_at timestamptz,
  add column if not exists password_recovery_sent_by uuid references public.employees(id) on delete set null;

create index if not exists employees_password_recovery_sent_idx
  on public.employees (password_recovery_sent_at desc)
  where password_recovery_sent_at is not null;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 108_pos_payment_integrity_patch.sql
-- ============================================================================
-- Sprint 9: preserva el vuelto por pago y totaliza sesiones por propiedades operativas.
-- Ejecutar manualmente en Supabase SQL Editor despues de 105_payment_method_cash_semantics.sql.

create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_total_sales numeric(12,2) := 0;
  v_total_cash numeric(12,2) := 0;
  v_total_wallet numeric(12,2) := 0;
  v_total_card numeric(12,2) := 0;
  v_total_cancelled numeric(12,2) := 0;
  v_sales_count integer := 0;
  v_cancelled_sales_count integer := 0;
  v_cash_income numeric(12,2) := 0;
  v_cash_expense numeric(12,2) := 0;
  v_cash_adjustment numeric(12,2) := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  select
    coalesce(sum(case when s.status = 'completed' then s.total else 0 end), 0),
    coalesce(sum(case when s.status = 'cancelled' then s.total else 0 end), 0),
    coalesce(count(*) filter (where s.status = 'completed'), 0),
    coalesce(count(*) filter (where s.status = 'cancelled'), 0)
  into
    v_total_sales,
    v_total_cancelled,
    v_sales_count,
    v_cancelled_sales_count
  from public.sales s
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(sp.amount) filter (where pm.counts_as_cash and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.payment_kind = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.payment_kind = 'card' and s.status = 'completed'), 0)
  into
    v_total_cash,
    v_total_wallet,
    v_total_card
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(case when cm.movement_type = 'income' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'expense' then cm.amount else 0 end), 0),
    coalesce(sum(case when cm.movement_type = 'adjustment' then cm.amount else 0 end), 0)
  into
    v_cash_income,
    v_cash_expense,
    v_cash_adjustment
  from public.cash_movements cm
  where cm.pos_session_id = p_session_id
    and cm.status = 'active';

  update public.pos_sessions
  set total_sales_amount = v_total_sales,
      total_cash_amount = v_total_cash,
      total_wallet_qr_amount = v_total_wallet,
      total_card_pos_amount = v_total_card,
      total_cancelled_amount = v_total_cancelled,
      sales_count = v_sales_count,
      cancelled_sales_count = v_cancelled_sales_count,
      expected_cash_amount = coalesce(opening_cash_amount, 0) + v_total_cash + v_cash_income - v_cash_expense + v_cash_adjustment
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
  v_change_amount numeric(12,2) := 0;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if not public.can_manage_pos_branch(v_sale.branch_id) then raise exception 'No tienes permisos para completar esta venta.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Solo las ventas en borrador se pueden completar.'; end if;
  if not exists (select 1 from public.pos_sessions ps where ps.id = v_sale.pos_session_id and ps.branch_id = v_sale.branch_id and ps.status = 'open') then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*) into v_item_count from public.sale_items where sale_id = p_sale_id;
  if v_item_count = 0 then raise exception 'La venta debe tener al menos un item.'; end if;
  if v_sale.paid_total < v_sale.total then raise exception 'Los pagos registrados no cubren el total de la venta.'; end if;

  select count(*) into v_service_count from public.sale_items where sale_id = p_sale_id and item_type = 'service';
  if v_service_count > 0 then
    select (v_sale.barber_id is not null or exists (select 1 from public.sale_items si where si.sale_id = p_sale_id and si.item_type = 'service' and si.barber_id is not null)) into v_barber_covered;
    if not v_barber_covered then raise exception 'Las ventas con servicios requieren un barbero asignado.'; end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select si.product_id, sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id and si.item_type = 'product' and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock on stock.product_id = p.id and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;
  if v_stock_issue is not null then raise exception '%', v_stock_issue; end if;

  insert into public.stock_movements (product_id, branch_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
  select si.product_id, v_sale.branch_id, case when si.is_courtesy then 'courtesy' else 'sale' end, si.quantity, coalesce(si.cost_snapshot, p.cost_price), 'sale', v_sale.id,
    case when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.' else 'Descuento de stock por venta completada.' end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id and si.item_type = 'product' and p.is_stockable = true;

  select coalesce(sum(sp.change_amount), 0) into v_change_amount from public.sale_payments sp where sp.sale_id = p_sale_id;

  update public.sales
  set status = 'completed', paid_total = greatest(paid_total, total), change_amount = v_change_amount,
      closed_by = v_employee_id, closed_at = now(), cancelled_by = null, cancelled_at = null, cancelled_reason = null
  where id = p_sale_id
  returning * into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations set status = 'completed', completed_at = now(), updated_by = v_employee_id where id = v_sale.reservation_id;
  end if;

  perform public.process_rewards_for_completed_sale(v_sale.id);
  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (pos_session_id, employee_id, event_type, message, metadata)
  values (v_sale.pos_session_id, v_employee_id, 'sale_completed', 'Venta completada.', jsonb_build_object('sale_id', v_sale.id, 'total', v_sale.total, 'customer_id', v_sale.customer_id));

  return v_sale;
end;
$$;

revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.complete_sale(uuid) from public;
grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.complete_sale(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 109_pos_checkout_idempotency.sql
-- ============================================================================
-- Sprint 9: una sola venta por intento de checkout dentro de una sesion POS.
-- Ejecutar manualmente en Supabase SQL Editor despues de 108_pos_payment_integrity_patch.sql.

alter table public.sales
  add column if not exists checkout_idempotency_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_checkout_idempotency_key_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_checkout_idempotency_key_check
      check (
        checkout_idempotency_key is null
        or checkout_idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'
      );
  end if;
end $$;

create unique index if not exists sales_pos_session_checkout_idempotency_key_idx
  on public.sales (pos_session_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 113_restore_global_customer_access.sql
-- ============================================================================
-- ============================================================
-- SQL 113
-- Restaura el alcance global de clientes activos para reception.
--
-- Regla del negocio:
-- - owner/admin: acceso administrativo global.
-- - reception activa: lectura y actualización operativa global.
-- - barber/viewer: sin acceso al panel.
-- - anon: sin acceso.
-- - las entidades transaccionales continúan limitadas por sede.
-- ============================================================

alter table public.customers enable row level security;

-- ------------------------------------------------------------
-- Centraliza el contrato global de lectura.
-- SECURITY DEFINER se utiliza únicamente para devolver un booleano.
-- ------------------------------------------------------------

create or replace function public.can_access_customer(
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and exists (
        select 1
        from public.employees employee
        where employee.id = public.current_employee_id()
          and employee.status = 'active'::public.employee_status
      )
      and exists (
        select 1
        from public.customers customer
        where customer.id = p_customer_id
          and customer.is_active = true
      )
    )
$$;

revoke all
on function public.can_access_customer(uuid)
from public;

grant execute
on function public.can_access_customer(uuid)
to authenticated, service_role;

-- ------------------------------------------------------------
-- Rebaseline controlado de policies de customers.
-- Se eliminan las policies residuales que pudieran conservar
-- restricciones por sede.
-- ------------------------------------------------------------

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
  loop
    execute format(
      'drop policy if exists %I on public.customers',
      policy_record.policyname
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- SELECT
-- Owner/admin: global.
-- Reception activa: clientes activos globales.
-- ------------------------------------------------------------

-- Policy historica omitida: customers_select_team. La definicion final se conserva mas adelante.

-- ------------------------------------------------------------
-- INSERT
-- Reception solo registra clientes como el empleado autenticado.
-- No puede crear clientes internos con source = system.
-- ------------------------------------------------------------

-- Policy historica omitida: customers_insert_team. La definicion final se conserva mas adelante.

-- ------------------------------------------------------------
-- UPDATE
-- Reception activa puede actualizar clientes activos globales.
-- No puede convertirlos en clientes system ni reactivar/inactivar
-- registros mediante acceso directo.
-- ------------------------------------------------------------

-- Policy historica omitida: customers_update_team. La definicion final se conserva mas adelante.

-- ------------------------------------------------------------
-- DELETE
-- Exclusivo para owner/admin.
-- ------------------------------------------------------------

-- Policy historica omitida: customers_delete_admin. La definicion final se conserva mas adelante.

-- Los grants habilitan operaciones de tabla.
-- RLS decide qué filas puede operar cada sesión.

grant select, insert, update, delete
on table public.customers
to authenticated;

revoke all
on table public.customers
from anon;

notify pgrst, 'reload schema';



-- ============================================================================
-- Fuente consolidada: 114_iteration_11_settlement_review_runtime.sql
-- ============================================================================
-- Iteracion 11: restaura la revision auditable de liquidaciones en entornos incompletos.
-- Ejecutar una sola vez desde Supabase SQL Editor despues de 103_settlement_mandatory_discount.sql.

create or replace function public.review_employee_settlement(
  p_settlement_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.employee_settlements%rowtype;
  v_adjustment jsonb;
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_bonus numeric(12,2) := 0;
  v_deduction numeric(12,2) := 0;
  v_before numeric(12,2);
  v_mandatory numeric(12,2);
  v_employee uuid := public.current_employee_id();
begin
  if not (public.is_owner() or public.is_admin()) then
    raise exception 'Solo owner o admin pueden revisar liquidaciones.';
  end if;

  select *
  into v_settlement
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_settlement.status <> 'draft' then
    raise exception 'Solo una liquidacion en borrador puede revisarse.';
  end if;

  delete from public.employee_settlement_adjustments
  where settlement_id = p_settlement_id;

  for v_adjustment in
    select * from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb))
  loop
    v_type := v_adjustment ->> 'adjustment_type';
    v_description := nullif(btrim(coalesce(v_adjustment ->> 'description', '')), '');
    v_amount := round(coalesce((v_adjustment ->> 'amount')::numeric, 0), 2);

    if v_type not in ('bonus', 'deduction') or v_description is null or v_amount <= 0 then
      raise exception 'Cada ajuste necesita tipo, motivo y monto mayor a cero.';
    end if;

    insert into public.employee_settlement_adjustments (
      settlement_id,
      adjustment_type,
      description,
      amount,
      created_by
    ) values (
      p_settlement_id,
      v_type,
      v_description,
      v_amount,
      v_employee
    );

    if v_type = 'bonus' then
      v_bonus := v_bonus + v_amount;
    else
      v_deduction := v_deduction + v_amount;
    end if;
  end loop;

  v_before := greatest(
    v_settlement.gross_pay_amount + v_bonus - v_settlement.debt_deduction_total - v_deduction,
    0
  );
  v_mandatory := round(
    v_before * coalesce(v_settlement.mandatory_discount_rate, 1) / 100,
    2
  );

  update public.employee_settlements
  set manual_bonus_total = v_bonus,
      other_deduction_total = v_deduction,
      net_before_mandatory_discount = v_before,
      mandatory_discount_amount = v_mandatory,
      net_pay_amount = greatest(v_before - v_mandatory, 0),
      status = 'review',
      reviewed_by = v_employee,
      reviewed_at = now()
  where id = p_settlement_id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function public.review_employee_settlement(uuid, jsonb) from public;
grant execute on function public.review_employee_settlement(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion posterior: debe devolver una fila con security_definer = true.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'review_employee_settlement'
  and p.oid::regprocedure::text = 'review_employee_settlement(uuid,jsonb)';


-- ============================================================================
-- Fuente consolidada: 115_settlement_cash_availability.sql
-- ============================================================================
-- Iteracion 11: evita que un pago de liquidacion en efectivo deje una sesion POS con saldo negativo.
-- Ejecutar despues de 114_iteration_11_settlement_review_runtime.sql.

insert into public.cash_movement_categories (
  code,
  name,
  description,
  movement_direction,
  sort_order,
  is_active
)
values (
  'employee_settlement_payment',
  'Pago de liquidacion',
  'Salida de efectivo por liquidacion de empleado.',
  'expense',
  50,
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_reference text default null,
  p_evidence_path text default null,
  p_notes text default null,
  p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_employee uuid := public.current_employee_id();
  v_deduction record;
  v_cash_id uuid;
  v_category_id uuid;
  v_available_cash numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select *
  into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_row.status <> 'approved' then
    raise exception 'La liquidacion debe estar aprobada antes de pagar.';
  end if;

  if round(coalesce(p_amount, 0), 2) <> round(v_row.net_pay_amount, 2) then
    raise exception 'El monto debe coincidir con el neto de la liquidacion.';
  end if;

  select *
  into v_method
  from public.payment_methods
  where id = p_payment_method_id
    and is_active;

  if not found then
    raise exception 'El metodo de pago no esta disponible.';
  end if;

  if v_method.counts_as_cash then
    select *
    into v_session
    from public.pos_sessions
    where id = p_pos_session_id
      and branch_id = v_row.branch_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'No existe una sesion POS activa para registrar el pago en efectivo.';
    end if;

    perform public.sync_pos_session_totals(v_session.id);

    select expected_cash_amount
    into v_available_cash
    from public.pos_sessions
    where id = v_session.id;

    if coalesce(v_available_cash, 0) < v_row.net_pay_amount then
      raise exception 'El efectivo disponible en la sesion no cubre esta liquidacion.';
    end if;

    select id
    into v_category_id
    from public.cash_movement_categories
    where code = 'employee_settlement_payment'
      and is_active
    limit 1;

    if v_category_id is null then
      raise exception 'No existe una categoria activa para el pago de liquidacion.';
    end if;

    insert into public.cash_movements (
      pos_session_id,
      branch_id,
      category_id,
      movement_type,
      amount,
      description,
      status,
      created_by
    ) values (
      v_session.id,
      v_row.branch_id,
      v_category_id,
      'expense',
      v_row.net_pay_amount,
      'Pago de liquidacion ' || v_row.settlement_number,
      'active',
      v_employee
    ) returning id into v_cash_id;

    perform public.sync_pos_session_totals(v_session.id);
  end if;

  for v_deduction in
    select * from public.employee_settlement_deductions where settlement_id = p_settlement_id
  loop
    update public.employee_debts
    set outstanding_amount = v_deduction.balance_after,
        status = case when v_deduction.balance_after = 0 then 'paid' else 'partial' end,
        settled_at = case when v_deduction.balance_after = 0 then now() else null end
    where id = v_deduction.employee_debt_id;

    insert into public.employee_debt_movements (
      debt_id,
      movement_type,
      amount,
      settlement_id,
      notes,
      created_by
    ) values (
      v_deduction.employee_debt_id,
      'settlement_deduction',
      v_deduction.amount,
      p_settlement_id,
      'Descuento aplicado en liquidacion.',
      v_employee
    );
  end loop;

  update public.employee_settlements
  set status = 'paid',
      payment_method_id = p_payment_method_id,
      payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
      payment_evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
      cash_movement_id = v_cash_id,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      paid_by = v_employee,
      paid_at = now()
  where id = p_settlement_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) from public;
grant execute on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion posterior: la categoria debe existir y la funcion debe conservar la firma exacta.
select
  (select count(*) from public.cash_movement_categories where code = 'employee_settlement_payment' and is_active) as active_category_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid::regprocedure::text = 'pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid)') as function_signature_count;


-- ============================================================================
-- Fuente consolidada: 116_settlement_cash_movement_rls.sql
-- ============================================================================
-- Iteracion 11: oculta de recepcion los egresos sensibles de liquidaciones.
-- Ejecutar despues de 115_settlement_cash_availability.sql.

drop policy if exists "cash_movements_select_scope" on public.cash_movements;
drop policy if exists "cash_movements_update_scope" on public.cash_movements;

create policy "cash_movements_select_scope"
on public.cash_movements
for select
to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
);

create policy "cash_movements_update_scope"
on public.cash_movements
for update
to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and not exists (
      select 1
      from public.cash_movement_categories cmc
      where cmc.id = cash_movements.category_id
        and cmc.code = 'employee_settlement_payment'
    )
  )
);

notify pgrst, 'reload schema';

-- Verificacion posterior: las dos politicas existen y mantienen el alcance autenticado.
select
  count(*) filter (where policyname = 'cash_movements_select_scope' and roles = '{authenticated}') as select_policy_count,
  count(*) filter (where policyname = 'cash_movements_update_scope' and roles = '{authenticated}') as update_policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'cash_movements';


-- ============================================================================
-- Fuente consolidada: 117_settlement_finance_ledger.sql
-- ============================================================================
-- Iteracion 11: vincula el egreso financiero canonico con la liquidacion pagada.
-- Ejecutar despues de 115_settlement_cash_availability.sql.

alter table public.finance_manual_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create index if not exists finance_manual_entries_source_idx
  on public.finance_manual_entries (source_type, source_id)
  where source_type is not null and source_id is not null;

create unique index if not exists finance_manual_entries_active_settlement_source_uidx
  on public.finance_manual_entries (source_type, source_id)
  where source_type = 'employee_settlement'
    and source_id is not null
    and status = 'active';

insert into public.finance_categories (
  code,
  name,
  direction,
  is_active,
  sort_order
)
values (
  'employee_settlement_payment',
  'Pago de liquidacion',
  'expense',
  true,
  50
)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

create or replace function public.pay_employee_settlement(
  p_settlement_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_reference text default null,
  p_evidence_path text default null,
  p_notes text default null,
  p_pos_session_id uuid default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_method public.payment_methods%rowtype;
  v_session public.pos_sessions%rowtype;
  v_employee uuid := public.current_employee_id();
  v_deduction record;
  v_cash_id uuid;
  v_cash_category_id uuid;
  v_finance_category_id uuid;
  v_available_cash numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden pagar liquidaciones.';
  end if;

  select *
  into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found or v_row.status <> 'approved' then
    raise exception 'La liquidacion debe estar aprobada antes de pagar.';
  end if;

  if round(coalesce(p_amount, 0), 2) <> round(v_row.net_pay_amount, 2) then
    raise exception 'El monto debe coincidir con el neto de la liquidacion.';
  end if;

  select *
  into v_method
  from public.payment_methods
  where id = p_payment_method_id
    and is_active;

  if not found then
    raise exception 'El metodo de pago no esta disponible.';
  end if;

  if v_method.counts_as_cash then
    select *
    into v_session
    from public.pos_sessions
    where id = p_pos_session_id
      and branch_id = v_row.branch_id
      and status = 'open'
    for update;

    if not found then
      raise exception 'No existe una sesion POS activa para registrar el pago en efectivo.';
    end if;

    perform public.sync_pos_session_totals(v_session.id);

    select expected_cash_amount
    into v_available_cash
    from public.pos_sessions
    where id = v_session.id;

    if coalesce(v_available_cash, 0) < v_row.net_pay_amount then
      raise exception 'El efectivo disponible en la sesion no cubre esta liquidacion.';
    end if;

    select id
    into v_cash_category_id
    from public.cash_movement_categories
    where code = 'employee_settlement_payment'
      and is_active
    limit 1;

    if v_cash_category_id is null then
      raise exception 'No existe una categoria activa para el pago de liquidacion.';
    end if;

    insert into public.cash_movements (
      pos_session_id,
      branch_id,
      category_id,
      movement_type,
      amount,
      description,
      status,
      created_by
    ) values (
      v_session.id,
      v_row.branch_id,
      v_cash_category_id,
      'expense',
      v_row.net_pay_amount,
      'Pago de liquidacion ' || v_row.settlement_number,
      'active',
      v_employee
    ) returning id into v_cash_id;

    perform public.sync_pos_session_totals(v_session.id);
  end if;

  select id
  into v_finance_category_id
  from public.finance_categories
  where code = 'employee_settlement_payment'
    and is_active
  limit 1;

  if v_finance_category_id is null then
    raise exception 'No existe una categoria financiera activa para el pago de liquidacion.';
  end if;

  insert into public.finance_manual_entries (
    branch_id,
    direction,
    category_id,
    amount,
    payment_method_id,
    description,
    reference,
    status,
    created_by,
    source_type,
    source_id
  ) values (
    v_row.branch_id,
    'expense',
    v_finance_category_id,
    v_row.net_pay_amount,
    v_method.id,
    'Pago de liquidacion ' || v_row.settlement_number,
    nullif(btrim(coalesce(p_reference, '')), ''),
    'active',
    v_employee,
    'employee_settlement',
    v_row.id
  );

  for v_deduction in
    select * from public.employee_settlement_deductions where settlement_id = p_settlement_id
  loop
    update public.employee_debts
    set outstanding_amount = v_deduction.balance_after,
        status = case when v_deduction.balance_after = 0 then 'paid' else 'partial' end,
        settled_at = case when v_deduction.balance_after = 0 then now() else null end
    where id = v_deduction.employee_debt_id;

    insert into public.employee_debt_movements (
      debt_id,
      movement_type,
      amount,
      settlement_id,
      notes,
      created_by
    ) values (
      v_deduction.employee_debt_id,
      'settlement_deduction',
      v_deduction.amount,
      p_settlement_id,
      'Descuento aplicado en liquidacion.',
      v_employee
    );
  end loop;

  update public.employee_settlements
  set status = 'paid',
      payment_method_id = p_payment_method_id,
      payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
      payment_evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
      cash_movement_id = v_cash_id,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      paid_by = v_employee,
      paid_at = now()
  where id = p_settlement_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) from public;
grant execute on function public.pay_employee_settlement(uuid, uuid, numeric, text, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion posterior: categoria y enlace unico para liquidaciones activas.
select
  (select count(*) from public.finance_categories where code = 'employee_settlement_payment' and is_active) as active_finance_category_count,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'finance_manual_entries_active_settlement_source_uidx') as active_source_index_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid::regprocedure::text = 'pay_employee_settlement(uuid,uuid,numeric,text,text,text,uuid)') as function_signature_count;


-- ============================================================================
-- Fuente consolidada: 118_settlement_paid_transition_guard.sql
-- ============================================================================
-- Iteracion 11: una liquidacion pagada no puede anularse sin un flujo de reversión dedicado.
-- Ejecutar despues de 117_settlement_finance_ledger.sql.

create or replace function public.transition_employee_settlement(
  p_settlement_id uuid,
  p_action text,
  p_reason text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_employee uuid := public.current_employee_id();
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden gestionar liquidaciones.';
  end if;

  select *
  into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception 'La liquidacion no existe.';
  end if;

  if p_action = 'review' and v_row.status = 'draft' then
    update public.employee_settlements
    set status = 'review', reviewed_by = v_employee, reviewed_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60
      and nullif(btrim(coalesce(v_row.high_rate_authorization_note, '')), '') is null then
      raise exception 'La autorizacion del porcentaje excepcional esta incompleta.';
    end if;

    update public.employee_settlements
    set status = 'approved', approved_by = v_employee, approved_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft', 'review', 'approved') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'El motivo de anulacion es obligatorio.';
    end if;

    update public.employee_settlements
    set status = 'cancelled',
        cancelled_by = v_employee,
        cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status = 'paid' then
    raise exception 'Una liquidacion pagada requiere un flujo de reversión autorizado.';
  else
    raise exception 'La transicion solicitada no esta permitida.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.transition_employee_settlement(uuid, text, text) from public;
grant execute on function public.transition_employee_settlement(uuid, text, text) to authenticated, service_role;

insert into public.app_settings (key, value, description)
values (
  'settlements.paid_transition_guard_version',
  '{"version": 1}'::jsonb,
  'Version desplegada del bloqueo de anulacion directa de liquidaciones pagadas.'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

notify pgrst, 'reload schema';

-- Verificacion posterior: conserva la firma y requiere ejecucion autenticada.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text = 'transition_employee_settlement(uuid,text,text)';


-- ============================================================================
-- Fuente consolidada: 119_pos_session_legacy_negative_closure.sql
-- ============================================================================
-- Iteracion 11: cierre auditable de sesiones historicas con efectivo esperado negativo.
-- Ejecutar manualmente despues de 118_settlement_paid_transition_guard.sql.
-- Los importes negativos heredados se conservan separados y no vuelven negativo el saldo operativo cerrado.

alter table public.pos_session_payment_closures
  add column if not exists legacy_expected_amount numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_session_payment_closures_legacy_expected_amount_check'
      and conrelid = 'public.pos_session_payment_closures'::regclass
  ) then
    alter table public.pos_session_payment_closures
      add constraint pos_session_payment_closures_legacy_expected_amount_check
      check (legacy_expected_amount is null or legacy_expected_amount < 0);
  end if;
end $$;

create table if not exists public.pos_session_legacy_closure_authorizations (
  pos_session_id uuid primary key references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  reason text not null,
  authorized_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.employees(id) on delete set null,
  constraint pos_session_legacy_closure_authorizations_reason_check
    check (nullif(btrim(reason), '') is not null)
);

-- Solo captura el patron heredado previo al corte; no habilita sesiones futuras.
insert into public.pos_session_legacy_closure_authorizations (
  pos_session_id,
  branch_id,
  reason
)
select distinct
  ps.id,
  ps.branch_id,
  'Egreso historico de liquidacion sin categoria de Caja; requiere cierre auditado.'
from public.pos_sessions ps
join public.cash_movements cm on cm.pos_session_id = ps.id
where ps.status in ('open', 'pending_close')
  and ps.opened_at < timestamptz '2026-07-17 00:00:00+00'
  and cm.status = 'active'
  and cm.movement_type = 'expense'
  and cm.category_id is null
  and cm.description like 'Pago de liquidacion %'
on conflict (pos_session_id) do nothing;

alter table public.pos_session_legacy_closure_authorizations enable row level security;

drop policy if exists "pos_session_legacy_closure_authorizations_select_admin"
  on public.pos_session_legacy_closure_authorizations;
drop policy if exists "pos_session_legacy_closure_authorizations_service_role_all"
  on public.pos_session_legacy_closure_authorizations;

create policy "pos_session_legacy_closure_authorizations_select_admin"
on public.pos_session_legacy_closure_authorizations
for select
to authenticated
using (public.is_admin());

create policy "pos_session_legacy_closure_authorizations_service_role_all"
on public.pos_session_legacy_closure_authorizations
for all
to service_role
using (true)
with check (true);

revoke all on public.pos_session_legacy_closure_authorizations from anon, public;
grant select on public.pos_session_legacy_closure_authorizations to authenticated;
grant all on public.pos_session_legacy_closure_authorizations to service_role;

-- La funcion auditada es la unica via autenticada de escritura para cierres.
revoke insert, update, delete on public.pos_session_payment_closures from authenticated;

drop policy if exists "pos_session_payment_closures_select_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_manage_scope"
  on public.pos_session_payment_closures;

create policy "pos_session_payment_closures_select_scope"
on public.pos_session_payment_closures
for select
to authenticated
using (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and legacy_expected_amount is null
  )
);

drop policy if exists "pos_session_events_select_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_manage_branch_scope" on public.pos_session_events;

create policy "pos_session_events_select_branch_scope"
on public.pos_session_events
for select
to authenticated
using (
  public.is_admin()
  or (
    public.can_view_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
);

create policy "pos_session_events_manage_branch_scope"
on public.pos_session_events
for all
to authenticated
using (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
)
with check (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
);

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_amounts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_legacy public.pos_session_legacy_closure_authorizations%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_summary jsonb;
  v_method record;
  v_counted numeric(12,2);
  v_expected numeric(12,2);
  v_legacy_expected numeric(12,2);
  v_difference numeric(12,2);
  v_has_difference boolean := false;
  v_legacy_authorized boolean := false;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_legacy_methods jsonb := '[]'::jsonb;
begin
  select * into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para cerrar esta sesion POS.';
  end if;

  if v_session.status not in ('open', 'pending_close') then
    raise exception 'La sesion POS ya no esta disponible para cierre.';
  end if;

  select *
  into v_legacy
  from public.pos_session_legacy_closure_authorizations
  where pos_session_id = p_session_id
  for update;
  v_legacy_authorized := found;

  v_summary := public.get_pos_session_closure_summary(p_session_id);

  if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
    raise exception 'No puedes cerrar la sesion con ventas en borrador.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', item ->> 'payment_method_id',
    'code', item ->> 'code',
    'legacy_expected_amount', round((item ->> 'expected_amount')::numeric, 2)
  )), '[]'::jsonb)
  into v_legacy_methods
  from jsonb_array_elements(v_summary -> 'payment_methods') item
  where round(coalesce((item ->> 'expected_amount')::numeric, 0), 2) < 0;

  if jsonb_array_length(v_legacy_methods) > 0 then
    if not public.is_admin() then
      raise exception 'Solo owner o admin pueden reparar un cierre historico.';
    end if;

    if not v_legacy_authorized or v_legacy.closed_at is not null then
      raise exception 'La sesion no esta autorizada para el cierre historico.';
    end if;

    v_notes := concat_ws(E'\n', v_notes, 'Cierre historico autorizado. Motivo: ' || v_legacy.reason);
  elsif v_legacy_authorized and v_legacy.closed_at is null then
    raise exception 'La autorizacion historica no coincide con el saldo actual de la sesion.';
  end if;

  delete from public.pos_session_payment_closures
  where pos_session_id = p_session_id;

  for v_method in
    select
      (item ->> 'payment_method_id')::uuid as payment_method_id,
      item ->> 'code' as code,
      (item ->> 'expected_amount')::numeric as expected_amount
    from jsonb_array_elements(v_summary -> 'payment_methods') item
  loop
    if not (coalesce(p_counted_amounts, '{}'::jsonb) ? v_method.payment_method_id::text) then
      raise exception 'Debes ingresar el monto real para todos los metodos activos.';
    end if;

    begin
      v_counted := (p_counted_amounts ->> v_method.payment_method_id::text)::numeric;
    exception when others then
      raise exception 'Uno de los montos reales no es valido.';
    end;

    if v_counted is null or v_counted < 0 then
      raise exception 'Los montos reales deben ser mayores o iguales a cero.';
    end if;

    v_counted := round(v_counted, 2);
    v_legacy_expected := case
      when round(coalesce(v_method.expected_amount, 0), 2) < 0 then round(v_method.expected_amount, 2)
      else null
    end;
    v_expected := greatest(round(coalesce(v_method.expected_amount, 0), 2), 0);
    v_difference := v_counted - v_expected;
    v_has_difference := v_has_difference or v_difference <> 0;

    insert into public.pos_session_payment_closures (
      pos_session_id, payment_method_id, expected_amount, legacy_expected_amount,
      counted_amount, difference_amount, notes, created_by
    ) values (
      p_session_id, v_method.payment_method_id, v_expected, v_legacy_expected,
      v_counted, v_difference, v_notes, auth.uid()
    );
  end loop;

  if (v_has_difference or v_session.status = 'pending_close' or v_session.business_date < current_date)
     and v_notes is null then
    raise exception 'Debes registrar una observacion para este cierre.';
  end if;

  update public.pos_sessions
  set status = 'closed',
      expected_cash_amount = coalesce((
        select pc.expected_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      counted_cash_amount = coalesce((
        select pc.counted_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      cash_difference = coalesce((
        select pc.difference_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      closing_notes = v_notes,
      closed_by = v_employee_id,
      closed_at = now(),
      updated_at = now()
  where id = p_session_id;

  if jsonb_array_length(v_legacy_methods) > 0 then
    update public.pos_session_legacy_closure_authorizations
    set closed_at = now(),
        closed_by = v_employee_id
    where pos_session_id = p_session_id
      and closed_at is null;

    if not found then
      raise exception 'No se pudo registrar el cierre historico.';
    end if;
  end if;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    p_session_id, v_employee_id, 'closed', 'Sesion POS cerrada por metodo.',
    jsonb_build_object(
      'has_difference', v_has_difference,
      'legacy_negative_expected_amounts', v_legacy_methods
    )
  );

  return public.get_pos_session_closure_summary(p_session_id);
end;
$$;

revoke all on function public.close_pos_session(uuid, jsonb, text) from public;
grant execute on function public.close_pos_session(uuid, jsonb, text) to authenticated, service_role;

-- Conserva la implementacion previa como fuente y expone un resumen saneado.
do $$
begin
  if to_regprocedure('public.get_pos_session_closure_summary_raw(uuid)') is null
     and to_regprocedure('public.get_pos_session_closure_summary(uuid)') is not null then
    alter function public.get_pos_session_closure_summary(uuid)
      rename to get_pos_session_closure_summary_raw;
  end if;
end $$;

create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_payments jsonb;
begin
  v_summary := public.get_pos_session_closure_summary_raw(p_session_id);

  if not public.is_admin() and exists (
    select 1 from public.pos_session_legacy_closure_authorizations
    where pos_session_id = p_session_id
  ) then
    raise exception 'No tienes permisos para ver el cierre historico auditado.';
  end if;

  if v_summary ->> 'status' <> 'closed' then
    return v_summary;
  end if;

  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(
        item,
        '{expected_amount}',
        to_jsonb(coalesce(pc.expected_amount, (item ->> 'expected_amount')::numeric)),
        true
      ),
      '{legacy_expected_amount}',
      coalesce(to_jsonb(pc.legacy_expected_amount), 'null'::jsonb),
      true
    )
    order by ordinal
  ), '[]'::jsonb)
  into v_payments
  from jsonb_array_elements(v_summary -> 'payment_methods') with ordinality as payments(item, ordinal)
  left join public.pos_session_payment_closures pc
    on pc.pos_session_id = p_session_id
   and pc.payment_method_id = (item ->> 'payment_method_id')::uuid;

  return jsonb_set(v_summary, '{payment_methods}', v_payments, true);
end;
$$;

revoke all on function public.get_pos_session_closure_summary_raw(uuid) from public;
revoke all on function public.get_pos_session_closure_summary_raw(uuid) from authenticated;
grant execute on function public.get_pos_session_closure_summary_raw(uuid) to service_role;

revoke all on function public.get_pos_session_closure_summary(uuid) from public;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion funcional posterior: ejecutar el cierre solo sobre una autorizacion creada arriba.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_session_payment_closures'
      and column_name = 'legacy_expected_amount'
  ) as legacy_column_exists,
  (select count(*) from public.pos_session_legacy_closure_authorizations) as authorized_legacy_sessions,
  to_regprocedure('public.close_pos_session(uuid,jsonb,text)') is not null as close_function_exists;


-- ============================================================================
-- Fuente consolidada: 121_reception_stock_customer_pos_lifecycle.sql
-- ============================================================================
-- Correcciones operativas: clientes de recepción, ingresos de stock y ciclo POS.
-- Ejecutar después de 119_pos_session_legacy_negative_closure.sql.

-- Clientes: reestablece el acceso global operativo de recepción y elimina
-- políticas residuales que pudieran bloquear el INSERT autorizado.
alter table public.customers enable row level security;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and exists (
        select 1
        from public.employees employee
        where employee.id = public.current_employee_id()
          and employee.status = 'active'::public.employee_status
      )
      and exists (
        select 1
        from public.customers customer
        where customer.id = p_customer_id
          and customer.is_active
      )
    );
$$;

revoke all on function public.can_access_customer(uuid) from public;
grant execute on function public.can_access_customer(uuid) to authenticated, service_role;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
  loop
    execute format('drop policy if exists %I on public.customers', policy_record.policyname);
  end loop;
end;
$$;

create policy "customers_select_team"
on public.customers for select to authenticated
using (public.can_access_customer(id));

create policy "customers_insert_team"
on public.customers for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and exists (
      select 1 from public.employees employee
      where employee.id = public.current_employee_id()
        and employee.status = 'active'::public.employee_status
    )
    and created_by = public.current_employee_id()
    and is_active
    and coalesce(source, '') <> 'system'
  )
);

create policy "customers_update_team"
on public.customers for update to authenticated
using (public.can_access_customer(id))
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_customer(id)
    and is_active
    and coalesce(source, '') <> 'system'
  )
);

create policy "customers_delete_admin"
on public.customers for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.customers to authenticated;
revoke all on public.customers from anon;

-- Stock: recepción solo puede insertar compras positivas para su propia sede.
drop policy if exists "stock_movements_insert_admin_or_reception" on public.stock_movements;

create policy "stock_movements_insert_admin_or_reception"
on public.stock_movements for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and movement_type = 'purchase'
    and quantity > 0
    and created_by = public.current_employee_id()
  )
);

-- Al abrir una nueva jornada para una sede, se cierra automáticamente la
-- sesión activa de una fecha anterior. El cierre conserva sus importes
-- esperados como contados, queda auditado y se fecha a las 23:50 de Lima.
-- La fecha operativa no depende del huso horario de la instancia Postgres
-- ni del navegador del operador: siempre se calcula en Lima.
create or replace function public.pos_business_date()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select timezone('America/Lima', now())::date;
$$;

revoke all on function public.pos_business_date() from public;
grant execute on function public.pos_business_date() to authenticated, service_role;

create or replace function public.open_pos_session(
  p_branch_id uuid,
  p_opening_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_active_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_business_date date := public.pos_business_date();
  v_summary jsonb;
  v_counted_amounts jsonb;
  v_auto_close_note text;
begin
  if not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para abrir una sesion POS en esta sede.';
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  select * into v_active_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status in ('open', 'pending_close')
  order by opened_at desc
  limit 1
  for update;

  if found then
    if v_active_session.business_date >= v_business_date then
      raise exception 'Ya existe una sesion POS activa para esta sede y fecha.';
    end if;

    v_summary := public.get_pos_session_closure_summary(v_active_session.id);
    if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
      raise exception 'No se puede cerrar automáticamente la sesión anterior porque tiene ventas en borrador. Resuélvelas antes de abrir la nueva sesión.';
    end if;

    select coalesce(
      jsonb_object_agg(
        item ->> 'payment_method_id',
        greatest(coalesce((item ->> 'expected_amount')::numeric, 0), 0)
      ),
      '{}'::jsonb
    )
    into v_counted_amounts
    from jsonb_array_elements(v_summary -> 'payment_methods') item;

    v_auto_close_note := format(
      'Cierre automático al iniciar la jornada %s. La sesión corresponde a %s y se registra a las 23:50 (America/Lima).',
      v_business_date,
      v_active_session.business_date
    );

    perform public.close_pos_session(v_active_session.id, v_counted_amounts, v_auto_close_note);

    update public.pos_sessions
    set closed_at = (v_active_session.business_date::timestamp + time '23:50') at time zone 'America/Lima',
        updated_at = now()
    where id = v_active_session.id;

    insert into public.pos_session_events (
      pos_session_id, employee_id, event_type, message, metadata
    ) values (
      v_active_session.id,
      v_employee_id,
      'closed',
      'Sesión cerrada automáticamente al iniciar una nueva jornada.',
      jsonb_build_object(
        'automatic', true,
        'trigger_business_date', v_business_date,
        'closed_at_local', v_active_session.business_date::text || ' 23:50 America/Lima'
      )
    );
  end if;

  insert into public.pos_sessions (
    branch_id, opened_by, business_date, status, opening_cash_amount,
    expected_cash_amount, opening_notes, opened_at
  ) values (
    p_branch_id, v_employee_id, v_business_date, 'open',
    coalesce(p_opening_cash_amount, 0), coalesce(p_opening_cash_amount, 0),
    nullif(btrim(coalesce(p_notes, '')), ''), now()
  ) returning * into v_session;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    v_session.id, v_employee_id, 'opened', 'Sesión POS abierta.',
    jsonb_build_object('opening_cash_amount', v_session.opening_cash_amount)
  );

  return v_session;
end;
$$;

revoke all on function public.open_pos_session(uuid, numeric, text) from public;
grant execute on function public.open_pos_session(uuid, numeric, text) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 122_seed_barbers_by_branch.sql
-- ============================================================================
-- Seed manual de barberos por sede.
-- Requiere las sedes con codigos LB-SSJ y LB-SRP.
-- No crea, elimina ni vincula cuentas en auth.users.

do $$
begin
  if (select count(*) from public.branches where code in ('LB-SSJ', 'LB-SRP')) <> 2 then
    raise exception 'Faltan las sedes LB-SSJ o LB-SRP. Crea o corrige ambas sedes antes de ejecutar este script.';
  end if;
end;
$$;

with seed (branch_code, full_name, email, phone, status, notes) as (
  values
    ('LB-SRP', 'Gerson Yahuarcani Cachique', 'gersonalcibiades@gmail.com', '906840005', 'active'::public.employee_status, null),
    ('LB-SRP', 'Nick Andrew Nicolini Caceres', 'nicknicolini0605@gmail.com', '932403338', 'active'::public.employee_status, null),
    ('LB-SRP', 'Jaime Ali Tello Huinapi', 'jaimealitello@gmail.com', '936866371', 'active'::public.employee_status, null),
    ('LB-SRP', 'Bruce Anderson Villacorta Ramirez', 'andervillacorta19@icloud.com', '925676158', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Heber Lincoln Cueva Bustamante', 'cheber.bus@gmail.com', '916367308', 'active'::public.employee_status, null),
    ('LB-SSJ', 'David Ochoa', 'ochoaguerradavid2@gmail.com', '981330538', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Wagner Danilo Inuma Fachin', 'danilofacin2@gmail.com', '921452058', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Jack Gallardo', 'jackgallardo71@gmail.com', '918060963', 'inactive'::public.employee_status, 'Perfil legado inactivo.'),
    ('LB-SSJ', 'Harley Sinarahua Grandez', null, '980257628', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Leonardo Pinche', 'leonardosanchezpinche@gmail.com', '935627411', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Junior Ortega Pisuri', 'ortegapisurijunior22@gmail.com', '929756312', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Vianca del Carmen Serroy Pezo', 'viancaserroy0@gmail.com', '931367011', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Luis Eduardo Perez Chumbico', 'luipe1804@gmail.com', '937137611', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Oscar Davila', 'oscardavilapereya27@gmail.com', '942308924', 'active'::public.employee_status, null)
), resolved as (
  select b.id as branch_id, seed.full_name, seed.email, seed.phone, seed.status, seed.notes
  from seed
  join public.branches b on b.code = seed.branch_code
)
update public.employees employee
set
  branch_id = resolved.branch_id,
  full_name = resolved.full_name,
  email = resolved.email,
  phone = resolved.phone,
  role = 'barber',
  status = resolved.status,
  position = 'Barbero',
  can_login = false,
  must_change_password = false,
  notes = resolved.notes,
  updated_at = now()
from resolved
where (resolved.email is not null and lower(employee.email) = lower(resolved.email))
   or employee.phone = resolved.phone;

with seed (branch_code, full_name, email, phone, status, notes) as (
  values
    ('LB-SRP', 'Gerson Yahuarcani Cachique', 'gersonalcibiades@gmail.com', '906840005', 'active'::public.employee_status, null),
    ('LB-SRP', 'Nick Andrew Nicolini Caceres', 'nicknicolini0605@gmail.com', '932403338', 'active'::public.employee_status, null),
    ('LB-SRP', 'Jaime Ali Tello Huinapi', 'jaimealitello@gmail.com', '936866371', 'active'::public.employee_status, null),
    ('LB-SRP', 'Bruce Anderson Villacorta Ramirez', 'andervillacorta19@icloud.com', '925676158', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Heber Lincoln Cueva Bustamante', 'cheber.bus@gmail.com', '916367308', 'active'::public.employee_status, null),
    ('LB-SSJ', 'David Ochoa', 'ochoaguerradavid2@gmail.com', '981330538', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Wagner Danilo Inuma Fachin', 'danilofacin2@gmail.com', '921452058', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Jack Gallardo', 'jackgallardo71@gmail.com', '918060963', 'inactive'::public.employee_status, 'Perfil legado inactivo.'),
    ('LB-SSJ', 'Harley Sinarahua Grandez', null, '980257628', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Leonardo Pinche', 'leonardosanchezpinche@gmail.com', '935627411', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Junior Ortega Pisuri', 'ortegapisurijunior22@gmail.com', '929756312', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Vianca del Carmen Serroy Pezo', 'viancaserroy0@gmail.com', '931367011', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Luis Eduardo Perez Chumbico', 'luipe1804@gmail.com', '937137611', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Oscar Davila', 'oscardavilapereya27@gmail.com', '942308924', 'active'::public.employee_status, null)
), resolved as (
  select b.id as branch_id, seed.full_name, seed.email, seed.phone, seed.status, seed.notes
  from seed
  join public.branches b on b.code = seed.branch_code
)
insert into public.employees (
  branch_id, full_name, email, phone, role, status, position,
  can_login, must_change_password, notes
)
select
  resolved.branch_id, resolved.full_name, resolved.email, resolved.phone, 'barber', resolved.status, 'Barbero',
  false, false, resolved.notes
from resolved
where not exists (
  select 1
  from public.employees employee
  where (resolved.email is not null and lower(employee.email) = lower(resolved.email))
     or employee.phone = resolved.phone
);
select
  branch.code as codigo_sede,
  employee.full_name,
  employee.phone,
  employee.email,
  employee.status,
  employee.can_login
from public.employees employee
join public.branches branch on branch.id = employee.branch_id
where employee.role = 'barber'
  and branch.code in ('LB-SSJ', 'LB-SRP')
order by branch.code, employee.full_name;


-- ============================================================================
-- Fuente consolidada: 124_seed_catalog_services_products.sql
-- ============================================================================
-- Seed manual del catalogo legado de servicios y productos.
-- Servicios: catalogo global; solo Corte Fade tiene precio especial en LB-SSJ.
-- Productos: catalogo global sin movimientos de stock; el stock inicial permanece en cero.

do $$
begin
  if (select count(*) from public.branches where code in ('LB-SSJ', 'LB-SRP')) <> 2 then
    raise exception 'Faltan las sedes LB-SSJ o LB-SRP.';
  end if;
end;
$$;

insert into public.service_categories (name, slug, description, sort_order, is_active)
values
  ('Cortes', 'cortes', 'Servicios principales de corte.', 1, true),
  ('Barba y detalles', 'barba-detalles', 'Servicios de barba, cejas y detalles.', 2, true),
  ('Combos', 'combos', 'Servicios combinados.', 3, true),
  ('Tratamientos', 'tratamientos', 'Tratamientos capilares.', 4, true),
  ('Facial', 'facial', 'Servicios de limpieza facial.', 5, true),
  ('Otros', 'otros', 'Servicios de precio manual.', 6, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

with seed (category_slug, name, slug, description, base_price, duration_minutes, allow_custom_price) as (
  values
    ('cortes', 'Corte Ejecutivo', 'corte-ejecutivo', 'Incluye masaje, locion, bebida e internet.', 35.00, 40, false),
    ('cortes', 'Corte Fade', 'corte-fade', 'Incluye masaje, locion, bebida e internet.', 40.00, 40, false),
    ('cortes', 'Corte Clasico', 'corte-clasico', 'Incluye masaje, locion, bebida e internet.', 30.00, 40, false),
    ('cortes', 'Corte a Tijeras', 'corte-a-tijeras', 'Incluye masaje, locion, bebida e internet.', 35.00, 40, false),
    ('cortes', 'Corte Nino 5 anos', 'corte-nino-5-anos', 'Servicio para ninos de hasta 5 anos.', 25.00, 40, false),
    ('cortes', 'Corte de Cabello Puntas para Damas', 'corte-puntas-damas', 'Incluye masaje, locion, bebida e internet.', 30.00, 40, false),
    ('combos', 'Corte + Barba', 'corte-barba', 'Incluye masaje, locion, bebida e internet.', 60.00, 40, false),
    ('combos', 'Bajadita Premium', 'bajadita-premium', 'Corte, barba o diseno, lavado, cejas y aceite.', 70.00, 40, false),
    ('tratamientos', 'Semiondulado + Corte', 'semiondulado-corte', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Ondulado + Corte', 'ondulado-corte', 'Incluye masaje, locion, bebida e internet.', 180.00, 40, false),
    ('tratamientos', 'Rayitos en Platinado', 'rayitos-platinado', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Platinado + Corte', 'platinado-corte', 'Incluye masaje, locion, bebida e internet.', 200.00, 40, false),
    ('tratamientos', 'Prepigmentacion', 'prepigmentacion', 'Incluye masaje, locion, bebida e internet.', 80.00, 40, false),
    ('tratamientos', 'Alisado + Corte', 'alisado-corte', 'Incluye masaje, locion, bebida e internet.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Premium', 'limpieza-facial-premium', 'Acido hialuronico, colageno y vitamina C.', 100.00, 40, false),
    ('facial', 'Limpieza Facial Express + Corte', 'limpieza-facial-express-corte', 'Acido hialuronico, colageno y vitamina C.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Profunda + Corte', 'limpieza-facial-profunda-corte', 'Acido hialuronico, colageno y vitamina C.', 150.00, 40, false),
    ('barba-detalles', 'Barba Italiana', 'barba-italiana', 'Perfilacion con crema o aceite.', 30.00, 40, false),
    ('barba-detalles', 'Perfilado de Cejas', 'perfilado-cejas', 'Incluye masaje, locion, bebida e internet.', 25.00, 40, false),
    ('otros', 'Personalizado', 'servicio-personalizado', 'Servicio personalizado con precio manual.', 1.00, 60, true)
)
insert into public.services (
  category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active
)
select category.id, seed.name, seed.slug, seed.description, seed.base_price, seed.duration_minutes, seed.allow_custom_price, true
from seed
join public.service_categories category on category.slug = seed.category_slug
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    base_price = excluded.base_price,
    duration_minutes = excluded.duration_minutes,
    allow_custom_price = excluded.allow_custom_price,
    is_active = excluded.is_active,
    updated_at = now();

-- El catalogo legado tenia Corte Fade a S/ 35.00 en San Juan y S/ 40.00 como precio base.
insert into public.service_branch_prices (service_id, branch_id, price, is_active)
select service.id, branch.id, 35.00, true
from public.services service
join public.branches branch on branch.code = 'LB-SSJ'
where service.slug = 'corte-fade'
on conflict (service_id, branch_id) do update
set price = excluded.price,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.product_categories (name, slug, description, sort_order, is_active)
values
  ('Productos de barberia', 'barberia', 'Productos de cuidado y peinado.', 1, true),
  ('Bebidas', 'bebidas', 'Bebidas y refrescos.', 2, true),
  ('Snacks y cafeteria', 'snacks-cafeteria', 'Snacks, postres y cafeteria.', 3, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

with seed (sku, name, slug, category_slug, cost_price, base_sale_price) as (
  values
    ('PROD-0001', 'Keke de banana', 'keke-de-banana', 'snacks-cafeteria', 0.00, 4.50),
    ('PROD-0002', 'Gel Rolda rojo x 500g', 'gel-rolda-rojo-500g', 'barberia', 18.00, 35.00),
    ('PROD-0003', 'Gel Rolda black x 500g', 'gel-rolda-black-500g', 'barberia', 23.00, 40.00),
    ('PROD-0004', 'Colonia Marmara N4', 'colonia-marmara-n4', 'barberia', 14.00, 25.00),
    ('PROD-0005', 'Colonia Marmara N1', 'colonia-marmara-n1', 'barberia', 14.00, 25.00),
    ('PROD-0006', 'Colonia Marmara N2', 'colonia-marmara-n2', 'barberia', 14.00, 25.00),
    ('PROD-0007', 'Bandido cera mate verde x150ml', 'bandido-cera-mate-verde-150ml', 'barberia', 18.50, 35.00),
    ('PROD-0008', 'Bandido cera aquawax dorado x150ml', 'bandido-cera-aquawax-dorado-150ml', 'barberia', 7.00, 35.00),
    ('PROD-0009', 'Bandido cera aquawax azul x150ml', 'bandido-cera-aquawax-azul-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0010', 'Bandido cera aquawax plomo', 'bandido-cera-aquawax-plomo', 'barberia', 13.00, 35.00),
    ('PROD-0011', 'Bandido cera aquawax rojo x150ml', 'bandido-cera-aquawax-rojo-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0012', 'Bandido cera aquawax negro x150ml', 'bandido-cera-aquawax-negro-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0013', 'Gel Rolda rojo x250g', 'gel-rolda-rojo-250g', 'barberia', 13.00, 25.00),
    ('PROD-0014', 'Gel Rolda morado x250g', 'gel-rolda-morado-250g', 'barberia', 13.00, 25.00),
    ('PROD-0015', 'Gel Rolda azul x250g', 'gel-rolda-azul-250g', 'barberia', 13.00, 25.00),
    ('PROD-0016', 'Bandido fiber wax x150ml', 'bandido-fiber-wax-150ml', 'barberia', 0.00, 35.00),
    ('PROD-0017', 'Cafe americano', 'cafe-americano', 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0018', 'Capuchino', 'capuchino', 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0019', 'Cafe helado', 'cafe-helado', 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0020', 'Expreso', 'expreso', 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0021', 'Frozen de pina', 'frozen-de-pina', 'bebidas', 0.00, 10.00),
    ('PROD-0022', 'Frozen de mango', 'frozen-de-mango', 'bebidas', 0.00, 10.00),
    ('PROD-0023', 'Frozen de maracuya', 'frozen-de-maracuya', 'bebidas', 0.00, 10.00),
    ('PROD-0024', 'Frozen de fresa', 'frozen-de-fresa', 'bebidas', 0.00, 10.00),
    ('PROD-0025', 'Frozen de camu camu', 'frozen-de-camu-camu', 'bebidas', 0.00, 10.00),
    ('PROD-0026', 'Jugo de papaya', 'jugo-de-papaya', 'bebidas', 0.00, 8.00),
    ('PROD-0027', 'Jugo de pina', 'jugo-de-pina', 'bebidas', 0.00, 8.00),
    ('PROD-0028', 'Jugo de fresa', 'jugo-de-fresa', 'bebidas', 0.00, 8.00),
    ('PROD-0029', 'Keke de banana individual', 'keke-de-banana-individual', 'snacks-cafeteria', 0.00, 4.00),
    ('PROD-0030', 'Gelatina', 'gelatina', 'snacks-cafeteria', 0.00, 3.50),
    ('PROD-0031', 'Cafe en granos', 'cafe-en-granos', 'snacks-cafeteria', 0.00, 60.00),
    ('PROD-0032', 'Agua San Luis 500ml', 'agua-san-luis-500ml', 'bebidas', 0.83, 0.00),
    ('PROD-0033', 'Gaseosa Coca Cola', 'gaseosa-coca-cola', 'bebidas', 0.00, 3.00),
    ('PROD-0034', 'Dona Pepa', 'dona-pepa', 'snacks-cafeteria', 0.00, 2.00),
    ('PROD-0035', 'Doritos', 'doritos', 'snacks-cafeteria', 0.00, 2.00)
)
insert into public.products (
  category_id, sku, name, slug, unit, cost_price, base_sale_price,
  is_stockable, is_courtesy_allowed, is_active
)
select
  category.id, seed.sku, seed.name, seed.slug, 'unidad', seed.cost_price, seed.base_sale_price,
  true, false, true
from seed
join public.product_categories category on category.slug = seed.category_slug
on conflict (sku) do update
set category_id = excluded.category_id,
    name = excluded.name,
    slug = excluded.slug,
    unit = excluded.unit,
    cost_price = excluded.cost_price,
    base_sale_price = excluded.base_sale_price,
    is_stockable = excluded.is_stockable,
    is_courtesy_allowed = excluded.is_courtesy_allowed,
    is_active = excluded.is_active,
    updated_at = now();
select 'servicios' as tipo, count(*) as total from public.services
union all
select 'productos' as tipo, count(*) as total from public.products;


-- ============================================================================
-- Fuente consolidada: 125_seed_operational_select_options.sql
-- ============================================================================
-- Seed manual de opciones seleccionables operativas.
-- No crea ventas, sesiones POS, movimientos de caja, movimientos de stock ni registros financieros.

insert into public.payment_methods (
  code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash
)
values
  ('cash', 'EFECTIVO', 'Cobro en efectivo.', 1, true, 'cash', true, true),
  ('qrayapeplin', 'QR YAPE/PLIN', 'Cobro por billetera digital o codigo QR.', 2, true, 'wallet_qr', false, false),
  ('culqi', 'CULQI', 'Cobro por tarjeta procesado por Culqi.', 3, true, 'card', false, false),
  ('transferencia', 'TRANSFERENCIA BANCARIA', 'Cobro por transferencia bancaria.', 4, true, 'bank_transfer', false, false)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    payment_kind = excluded.payment_kind,
    allows_change = excluded.allows_change,
    counts_as_cash = excluded.counts_as_cash,
    updated_at = now();

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

insert into public.stock_adjustment_reasons (code, name, description, movement_type, sort_order, is_active)
values
  ('conteo_fisico', 'Conteo fisico', 'Ajuste por diferencia encontrada en conteo.', 'adjustment', 1, true),
  ('merma', 'Merma', 'Salida por perdida o dano del producto.', 'waste', 2, true),
  ('vencimiento', 'Vencimiento', 'Salida por producto vencido.', 'waste', 3, true),
  ('error_registro', 'Error de registro', 'Correccion por registro previo incorrecto.', 'adjustment', 4, true),
  ('uso_interno', 'Uso interno', 'Salida para consumo interno.', 'adjustment', 5, true),
  ('reposicion', 'Reposicion', 'Ingreso por reposicion manual.', 'purchase', 6, true),
  ('transferencia_entrada', 'Transferencia recibida', 'Ingreso recibido desde otra sede.', 'transfer_in', 7, true),
  ('transferencia_salida', 'Transferencia enviada', 'Salida enviada a otra sede.', 'transfer_out', 8, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_type = excluded.movement_type,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.courtesy_reasons (code, name, description, sort_order, is_active)
values
  ('cliente_frecuente', 'Cliente frecuente', 'Atencion especial para clientes recurrentes.', 1, true),
  ('compensacion', 'Compensacion', 'Compensacion por inconveniente operativo.', 2, true),
  ('promocion', 'Promocion', 'Cortesia por campana comercial.', 3, true),
  ('error_servicio', 'Error de servicio', 'Correccion por error detectado en el servicio.', 4, true),
  ('cortesia_admin', 'Cortesia autorizada', 'Cortesia aprobada por administracion.', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.cash_movement_categories (code, name, description, movement_direction, sort_order, is_active)
values
  ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
  ('employee_supply_collection', 'Cobro de insumo a empleado', 'Cobro manual por insumos entregados.', 'income', 2, true),
  ('cash_replenishment', 'Reposicion de caja', 'Ingreso para reponer efectivo operativo.', 'income', 3, true),
  ('other_income', 'Otro ingreso', 'Ingreso operativo no clasificado.', 'income', 4, true),
  ('operational_purchase', 'Compra operativa', 'Compra pagada desde caja sin afectar stock.', 'expense', 10, true),
  ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 11, true),
  ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 12, true),
  ('employee_settlement_payment', 'Pago de liquidacion', 'Salida de efectivo por liquidacion de empleado.', 'expense', 13, true),
  ('other_expense', 'Otro egreso', 'Egreso operativo no clasificado.', 'expense', 14, true),
  ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 20, true),
  ('positive_adjustment', 'Ajuste positivo', 'Correccion positiva de caja.', 'adjustment', 21, true),
  ('negative_adjustment', 'Ajuste negativo', 'Correccion negativa de caja.', 'adjustment', 22, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.sale_cancellation_reasons (code, name, description, sort_order, is_active)
values
  ('error_de_registro', 'Error de registro', 'Datos incorrectos durante el registro.', 1, true),
  ('cliente_desistio', 'Cliente desistio', 'El cliente decidio no continuar.', 2, true),
  ('pago_no_completado', 'Pago no completado', 'No se completo el pago de la venta.', 3, true),
  ('servicio_no_realizado', 'Servicio no realizado', 'El servicio finalmente no fue realizado.', 4, true),
  ('venta_duplicada', 'Venta duplicada', 'La venta fue registrada mas de una vez.', 5, true),
  ('otro', 'Otro motivo', 'Motivo no incluido en el catalogo.', 99, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.finance_categories (code, name, direction, is_active, sort_order)
values
  ('other_income', 'Otros ingresos', 'income', true, 100),
  ('operating_expense', 'Gastos operativos', 'expense', true, 100),
  ('employee_settlement_payment', 'Pago de liquidacion', 'expense', true, 50)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.whatsapp_templates (code, name, contact_type, body, is_active)
values
  ('reservation_reminder_default', 'Recordatorio de reserva', 'reservation_reminder', 'Hola {{cliente}}, te recordamos tu reserva para {{fecha}} a las {{hora}} en {{sede}}. {{direccion}}. Barbero: {{barbero}}. Servicio de interes: {{servicio}}.', true),
  ('post_service_thanks_default', 'Agradecimiento post servicio', 'post_service_thanks', 'Gracias por visitarnos, {{cliente}}. Esperamos verte pronto en {{sede}}. Te atendio {{barbero}}. Servicios: {{servicios}}.', true)
on conflict (code) do update
set name = excluded.name,
    body = excluded.body,
    is_active = excluded.is_active,
    updated_at = now();
select 'metodos_pago' as catalogo, count(*) as total from public.payment_methods where is_active
union all
select 'unidades_producto', count(*) from public.product_units where is_active
union all
select 'motivos_stock', count(*) from public.stock_adjustment_reasons where is_active
union all
select 'motivos_cortesia', count(*) from public.courtesy_reasons where is_active
union all
select 'motivos_caja', count(*) from public.cash_movement_categories where is_active
union all
select 'motivos_anulacion', count(*) from public.sale_cancellation_reasons where is_active
union all
select 'categorias_finanzas', count(*) from public.finance_categories where is_active
union all
select 'plantillas_whatsapp', count(*) from public.whatsapp_templates where is_active;


-- ============================================================================
-- Fuente consolidada: 126_pos_atomic_checkout.sql
-- ============================================================================
-- Cierre POS atómico. Una llamada de función PostgreSQL se ejecuta como una
-- sola transacción: si falla un paso, no se conserva venta, item, pago ni reward.

create or replace function public.checkout_pos_sale(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item jsonb;
  v_payment jsonb;
  v_final_total numeric(12,2);
  v_paid_total numeric(12,2);
  v_pos_session_id uuid := (p_payload ->> 'pos_session_id')::uuid;
  v_branch_id uuid := (p_payload ->> 'branch_id')::uuid;
  v_customer_id uuid := (p_payload ->> 'customer_id')::uuid;
  v_barber_id uuid := nullif(p_payload ->> 'barber_id', '')::uuid;
  v_reservation_id uuid := nullif(p_payload ->> 'reservation_id', '')::uuid;
  v_reward_entitlement_id uuid := nullif(p_payload ->> 'reward_entitlement_id', '')::uuid;
begin
  if v_employee_id is null or not public.can_manage_pos_branch(v_branch_id) then
    raise exception 'No tienes permisos para cerrar ventas en esta sede.';
  end if;

  select * into v_session
  from public.pos_sessions
  where id = v_pos_session_id
    and branch_id = v_branch_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'La sesion POS ya esta cerrada.';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'items', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'La venta debe incluir al menos un item.';
  end if;

  insert into public.sales (
    pos_session_id, branch_id, customer_id, reservation_id, barber_id, status,
    subtotal, discount_total, courtesy_total, total, paid_total, change_amount,
    checkout_idempotency_key, notes, created_by
  ) values (
    v_pos_session_id, v_branch_id, v_customer_id, v_reservation_id, v_barber_id, 'draft',
    coalesce((p_payload ->> 'subtotal')::numeric, 0),
    coalesce((p_payload ->> 'discount_total')::numeric, 0),
    coalesce((p_payload ->> 'courtesy_total')::numeric, 0),
    coalesce((p_payload ->> 'total')::numeric, 0),
    coalesce((p_payload ->> 'paid_total')::numeric, 0),
    coalesce((p_payload ->> 'change_amount')::numeric, 0),
    nullif(p_payload ->> 'idempotency_key', ''),
    nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
    v_employee_id
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    insert into public.sale_items (
      sale_id, item_type, service_id, product_id, description_snapshot, quantity,
      unit_price, discount_amount, total, cost_snapshot, barber_id, is_courtesy,
      courtesy_reason, courtesy_rule_id, courtesy_rule_name_snapshot,
      original_unit_price, original_total, courtesy_amount, courtesy_authorized_by
    ) values (
      v_sale_id,
      v_item ->> 'item_type',
      nullif(v_item ->> 'service_id', '')::uuid,
      nullif(v_item ->> 'product_id', '')::uuid,
      coalesce(nullif(v_item ->> 'description_snapshot', ''), 'Item POS'),
      (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_price')::numeric,
      coalesce((v_item ->> 'discount_amount')::numeric, 0),
      (v_item ->> 'total')::numeric,
      nullif(v_item ->> 'cost_snapshot', '')::numeric,
      nullif(v_item ->> 'barber_id', '')::uuid,
      coalesce((v_item ->> 'is_courtesy')::boolean, false),
      nullif(v_item ->> 'courtesy_reason', ''),
      null,
      null,
      nullif(v_item ->> 'original_unit_price', '')::numeric,
      nullif(v_item ->> 'original_total', '')::numeric,
      nullif(v_item ->> 'courtesy_amount', '')::numeric,
      case when coalesce((v_item ->> 'is_courtesy')::boolean, false) then v_employee_id else null end
    );
  end loop;

  if v_reward_entitlement_id is not null then
    perform public.apply_reward_to_sale(v_sale_id, v_reward_entitlement_id);
  end if;

  select total into v_final_total from public.sales where id = v_sale_id;
  select coalesce(sum((value ->> 'amount')::numeric), 0) into v_paid_total
  from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb));

  if round(v_paid_total, 2) <> round(coalesce(v_final_total, 0), 2) then
    raise exception 'El monto pagado no cubre el total final de la venta.';
  end if;

  for v_payment in select value from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb))
  loop
    insert into public.sale_payments (
      sale_id, payment_method_id, amount, tendered_amount, change_amount
    ) values (
      v_sale_id,
      (v_payment ->> 'payment_method_id')::uuid,
      (v_payment ->> 'amount')::numeric,
      (v_payment ->> 'tendered_amount')::numeric,
      coalesce((v_payment ->> 'change_amount')::numeric, 0)
    );
  end loop;

  perform public.complete_sale(v_sale_id);
  return v_sale_id;
end;
$$;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- Fuente consolidada: 127_distributed_rate_limits.sql
-- ============================================================================
-- Límite distribuido: todas las instancias comparten el mismo contador.
create table if not exists public.api_rate_limit_windows (
  scope text not null,
  client_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, client_key, window_started_at)
);

alter table public.api_rate_limit_windows enable row level security;
revoke all on public.api_rate_limit_windows from public, anon, authenticated;
grant all on public.api_rate_limit_windows to service_role;

create or replace function public.consume_distributed_rate_limit(
  p_scope text,
  p_client_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_max_requests < 1 or p_window_seconds < 1 then
    raise exception 'Configuración de límite inválida.';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limit_windows (scope, client_key, window_started_at, request_count)
  values (left(p_scope, 80), left(p_client_key, 160), v_window, 1)
  on conflict (scope, client_key, window_started_at) do update
  set request_count = public.api_rate_limit_windows.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_distributed_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_distributed_rate_limit(text, text, integer, integer) to service_role;

create index if not exists api_rate_limit_windows_expiry_idx
  on public.api_rate_limit_windows (window_started_at);

notify pgrst, 'reload schema';

insert into public.app_settings (key, value, description)
values
  ('app.name', '"LBBS v2"'::jsonb, 'Nombre visible de la aplicacion.'),
  ('app.environment', '"production"'::jsonb, 'Instalacion base de produccion.')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;

notify pgrst, 'reload schema';
