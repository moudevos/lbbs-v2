-- Sprint 8.14: el efectivo se determina por propiedades operativas, no por codigo.
-- Ejecutar despues de 101_payment_method_operational_properties.sql.

do $$
declare
  v_function_oid oid;
  v_definition text;
begin
  for v_function_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('close_pos_session', 'pay_employee_settlement', 'register_employee_supply')
  loop
    v_definition := pg_get_functiondef(v_function_oid);
    v_definition := replace(v_definition, 'pm.code = ''cash''', 'pm.counts_as_cash');
    v_definition := replace(v_definition, 'pm.code=''cash''', 'pm.counts_as_cash');
    v_definition := replace(v_definition, 'v_method.code = ''cash''', 'v_method.counts_as_cash');
    v_definition := replace(v_definition, 'v_method.code=''cash''', 'v_method.counts_as_cash');
    execute v_definition;
  end loop;
end $$;

-- Categorias iniciales para movimientos manuales. No duplica codigos existentes.
insert into public.finance_categories (name, code, direction, sort_order)
values
  ('Otros ingresos', 'other_income', 'income', 100),
  ('Gastos operativos', 'operating_expense', 'expense', 100)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    sort_order = excluded.sort_order,
    updated_at = now();

notify pgrst, 'reload schema';
