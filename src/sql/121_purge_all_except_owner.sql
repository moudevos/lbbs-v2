-- Purga total de datos LBBS v2.
-- Conserva solo los perfiles employees con role = 'owner' y sus cuentas auth.users vinculadas.
-- Conserva tablas, funciones, RLS, buckets y configuracion tecnica de Supabase.
-- Elimina datos operativos, catalogos, historial y cuentas Auth no owner.
-- Storage no se elimina desde SQL porque Supabase lo bloquea; usa Storage API o el panel de Supabase.
-- Esta operacion es irreversible. Realiza un backup antes de ejecutarla.
-- Para ejecutar: cambia solo v_confirm_purge a true y ejecuta todo el archivo.

begin;

do $$
declare
  v_confirm_purge constant boolean := false;
  v_owner_count integer;
  v_owner_without_auth integer;
begin
  if not v_confirm_purge then
    raise exception 'Purga bloqueada. Cambia v_confirm_purge a true despues de revisar el script.';
  end if;

  select count(*)
    into v_owner_count
  from public.employees
  where role = 'owner';

  select count(*)
    into v_owner_without_auth
  from public.employees
  where role = 'owner'
    and user_id is null;

  if v_owner_count = 0 then
    raise exception 'No existe un owner para preservar. La purga fue cancelada.';
  end if;

  if v_owner_without_auth > 0 then
    raise exception 'Existe un owner sin cuenta Auth vinculada. La purga fue cancelada para evitar perder acceso.';
  end if;
end;
$$;

-- Elimina todos los registros de tablas public excepto employees.
-- El orden se resuelve en varias pasadas segun las llaves foraneas existentes.
do $$
declare
  v_table record;
  v_deleted integer;
  v_deleted_in_pass integer;
  v_has_rows boolean;
  v_pass integer := 0;
  v_remaining text[] := array[]::text[];
begin
  loop
    v_pass := v_pass + 1;
    v_deleted_in_pass := 0;

    for v_table in
      select c.relname,
             format('%I.%I', n.nspname, c.relname) as qualified_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname <> 'employees'
      order by c.relname
    loop
      begin
        execute format('delete from %s', v_table.qualified_name);
        get diagnostics v_deleted = row_count;
        v_deleted_in_pass := v_deleted_in_pass + v_deleted;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;

    exit when v_deleted_in_pass = 0;

    if v_pass > 100 then
      raise exception 'La purga no pudo resolver las dependencias despues de 100 pasadas.';
    end if;
  end loop;

  for v_table in
    select c.relname,
           format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'employees'
    order by c.relname
  loop
    execute format('select exists (select 1 from %s)', v_table.qualified_name)
      into v_has_rows;

    if v_has_rows then
      v_remaining := array_append(v_remaining, v_table.relname);
    end if;
  end loop;

  if cardinality(v_remaining) > 0 then
    raise exception 'No se pudieron eliminar registros de: %', array_to_string(v_remaining, ', ');
  end if;
end;
$$;

-- Elimina todos los perfiles no owner despues de vaciar sus dependencias.
delete from public.employees
where role <> 'owner';

-- Elimina cuentas Auth no owner. Sus sesiones, identidades y tokens dependientes se eliminan por cascada.
delete from auth.users
where not exists (
  select 1
  from public.employees owner_employee
  where owner_employee.role = 'owner'
    and owner_employee.user_id = auth.users.id
);

commit;

-- Verificacion final.
select
  (select count(*) from public.employees where role = 'owner') as owners_preservados,
  (select count(*) from public.employees where role <> 'owner') as perfiles_no_owner_restantes,
  (select count(*) from auth.users where id not in (select user_id from public.employees where role = 'owner')) as cuentas_auth_no_owner_restantes;

select id, full_name, email, role, status, user_id
from public.employees
where role = 'owner';
