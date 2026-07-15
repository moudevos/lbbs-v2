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
  bonus_type text not null default 'fixed_per_unit' check (bonus_type = 'fixed_per_unit'),
  bonus_value numeric(12,2) not null check (bonus_value >= 0),
  priority integer not null default 0, is_active boolean not null default true,
  effective_from date not null default current_date, effective_to date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (product_id is not null or product_category_id is not null),
  check (not (product_id is not null and product_category_id is not null)),
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
create index if not exists employee_supply_markup_rules_lookup_idx on public.employee_supply_markup_rules (is_active, product_id, priority desc);

alter table public.employee_product_bonus_entries
  drop constraint if exists employee_product_bonus_entries_bonus_rule_id_fkey;
alter table public.employee_product_bonus_entries
  add constraint employee_product_bonus_entries_bonus_rule_id_fkey
  foreign key (bonus_rule_id) references public.product_bonus_rules(id) on delete set null;
