-- Refuerzo de alcance exclusivo de reglas para Socios.
-- Ejecutar después de 155_socio_recognized_production_base.sql.

create or replace function public.guard_socio_benefit_rule_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.operation_kind = 'socio_benefit' and not exists (
    select 1
    from public.employee_benefit_rules rule
    where rule.id = new.benefit_rule_id
      and rule.beneficiary_scope = 'socio'
  ) then
    raise exception 'Las operaciones de socio requieren una regla exclusiva de socio.';
  end if;
  return new;
end;
$$;

drop trigger if exists internal_pos_operations_socio_rule_scope_guard on public.internal_pos_operations;
create trigger internal_pos_operations_socio_rule_scope_guard
before insert or update of operation_kind, benefit_rule_id on public.internal_pos_operations
for each row execute function public.guard_socio_benefit_rule_scope();

revoke all on function public.guard_socio_benefit_rule_scope() from public, anon;
grant execute on function public.guard_socio_benefit_rule_scope() to authenticated, service_role;

notify pgrst, 'reload schema';
