-- Iteracion 11: cierre auditable de sesiones historicas con efectivo esperado negativo.
-- Ejecutar manualmente despues de 118_settlement_paid_transition_guard.sql.
-- Los importes negativos heredados se conservan separados y no vuelven negativo el saldo operativo cerrado.

alter table public.pos_session_payment_closures
  add column if not exists legacy_expected_amount numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_session_payment_closures_legacy_expected_amount_check'
      and conrelid = 'public.pos_session_payment_closures'::regclass
  ) then
    alter table public.pos_session_payment_closures
      add constraint pos_session_payment_closures_legacy_expected_amount_check
      check (legacy_expected_amount is null or legacy_expected_amount < 0);
  end if;
end $$;

create table if not exists public.pos_session_legacy_closure_authorizations (
  pos_session_id uuid primary key references public.pos_sessions(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  reason text not null,
  authorized_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.employees(id) on delete set null,
  constraint pos_session_legacy_closure_authorizations_reason_check
    check (nullif(btrim(reason), '') is not null)
);

-- Solo captura el patron heredado previo al corte; no habilita sesiones futuras.
insert into public.pos_session_legacy_closure_authorizations (
  pos_session_id,
  branch_id,
  reason
)
select distinct
  ps.id,
  ps.branch_id,
  'Egreso historico de liquidacion sin categoria de Caja; requiere cierre auditado.'
from public.pos_sessions ps
join public.cash_movements cm on cm.pos_session_id = ps.id
where ps.status in ('open', 'pending_close')
  and ps.opened_at < timestamptz '2026-07-17 00:00:00+00'
  and cm.status = 'active'
  and cm.movement_type = 'expense'
  and cm.category_id is null
  and cm.description like 'Pago de liquidacion %'
on conflict (pos_session_id) do nothing;

alter table public.pos_session_legacy_closure_authorizations enable row level security;

drop policy if exists "pos_session_legacy_closure_authorizations_select_admin"
  on public.pos_session_legacy_closure_authorizations;
drop policy if exists "pos_session_legacy_closure_authorizations_service_role_all"
  on public.pos_session_legacy_closure_authorizations;

create policy "pos_session_legacy_closure_authorizations_select_admin"
on public.pos_session_legacy_closure_authorizations
for select
to authenticated
using (public.is_admin());

create policy "pos_session_legacy_closure_authorizations_service_role_all"
on public.pos_session_legacy_closure_authorizations
for all
to service_role
using (true)
with check (true);

revoke all on public.pos_session_legacy_closure_authorizations from anon, public;
grant select on public.pos_session_legacy_closure_authorizations to authenticated;
grant all on public.pos_session_legacy_closure_authorizations to service_role;

-- La funcion auditada es la unica via autenticada de escritura para cierres.
revoke insert, update, delete on public.pos_session_payment_closures from authenticated;

drop policy if exists "pos_session_payment_closures_select_scope"
  on public.pos_session_payment_closures;
drop policy if exists "pos_session_payment_closures_manage_scope"
  on public.pos_session_payment_closures;

create policy "pos_session_payment_closures_select_scope"
on public.pos_session_payment_closures
for select
to authenticated
using (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and legacy_expected_amount is null
  )
);

drop policy if exists "pos_session_events_select_branch_scope" on public.pos_session_events;
drop policy if exists "pos_session_events_manage_branch_scope" on public.pos_session_events;

create policy "pos_session_events_select_branch_scope"
on public.pos_session_events
for select
to authenticated
using (
  public.is_admin()
  or (
    public.can_view_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
);

create policy "pos_session_events_manage_branch_scope"
on public.pos_session_events
for all
to authenticated
using (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
)
with check (
  public.is_admin()
  or (
    public.can_manage_pos_session(pos_session_id)
    and not exists (
      select 1 from public.pos_session_legacy_closure_authorizations legacy
      where legacy.pos_session_id = pos_session_events.pos_session_id
    )
  )
);

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
  v_legacy public.pos_session_legacy_closure_authorizations%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_summary jsonb;
  v_method record;
  v_counted numeric(12,2);
  v_expected numeric(12,2);
  v_legacy_expected numeric(12,2);
  v_difference numeric(12,2);
  v_has_difference boolean := false;
  v_legacy_authorized boolean := false;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_legacy_methods jsonb := '[]'::jsonb;
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

  select *
  into v_legacy
  from public.pos_session_legacy_closure_authorizations
  where pos_session_id = p_session_id
  for update;
  v_legacy_authorized := found;

  v_summary := public.get_pos_session_closure_summary(p_session_id);

  if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
    raise exception 'No puedes cerrar la sesion con ventas en borrador.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id', item ->> 'payment_method_id',
    'code', item ->> 'code',
    'legacy_expected_amount', round((item ->> 'expected_amount')::numeric, 2)
  )), '[]'::jsonb)
  into v_legacy_methods
  from jsonb_array_elements(v_summary -> 'payment_methods') item
  where round(coalesce((item ->> 'expected_amount')::numeric, 0), 2) < 0;

  if jsonb_array_length(v_legacy_methods) > 0 then
    if not public.is_admin() then
      raise exception 'Solo owner o admin pueden reparar un cierre historico.';
    end if;

    if not v_legacy_authorized or v_legacy.closed_at is not null then
      raise exception 'La sesion no esta autorizada para el cierre historico.';
    end if;

    v_notes := concat_ws(E'\n', v_notes, 'Cierre historico autorizado. Motivo: ' || v_legacy.reason);
  elsif v_legacy_authorized and v_legacy.closed_at is null then
    raise exception 'La autorizacion historica no coincide con el saldo actual de la sesion.';
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
    v_legacy_expected := case
      when round(coalesce(v_method.expected_amount, 0), 2) < 0 then round(v_method.expected_amount, 2)
      else null
    end;
    v_expected := greatest(round(coalesce(v_method.expected_amount, 0), 2), 0);
    v_difference := v_counted - v_expected;
    v_has_difference := v_has_difference or v_difference <> 0;

    insert into public.pos_session_payment_closures (
      pos_session_id, payment_method_id, expected_amount, legacy_expected_amount,
      counted_amount, difference_amount, notes, created_by
    ) values (
      p_session_id, v_method.payment_method_id, v_expected, v_legacy_expected,
      v_counted, v_difference, v_notes, auth.uid()
    );
  end loop;

  if (v_has_difference or v_session.status = 'pending_close' or v_session.business_date < current_date)
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

  if jsonb_array_length(v_legacy_methods) > 0 then
    update public.pos_session_legacy_closure_authorizations
    set closed_at = now(),
        closed_by = v_employee_id
    where pos_session_id = p_session_id
      and closed_at is null;

    if not found then
      raise exception 'No se pudo registrar el cierre historico.';
    end if;
  end if;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    p_session_id, v_employee_id, 'closed', 'Sesion POS cerrada por metodo.',
    jsonb_build_object(
      'has_difference', v_has_difference,
      'legacy_negative_expected_amounts', v_legacy_methods
    )
  );

  return public.get_pos_session_closure_summary(p_session_id);
end;
$$;

revoke all on function public.close_pos_session(uuid, jsonb, text) from public;
grant execute on function public.close_pos_session(uuid, jsonb, text) to authenticated, service_role;

-- Conserva la implementacion previa como fuente y expone un resumen saneado.
do $$
begin
  if to_regprocedure('public.get_pos_session_closure_summary_raw(uuid)') is null
     and to_regprocedure('public.get_pos_session_closure_summary(uuid)') is not null then
    alter function public.get_pos_session_closure_summary(uuid)
      rename to get_pos_session_closure_summary_raw;
  end if;
end $$;

create or replace function public.get_pos_session_closure_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_payments jsonb;
begin
  v_summary := public.get_pos_session_closure_summary_raw(p_session_id);

  if not public.is_admin() and exists (
    select 1 from public.pos_session_legacy_closure_authorizations
    where pos_session_id = p_session_id
  ) then
    raise exception 'No tienes permisos para ver el cierre historico auditado.';
  end if;

  if v_summary ->> 'status' <> 'closed' then
    return v_summary;
  end if;

  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(
        item,
        '{expected_amount}',
        to_jsonb(coalesce(pc.expected_amount, (item ->> 'expected_amount')::numeric)),
        true
      ),
      '{legacy_expected_amount}',
      coalesce(to_jsonb(pc.legacy_expected_amount), 'null'::jsonb),
      true
    )
    order by ordinal
  ), '[]'::jsonb)
  into v_payments
  from jsonb_array_elements(v_summary -> 'payment_methods') with ordinality as payments(item, ordinal)
  left join public.pos_session_payment_closures pc
    on pc.pos_session_id = p_session_id
   and pc.payment_method_id = (item ->> 'payment_method_id')::uuid;

  return jsonb_set(v_summary, '{payment_methods}', v_payments, true);
end;
$$;

revoke all on function public.get_pos_session_closure_summary_raw(uuid) from public;
revoke all on function public.get_pos_session_closure_summary_raw(uuid) from authenticated;
grant execute on function public.get_pos_session_closure_summary_raw(uuid) to service_role;

revoke all on function public.get_pos_session_closure_summary(uuid) from public;
grant execute on function public.get_pos_session_closure_summary(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verificacion funcional posterior: ejecutar el cierre solo sobre una autorizacion creada arriba.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_session_payment_closures'
      and column_name = 'legacy_expected_amount'
  ) as legacy_column_exists,
  (select count(*) from public.pos_session_legacy_closure_authorizations) as authorized_legacy_sessions,
  to_regprocedure('public.close_pos_session(uuid,jsonb,text)') is not null as close_function_exists;
