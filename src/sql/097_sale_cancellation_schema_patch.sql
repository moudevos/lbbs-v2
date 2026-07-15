-- Sprint 8.11: compatibilidad de anulaciones para tickets y ventas historicas.
-- Ejecutar despues de 096_sale_cancellation_reasons.sql. Es idempotente.

create table if not exists public.sale_cancellation_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales
  add column if not exists cancellation_reason_id uuid,
  add column if not exists cancellation_notes text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_cancellation_reason_id_fkey') then
    alter table public.sales add constraint sales_cancellation_reason_id_fkey foreign key (cancellation_reason_id) references public.sale_cancellation_reasons(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_cancelled_by_fkey') then
    alter table public.sales add constraint sales_cancelled_by_fkey foreign key (cancelled_by) references public.employees(id) on delete set null;
  end if;
end $$;

create index if not exists sales_cancellation_reason_id_idx on public.sales (cancellation_reason_id);
