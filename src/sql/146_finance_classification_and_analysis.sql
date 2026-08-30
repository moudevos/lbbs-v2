-- Clasifica el libro financiero para separar utilidad, caja y cuentas por cobrar.
-- Ejecutar después de 145_defer_sale_production_until_pos_closure.sql.
-- El aporte operativo no es un egreso: se analiza desde producción y ventas.

alter table public.finance_categories
  add column if not exists financial_group text not null default 'operating_expense',
  add column if not exists affects_profit boolean not null default true;

alter table public.finance_categories
  drop constraint if exists finance_categories_financial_group_check;
alter table public.finance_categories
  add constraint finance_categories_financial_group_check
  check (financial_group in (
    'operating_income',
    'operating_expense',
    'personnel_cost',
    'asset_movement',
    'receivable',
    'financing'
  ));

-- Conserva el sentido económico de categorías que ya existen en producción.
update public.finance_categories
set financial_group = case code
  when 'other_income' then 'operating_income'
  when 'employee_settlement_payment' then 'personnel_cost'
  else 'operating_expense'
end,
affects_profit = case
  when code in ('other_income', 'operating_expense', 'employee_settlement_payment') then true
  else affects_profit
end;

insert into public.finance_categories (
  code, name, direction, financial_group, affects_profit, is_active, sort_order
)
values
  ('rent', 'Alquiler', 'expense', 'operating_expense', true, true, 10),
  ('utilities', 'Servicios públicos', 'expense', 'operating_expense', true, true, 11),
  ('maintenance', 'Mantenimiento', 'expense', 'operating_expense', true, true, 12),
  ('professional_services', 'Servicios profesionales', 'expense', 'operating_expense', true, true, 13),
  ('inventory_purchase', 'Compra de inventario', 'expense', 'asset_movement', false, true, 14),
  ('employee_advance', 'Préstamo o adelanto a empleado', 'expense', 'receivable', false, true, 15),
  ('employee_debt_collection', 'Cobro de deuda de empleado', 'income', 'receivable', false, true, 16),
  ('owner_contribution', 'Aporte de capital', 'income', 'financing', false, true, 17),
  ('owner_withdrawal', 'Retiro del owner', 'expense', 'financing', false, true, 18),
  ('other_expense', 'Otro egreso', 'expense', 'operating_expense', true, true, 99)
on conflict (code) do update set
  name = excluded.name,
  direction = excluded.direction,
  financial_group = excluded.financial_group,
  affects_profit = excluded.affects_profit,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

create index if not exists finance_manual_entries_active_date_branch_category_idx
  on public.finance_manual_entries (entry_date, branch_id, category_id)
  where status = 'active';

notify pgrst, 'reload schema';
