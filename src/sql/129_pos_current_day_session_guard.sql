-- Reparación defensiva del ciclo de sesión POS.
-- Una sesión de la fecha operativa de Lima nunca debe marcarse pending_close.
-- Ejecutar después de 128_internal_pos_benefits_and_accounts.sql.

create or replace function public.mark_overdue_pos_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_business_date date := public.pos_business_date();
begin
  update public.pos_sessions
  set status = 'pending_close',
      updated_at = now()
  where status = 'open'
    and business_date < v_business_date
    and public.can_manage_pos_branch(branch_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_overdue_pos_sessions() from public, anon;
grant execute on function public.mark_overdue_pos_sessions() to authenticated, service_role;

-- Corrige únicamente estados creados por la implementación previa. No altera
-- cierres reales ni jornadas anteriores.
update public.pos_sessions
set status = 'open',
    updated_at = now()
where status = 'pending_close'
  and business_date = public.pos_business_date();

notify pgrst, 'reload schema';
