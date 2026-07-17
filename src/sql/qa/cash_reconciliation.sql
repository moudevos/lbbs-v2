-- QA Sprint 9. Solo lectura. Concilia sesiones y movimientos registrados por run.
with registered_sessions as (
  select qr.run_code, qer.entity_id as session_id
  from public.qa_entity_registry qer
  join public.qa_runs qr on qr.id = qer.qa_run_id
  where qer.entity_table = 'pos_sessions'
), payment_totals as (
  select
    s.pos_session_id,
    sum(sp.amount) as applied_amount,
    sum(sp.tendered_amount) as tendered_amount,
    sum(sp.change_amount) as change_amount
  from public.sales s
  join public.sale_payments sp on sp.sale_id = s.id
  where s.status = 'completed'
  group by s.pos_session_id
), movement_totals as (
  select
    cm.pos_session_id,
    sum(case when cm.status = 'active' and cm.movement_type = 'income' then cm.amount else 0 end) as income_amount,
    sum(case when cm.status = 'active' and cm.movement_type = 'expense' then cm.amount else 0 end) as expense_amount,
    sum(case when cm.status = 'active' and cm.movement_type = 'adjustment' then cm.amount else 0 end) as adjustment_amount,
    count(*) filter (where cm.status = 'cancelled') as cancelled_movements
  from public.cash_movements cm
  group by cm.pos_session_id
)
select
  rs.run_code,
  ps.id as session_id,
  ps.branch_id,
  ps.status,
  ps.opening_cash_amount,
  coalesce(pt.applied_amount, 0) as applied_amount,
  coalesce(pt.tendered_amount, 0) as tendered_amount,
  coalesce(pt.change_amount, 0) as change_amount,
  coalesce(mt.income_amount, 0) as manual_income,
  coalesce(mt.expense_amount, 0) as manual_expense,
  coalesce(mt.adjustment_amount, 0) as manual_adjustment,
  coalesce(mt.cancelled_movements, 0) as cancelled_movements
from registered_sessions rs
join public.pos_sessions ps on ps.id = rs.session_id
left join payment_totals pt on pt.pos_session_id = ps.id
left join movement_totals mt on mt.pos_session_id = ps.id
order by rs.run_code, ps.opened_at;
