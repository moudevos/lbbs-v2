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
