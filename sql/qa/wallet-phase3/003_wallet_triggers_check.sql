-- Fase 3A.1 — Diagnóstico de solo lectura.
-- Ejecutar manualmente ÚNICAMENTE en Supabase DEVELOPMENT.

-- Triggers de Wallet/Rewards y su función. No devuelve datos de clientes.
select
  rel.relname as table_name,
  trg.tgname as trigger_name,
  case trg.tgenabled
    when 'O' then 'enabled'
    when 'D' then 'disabled'
    when 'R' then 'replica'
    when 'A' then 'always'
    else trg.tgenabled::text
  end as enabled_mode,
  pg_get_triggerdef(trg.oid, true) as definition,
  fn.proname as function_name,
  case when fn.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as function_security_mode
from pg_trigger trg
join pg_class rel on rel.oid = trg.tgrelid
join pg_namespace ns on ns.oid = rel.relnamespace
join pg_proc fn on fn.oid = trg.tgfoid
join pg_namespace fn_ns on fn_ns.oid = fn.pronamespace
where not trg.tgisinternal
  and ns.nspname = 'public'
  and (
    rel.relname in (
      'customer_reward_ledger',
      'customer_reward_entitlements',
      'reward_redemptions',
      'customer_public_tokens',
      'wallet_passes',
      'customer_wallet_sync_outbox'
    )
    or fn.proname ilike '%wallet%'
    or fn.proname ilike '%reward%'
  )
order by rel.relname, trg.tgname;
