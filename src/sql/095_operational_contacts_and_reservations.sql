  -- Sprint 8.10: categorias operativas de caja, contactos manuales y vinculo unico reserva-venta.

  insert into public.cash_movement_categories (code, name, description, movement_direction, sort_order, is_active)
  values
    ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
    ('employee_supply_collection', 'Cobro de insumo a empleado', 'Cobro manual por insumos entregados.', 'income', 2, true),
    ('cash_replenishment', 'Reposicion de caja', 'Ingreso para reponer efectivo operativo.', 'income', 3, true),
    ('other_income', 'Otro ingreso', 'Ingreso operativo no clasificado.', 'income', 4, true),
    ('operational_purchase', 'Compra operativa', 'Compra pagada desde caja sin afectar stock.', 'expense', 10, true),
    ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 11, true),
    ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 12, true),
    ('settlement_payment', 'Pago de liquidacion', 'Pago operativo de liquidacion a empleado.', 'expense', 13, true),
    ('other_expense', 'Otro egreso', 'Egreso operativo no clasificado.', 'expense', 14, true),
    ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 20, true),
    ('positive_adjustment', 'Ajuste positivo', 'Correccion positiva de caja.', 'adjustment', 21, true),
    ('negative_adjustment', 'Ajuste negativo', 'Correccion negativa de caja.', 'adjustment', 22, true)
  on conflict (code) do update
  set name = excluded.name, description = excluded.description, movement_direction = excluded.movement_direction,
      sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();

  create table if not exists public.whatsapp_templates (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    contact_type text not null check (contact_type in ('reservation_reminder', 'post_service_thanks', 'manual')),
    body text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  insert into public.whatsapp_templates (code, name, contact_type, body)
  values
    ('reservation_reminder_default', 'Recordatorio de reserva', 'reservation_reminder', 'Hola {{cliente}}, te recordamos tu reserva para {{fecha}} a las {{hora}} en {{sede}}. {{direccion}}. Barbero: {{barbero}}. Servicio de interes: {{servicio}}.'),
    ('post_service_thanks_default', 'Agradecimiento post servicio', 'post_service_thanks', 'Gracias por visitarnos, {{cliente}}. Esperamos verte pronto en {{sede}}. Te atendio {{barbero}}. Servicios: {{servicios}}.')
  on conflict (code) do update set name = excluded.name, body = excluded.body, is_active = true, updated_at = now();

  alter table public.whatsapp_templates enable row level security;
  drop policy if exists "whatsapp_templates_select_scope" on public.whatsapp_templates;
  drop policy if exists "whatsapp_templates_manage_admin" on public.whatsapp_templates;
  drop policy if exists "whatsapp_templates_service_role_all" on public.whatsapp_templates;
  create policy "whatsapp_templates_select_scope" on public.whatsapp_templates for select to authenticated using (is_active and (public.is_admin() or public.current_user_role() = 'reception'));
  create policy "whatsapp_templates_manage_admin" on public.whatsapp_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
  create policy "whatsapp_templates_service_role_all" on public.whatsapp_templates for all to service_role using (true) with check (true);
  grant select on public.whatsapp_templates to authenticated;
  grant all on public.whatsapp_templates to service_role;
  revoke all on public.whatsapp_templates from public;

  create table if not exists public.whatsapp_contact_logs (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    reservation_id uuid references public.reservations(id) on delete set null,
    sale_id uuid references public.sales(id) on delete set null,
    branch_id uuid not null references public.branches(id) on delete restrict,
    contact_type text not null check (contact_type in ('reservation_reminder', 'post_service_thanks', 'manual')),
    template_id uuid references public.whatsapp_templates(id) on delete set null,
    phone text not null,
    message_snapshot text not null,
    status text not null default 'opened' check (status in ('opened', 'marked_sent', 'cancelled')),
    contacted_at timestamptz,
    contacted_by uuid references public.employees(id) on delete set null,
    created_at timestamptz not null default now()
  );

  create index if not exists whatsapp_contact_logs_reservation_idx on public.whatsapp_contact_logs (reservation_id, created_at desc);
  create index if not exists whatsapp_contact_logs_sale_idx on public.whatsapp_contact_logs (sale_id, created_at desc);
  create index if not exists whatsapp_contact_logs_branch_created_idx on public.whatsapp_contact_logs (branch_id, created_at desc);

  alter table public.whatsapp_contact_logs enable row level security;
  drop policy if exists "whatsapp_contact_logs_select_scope" on public.whatsapp_contact_logs;
  drop policy if exists "whatsapp_contact_logs_write_scope" on public.whatsapp_contact_logs;
  drop policy if exists "whatsapp_contact_logs_service_role_all" on public.whatsapp_contact_logs;
  create policy "whatsapp_contact_logs_select_scope" on public.whatsapp_contact_logs for select to authenticated
  using ((public.is_admin() or public.current_user_role() = 'reception') and public.can_access_branch(branch_id));
  create policy "whatsapp_contact_logs_write_scope" on public.whatsapp_contact_logs for insert to authenticated
  with check ((public.is_admin() or public.current_user_role() = 'reception') and public.can_access_branch(branch_id));
  create policy "whatsapp_contact_logs_service_role_all" on public.whatsapp_contact_logs for all to service_role using (true) with check (true);
  grant select, insert on public.whatsapp_contact_logs to authenticated;
  grant all on public.whatsapp_contact_logs to service_role;
  revoke all on public.whatsapp_contact_logs from public;

  create unique index if not exists sales_one_completed_reservation_idx
    on public.sales (reservation_id)
    where status = 'completed' and reservation_id is not null;
