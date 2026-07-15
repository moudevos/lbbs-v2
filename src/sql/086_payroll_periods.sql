-- Sprint 8.8: periodos quincenales y aportes operativos.
-- Ejecutar despues de 085_pos_session_history_and_closure.sql.

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_year integer not null check (period_year between 2020 and 2200),
  period_month integer not null check (period_month between 1 and 12),
  period_half integer not null check (period_half in (1, 2)),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'processing', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.employees(id) on delete set null,
  unique (period_year, period_month, period_half),
  check (end_date >= start_date)
);

create table if not exists public.production_operational_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  minimum_amount numeric(12,2) not null default 0 check (minimum_amount >= 0),
  maximum_amount numeric(12,2) check (maximum_amount is null or maximum_amount >= minimum_amount),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage')),
  calculation_value numeric(12,4) not null check (calculation_value >= 0),
  priority integer not null default 0,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists production_operational_rules_lookup_idx
  on public.production_operational_rules (is_active, effective_from, effective_to, priority desc);

create or replace function public.get_or_create_payroll_period(p_date date)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_half integer := case when extract(day from v_date) <= 15 then 1 else 2 end;
  v_start date;
  v_end date;
  v_period public.payroll_periods%rowtype;
begin
  if public.current_user_role() not in ('owner', 'admin', 'reception') then
    raise exception 'No tienes permisos para consultar periodos de produccion.';
  end if;

  v_start := make_date(extract(year from v_date)::integer, extract(month from v_date)::integer, case when v_half = 1 then 1 else 16 end);
  v_end := case when v_half = 1 then make_date(extract(year from v_date)::integer, extract(month from v_date)::integer, 15) else (date_trunc('month', v_date) + interval '1 month - 1 day')::date end;

  insert into public.payroll_periods (
    period_year, period_month, period_half, start_date, end_date, created_by
  ) values (
    extract(year from v_date)::integer, extract(month from v_date)::integer,
    v_half, v_start, v_end, public.current_employee_id()
  )
  on conflict (period_year, period_month, period_half) do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date
  returning * into v_period;

  return v_period;
end;
$$;

insert into public.production_operational_rules (
  name, minimum_amount, maximum_amount, calculation_type, calculation_value,
  priority, is_active, effective_from
)
select 'Aporte servicios menores a S/ 60', 0, 59.99, 'fixed', 2, 20, true, date '2000-01-01'
where not exists (
  select 1 from public.production_operational_rules
  where name = 'Aporte servicios menores a S/ 60'
);

insert into public.production_operational_rules (
  name, minimum_amount, maximum_amount, calculation_type, calculation_value,
  priority, is_active, effective_from
)
select 'Aporte servicios desde S/ 60', 60, null, 'fixed', 10, 10, true, date '2000-01-01'
where not exists (
  select 1 from public.production_operational_rules
  where name = 'Aporte servicios desde S/ 60'
);

revoke all on function public.get_or_create_payroll_period(date) from public;
grant execute on function public.get_or_create_payroll_period(date) to authenticated, service_role;
