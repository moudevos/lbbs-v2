do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'owner',
      'admin',
      'reception',
      'barber',
      'viewer'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type public.employee_status as enum (
      'active',
      'inactive',
      'blocked'
    );
  end if;
end $$;
