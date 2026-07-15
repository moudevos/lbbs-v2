-- Sprint 8.9: snapshots internos de ticket y garantias de canje de rewards.
-- Ejecutar despues de 093_employee_compensation_rls.sql.

create table if not exists public.sale_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  document_type text not null check (document_type = 'internal_ticket'),
  schema_version text not null default '1.0',
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.employees(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_at timestamptz not null default now()
);

create unique index if not exists sale_document_snapshots_active_version_idx
  on public.sale_document_snapshots (sale_id, document_type, schema_version)
  where status = 'active';

create index if not exists sale_document_snapshots_sale_idx
  on public.sale_document_snapshots (sale_id, generated_at desc);

create unique index if not exists reward_redemptions_one_active_per_entitlement_idx
  on public.reward_redemptions (entitlement_id)
  where status = 'applied';

alter table public.sale_document_snapshots enable row level security;

drop policy if exists "sale_document_snapshots_select_scope" on public.sale_document_snapshots;
drop policy if exists "sale_document_snapshots_manage_scope" on public.sale_document_snapshots;
drop policy if exists "sale_document_snapshots_service_role_all" on public.sale_document_snapshots;

create policy "sale_document_snapshots_select_scope"
on public.sale_document_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
);

create policy "sale_document_snapshots_manage_scope"
on public.sale_document_snapshots
for all to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_document_snapshots.sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
);

create policy "sale_document_snapshots_service_role_all"
on public.sale_document_snapshots
for all to service_role using (true) with check (true);

grant select, insert on public.sale_document_snapshots to authenticated;
grant all on public.sale_document_snapshots to service_role;
revoke all on public.sale_document_snapshots from anon, public;
