-- Fase 3A.2 — QA posterior a aplicar la migración local.
-- SOLO LECTURA. No llama las RPCs: únicamente inspecciona su definición y grants.

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.proname in (
    'recover_stale_customer_wallet_sync_jobs',
    'claim_customer_wallet_sync_jobs',
    'finalize_customer_wallet_sync_job'
  )
order by p.proname;

-- Confirma que ningún customer tenga más de un job no finalizado.
select
  count(*) as customers_with_multiple_unfinished_jobs,
  coalesce(max(unfinished_jobs), 0) as maximum_unfinished_jobs_for_one_customer
from (
  select customer_id, count(*) as unfinished_jobs
  from public.customer_wallet_sync_outbox
  where status in ('pending', 'processing')
  group by customer_id
  having count(*) > 1
) duplicate_candidates;
