-- QA Sprint 9. Solo lectura. Revisa que producción anulada no contribuya al cálculo.

select
  esp.payroll_period_id,
  esp.employee_id,
  esp.branch_id,
  esp.status,
  count(*) as production_rows,
  sum(esp.commissionable_amount) as commissionable_amount,
  sum(esp.fixed_commission_amount) as fixed_commission_amount,
  sum(esp.operational_contribution_amount) as operational_contribution_amount
from public.employee_service_production esp
group by esp.payroll_period_id, esp.employee_id, esp.branch_id, esp.status
order by esp.payroll_period_id desc, esp.employee_id, esp.status;

select
  esp.sale_id,
  s.status as sale_status,
  esp.status as production_status,
  esp.reversed_at,
  esp.reversed_reason
from public.employee_service_production esp
join public.sales s on s.id = esp.sale_id
where s.status = 'cancelled' and esp.status <> 'reversed'
order by s.cancelled_at desc;
