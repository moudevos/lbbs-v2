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
  product_id uuid not null references public.products(id) on delete restrict,
  product_category_id uuid references public.product_categories(id) on delete set null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_bonus_amount numeric(12,2) not null default 0 check (unit_bonus_amount >= 0),
  total_bonus_amount numeric(12,2) not null default 0 check (total_bonus_amount >= 0),
  bonus_rule_id uuid,
  status text not null default 'active' check (status in ('active', 'pending_review', 'reversed')),
  reversed_at timestamptz,
  reversed_reason text,
  created_at timestamptz not null default now(),
  unique (sale_item_id)
);

create index if not exists employee_service_production_period_employee_idx
  on public.employee_service_production (payroll_period_id, employee_id, status);
create index if not exists employee_product_bonus_period_employee_idx
  on public.employee_product_bonus_entries (payroll_period_id, employee_id, status);

