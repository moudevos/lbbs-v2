-- Correcciones operativas: clientes de recepción, ingresos de stock y ciclo POS.
-- Ejecutar después de 119_pos_session_legacy_negative_closure.sql.

-- Clientes: reestablece el acceso global operativo de recepción y elimina
-- políticas residuales que pudieran bloquear el INSERT autorizado.
alter table public.customers enable row level security;

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and exists (
        select 1
        from public.employees employee
        where employee.id = public.current_employee_id()
          and employee.status = 'active'::public.employee_status
      )
      and exists (
        select 1
        from public.customers customer
        where customer.id = p_customer_id
          and customer.is_active
      )
    );
$$;

revoke all on function public.can_access_customer(uuid) from public;
grant execute on function public.can_access_customer(uuid) to authenticated, service_role;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
  loop
    execute format('drop policy if exists %I on public.customers', policy_record.policyname);
  end loop;
end;
$$;

create policy "customers_select_team"
on public.customers for select to authenticated
using (public.can_access_customer(id));

create policy "customers_insert_team"
on public.customers for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and exists (
      select 1 from public.employees employee
      where employee.id = public.current_employee_id()
        and employee.status = 'active'::public.employee_status
    )
    and created_by = public.current_employee_id()
    and is_active
    and coalesce(source, '') <> 'system'
  )
);

create policy "customers_update_team"
on public.customers for update to authenticated
using (public.can_access_customer(id))
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_customer(id)
    and is_active
    and coalesce(source, '') <> 'system'
  )
);

create policy "customers_delete_admin"
on public.customers for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.customers to authenticated;
revoke all on public.customers from anon;

-- Stock: recepción solo puede insertar compras positivas para su propia sede.
drop policy if exists "stock_movements_insert_admin_or_reception" on public.stock_movements;

create policy "stock_movements_insert_admin_or_reception"
on public.stock_movements for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'reception'
    and public.can_access_branch(branch_id)
    and movement_type = 'purchase'
    and quantity > 0
    and created_by = public.current_employee_id()
  )
);

-- Al abrir una nueva jornada para una sede, se cierra automáticamente la
-- sesión activa de una fecha anterior. El cierre conserva sus importes
-- esperados como contados, queda auditado y se fecha a las 23:50 de Lima.
-- La fecha operativa no depende del huso horario de la instancia Postgres
-- ni del navegador del operador: siempre se calcula en Lima.
create or replace function public.pos_business_date()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select timezone('America/Lima', now())::date;
$$;

revoke all on function public.pos_business_date() from public;
grant execute on function public.pos_business_date() to authenticated, service_role;

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
  v_active_session public.pos_sessions%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_business_date date := public.pos_business_date();
  v_summary jsonb;
  v_counted_amounts jsonb;
  v_auto_close_note text;
begin
  if not public.can_manage_pos_branch(p_branch_id) then
    raise exception 'No tienes permisos para abrir una sesion POS en esta sede.';
  end if;

  if coalesce(p_opening_cash_amount, 0) < 0 then
    raise exception 'El monto inicial no puede ser negativo.';
  end if;

  select * into v_active_session
  from public.pos_sessions
  where branch_id = p_branch_id
    and status in ('open', 'pending_close')
  order by opened_at desc
  limit 1
  for update;

  if found then
    if v_active_session.business_date >= v_business_date then
      raise exception 'Ya existe una sesion POS activa para esta sede y fecha.';
    end if;

    v_summary := public.get_pos_session_closure_summary(v_active_session.id);
    if coalesce((v_summary ->> 'draft_sales_count')::integer, 0) > 0 then
      raise exception 'No se puede cerrar automáticamente la sesión anterior porque tiene ventas en borrador. Resuélvelas antes de abrir la nueva sesión.';
    end if;

    select coalesce(
      jsonb_object_agg(
        item ->> 'payment_method_id',
        greatest(coalesce((item ->> 'expected_amount')::numeric, 0), 0)
      ),
      '{}'::jsonb
    )
    into v_counted_amounts
    from jsonb_array_elements(v_summary -> 'payment_methods') item;

    v_auto_close_note := format(
      'Cierre automático al iniciar la jornada %s. La sesión corresponde a %s y se registra a las 23:50 (America/Lima).',
      v_business_date,
      v_active_session.business_date
    );

    perform public.close_pos_session(v_active_session.id, v_counted_amounts, v_auto_close_note);

    update public.pos_sessions
    set closed_at = (v_active_session.business_date::timestamp + time '23:50') at time zone 'America/Lima',
        updated_at = now()
    where id = v_active_session.id;

    insert into public.pos_session_events (
      pos_session_id, employee_id, event_type, message, metadata
    ) values (
      v_active_session.id,
      v_employee_id,
      'closed',
      'Sesión cerrada automáticamente al iniciar una nueva jornada.',
      jsonb_build_object(
        'automatic', true,
        'trigger_business_date', v_business_date,
        'closed_at_local', v_active_session.business_date::text || ' 23:50 America/Lima'
      )
    );
  end if;

  insert into public.pos_sessions (
    branch_id, opened_by, business_date, status, opening_cash_amount,
    expected_cash_amount, opening_notes, opened_at
  ) values (
    p_branch_id, v_employee_id, v_business_date, 'open',
    coalesce(p_opening_cash_amount, 0), coalesce(p_opening_cash_amount, 0),
    nullif(btrim(coalesce(p_notes, '')), ''), now()
  ) returning * into v_session;

  insert into public.pos_session_events (
    pos_session_id, employee_id, event_type, message, metadata
  ) values (
    v_session.id, v_employee_id, 'opened', 'Sesión POS abierta.',
    jsonb_build_object('opening_cash_amount', v_session.opening_cash_amount)
  );

  return v_session;
end;
$$;

revoke all on function public.open_pos_session(uuid, numeric, text) from public;
grant execute on function public.open_pos_session(uuid, numeric, text) to authenticated, service_role;

notify pgrst, 'reload schema';
