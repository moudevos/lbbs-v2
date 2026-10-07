-- EMERGENCY ONLY — reverses only v170 historical-sales backfill postings.
-- It preserves the original audit records and inserts compensating postings.
-- Run manually only after verifying the batch and within a planned window.

begin;

with originals as (
  select posting.*
  from public.financial_postings posting
  where posting.status = 'posted'
    and posting.metadata ->> 'backfillBatch' = 'v170_historical_pnl_20261001_20261004'
)
insert into public.financial_postings (
  accounting_date, branch_id, business_line, financial_group, effect_type,
  posting_code, amount, affects_profit, source_type, source_id, reversal_of_id,
  description, metadata, created_by
)
select
  original.accounting_date,
  original.branch_id,
  original.business_line,
  original.financial_group,
  case original.effect_type
    when 'income' then 'expense'
    when 'expense' then 'income'
    when 'asset_increase' then 'asset_decrease'
    when 'asset_decrease' then 'asset_increase'
    when 'liability_increase' then 'liability_decrease'
    when 'liability_decrease' then 'liability_increase'
    when 'cash_in' then 'cash_out'
    when 'cash_out' then 'cash_in'
    else 'memo'
  end,
  original.posting_code || '_reversal',
  original.amount,
  original.affects_profit,
  'reversal',
  original.id,
  original.id,
  'Reversa de backfill v170: ' || original.description,
  original.metadata || jsonb_build_object('reversalReason', 'BACKFILL_V170_ROLLBACK'),
  null
from originals original
where not exists (
  select 1 from public.financial_postings reversal
  where reversal.reversal_of_id = original.id
);

commit;
