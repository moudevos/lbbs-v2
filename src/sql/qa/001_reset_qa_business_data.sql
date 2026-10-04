-- QA/STAGING ONLY. Never place this file in supabase/migrations.
-- Before use, configure public.system_environment(environment_name) = qa|staging
-- and execute: set app.lbbs_reset_token = 'RESET_LBBS_QA_DATA';
do $$
declare v_environment text; v_table text;
begin
  if to_regclass('public.system_environment') is null then
    raise exception 'QA reset blocked: public.system_environment is required.';
  end if;
  select environment_name into v_environment from public.system_environment limit 1;
  if v_environment not in ('qa','staging') then
    raise exception 'QA reset blocked outside QA environment';
  end if;
  if current_setting('app.lbbs_reset_token', true) <> 'RESET_LBBS_QA_DATA' then
    raise exception 'QA reset blocked: explicit confirmation token is required.';
  end if;
  -- Transactional business facts only. Lookup tables, roles, auth.users and
  -- the selected QA administrator are deliberately preserved.
  foreach v_table in array array[
    'employee_settlement_product_lines','employee_settlement_bonus_lines','employee_settlement_service_lines','employee_settlement_deductions','employee_settlement_adjustments','employee_settlements',
    'employee_product_bonus_entries','employee_service_production','employee_sale_item_attributions',
    'sale_payments','reward_redemptions','internal_pos_operations','sale_items','sales','pos_sessions',
    'employee_debt_disbursements','employee_debt_movements','employee_debts',
    'accounts_payable','finance_manual_entries','financial_postings','cash_movements','stock_movements','reservations'
  ] loop
    if to_regclass('public.' || v_table) is not null then execute 'delete from public.' || quote_ident(v_table); end if;
  end loop;
  -- QA-only catalog/person fixtures use a deterministic prefix; real lookup
  -- configuration and all auth users remain untouched.
  delete from public.products where name like 'QA_%';
  delete from public.services where name like 'QA_%';
  delete from public.customers where full_name like 'QA_%';
  delete from public.employees where full_name like 'QA_%';
  delete from public.product_categories where name like 'QA_%';
  delete from public.service_categories where name like 'QA_%';
end $$;
