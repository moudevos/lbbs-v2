# Plan tecnico: autenticacion y contrasenas

## 1. Estado actual

- El login existe en `/login` y usa `signInWithPassword` desde un cliente Supabase de navegador.
- El login no tenia flujo funcional de recuperacion; el enlace mostraba informacion en SweetAlert.
- No existe `proxy.ts` ni `middleware.ts`.
- El layout de control valida la sesion mediante `getAccessContext`, pero no aplica `must_change_password`.
- `employees` ya tiene `user_id`, `must_change_password` y `can_login`.
- No existen `password_changed_at` ni `password_recovery_sent_at`.
- `audit_logs` ya existe y es la tabla que se reutilizara.
- La gestion administrativa de empleados ya usa service role unicamente en Route Handlers del servidor.
- No existe framework de pruebas configurado en `package.json`.

## 2. Rutas existentes

- `/login`
- `/control/*`
- `/pos`
- `/api/auth/me`
- `/api/admin/employees`

Rutas nuevas previstas:

- `/recuperar-contrasena`
- `/auth/confirm`
- `/restablecer-contrasena`
- `/cambiar-contrasena-obligatoria`
- `/control/mi-cuenta`

## 3. Componentes reutilizables

- `AsyncButton` para evitar doble envio.
- `Input`, `Modal` y clases visuales del login actual.
- Cliente browser en `src/lib/supabase/client.ts`.
- Cliente server en `src/lib/supabase/server.ts`.
- `getSupabaseAdmin` solo para operaciones administrativas de servidor.
- SweetAlert2 para confirmaciones y errores no tecnicos.

Se agregaran `PasswordField`, `PasswordRequirements` y `PasswordStrengthIndicator` como componentes pequenos y compartidos.

## 4. Flujo de recuperacion detectado

Se usara el flujo PKCE con `resetPasswordForEmail` y `redirectTo` hacia `/auth/confirm?next=/restablecer-contrasena`. El callback recibira `code`, lo intercambiara con el cliente SSR y redirigira usando cookies de servidor.

El callback tambien aceptara `token_hash` con `verifyOtp` para instalaciones cuya plantilla de correo use esa modalidad. Nunca se mezclaran ambos valores ni se registraran en logs.

## 5. Metodo de confirmacion

1. `code`: `exchangeCodeForSession(code)` con el cliente SSR.
2. `token_hash`: `verifyOtp({ token_hash, type: "recovery" })`.
3. Se marca una cookie HttpOnly de flujo de recuperacion.
4. Se redirige a una ruta interna validada.

El formulario de restablecimiento exige sesion y la cookie de flujo. Un acceso directo normal se bloquea con una pantalla controlada.

## 6. Cambios de proteccion

- Se agregara `proxy.ts` solo para redirects optimistas de paginas publicas y control.
- La autorizacion definitiva continuara en layouts, Route Handlers y RLS.
- `/auth/confirm` quedara publico.
- `/restablecer-contrasena` y `/cambiar-contrasena-obligatoria` tendran validacion de sesion en servidor y cliente.
- El layout de control redirigira a cambio obligatorio cuando el empleado tenga el flag activo.
- No se protegeran API mediante el proxy como unica barrera.

## 7. Cambios de base de datos

Se creara `src/sql/107_auth_password_security.sql` con columnas idempotentes para fechas de cambio y recuperacion, actor de recuperacion y un indice. No se guardaran contrasenas ni tokens.

Se reutilizara `audit_logs`, con metadata segura y sin secretos.

## 8. Riesgos

- La URL de Supabase debe permitir exactamente los callbacks de local, produccion y previews autorizados.
- El comportamiento final del correo depende de si la plantilla usa `ConfirmationURL` o `TokenHash`.
- Cerrar todas las sesiones despues de recuperar depende del comportamiento disponible de la version de `supabase-js`; se intentara con `signOut({ scope: "global" })` desde el cliente.
- El proxy no reemplaza la autenticacion de cada endpoint.
- El cambio de Auth y la actualizacion del perfil empleado son operaciones separadas; si la segunda falla se registra un error critico y se ofrece reintento.

## 9. Casos de prueba

- Solicitud para correo registrado y no registrado con el mismo mensaje.
- Doble clic bloqueado.
- Callback con `code`, `token_hash`, tipo incorrecto, expirado y reutilizado.
- Redirect externo bloqueado.
- Acceso directo a restablecimiento bloqueado.
- Politica debil y confirmacion diferente bloqueadas.
- Cambio autenticado con contrasena actual incorrecta.
- Cambio obligatorio bloqueando `/control`.
- Owner/admin enviando recuperacion desde Equipo.
- Reception recibiendo 403.
- Auditoria sin contrasenas ni tokens.
- Build con todas las rutas Auth.

## 10. Orden de implementacion

1. Crear este plan y auditar el flujo actual.
2. Crear helpers de URL, redirects y politica de contrasenas.
3. Crear SQL manual `107`.
4. Crear callback y pantallas publicas de recuperacion.
5. Crear cambio autenticado y cambio obligatorio.
6. Actualizar login, `/api/auth/me`, layout y UserMenu.
7. Agregar recuperacion administrativa en Equipo.
8. Crear documentacion de configuracion Supabase y plantilla de correo.
9. Ejecutar lint, build y comprobacion de procesos.
