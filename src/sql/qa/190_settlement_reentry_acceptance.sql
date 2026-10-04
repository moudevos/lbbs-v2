-- QA 190: solo lectura. Sustituye :employee_id y :period_id.
select id,settlement_number,status,recognized_production_total,commissionable_base_total,percentage_commission_total,product_bonus_total,debt_deduction_total,mandatory_discount_amount,net_pay_amount
from public.employee_settlements where employee_id=:'employee_id'::uuid and payroll_period_id=:'period_id'::uuid order by created_at;
select line.settlement_id,line.production_entry_id,settlement.status from public.employee_settlement_service_lines line join public.employee_settlements settlement on settlement.id=line.settlement_id where settlement.employee_id=:'employee_id'::uuid;
select line.settlement_id,line.employee_sale_item_attribution_id,line.bonus_amount from public.employee_settlement_product_lines line join public.employee_settlements settlement on settlement.id=line.settlement_id where settlement.employee_id=:'employee_id'::uuid;
select debt_id,debt_type,debt_description,sale_reference,source_description,outstanding_amount from public.vw_employee_debt_source_detail where debt_id in (select id from public.employee_debts where employee_id=:'employee_id'::uuid);
select * from public.vw_employee_settlement_debt_ledger_detail where settlement_id in (select id from public.employee_settlements where employee_id=:'employee_id'::uuid);
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='employee_settlement_payments' order by ordinal_position;
