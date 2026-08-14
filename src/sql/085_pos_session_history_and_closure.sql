-- Sprint 8.7: historial y cierre de sesiones POS por metodo de pago.
-- Ejecutar manualmente despues de 083_services_custom_price_patch.sql.

alter table public.pos_sessions
  add column if not exists expected_cash_amount numeric(12,2) not null default 0,
  add column if not exists counted_cash_amount numeric(12,2),
  add column if not exists cash_difference numeric(12,2),
  add column if not exists closing_notes text,
  add column if not exists closed_at timestamptz;

alter table public.pos_sessions
  drop constraint if exists pos_sessions_status_check;

alter table public.pos_sessions
  add constraint pos_sessions_status_check
  check (status in ('open', 'pending_close', 'closed', 'cancelled'));

drop index if exists public.pos_sessions_one_open_per_branch_idx;
create unique index if not exists pos_sessions_one_active_per_branch_idx
  on public.pos_sessions (branch_id)
  where status in ('open', 'pending_close');

create index if not exists pos_sessions_history_idx
  on public.pos_sessions (business_date desc, status, branch_id);

create table if not exists public.pos_session_payment_closures (
  id uuid primary key default gen_random_uuid(),
  pos_session_id uuid not null references public.pos_sessions(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  expected_amount numeric(12,2) not null default 0,
  counted_amount numeric(12,2) not null default 0,
  difference_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pos_session_id, payment_method_id),
  check (expected_amount >= 0),
  check (counted_amount >= 0)
);

create index if not exists pos_session_payment_closures_session_idx
  on public.pos_session_payment_closures (pos_session_id);

alter table public.pos_session_payment_closures enable row level security;

drop policy if exists "pos_session_payment_closures_select_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_manage_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_service_role_all"
  on public.pos_session_payment_closures;

create policy "pos_session_payment_closures_select_scope"
on public.pos_session_payment_closures
for select
to authenticated
using (public.can_manage_pos_session(pos_session_id));

create policy "pos_session_payment_closures_manage_scope"
on public.pos_session_payment_closures
for all
to authenticated
using (public.can_manage_pos_session(pos_session_id))
with check (public.can_manage_pos_session(pos_session_id));

create policy "pos_session_payment_closures_service_role_all"
on public.pos_session_payment_closures
for all
to service_role
using (true)
with check (true);

grant select, insert, update on public.pos_session_payment_closures to authenticated;
grant all on public.pos_session_payment_closures to service_role;
revoke all on public.pos_session_payment_closures from anon, public;

-- La jornada operativa se rige por Lima independientemente del timezone de
-- la conexión o del servidor PostgreSQL.
create or replace function public.pos_business_date()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select timezone('America/Lima', now())::date;
$$;

create or replace function public.mark_overdue_pos_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.pos_sessions
  set status = 'pending_close',
      updated_at = now()
  where status = 'open'
    and business_date < public.pos_business_date()
    and public.can_manage_pos_branch(branch_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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

  perform public.mark_overdue_pos_sessions();

  select * into v_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status in ('open', 'pending_close')
  order by opened_at desc
  limit 1;

  if found then
    raise exception 'Hay una sesion pendiente de cierre en esta sede.';
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  insert into public.pos_sessions (
    branch_id, opened_by, business_date, status, opening_cash_amount,
    expected_cash_amount, opening_notes, opened_at
  ) values (
    p_branch_id, v_employee_id, current_date, 'open',
    coalesce(p_opening_cash_amount, 0), coalesce(p_opening_cash_amount, 0),
    nullif(btrim(coalesce(p_notes, '')), ''), now()
  )
  returning * into v_session;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    v_session.id, v_employee_id, 'opened', 'Sesion POS abierta.',
    jsonb_build_object('opening_cash_amount', v_session.opening_cash_amount)
  );

  return v_session;
end;
$$;

create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_sales jsonb;
  v_payments jsonb;
  v_movements jsonb;
  v_rewards jsonb;
  v_closures jsonb;
  v_gross numeric(12,2) := 0;
  v_discounts numeric(12,2) := 0;
  v_rewards_total numeric(12,2) := 0;
  v_courtesies numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
  v_completed integer := 0;
  v_cancelled integer := 0;
  v_drafts integer := 0;
begin
  select * into v_session
  from public.pos_sessions
  where id = p_session_id;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para ver esta sesion POS.';
  end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'draft'),
    coalesce(sum(subtotal) filter (where status = 'completed'), 0),
    coalesce(sum(discount_total) filter (where status = 'completed'), 0),
    coalesce(sum(courtesy_total) filter (where status = 'completed'), 0),
    coalesce(sum(total) filter (where status = 'completed'), 0)
  into v_completed, v_cancelled, v_drafts, v_gross, v_discounts, v_courtesies, v_net
  from public.sales
  where pos_session_id = p_session_id;

  select coalesce(sum(rr.discount_amount), 0)
  into v_rewards_total
  from public.reward_redemptions rr
  join public.sales s on s.id = rr.sale_id
  where s.pos_session_id = p_session_id
    and s.status = 'completed'
    and rr.status = 'applied';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'reference', 'VTA-' || upper(left(s.id::text, 8)),
    'status', s.status,
    'customer_name', coalesce(c.full_name, 'Cliente varios'),
    'subtotal', s.subtotal,
    'discount_total', s.discount_total,
    'courtesy_total', s.courtesy_total,
    'total', s.total,
    'created_at', s.created_at,
    'closed_at', s.closed_at
  ) order by s.created_at desc), '[]'::jsonb)
  into v_sales
  from public.sales s
  left join public.customers c on c.id = s.customer_id
  where s.pos_session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', pm.id,
    'code', pm.code,
    'name', pm.name,
    'is_active', pm.is_active,
    'expected_amount', case
      when pm.code = 'cash' then
        v_session.opening_cash_amount
        + coalesce((select sum(sp.amount) from public.sale_payments sp join public.sales s on s.id = sp.sale_id where s.pos_session_id = p_session_id and s.status = 'completed' and sp.payment_method_id = pm.id), 0)
        + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'income'), 0)
        - coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'expense'), 0)
        + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.pos_session_id = p_session_id and cm.status = 'active' and cm.movement_type = 'adjustment'), 0)
      else coalesce((select sum(sp.amount) from public.sale_payments sp join public.sales s on s.id = sp.sale_id where s.pos_session_id = p_session_id and s.status = 'completed' and sp.payment_method_id = pm.id), 0)
    end
  ) order by pm.sort_order, pm.name), '[]'::jsonb)
  into v_payments
  from public.payment_methods pm
  where pm.is_active
     or exists (select 1 from public.pos_session_payment_closures pc where pc.pos_session_id = p_session_id and pc.payment_method_id = pm.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cm.id,
    'movement_type', cm.movement_type,
    'category_name', coalesce(cmc.name, 'Movimiento'),
    'amount', cm.amount,
    'description', cm.description,
    'status', cm.status,
    'created_at', cm.created_at
  ) order by cm.created_at), '[]'::jsonb)
  into v_movements
  from public.cash_movements cm
  left join public.cash_movement_categories cmc on cmc.id = cm.category_id
  where cm.pos_session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rr.id,
    'sale_id', s.id,
    'sale_reference', 'VTA-' || upper(left(s.id::text, 8)),
    'customer_name', coalesce(c.full_name, 'Cliente'),
    'reward_name', coalesce(rb.name, 'Reward'),
    'discount_amount', rr.discount_amount,
    'applied_at', rr.applied_at
  ) order by rr.applied_at), '[]'::jsonb)
  into v_rewards
  from public.reward_redemptions rr
  join public.sales s on s.id = rr.sale_id
  left join public.customers c on c.id = rr.customer_id
  left join public.reward_benefits rb on rb.id = rr.benefit_id
  where s.pos_session_id = p_session_id
    and rr.status = 'applied';

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', pc.payment_method_id,
    'expected_amount', pc.expected_amount,
    'counted_amount', pc.counted_amount,
    'difference_amount', pc.difference_amount,
    'notes', pc.notes
  )), '[]'::jsonb)
  into v_closures
  from public.pos_session_payment_closures pc
  where pc.pos_session_id = p_session_id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'is_overdue', v_session.business_date < public.pos_business_date() and v_session.status in ('open', 'pending_close'),
    'business_date', v_session.business_date,
    'branch_id', v_session.branch_id,
    'branch_name', (select b.name from public.branches b where b.id = v_session.branch_id),
    'opened_at', v_session.opened_at,
    'opened_by_name', (select e.full_name from public.employees e where e.id = v_session.opened_by),
    'opening_cash_amount', v_session.opening_cash_amount,
    'opening_notes', v_session.opening_notes,
    'closed_at', v_session.closed_at,
    'closed_by_name', (select e.full_name from public.employees e where e.id = v_session.closed_by),
    'closing_notes', v_session.closing_notes,
    'completed_sales_count', v_completed,
    'cancelled_sales_count', v_cancelled,
    'draft_sales_count', v_drafts,
    'gross_total', v_gross,
    'discount_total', v_discounts,
    'reward_total', v_rewards_total,
    'manual_discount_total', greatest(v_discounts - v_rewards_total, 0),
    'courtesy_total', v_courtesies,
    'net_total', v_net,
    'sales', v_sales,
    'payment_methods', v_payments,
    'movements', v_movements,
    'rewards', v_rewards,
    'closures', v_closures
  );
end;
$$;

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_amounts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_summary jsonb;
  v_method record;
  v_counted numeric(12,2);
  v_difference numeric(12,2);
  v_has_difference boolean := false;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  select * into v_session
  from public.pos_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesion POS no existe.';
  end if;

  if not public.can_manage_pos_branch(v_session.branch_id) then
    raise exception 'No tienes permisos para cerrar esta sesion POS.';
  end if;

  if v_session.status not in ('open', 'pending_close') then
    raise exception 'La sesion POS ya no esta disponible para cierre.';
  end if;

  v_summary := public.get_pos_session_closure_summary(p_session_id);

  if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
    raise exception 'No puedes cerrar la sesion con ventas en borrador.';
  end if;

  delete from public.pos_session_payment_closures
  where pos_session_id = p_session_id;

  for v_method in
    select
      (item ->> 'payment_method_id')::uuid as payment_method_id,
      item ->> 'code' as code,
      (item ->> 'expected_amount')::numeric as expected_amount
    from jsonb_array_elements(v_summary -> 'payment_methods') item
  loop
    if not (coalesce(p_counted_amounts, '{}'::jsonb) ? v_method.payment_method_id::text) then
      raise exception 'Debes ingresar el monto real para todos los metodos activos.';
    end if;

    begin
      v_counted := (p_counted_amounts ->> v_method.payment_method_id::text)::numeric;
    exception when others then
      raise exception 'Uno de los montos reales no es valido.';
    end;

    if v_counted is null or v_counted < 0 then
      raise exception 'Los montos reales deben ser mayores o iguales a cero.';
    end if;

    v_counted := round(v_counted, 2);
    v_difference := v_counted - round(v_method.expected_amount, 2);
    v_has_difference := v_has_difference or v_difference <> 0;

    insert into public.pos_session_payment_closures (
      pos_session_id, payment_method_id, expected_amount, counted_amount,
      difference_amount, notes, created_by
    ) values (
      p_session_id, v_method.payment_method_id, round(v_method.expected_amount, 2),
      v_counted, v_difference, v_notes, auth.uid()
    );
  end loop;

  if (v_has_difference or v_session.status = 'pending_close' or v_session.business_date < public.pos_business_date())
     and v_notes is null then
    raise exception 'Debes registrar una observacion para este cierre.';
  end if;

  update public.pos_sessions
  set status = 'closed',
      expected_cash_amount = coalesce((
        select pc.expected_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      counted_cash_amount = coalesce((
        select pc.counted_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      cash_difference = coalesce((
        select pc.difference_amount
        from public.pos_session_payment_closures pc
        join public.payment_methods pm on pm.id = pc.payment_method_id
        where pc.pos_session_id = p_session_id and pm.code = 'cash'
      ), 0),
      closing_notes = v_notes,
      closed_by = v_employee_id,
      closed_at = now(),
      updated_at = now()
  where id = p_session_id;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    p_session_id, v_employee_id, 'closed', 'Sesion POS cerrada por metodo.',
    jsonb_build_object('has_difference', v_has_difference)
  );

  return public.get_pos_session_closure_summary(p_session_id);
end;
$$;

revoke all on function public.mark_overdue_pos_sessions() from public;
revoke all on function public.get_pos_session_closure_summary(uuid) from public;
revoke all on function public.close_pos_session(uuid, jsonb, text) from public;

grant execute on function public.mark_overdue_pos_sessions() to authenticated, service_role;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;
grant execute on function public.close_pos_session(uuid, jsonb, text) to authenticated, service_role;
