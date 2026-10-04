-- Fase 3A.1 — Diagnóstico de solo lectura.
-- Ejecutar manualmente ÚNICAMENTE en Supabase DEVELOPMENT.
-- Copia el resultado completo, sin ejecutar ninguna modificación adicional.

-- Columnas, tipos, nulabilidad y valores por defecto.
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'customer_wallet_sync_outbox'
order by c.ordinal_position;

-- Primary key, foreign keys, UNIQUE y CHECK reales.
select
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and rel.relname = 'customer_wallet_sync_outbox'
order by constraint_type, constraint_name;

-- Todos los índices, incluidos los parciales que aplican deduplicación.
select
  idx.relname as index_name,
  i.indisprimary as is_primary,
  i.indisunique as is_unique,
  pg_get_indexdef(i.indexrelid) as definition,
  pg_get_expr(i.indpred, i.indrelid) as predicate
from pg_index i
join pg_class rel on rel.oid = i.indrelid
join pg_namespace ns on ns.oid = rel.relnamespace
join pg_class idx on idx.oid = i.indexrelid
where ns.nspname = 'public'
  and rel.relname = 'customer_wallet_sync_outbox'
order by idx.relname;
