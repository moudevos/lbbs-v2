-- Elegibilidad explícita y PIN de owner para operaciones de S/ 0.
-- Supabase instala pgcrypto en el esquema extensions; el search_path seguro de
-- las funciones no lo incluye, por eso las llamadas se califican abajo.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.employee_benefit_rule_employees (
  rule_id uuid not null references public.employee_benefit_rules(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (rule_id, employee_id)
);
alter table public.employee_benefit_rule_employees enable row level security;
drop policy if exists "benefit_rule_targets_admin" on public.employee_benefit_rule_employees;
create policy "benefit_rule_targets_admin" on public.employee_benefit_rule_employees for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.owner_internal_authorization_pins (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.owner_internal_authorization_pins enable row level security;
revoke all on public.owner_internal_authorization_pins from public, anon, authenticated;

create or replace function public.set_owner_internal_authorization_pin(p_pin text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.current_user_role() <> 'owner' then raise exception 'Solo owner puede configurar el PIN.'; end if;
 if p_pin !~ '^[0-9]{6,12}$' then raise exception 'El PIN debe tener entre 6 y 12 dígitos.'; end if;
 insert into public.owner_internal_authorization_pins(employee_id,pin_hash,updated_at) values(public.current_employee_id(),extensions.crypt(p_pin,extensions.gen_salt('bf',12)),now()) on conflict(employee_id) do update set pin_hash=excluded.pin_hash,updated_at=now();
end; $$;
create or replace function public.verify_owner_internal_authorization_pin(p_pin text) returns boolean language sql security definer set search_path=public,pg_temp as $$
 select public.current_user_role()='owner' and exists(select 1 from public.owner_internal_authorization_pins where employee_id=public.current_employee_id() and pin_hash=extensions.crypt(p_pin,pin_hash));
$$;
revoke all on function public.set_owner_internal_authorization_pin(text), public.verify_owner_internal_authorization_pin(text) from public, anon;
grant execute on function public.set_owner_internal_authorization_pin(text), public.verify_owner_internal_authorization_pin(text) to authenticated;
notify pgrst, 'reload schema';
