-- Sprint 8.8: RLS y permisos de compensacion de empleados.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'payroll_periods','production_operational_rules','reward_service_commission_rules',
    'courtesy_service_commission_rules','product_bonus_rules','employee_supply_markup_rules',
    'employee_service_production','employee_product_bonus_entries','employee_debts',
    'employee_debt_movements','employee_supply_deliveries','employee_benefit_usages',
    'employee_settlements','employee_settlement_service_lines','employee_settlement_bonus_lines',
    'employee_settlement_deductions','employee_settlement_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_admin_all', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_service_role_all', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      v_table || '_admin_all', v_table
    );
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      v_table || '_service_role_all', v_table
    );
    execute format('revoke all on public.%I from anon, public', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end $$;

drop policy if exists "employee_benefit_usages_reception_scope" on public.employee_benefit_usages;
create policy "employee_benefit_usages_reception_scope"
on public.employee_benefit_usages
for select to authenticated
using (
  public.current_user_role() = 'reception'
  and public.can_access_branch(branch_id)
);

drop policy if exists "employee_supply_deliveries_reception_scope" on public.employee_supply_deliveries;
create policy "employee_supply_deliveries_reception_scope"
on public.employee_supply_deliveries
for select to authenticated
using (
  public.current_user_role() = 'reception'
  and public.can_access_branch(branch_id)
);

grant insert on public.employee_benefit_usages to authenticated;

grant insert, update on public.production_operational_rules to authenticated;
grant insert, update on public.reward_service_commission_rules to authenticated;
grant insert, update on public.courtesy_service_commission_rules to authenticated;
grant insert, update on public.product_bonus_rules to authenticated;
grant insert, update on public.employee_supply_markup_rules to authenticated;
