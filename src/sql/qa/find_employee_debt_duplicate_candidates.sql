-- DIAGNÓSTICO ÚNICAMENTE.
-- NO REPARA NI ELIMINA DEUDAS. Revise cada par antes de cualquier acción manual.
-- Candidatos: mismo empleado/sede/tipo/monto/descripción normalizada/creador,
-- creados con no más de cinco segundos de diferencia.
with normalized_debts as (
  select
    debt.id,
    debt.employee_id,
    employee.full_name as employee_name,
    debt.branch_id,
    branch.name as branch_name,
    debt.debt_type,
    debt.original_amount,
    lower(regexp_replace(btrim(coalesce(debt.description, '')), '\s+', ' ', 'g')) as normalized_description,
    debt.created_by,
    creator.full_name as created_by_name,
    debt.status,
    debt.created_at
  from public.employee_debts debt
  left join public.employees employee on employee.id = debt.employee_id
  left join public.branches branch on branch.id = debt.branch_id
  left join public.employees creator on creator.id = debt.created_by
)
select
  earlier.employee_id,
  earlier.employee_name,
  earlier.branch_id,
  earlier.branch_name,
  earlier.debt_type,
  earlier.original_amount,
  earlier.normalized_description,
  earlier.created_by,
  earlier.created_by_name,
  earlier.id as earlier_debt_id,
  earlier.status as earlier_status,
  earlier.created_at as earlier_created_at,
  later.id as later_debt_id,
  later.status as later_status,
  later.created_at as later_created_at,
  round(extract(epoch from (later.created_at - earlier.created_at))::numeric, 6) as seconds_apart
from normalized_debts earlier
join normalized_debts later
  on later.employee_id = earlier.employee_id
 and later.branch_id = earlier.branch_id
 and later.debt_type = earlier.debt_type
 and later.original_amount = earlier.original_amount
 and later.normalized_description = earlier.normalized_description
 and later.created_by is not distinct from earlier.created_by
 and later.created_at > earlier.created_at
 and later.created_at <= earlier.created_at + interval '5 seconds'
order by later.created_at desc, seconds_apart asc;
