insert into public.app_settings (key, value, description)
values
  ('app.name', '"LBBS v2"'::jsonb, 'Nombre visible de la aplicacion'),
  ('app.sprint', '"sprint-0"'::jsonb, 'Sprint preparado en esta base')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

-- Pendiente: crear la primera sucursal y el primer empleado owner desde el panel de auth.
