-- Iteracion 11: una liquidacion pagada no puede anularse sin un flujo de reversión dedicado.
-- Ejecutar despues de 117_settlement_finance_ledger.sql.

create or replace function public.transition_employee_settlement(
  p_settlement_id uuid,
  p_action text,
  p_reason text default null
)
returns public.employee_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.employee_settlements%rowtype;
  v_employee uuid := public.current_employee_id();
begin
  if not public.is_admin() then
    raise exception 'Solo owner o admin pueden gestionar liquidaciones.';
  end if;

  select *
  into v_row
  from public.employee_settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception 'La liquidacion no existe.';
  end if;

  if p_action = 'review' and v_row.status = 'draft' then
    update public.employee_settlements
    set status = 'review', reviewed_by = v_employee, reviewed_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'approve' and v_row.status = 'review' then
    if v_row.commission_rate > 60
      and nullif(btrim(coalesce(v_row.high_rate_authorization_note, '')), '') is null then
      raise exception 'La autorizacion del porcentaje excepcional esta incompleta.';
    end if;

    update public.employee_settlements
    set status = 'approved', approved_by = v_employee, approved_at = now()
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status in ('draft', 'review', 'approved') then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'El motivo de anulacion es obligatorio.';
    end if;

    update public.employee_settlements
    set status = 'cancelled',
        cancelled_by = v_employee,
        cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    where id = p_settlement_id
    returning * into v_row;
  elsif p_action = 'cancel' and v_row.status = 'paid' then
    raise exception 'Una liquidacion pagada requiere un flujo de reversión autorizado.';
  else
    raise exception 'La transicion solicitada no esta permitida.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.transition_employee_settlement(uuid, text, text) from public;
grant execute on function public.transition_employee_settlement(uuid, text, text) to authenticated, service_role;

insert into public.app_settings (key, value, description)
values (
  'settlements.paid_transition_guard_version',
  '{"version": 1}'::jsonb,
  'Version desplegada del bloqueo de anulacion directa de liquidaciones pagadas.'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

notify pgrst, 'reload schema';

-- Verificacion posterior: conserva la firma y requiere ejecucion autenticada.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text = 'transition_employee_settlement(uuid,text,text)';
