# Instalacion SQL de Produccion

## Archivo a ejecutar

Ejecuta solo `src/sql/000_production_bootstrap.sql` completo desde Supabase SQL Editor en una base nueva.

No ejecutes los scripts historicos individuales despues del instalador. Se conservan en `src/sql` como trazabilidad de los sprints y parches anteriores.

## Alcance

El instalador crea el esquema operativo completo: tablas, indices, triggers, funciones, RPC, vistas, RLS, permisos y catalogos base. Incluye las sedes `LB-SRP` y `LB-SSJ`, los perfiles de barberos, servicios, productos y opciones seleccionables.

No crea usuarios de Supabase Auth, no crea contrasenas, no agrega stock ficticio, no crea ventas, reservas, sesiones POS, movimientos financieros ni datos de QA.

Los scripts de QA, purga, restauracion y correccion puntual quedan excluidos del instalador. La correccion de sede de barberos ya esta incorporada en el seed de empleados.

## Owner Inicial

1. Crea el usuario owner desde Supabase Auth con el correo definitivo.
2. Ejecuta el instalador completo.
3. Ejecuta este bloque, reemplazando el correo y la sede si corresponde:

```sql
insert into public.employees (
  user_id,
  branch_id,
  full_name,
  email,
  role,
  status,
  position,
  can_login,
  must_change_password
)
select
  auth_user.id,
  branch.id,
  'Nombre del owner',
  auth_user.email,
  'owner',
  'active',
  'Owner',
  true,
  false
from auth.users auth_user
left join public.branches branch on branch.code = 'LB-SRP'
where lower(auth_user.email) = lower('owner@ejemplo.com')
on conflict (user_id) where user_id is not null do update
set branch_id = excluded.branch_id,
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    position = excluded.position,
    can_login = excluded.can_login,
    must_change_password = excluded.must_change_password,
    updated_at = now();
```

## Regeneracion

Cuando se modifiquen los scripts fuente aprobados, regenera el instalador con:

```powershell
node scripts/build-production-sql.mjs
```

El generador excluye los scripts `110`, `111`, `120`, `121` y `123`, entre otros artefactos no aptos para una instalacion limpia.
