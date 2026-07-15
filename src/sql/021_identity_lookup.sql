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
