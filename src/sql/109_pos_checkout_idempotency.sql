-- Sprint 9: una sola venta por intento de checkout dentro de una sesion POS.
-- Ejecutar manualmente en Supabase SQL Editor despues de 108_pos_payment_integrity_patch.sql.

alter table public.sales
  add column if not exists checkout_idempotency_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_checkout_idempotency_key_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_checkout_idempotency_key_check
      check (
        checkout_idempotency_key is null
        or checkout_idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'
      );
  end if;
end $$;

create unique index if not exists sales_pos_session_checkout_idempotency_key_idx
  on public.sales (pos_session_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

notify pgrst, 'reload schema';
