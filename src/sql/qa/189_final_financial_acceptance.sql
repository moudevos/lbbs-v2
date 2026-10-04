-- QA de solo lectura para la migración 189. No modifica datos.
-- Sustituye :settlement_id por una liquidación de prueba ya aprobada/pagada.

-- 1. Las partes vigentes deben sumar exactamente el neto de la liquidación.
select settlement.id, settlement.settlement_number, settlement.status,
  settlement.net_pay_amount,
  coalesce(sum(payment.amount) filter(where payment.status='posted'),0) as paid_parts_total
from public.employee_settlements settlement
left join public.employee_settlement_payments payment on payment.settlement_id=settlement.id
where settlement.id = :'settlement_id'::uuid
group by settlement.id;

-- 2. El ledger no debe repetir una misma deducción de liquidación.
select debt_id, settlement_id, movement_type, count(*)
from public.employee_debt_movements
where settlement_id = :'settlement_id'::uuid and movement_type='settlement_deduction'
group by debt_id, settlement_id, movement_type
having count(*) > 1;

-- 3. El costo laboral se reconoce una vez al aprobar y nunca al pagar.
select posting.accounting_date, posting.amount, posting.status, posting.posting_code
from public.financial_postings posting
where posting.source_type='employee_settlement' and posting.source_id=:'settlement_id'::uuid
order by posting.created_at;

-- 4. El perfil agregado coincide con la fuente autoritativa employee_debts.
select profile.employee_id, profile.branch_id, profile.outstanding_total,
  source.outstanding_total as source_outstanding_total
from public.vw_employee_debt_profiles profile
join lateral (
  select coalesce(sum(outstanding_amount) filter(where status in ('pending','partial')),0) as outstanding_total
  from public.employee_debts debt where debt.employee_id=profile.employee_id and debt.branch_id=profile.branch_id
) source on true
where profile.employee_id=(select employee_id from public.employee_settlements where id=:'settlement_id'::uuid);
