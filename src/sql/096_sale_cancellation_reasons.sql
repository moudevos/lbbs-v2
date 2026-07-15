-- Sprint 8.11: catalogo de motivos para anulaciones de venta.
-- Ejecutar despues de 095_operational_contacts_and_reservations.sql.

create table if not exists public.sale_cancellation_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales
  add column if not exists cancellation_reason_id uuid references public.sale_cancellation_reasons(id) on delete set null,
  add column if not exists cancellation_notes text;

create index if not exists sales_cancellation_reason_id_idx on public.sales (cancellation_reason_id);

insert into public.sale_cancellation_reasons (code, name, description, sort_order)
values
  ('error_de_registro', 'Error de registro', 'Datos incorrectos durante el registro.', 1),
  ('cliente_desistio', 'Cliente desistio', 'El cliente decidio no continuar.', 2),
  ('pago_no_completado', 'Pago no completado', 'No se completo el pago de la venta.', 3),
  ('servicio_no_realizado', 'Servicio no realizado', 'El servicio finalmente no fue realizado.', 4),
  ('venta_duplicada', 'Venta duplicada', 'La venta fue registrada mas de una vez.', 5),
  ('otro', 'Otro motivo', 'Motivo no incluido en el catalogo.', 99)
on conflict (code) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
    is_active = true, updated_at = now();

alter table public.sale_cancellation_reasons enable row level security;
drop policy if exists "sale_cancellation_reasons_select_scope" on public.sale_cancellation_reasons;
drop policy if exists "sale_cancellation_reasons_manage_admin" on public.sale_cancellation_reasons;
drop policy if exists "sale_cancellation_reasons_service_role_all" on public.sale_cancellation_reasons;
create policy "sale_cancellation_reasons_select_scope" on public.sale_cancellation_reasons for select to authenticated
using (is_active and public.current_user_role() in ('owner', 'admin', 'reception'));
create policy "sale_cancellation_reasons_manage_admin" on public.sale_cancellation_reasons for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "sale_cancellation_reasons_service_role_all" on public.sale_cancellation_reasons for all to service_role using (true) with check (true);
grant select on public.sale_cancellation_reasons to authenticated;
grant all on public.sale_cancellation_reasons to service_role;
revoke all on public.sale_cancellation_reasons from public;
