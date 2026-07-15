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
