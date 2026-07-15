-- Sprint 8.5
-- Ejecutar manualmente en Supabase SQL Editor.

alter table if exists public.products
  add column if not exists allow_custom_price boolean not null default false;
