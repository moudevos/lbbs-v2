-- Sprint 8.13: propiedades operativas de metodos de pago configurables.
alter table public.payment_methods
  add column if not exists payment_kind text,
  add column if not exists allows_change boolean not null default false,
  add column if not exists counts_as_cash boolean not null default false;

update public.payment_methods
set payment_kind = case
  when code = 'cash' then 'cash'
  when code = 'wallet_qr' then 'wallet_qr'
  when code = 'card_pos' then 'card'
  else coalesce(payment_kind, 'other_digital')
end;

update public.payment_methods
set allows_change = payment_kind = 'cash',
    counts_as_cash = payment_kind = 'cash';

alter table public.payment_methods
  alter column payment_kind set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_methods_payment_kind_check') then
    alter table public.payment_methods add constraint payment_methods_payment_kind_check check (payment_kind in ('cash', 'wallet_qr', 'card', 'bank_transfer', 'other_digital'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_methods_operational_flags_check') then
    alter table public.payment_methods add constraint payment_methods_operational_flags_check check ((payment_kind = 'cash' and allows_change and counts_as_cash) or (payment_kind <> 'cash' and not allows_change and not counts_as_cash));
  end if;
end $$;

notify pgrst, 'reload schema';
