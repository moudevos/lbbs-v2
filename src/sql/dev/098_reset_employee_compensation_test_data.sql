-- SOLO DESARROLLO. No ejecutar en produccion.
-- Limpia unicamente datos creados por Sprint 8.8.

begin;

delete from public.employee_settlement_adjustments;
delete from public.employee_settlement_deductions;
delete from public.employee_settlement_bonus_lines;
delete from public.employee_settlement_service_lines;
delete from public.employee_debt_movements;
delete from public.employee_settlements;
delete from public.employee_supply_deliveries;
delete from public.employee_debts;
delete from public.employee_benefit_usages;
delete from public.employee_product_bonus_entries;
delete from public.employee_service_production;
delete from public.payroll_periods;

commit;
