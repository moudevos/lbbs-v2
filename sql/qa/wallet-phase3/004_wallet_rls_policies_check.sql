-- Fase 3A.1 — Diagnóstico de solo lectura.
-- Ejecutar manualmente ÚNICAMENTE en Supabase DEVELOPMENT.

-- Estado de RLS de las tres tablas de infraestructura Wallet.
select
  rel.relname as table_name,
  rel.relrowsecurity as rls_enabled,
  rel.relforcerowsecurity as rls_forced
from pg_class rel
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and rel.relname in (
    'customer_public_tokens',
    'wallet_passes',
    'customer_wallet_sync_outbox'
  )
order by rel.relname;

-- Políticas reales, incluidas expresiones USING y WITH CHECK.
select
  pol.tablename as table_name,
  pol.policyname as policy_name,
  pol.permissive,
  pol.roles,
  pol.cmd as command,
  pol.qual as using_expression,
  pol.with_check as with_check_expression
from pg_policies pol
where pol.schemaname = 'public'
  and pol.tablename in (
    'customer_public_tokens',
    'wallet_passes',
    'customer_wallet_sync_outbox'
  )
order by pol.tablename, pol.policyname;

-- Privilegios de tabla concedidos explícitamente a roles de Data API.
select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'customer_public_tokens',
    'wallet_passes',
    'customer_wallet_sync_outbox'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by table_name, grantee, privilege_type;
