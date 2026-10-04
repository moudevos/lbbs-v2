-- QA 187: reversas cuya fecha contable no coincide con la del hecho revertido.
select
  reversal.id as reversal_id,
  original.id as original_id,
  original.source_type,
  original.source_id,
  original.financial_group,
  original.accounting_date as original_accounting_date,
  reversal.accounting_date as reversal_accounting_date,
  reversal.amount
from public.financial_postings reversal
join public.financial_postings original on original.id = reversal.reversal_of_id
where reversal.accounting_date is distinct from original.accounting_date
order by original.accounting_date, reversal.created_at;
