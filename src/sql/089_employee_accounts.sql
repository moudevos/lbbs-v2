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

