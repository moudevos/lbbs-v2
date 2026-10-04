-- Fase 3A.1 — Diagnóstico de solo lectura.
-- Ejecutar manualmente ÚNICAMENTE en Supabase DEVELOPMENT.
-- No expone customer_id, QR, email, documento ni error completo.

-- Conteo por estado y uso de reintentos.
select
  status,
  count(*) as job_count,
  coalesce(max(attempts), 0) as max_attempts,
  round(coalesce(avg(attempts), 0), 2) as avg_attempts,
  min(created_at) as oldest_created_at,
  max(created_at) as newest_created_at,
  max(processed_at) as latest_processed_at
from public.customer_wallet_sync_outbox
group by status
order by status;

-- Resumen general, incluido el trabajo processing más antiguo si existiera.
select
  count(*) as total_jobs,
  coalesce(max(attempts), 0) as max_attempts,
  round(coalesce(avg(attempts), 0), 2) as avg_attempts,
  min(created_at) as oldest_created_at,
  max(created_at) as newest_created_at,
  min(locked_at) filter (where status = 'processing') as oldest_processing_locked_at,
  count(*) filter (
    where status = 'processing'
      and locked_at < now() - interval '15 minutes'
  ) as processing_older_than_15_minutes,
  count(*) filter (where last_error is not null) as jobs_with_error
from public.customer_wallet_sync_outbox;

-- Detecta violaciones potenciales de coalescing sin revelar el customer.
select
  count(*) as customers_with_multiple_unfinished_jobs,
  coalesce(max(unfinished_jobs), 0) as maximum_unfinished_jobs_for_one_customer
from (
  select customer_id, count(*) as unfinished_jobs
  from public.customer_wallet_sync_outbox
  where status in ('pending', 'processing')
  group by customer_id
  having count(*) > 1
) duplicates;

-- Agrupa errores por una huella no reversible, sin publicar el texto del error.
select
  md5(last_error) as error_fingerprint,
  count(*) as job_count,
  max(updated_at) as last_seen_at
from public.customer_wallet_sync_outbox
where last_error is not null
  and btrim(last_error) <> ''
group by md5(last_error)
order by job_count desc, last_seen_at desc
limit 20;
