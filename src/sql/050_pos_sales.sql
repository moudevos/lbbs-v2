do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'customers'
  ) then
    alter table public.customers
      drop constraint if exists customers_source_check;

    alter table public.customers
      add constraint customers_source_check
      check (source in ('manual', 'reservation', 'sale', 'import', 'system'));
  end if;
end $$;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by uuid references public.employees(id) on delete set null,
  closed_by uuid references public.employees(id) on delete set null,
  reopened_by uuid references public.employees(id) on delete set null,
  business_date date not null default current_date,
  status text not null default 'open',
  opening_cash_amount numeric(12,2) not null default 0,
  expected_cash_amount numeric(12,2) not null default 0,
  counted_cash_amount numeric(12,2),
  cash_difference numeric(12,2),
  total_sales_amount numeric(12,2) not null default 0,
  total_cash_amount numeric(12,2) not null default 0,
  total_wallet_qr_amount numeric(12,2) not null default 0,
  total_card_pos_amount numeric(12,2) not null default 0,
  total_cancelled_amount numeric(12,2) not null default 0,
  sales_count integer not null default 0,
  cancelled_sales_count integer not null default 0,
  opening_notes text,
  closing_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  barber_id uuid references public.employees(id) on delete set null,
  status text not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  courtesy_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  notes text,
  cancelled_reason text,
  created_by uuid references public.employees(id) on delete set null,
  closed_by uuid references public.employees(id) on delete set null,
  cancelled_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_type text not null,
  service_id uuid references public.services(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  description_snapshot text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  cost_snapshot numeric(12,2),
  barber_id uuid references public.employees(id) on delete set null,
  is_courtesy boolean not null default false,
  courtesy_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  amount numeric(12,2) not null,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_session_events (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_status_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_status_check
      check (status in ('open', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_opening_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_opening_cash_amount_check
      check (opening_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_expected_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_expected_cash_amount_check
      check (expected_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_counted_cash_amount_check'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table public.pos_sessions
      add constraint pos_sessions_counted_cash_amount_check
      check (counted_cash_amount is null or counted_cash_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_status_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_status_check
      check (status in ('draft', 'completed', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_amounts_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_amounts_check
      check (
        subtotal >= 0
        and discount_total >= 0
        and courtesy_total >= 0
        and total >= 0
        and paid_total >= 0
        and change_amount >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_completed_requires_closed_at_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_completed_requires_closed_at_check
      check (status <> 'completed' or closed_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_cancelled_requires_cancelled_at_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_cancelled_requires_cancelled_at_check
      check (status <> 'cancelled' or cancelled_at is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_item_type_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_item_type_check
      check (item_type in ('service', 'product'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_amounts_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_amounts_check
      check (
        quantity > 0
        and unit_price >= 0
        and discount_amount >= 0
        and total >= 0
        and (cost_snapshot is null or cost_snapshot >= 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_reference_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_reference_check
      check (
        (
          item_type = 'service'
          and service_id is not null
          and product_id is null
        )
        or (
          item_type = 'product'
          and product_id is not null
          and service_id is null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_items_courtesy_total_check'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_courtesy_total_check
      check (is_courtesy = false or total = 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_payments_amount_check'
      and conrelid = 'public.sale_payments'::regclass
  ) then
    alter table public.sale_payments
      add constraint sale_payments_amount_check
      check (amount > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_session_events_event_type_check'
      and conrelid = 'public.pos_session_events'::regclass
  ) then
    alter table public.pos_session_events
      add constraint pos_session_events_event_type_check
      check (event_type in ('opened', 'closed', 'reopened', 'sale_completed', 'sale_cancelled', 'note'));
  end if;
end $$;

create unique index if not exists payment_methods_code_idx
  on public.payment_methods (code);

create index if not exists pos_sessions_branch_status_idx
  on public.pos_sessions (branch_id, status);

create index if not exists pos_sessions_business_date_idx
  on public.pos_sessions (business_date);

create unique index if not exists pos_sessions_one_open_per_branch_idx
  on public.pos_sessions (branch_id)
  where status = 'open';

create index if not exists sales_pos_session_id_idx
  on public.sales (pos_session_id);

create index if not exists sales_branch_id_idx
  on public.sales (branch_id);

create index if not exists sales_customer_id_idx
  on public.sales (customer_id);

create index if not exists sales_reservation_id_idx
  on public.sales (reservation_id);

create index if not exists sales_barber_id_idx
  on public.sales (barber_id);

create index if not exists sales_status_idx
  on public.sales (status);

create index if not exists sales_created_at_desc_idx
  on public.sales (created_at desc);

create index if not exists sale_items_sale_id_idx
  on public.sale_items (sale_id);

create index if not exists sale_items_service_id_idx
  on public.sale_items (service_id);

create index if not exists sale_items_product_id_idx
  on public.sale_items (product_id);

create index if not exists sale_payments_sale_id_idx
  on public.sale_payments (sale_id);

create index if not exists pos_session_events_pos_session_created_at_desc_idx
  on public.pos_session_events (pos_session_id, created_at desc);

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

drop trigger if exists payment_methods_set_updated_at on public.payment_methods;
create trigger payment_methods_set_updated_at
before update on public.payment_methods
for each row execute function public.set_updated_at();

drop trigger if exists pos_sessions_set_updated_at on public.pos_sessions;
create trigger pos_sessions_set_updated_at
before update on public.pos_sessions
for each row execute function public.set_updated_at();

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists sale_items_set_updated_at on public.sale_items;
create trigger sale_items_set_updated_at
before update on public.sale_items
for each row execute function public.set_updated_at();

create or replace function public.can_view_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or public.can_access_branch(target_branch_id),
    false
  )
$$;

create or replace function public.can_manage_pos_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and public.can_access_branch(target_branch_id)
    ),
    false
  )
$$;

create or replace function public.can_view_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales s
    where s.id = target_sale_id
      and public.can_manage_pos_branch(s.branch_id)
  )
$$;

create or replace function public.can_view_pos_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pos_sessions ps
    where ps.id = target_session_id
      and public.can_view_pos_branch(ps.branch_id)
  )
$$;

create or replace function public.can_manage_pos_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pos_sessions ps
    where ps.id = target_session_id
      and public.can_manage_pos_branch(ps.branch_id)
  )
$$;

create or replace function public.sync_pos_session_totals(p_session_id uuid)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_total_sales numeric(12,2) := 0;
  v_total_cash numeric(12,2) := 0;
  v_total_wallet numeric(12,2) := 0;
  v_total_card numeric(12,2) := 0;
  v_total_cancelled numeric(12,2) := 0;
  v_sales_count integer := 0;
  v_cancelled_sales_count integer := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  select
    coalesce(sum(case when s.status = 'completed' then s.total else 0 end), 0),
    coalesce(sum(case when s.status = 'cancelled' then s.total else 0 end), 0),
    coalesce(count(*) filter (where s.status = 'completed'), 0),
    coalesce(count(*) filter (where s.status = 'cancelled'), 0)
  into
    v_total_sales,
    v_total_cancelled,
    v_sales_count,
    v_cancelled_sales_count
  from public.sales s
  where s.pos_session_id = p_session_id;

  select
    coalesce(sum(sp.amount) filter (where pm.code = 'cash' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'wallet_qr' and s.status = 'completed'), 0),
    coalesce(sum(sp.amount) filter (where pm.code = 'card_pos' and s.status = 'completed'), 0)
  into
    v_total_cash,
    v_total_wallet,
    v_total_card
  from public.sale_payments sp
  join public.sales s on s.id = sp.sale_id
  join public.payment_methods pm on pm.id = sp.payment_method_id
  where s.pos_session_id = p_session_id;

  update public.pos_sessions
  set total_sales_amount = v_total_sales,
      total_cash_amount = v_total_cash,
      total_wallet_qr_amount = v_total_wallet,
      total_card_pos_amount = v_total_card,
      total_cancelled_amount = v_total_cancelled,
      sales_count = v_sales_count,
      cancelled_sales_count = v_cancelled_sales_count,
      expected_cash_amount = coalesce(opening_cash_amount, 0) + v_total_cash
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function public.get_open_pos_session(p_branch_id uuid)
returns public.pos_sessions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ps.*
  from public.pos_sessions ps
  where ps.branch_id = p_branch_id
    and ps.status = 'open'
  order by ps.opened_at desc
  limit 1
$$;

create or replace function public.recalculate_sale_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_courtesy_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select
    coalesce(sum(si.quantity * si.unit_price), 0),
    coalesce(sum(si.discount_amount), 0),
    coalesce(sum(case when si.is_courtesy then si.quantity * si.unit_price else 0 end), 0),
    coalesce(sum(si.total), 0)
  into
    v_subtotal,
    v_discount_total,
    v_courtesy_total,
    v_total
  from public.sale_items si
  where si.sale_id = p_sale_id;

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_discount_total,
      courtesy_total = v_courtesy_total,
      total = v_total,
      change_amount = greatest(paid_total - v_total, 0)
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.recalculate_sale_payment_totals(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_paid_total numeric(12,2) := 0;
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  select coalesce(sum(sp.amount), 0)
  into v_paid_total
  from public.sale_payments sp
  where sp.sale_id = p_sale_id;

  update public.sales
  set paid_total = v_paid_total,
      change_amount = greatest(v_paid_total - total, 0)
  where id = p_sale_id
  returning *
  into v_sale;

  return v_sale;
end;
$$;

create or replace function public.sale_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_sale_totals(coalesce(new.sale_id, old.sale_id));
  return null;
end;
$$;

create or replace function public.sale_payments_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_sale_payment_totals(coalesce(new.sale_id, old.sale_id));
  return null;
end;
$$;

drop trigger if exists sale_items_after_write_trigger on public.sale_items;
create trigger sale_items_after_write_trigger
after insert or update or delete on public.sale_items
for each row execute function public.sale_items_after_write();

drop trigger if exists sale_payments_after_write_trigger on public.sale_payments;
create trigger sale_payments_after_write_trigger
after insert or update or delete on public.sale_payments
for each row execute function public.sale_payments_after_write();

create or replace function public.open_pos_session(
  p_branch_id uuid,
  p_opening_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  if not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para abrir una sesion POS en esta sede.';
  end if;

  select *
  into v_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  if found then
    return v_session;
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  begin
    insert into public.pos_sessions (
      branch_id,
      opened_by,
      business_date,
      status,
      opening_cash_amount,
      expected_cash_amount,
      opening_notes,
      opened_at
    )
    values (
      p_branch_id,
      v_employee_id,
      current_date,
      'open',
      coalesce(p_opening_cash_amount, 0),
      coalesce(p_opening_cash_amount, 0),
      nullif(btrim(coalesce(p_notes, '')), ''),
      now()
    )
    returning *
    into v_session;
  exception
    when unique_violation then
      select *
      into v_session
      from public.pos_sessions
      where branch_id = p_branch_id
        and status = 'open'
      order by opened_at desc
      limit 1;
      return v_session;
  end;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'opened',
    'Sesion POS abierta.',
    jsonb_build_object(
      'opening_cash_amount', v_session.opening_cash_amount,
      'branch_id', v_session.branch_id
    )
  );

  return v_session;
end;
$$;

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_cash_amount numeric,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_draft_count integer := 0;
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para cerrar esta sesion POS.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'La sesion POS ya esta cerrada.';
  end if;

  if coalesce(p_counted_cash_amount, 0) < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select count(*)
  into v_draft_count
  from public.sales s
  where s.pos_session_id = p_session_id
    and s.status = 'draft';

  if v_draft_count > 0 then
    raise exception 'No se puede cerrar la sesion mientras existan ventas en borrador.';
  end if;

  v_session := public.sync_pos_session_totals(p_session_id);

  update public.pos_sessions
  set status = 'closed',
      counted_cash_amount = coalesce(p_counted_cash_amount, 0),
      cash_difference = coalesce(p_counted_cash_amount, 0) - expected_cash_amount,
      closing_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      closed_by = v_employee_id,
      closed_at = now()
  where id = p_session_id
  returning *
  into v_session;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'closed',
    'Sesion POS cerrada.',
    jsonb_build_object(
      'counted_cash_amount', v_session.counted_cash_amount,
      'expected_cash_amount', v_session.expected_cash_amount,
      'cash_difference', v_session.cash_difference
    )
  );

  return v_session;
end;
$$;

create or replace function public.reopen_pos_session(
  p_session_id uuid,
  p_notes text default null
)
returns public.pos_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
begin
  select *
  into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden reabrir sesiones POS.';
  end if;

  if v_session.status <> 'closed' then
    raise exception 'Solo se pueden reabrir sesiones cerradas.';
  end if;

  if v_session.business_date <> public.pos_business_date() then
    raise exception 'Solo se puede reabrir una sesion cerrada del mismo dia.';
  end if;

  if exists (
    select 1
    from public.pos_sessions ps
    where ps.branch_id = v_session.branch_id
      and ps.status = 'open'
      and ps.id <> v_session.id
  ) then
    raise exception 'Ya existe otra sesion POS abierta para esta sede.';
  end if;

  update public.pos_sessions
  set status = 'open',
      reopened_by = v_employee_id,
      reopened_at = now(),
      closed_by = null,
      closed_at = null,
      counted_cash_amount = null,
      cash_difference = null,
      closing_notes = nullif(btrim(coalesce(p_notes, closing_notes, '')), '')
  where id = p_session_id
  returning *
  into v_session;

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_session.id,
    v_employee_id,
    'reopened',
    'Sesion POS reabierta.',
    jsonb_build_object(
      'business_date', v_session.business_date
    )
  );

  return v_session;
end;
$$;

create or replace function public.complete_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_item_count integer := 0;
  v_service_count integer := 0;
  v_barber_covered boolean := false;
  v_stock_issue text;
begin
  v_sale := public.recalculate_sale_totals(p_sale_id);
  v_sale := public.recalculate_sale_payment_totals(p_sale_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para completar esta venta.';
  end if;

  if v_sale.status <> 'draft' then
    raise exception 'Solo las ventas en borrador se pueden completar.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.branch_id = v_sale.branch_id
      and ps.status = 'open'
  ) then
    raise exception 'La venta requiere una sesion POS abierta de la misma sede.';
  end if;

  select count(*)
  into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  if v_item_count = 0 then
    raise exception 'La venta debe tener al menos un item.';
  end if;

  if v_sale.paid_total < v_sale.total then
    raise exception 'Los pagos registrados no cubren el total de la venta.';
  end if;

  select count(*)
  into v_service_count
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_type = 'service';

  if v_service_count > 0 then
    select (
      v_sale.barber_id is not null
      or exists (
        select 1
        from public.sale_items si
        where si.sale_id = p_sale_id
          and si.item_type = 'service'
          and si.barber_id is not null
      )
    )
    into v_barber_covered;

    if not v_barber_covered then
      raise exception 'Las ventas con servicios requieren un barbero asignado.';
    end if;
  end if;

  select concat('Stock insuficiente para ', p.name)
  into v_stock_issue
  from (
    select
      si.product_id,
      sum(si.quantity) as required_quantity
    from public.sale_items si
    join public.products p0 on p0.id = si.product_id
    where si.sale_id = p_sale_id
      and si.item_type = 'product'
      and p0.is_stockable = true
    group by si.product_id
  ) required
  join public.products p on p.id = required.product_id
  join public.vw_product_stock stock
    on stock.product_id = required.product_id
   and stock.branch_id = v_sale.branch_id
  where stock.stock_quantity < required.required_quantity
  limit 1;

  if v_stock_issue is not null then
    raise exception '%', v_stock_issue;
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    case when si.is_courtesy then 'courtesy' else 'sale' end,
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale',
    v_sale.id,
    case
      when si.is_courtesy then 'Descuento de stock por cortesia en venta completada.'
      else 'Descuento de stock por venta completada.'
    end,
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'completed',
      paid_total = greatest(paid_total, total),
      change_amount = greatest(paid_total - total, 0),
      closed_by = v_employee_id,
      closed_at = now(),
      cancelled_by = null,
      cancelled_at = null,
      cancelled_reason = null
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'completed',
        completed_at = now(),
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_completed',
    'Venta completada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'total', v_sale.total,
      'customer_id', v_sale.customer_id
    )
  );

  return v_sale;
end;
$$;

create or replace function public.cancel_completed_sale(
  p_sale_id uuid,
  p_reason text
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if not public.can_manage_pos_branch(v_sale.branch_id) then
    raise exception 'No tienes permisos para anular esta venta.';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Solo se pueden anular ventas completadas.';
  end if;

  if not exists (
    select 1
    from public.pos_sessions ps
    where ps.id = v_sale.pos_session_id
      and ps.status = 'open'
  ) then
    raise exception 'Solo se puede anular una venta mientras la sesion POS este abierta.';
  end if;

  if v_reason is null then
    raise exception 'Debes indicar el motivo de anulacion.';
  end if;

  insert into public.stock_movements (
    product_id,
    branch_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  select
    si.product_id,
    v_sale.branch_id,
    'adjustment',
    si.quantity,
    coalesce(si.cost_snapshot, p.cost_price),
    'sale_cancellation',
    v_sale.id,
    'Reversion de stock por anulacion de venta completada.',
    v_employee_id
  from public.sale_items si
  join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and si.item_type = 'product'
    and p.is_stockable = true;

  update public.sales
  set status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_by = v_employee_id,
      cancelled_at = now()
  where id = p_sale_id
  returning *
  into v_sale;

  if v_sale.reservation_id is not null then
    update public.reservations
    set status = 'checked_in',
        completed_at = null,
        updated_by = v_employee_id
    where id = v_sale.reservation_id;
  end if;

  perform public.sync_pos_session_totals(v_sale.pos_session_id);

  insert into public.pos_session_events (
    pos_session_id,
    employee_id,
    event_type,
    message,
    metadata
  )
  values (
    v_sale.pos_session_id,
    v_employee_id,
    'sale_cancelled',
    'Venta anulada.',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'reason', v_reason
    )
  );

  return v_sale;
end;
$$;

revoke all on function public.can_view_pos_branch(uuid) from public;
revoke all on function public.can_manage_pos_branch(uuid) from public;
revoke all on function public.can_view_sale(uuid) from public;
revoke all on function public.can_view_pos_session(uuid) from public;
revoke all on function public.can_manage_pos_session(uuid) from public;
revoke all on function public.sync_pos_session_totals(uuid) from public;
revoke all on function public.get_open_pos_session(uuid) from public;
revoke all on function public.open_pos_session(uuid, numeric, text) from public;
revoke all on function public.close_pos_session(uuid, numeric, text) from public;
revoke all on function public.reopen_pos_session(uuid, text) from public;
revoke all on function public.recalculate_sale_totals(uuid) from public;
revoke all on function public.recalculate_sale_payment_totals(uuid) from public;
revoke all on function public.sale_items_after_write() from public;
revoke all on function public.sale_payments_after_write() from public;
revoke all on function public.complete_sale(uuid) from public;
revoke all on function public.cancel_completed_sale(uuid, text) from public;

grant execute on function public.can_view_pos_branch(uuid) to authenticated, service_role;
grant execute on function public.can_manage_pos_branch(uuid) to authenticated, service_role;
grant execute on function public.can_view_sale(uuid) to authenticated, service_role;
grant execute on function public.can_view_pos_session(uuid) to authenticated, service_role;
grant execute on function public.can_manage_pos_session(uuid) to authenticated, service_role;
grant execute on function public.sync_pos_session_totals(uuid) to authenticated, service_role;
grant execute on function public.get_open_pos_session(uuid) to authenticated, service_role;
grant execute on function public.open_pos_session(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.close_pos_session(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.reopen_pos_session(uuid, text) to authenticated, service_role;
grant execute on function public.recalculate_sale_totals(uuid) to authenticated, service_role;
grant execute on function public.recalculate_sale_payment_totals(uuid) to authenticated, service_role;
grant execute on function public.complete_sale(uuid) to authenticated, service_role;
grant execute on function public.cancel_completed_sale(uuid, text) to authenticated, service_role;

alter table public.payment_methods enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.pos_session_events enable row level security;

drop policy if exists "payment_methods_select_team" on public.payment_methods;
drop policy if exists "payment_methods_write_admin" on public.payment_methods;
drop policy if exists "payment_methods_service_role_all" on public.payment_methods;

create policy "payment_methods_select_team"
on public.payment_methods
for select
to authenticated
using (public.is_admin() or public.current_user_role() = 'reception' or is_active);

create policy "payment_methods_write_admin"
on public.payment_methods
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "payment_methods_service_role_all"
on public.payment_methods
for all
to service_role
using (true)
with check (true);

drop policy if exists "pos_sessions_select_branch_scope" on public.pos_sessions;
drop policy if exists "pos_sessions_manage_branch_scope" on public.pos_sessions;
drop policy if exists "pos_sessions_service_role_all" on public.pos_sessions;

create policy "pos_sessions_select_branch_scope"
on public.pos_sessions
for select
to authenticated
using (public.can_view_pos_branch(branch_id));

create policy "pos_sessions_manage_branch_scope"
on public.pos_sessions
for all
to authenticated
using (public.can_manage_pos_branch(branch_id))
with check (public.can_manage_pos_branch(branch_id));

create policy "pos_sessions_service_role_all"
on public.pos_sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists "sales_select_branch_scope" on public.sales;
drop policy if exists "sales_manage_branch_scope" on public.sales;
drop policy if exists "sales_service_role_all" on public.sales;

create policy "sales_select_branch_scope"
on public.sales
for select
to authenticated
using (public.can_manage_pos_branch(branch_id));

create policy "sales_manage_branch_scope"
on public.sales
for all
to authenticated
using (public.can_manage_pos_branch(branch_id))
with check (public.can_manage_pos_branch(branch_id));

create policy "sales_service_role_all"
on public.sales
for all
to service_role
using (true)
with check (true);

drop policy if exists "sale_items_select_branch_scope" on public.sale_items;
drop policy if exists "sale_items_manage_branch_scope" on public.sale_items;
drop policy if exists "sale_items_service_role_all" on public.sale_items;

create policy "sale_items_select_branch_scope"
on public.sale_items
for select
to authenticated
using (public.can_view_sale(sale_id));

create policy "sale_items_manage_branch_scope"
on public.sale_items
for all
to authenticated
using (public.can_view_sale(sale_id))
with check (public.can_view_sale(sale_id));

create policy "sale_items_service_role_all"
on public.sale_items
for all
to service_role
using (true)
with check (true);

drop policy if exists "sale_payments_select_branch_scope" on public.sale_payments;
drop policy if exists "sale_payments_manage_branch_scope" on public.sale_payments;
drop policy if exists "sale_payments_service_role_all" on public.sale_payments;

create policy "sale_payments_select_branch_scope"
on public.sale_payments
for select
to authenticated
using (public.can_view_sale(sale_id));

create policy "sale_payments_manage_branch_scope"
on public.sale_payments
for all
to authenticated
using (public.can_view_sale(sale_id))
with check (public.can_view_sale(sale_id));

create policy "sale_payments_service_role_all"
on public.sale_payments
for all
to service_role
using (true)
with check (true);

drop policy if exists "pos_session_events_select_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_manage_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_service_role_all" on public.pos_session_events;

create policy "pos_session_events_select_branch_scope"
on public.pos_session_events
for select
to authenticated
using (public.can_view_pos_session(pos_session_id));

create policy "pos_session_events_manage_branch_scope"
on public.pos_session_events
for all
to authenticated
using (public.can_manage_pos_session(pos_session_id))
with check (public.can_manage_pos_session(pos_session_id));

create policy "pos_session_events_service_role_all"
on public.pos_session_events
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.payment_methods to authenticated;
grant select, insert, update, delete on public.pos_sessions to authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update, delete on public.sale_items to authenticated;
grant select, insert, update, delete on public.sale_payments to authenticated;
grant select, insert, update, delete on public.pos_session_events to authenticated;

grant all on public.payment_methods to service_role;
grant all on public.pos_sessions to service_role;
grant all on public.sales to service_role;
grant all on public.sale_items to service_role;
grant all on public.sale_payments to service_role;
grant all on public.pos_session_events to service_role;

revoke all on public.payment_methods from public;
revoke all on public.pos_sessions from public;
revoke all on public.sales from public;
revoke all on public.sale_items from public;
revoke all on public.sale_payments from public;
revoke all on public.pos_session_events from public;

insert into public.payment_methods (code, name, description, sort_order, is_active)
values
  ('cash', 'Efectivo', 'Cobro en efectivo.', 1, true),
  ('wallet_qr', 'QR billetera', 'Cobro con billetera digital o QR.', 2, true),
  ('card_pos', 'POS tarjeta', 'Cobro con POS de tarjetas.', 3, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

do $$
declare
  v_customer_id uuid;
begin
  select c.id
  into v_customer_id
  from public.customers c
  where c.phone_normalized = '000000000'
     or lower(c.full_name) = 'cliente varios'
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      full_name,
      first_name,
      last_name,
      business_name,
      phone,
      phone_normalized,
      source,
      is_active
    )
    values (
      'Cliente varios',
      'Cliente',
      'varios',
      null,
      '000000000',
      '000000000',
      'system',
      true
    );
  else
    update public.customers
    set full_name = 'Cliente varios',
        first_name = 'Cliente',
        last_name = 'varios',
        phone = '000000000',
        phone_normalized = '000000000',
        source = 'system',
        is_active = true
    where id = v_customer_id;
  end if;
end $$;

-- TODO: si la validacion de barbero por servicio se vuelve mas compleja,
-- mantener la verificacion principal tambien en backend durante el Sprint 5C.
-- TODO: en una fase posterior, registrar asientos de caja operativa separados
-- para anulaciones y ajustes fuera del flujo de venta.
