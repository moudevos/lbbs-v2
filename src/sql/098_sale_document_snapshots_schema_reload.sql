-- Sprint 8.11: verificacion idempotente y recarga de PostgREST para tickets.
create table if not exists public.sale_document_snapshots (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete restrict,
  document_type text not null, schema_version text not null, payload jsonb not null, status text not null default 'active',
  generated_at timestamptz not null default now(), generated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists sale_document_snapshots_active_version_idx on public.sale_document_snapshots (sale_id, document_type, schema_version) where status = 'active';
create index if not exists sale_document_snapshots_sale_idx on public.sale_document_snapshots (sale_id, generated_at desc);
notify pgrst, 'reload schema';
select to_regclass('public.sale_document_snapshots');
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'sale_document_snapshots' order by ordinal_position;
