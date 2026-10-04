-- Fase 3A.2: resiliencia del outbox Google Wallet.
-- Ejecutar manualmente después de 151_customer_digital_wallet.sql.
-- No crea cron ni altera la semántica del motor Rewards.

alter table public.customer_wallet_sync_outbox
  alter column available_at drop not null,
  add column if not exists last_error_code text,
  add column if not exists last_error_category text,
  add column if not exists last_http_status integer;

alter table public.customer_wallet_sync_outbox
  drop constraint if exists customer_wallet_sync_outbox_last_error_category_check;
alter table public.customer_wallet_sync_outbox
  add constraint customer_wallet_sync_outbox_last_error_category_check
  check (
    last_error_category is null
    or last_error_category in (
      'transient', 'permanent', 'configuration', 'not_found',
      'conflict', 'unknown', 'retry_exhausted'
    )
  );

alter table public.customer_wallet_sync_outbox
  drop constraint if exists customer_wallet_sync_outbox_last_http_status_check;
alter table public.customer_wallet_sync_outbox
  add constraint customer_wallet_sync_outbox_last_http_status_check
  check (last_http_status is null or last_http_status between 100 and 599);

-- El índice existente (status, available_at, created_at) ya sirve al claim:
-- filtra pending, respeta available_at y mantiene una cola ordenada. No se
-- agrega un índice redundante en esta migración.

create or replace function public.recover_stale_customer_wallet_sync_jobs(
  p_stale_after interval default interval '15 minutes',
  p_max_attempts integer default 8
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recovered integer := 0;
  v_limit integer := greatest(coalesce(p_max_attempts, 8), 1);
begin
  update public.customer_wallet_sync_outbox job
  set status = case when job.attempts + 1 >= v_limit then 'failed' else 'pending' end,
      attempts = least(job.attempts + 1, v_limit),
      available_at = case when job.attempts + 1 >= v_limit then null else now() end,
      locked_at = null,
      processed_at = null,
      last_error = case
        when job.attempts + 1 >= v_limit
          then 'Worker Wallet interrumpido; se agotó el límite de reintentos.'
        else 'Trabajo Wallet recuperado después de exceder el tiempo de procesamiento.'
      end,
      last_error_code = 'stale_processing_timeout',
      last_error_category = case when job.attempts + 1 >= v_limit then 'retry_exhausted' else 'transient' end,
      last_http_status = null,
      updated_at = now()
  where job.status = 'processing'
    and job.locked_at is not null
    and job.locked_at <= now() - greatest(coalesce(p_stale_after, interval '15 minutes'), interval '1 minute');

  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

create or replace function public.claim_customer_wallet_sync_jobs(p_limit integer default 20)
returns table (
  id uuid,
  customer_id uuid,
  attempts integer,
  locked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  return query
  with candidates as (
    select job.id
    from public.customer_wallet_sync_outbox job
    where job.status = 'pending'
      and (job.available_at is null or job.available_at <= now())
    order by job.available_at nulls first, job.created_at, job.id
    limit v_limit
    for update skip locked
  ), claimed as (
    update public.customer_wallet_sync_outbox job
    set status = 'processing',
        locked_at = now(),
        updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.customer_id, job.attempts, job.locked_at, job.created_at
  )
  select claimed.id, claimed.customer_id, claimed.attempts, claimed.locked_at
  from claimed
  order by claimed.created_at, claimed.id;
end;
$$;

-- Finaliza el trabajo reclamado. Si un trigger encoló un cambio más reciente
-- mientras estaba processing, no se pierde: se reutiliza el mismo job y vuelve
-- a pending para sincronizar la proyección actual una vez más.
create or replace function public.finalize_customer_wallet_sync_job(
  p_job_id uuid,
  p_locked_at timestamptz,
  p_outcome text,
  p_error text default null,
  p_error_code text default null,
  p_error_category text default null,
  p_http_status integer default null,
  p_next_available_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.customer_wallet_sync_outbox%rowtype;
  v_changed_during_processing boolean := false;
begin
  if p_outcome not in ('completed', 'retry', 'failed') then
    raise exception 'El resultado de sincronización Wallet no es válido.';
  end if;

  select * into v_job
  from public.customer_wallet_sync_outbox
  where id = p_job_id
  for update;

  if not found
    or v_job.status <> 'processing'
    or v_job.locked_at is distinct from p_locked_at then
    return 'not_claimed';
  end if;

  v_changed_during_processing := v_job.updated_at > v_job.locked_at;
  if v_changed_during_processing then
    update public.customer_wallet_sync_outbox
    set status = 'pending',
        available_at = now(),
        locked_at = null,
        processed_at = null,
        last_error = null,
        last_error_code = null,
        last_error_category = null,
        last_http_status = null,
        updated_at = now()
    where id = v_job.id;
    return 'requeued_changed';
  end if;

  if p_outcome = 'completed' then
    update public.customer_wallet_sync_outbox
    set status = 'completed',
        available_at = null,
        locked_at = null,
        processed_at = now(),
        last_error = null,
        last_error_code = null,
        last_error_category = null,
        last_http_status = null,
        updated_at = now()
    where id = v_job.id;
    return 'completed';
  end if;

  if p_outcome = 'retry' then
    if p_next_available_at is null then
      raise exception 'Un reintento Wallet requiere una fecha de disponibilidad.';
    end if;
    update public.customer_wallet_sync_outbox
    set status = 'pending',
        attempts = v_job.attempts + 1,
        available_at = p_next_available_at,
        locked_at = null,
        processed_at = null,
        last_error = left(coalesce(nullif(btrim(p_error), ''), 'Error Wallet desconocido.'), 500),
        last_error_code = left(nullif(btrim(p_error_code), ''), 80),
        last_error_category = coalesce(p_error_category, 'transient'),
        last_http_status = p_http_status,
        updated_at = now()
    where id = v_job.id;
    return 'retried';
  end if;

  update public.customer_wallet_sync_outbox
  set status = 'failed',
      attempts = v_job.attempts + 1,
      available_at = null,
      locked_at = null,
      processed_at = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'Error Wallet desconocido.'), 500),
      last_error_code = left(nullif(btrim(p_error_code), ''), 80),
      last_error_category = coalesce(p_error_category, 'unknown'),
      last_http_status = p_http_status,
      updated_at = now()
  where id = v_job.id;
  return 'failed';
end;
$$;

revoke all on function public.recover_stale_customer_wallet_sync_jobs(interval, integer) from public, anon, authenticated;
revoke all on function public.claim_customer_wallet_sync_jobs(integer) from public, anon, authenticated;
revoke all on function public.finalize_customer_wallet_sync_job(uuid, timestamptz, text, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.recover_stale_customer_wallet_sync_jobs(interval, integer) to service_role;
grant execute on function public.claim_customer_wallet_sync_jobs(integer) to service_role;
grant execute on function public.finalize_customer_wallet_sync_job(uuid, timestamptz, text, text, text, text, integer, timestamptz) to service_role;

notify pgrst, 'reload schema';
