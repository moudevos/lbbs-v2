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
