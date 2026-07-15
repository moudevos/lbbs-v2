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
