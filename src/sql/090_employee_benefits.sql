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

