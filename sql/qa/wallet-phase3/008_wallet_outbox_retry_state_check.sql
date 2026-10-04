-- Fase 3A.2 — QA posterior a aplicar la migración local.
-- SOLO LECTURA. No expone customer_id, QR, email, documento ni texto de error.

select
  status,
  coalesce(last_error_category, 'none') as error_category,
  last_http_status,
  count(*) as job_count,
  max(attempts) as max_attempts,
  min(available_at) filter (where status = 'pending') as earliest_pending_at,
  min(locked_at) filter (where status = 'processing') as oldest_processing_started_at,
  max(processed_at) as latest_completed_at,
  max(updated_at) as latest_updated_at
from public.customer_wallet_sync_outbox
group by status, coalesce(last_error_category, 'none'), last_http_status
order by status, error_category, last_http_status nulls first;

select
  count(*) filter (
    where status = 'processing'
      and locked_at < now() - interval '15 minutes'
  ) as stale_processing_over_15_minutes,
  count(*) filter (
    where status = 'pending'
      and available_at > now()
  ) as scheduled_retries_not_yet_eligible,
  count(*) filter (
    where status = 'failed'
      and last_error_category = 'retry_exhausted'
  ) as retry_exhausted_jobs,
  count(*) filter (
    where status = 'failed'
      and last_error_category in ('configuration', 'permanent', 'not_found', 'conflict')
  ) as permanent_or_configuration_failures
from public.customer_wallet_sync_outbox;
