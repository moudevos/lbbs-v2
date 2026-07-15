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

create policy "customers_select_team"
on public.customers
for select
to authenticated
using (
  public.is_admin()
  or public.current_user_role() = 'reception'
  or (
    public.current_user_role() in ('barber', 'viewer')
    and is_active
  )
);

create policy "customers_insert_team"
on public.customers
for insert
to authenticated
with check (
  public.is_admin()
  or public.current_user_role() = 'reception'
);

create policy "customers_update_team"
on public.customers
for update
to authenticated
using (
  public.is_admin()
  or public.current_user_role() = 'reception'
)
with check (
  public.is_admin()
  or public.current_user_role() = 'reception'
);

create policy "customers_delete_admin"
on public.customers
for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
revoke all on public.customers from public;
