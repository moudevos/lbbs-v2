-- Sprint 8.14: snapshot del descuento obligatorio aplicado despues de deducciones.
alter table public.employee_settlements
  add column if not exists net_before_mandatory_discount numeric(12,2) not null default 0,
  add column if not exists mandatory_discount_rate numeric(7,4) not null default 1,
  add column if not exists mandatory_discount_amount numeric(12,2) not null default 0;

create or replace function public.apply_settlement_mandatory_discount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.mandatory_discount_rate := greatest(coalesce(new.mandatory_discount_rate, 1), 0);
  new.net_before_mandatory_discount := greatest(round(coalesce(new.gross_pay_amount, 0) - coalesce(new.debt_deduction_total, 0), 2), 0);
  new.mandatory_discount_amount := round(new.net_before_mandatory_discount * new.mandatory_discount_rate / 100, 2);
  new.net_pay_amount := greatest(new.net_before_mandatory_discount - new.mandatory_discount_amount, 0);
  return new;
end;
$$;

drop trigger if exists employee_settlements_mandatory_discount on public.employee_settlements;
create trigger employee_settlements_mandatory_discount
before insert or update of gross_pay_amount, debt_deduction_total, mandatory_discount_rate
on public.employee_settlements
for each row execute function public.apply_settlement_mandatory_discount();

update public.employee_settlements
set mandatory_discount_rate = 1;

notify pgrst, 'reload schema';
