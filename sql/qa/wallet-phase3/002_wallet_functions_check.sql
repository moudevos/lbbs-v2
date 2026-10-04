-- Fase 3A.1 — Diagnóstico de solo lectura.
-- Ejecutar manualmente ÚNICAMENTE en Supabase DEVELOPMENT.

-- Funciones Wallet y las RPC explícitamente relevantes para esta fase.
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
  and (
    p.proname in (
      'queue_customer_wallet_sync',
      'queue_customer_wallet_sync_from_event',
      'resolve_customer_public_token',
      'get_customer_wallet_projection',
      'ensure_customer_public_token',
      'rotate_customer_public_token',
      'admin_rotate_customer_public_token',
      'get_customer_digital_card',
      'get_customer_digital_wallet_status'
    )
    or p.proname ilike '%wallet%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);
