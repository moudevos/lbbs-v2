# LBBS v2

Sistema operativo para la gestión de **La Bajadita Barber Studio**. El proyecto concentra el panel de control, el catálogo de servicios y productos, reservas, clientes, equipo, caja, POS, rewards, producción, liquidaciones y configuraciones administrativas.

La aplicación está construida para ejecutarse en Vercel y utiliza Supabase como plataforma de autenticación, base de datos y almacenamiento. La base de datos se prepara mediante scripts SQL ejecutados manualmente desde el SQL Editor de Supabase.

## Alcance actual

### Operación

- Inicio de sesión con Supabase Auth.
- Recuperación, restablecimiento, cambio obligatorio y cambio autenticado de contraseña.
- Panel de control protegido por rol.
- Gestión de sedes, empleados, clientes y contactos.
- Catálogo global de servicios, con precios especiales por sede.
- Catálogo de productos, categorías, stock y movimientos.
- Reservas como flujo de coordinación, sin convertirlas automáticamente en ventas.
- Caja y sesiones POS por sede.
- POS independiente en `/pos`, sin sidebar ni layout del dashboard.
- Carrito POS persistido localmente por sesión, sede y empleado.
- Ventas con servicios, productos, descuentos, cortesías, rewards y pagos múltiples.
- Validación de efectivo, vuelto, saldo pendiente y métodos configurables.
- Ticket interno para impresión térmica de 80 mm.
- Consulta y cancelación de ventas según permisos.

### Rewards

- Reglas y beneficios configurables.
- Migración de tarjetas físicas con stickers.
- Ledger de atenciones y movimientos auditables.
- Recalculo de rewards por cliente.
- Entitlements disponibles para uso en POS.
- Restricción de rewards para el cliente genérico.

### Personal y liquidaciones

- Generación de producción por periodo.
- Producción de servicios, rewards, cortesías y descuentos comerciales.
- Bonos de productos.
- Deudas y descuentos aplicables.
- Liquidaciones por empleado y periodo.
- Revisión previa con detalle de snapshots.
- Ajustes auditables de tipo bono o descuento.
- Aprobación, pago y anulación de liquidaciones.
- Descuento obligatorio configurable y guardado como snapshot.
- Simulaciones de pago sin efectos en la base de datos.

### Administración

- Métodos de pago configurables con propiedades operativas.
- Motivos de cortesía y cancelación.
- Categorías y unidades de catálogo.
- Reglas de compensación.
- Finanzas con movimientos manuales y categorías.
- Plantillas de WhatsApp.
- Búsqueda normalizada para mayúsculas, minúsculas y acentos.
- Registro de auditoría y restricciones RLS en tablas sensibles.

## Fuera de alcance

Estas capacidades no forman parte de la implementación actual o deben ampliarse en una etapa posterior:

- Comprobantes fiscales electrónicos.
- Integración de impresión física validada contra cada modelo de impresora.
- Integraciones de pago externas.
- Portal público completo de reservas.
- Reportería financiera avanzada y conciliación bancaria.
- Automatizaciones externas de WhatsApp o correo.
- Aplicación móvil nativa.

Una reserva no es una venta. No descuenta stock, no registra pagos, no genera rewards y no define los servicios finales. La venta real se valida en POS.

## Stack

- Next.js 16 con App Router.
- React 19.
- TypeScript.
- Supabase Auth, Postgres, Storage y Supabase JS.
- `@supabase/ssr` para cookies y sesiones en servidor.
- Tailwind CSS 4.
- SweetAlert2 para confirmaciones y errores operativos.
- FontAwesome React para navegación e iconos.
- `clsx` y `tailwind-merge` mediante el helper `cn`.
- Vercel como plataforma de despliegue.

No se utiliza ORM. Las consultas se realizan mediante Supabase JS y las funciones de negocio de Postgres cuando corresponde.

## Requisitos

- Node.js compatible con Next.js 16.
- npm.
- Proyecto Supabase.
- Usuario de Supabase con un empleado relacionado en `public.employees`.
- Rol operativo válido: `owner`, `admin`, `reception`, `barber` o `viewer`.

## Instalación local

Desde la carpeta del proyecto:

```bash
npm install
```

Crea `.env.local` a partir de `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
APIPERU_TOKEN=
APIPERU_BASE_URL=https://apiperu.dev/api
```

`SUPABASE_SERVICE_ROLE_KEY` sólo debe existir en el servidor. Nunca debe importarse desde componentes cliente ni exponerse con el prefijo `NEXT_PUBLIC_`.

## Base de datos Supabase

El repositorio no utiliza Supabase migrations. Los archivos de `src/sql` deben ejecutarse manualmente desde el SQL Editor.

### Orden recomendado

Ejecuta los scripts en este orden, respetando las dependencias:

1. `001_extensions.sql`
2. `002_enums.sql`
3. `003_core_tables.sql`
4. `004_rls_helpers.sql`
5. `005_rls_policies.sql`
6. `006_seed_base.sql`
7. `007_branches_team.sql`
8. `010_services.sql`
9. `020_customers.sql`
10. `021_identity_lookup.sql`
11. `022_customers_simplify.sql`
12. `030_reservations.sql`
13. `040_products_stock.sql`
14. `050_pos_sales.sql`
15. `052_sales_cash_change_patch.sql`
16. `060_operational_settings.sql`
17. `070_cash_operations.sql`
18. `080_rewards.sql`
19. `081_rewards_consumption_patch.sql`
20. `082_products_custom_price_patch.sql`
21. `083_services_custom_price_patch.sql`
22. `085_pos_session_history_and_closure.sql`
23. `086_payroll_periods.sql`
24. `087_employee_production.sql`
25. `088_employee_bonus_rules.sql`
26. `089_employee_accounts.sql`
27. `090_employee_benefits.sql`
28. `091_employee_settlements.sql`
29. `092_employee_compensation_functions.sql`
30. `093_employee_compensation_rls.sql`
31. `094_sale_documents_and_reward_guards.sql`
32. `095_operational_contacts_and_reservations.sql`
33. `096_sale_cancellation_reasons.sql`
34. `097_sale_cancellation_schema_patch.sql`
35. `098_sale_document_snapshots_schema_reload.sql`
36. `099_sale_document_snapshots_actor_fk.sql`
37. `100_courtesy_rules.sql`
38. `101_payment_method_operational_properties.sql`
39. `102_search_normalization.sql`
40. `103_settlement_mandatory_discount.sql`
41. `104_finance_manual_entries.sql`
42. `105_payment_method_cash_semantics.sql`
43. `106_settlement_review_adjustments.sql`
44. `107_auth_password_security.sql`

Los scripts posteriores a `085` corresponden a producción, compensaciones, documentos, cortesías, pagos, búsqueda, finanzas, revisión de liquidaciones y seguridad de contraseñas. `src/sql/dev/098_reset_employee_compensation_test_data.sql` es únicamente para datos de prueba y no debe ejecutarse en producción.

El archivo [EMPLOYEE_COMPENSATION_ORDER.md](src/sql/EMPLOYEE_COMPENSATION_ORDER.md) resume las dependencias específicas del bloque de producción y liquidaciones.

### Reglas importantes de SQL

- Verifica el resultado de cada script antes de ejecutar el siguiente.
- Si una tabla ya existe, revisa el mensaje antes de continuar.
- Después de cambios de esquema, espera la recarga del esquema de PostgREST.
- No ejecutes scripts de desarrollo en una base con datos reales.
- Conserva respaldos antes de cambios estructurales o scripts correctivos.
- Los scripts no sustituyen una estrategia de backup de Supabase.

## Arquitectura del proyecto

```text
src/
  app/
    (auth)/login/                 Login
    (control)/control/            Dashboard protegido
    (pos)/pos/                    POS full screen independiente
    api/                          Route Handlers administrativos
  components/
    layout/                       Sidebar, header y shell del dashboard
    ui/                           Button, Input, Select, Modal y controles base
    feedback/                     Mensajes y estados operativos
  features/
    auth/                         Formulario de autenticación
    branches/                     Sedes
    cash/                         Caja y movimientos
    customers/                    Clientes
    employees/                    Equipo y finanzas del empleado
    finance/                      Libro financiero manual
    payment-simulations/          Simulaciones sin efectos secundarios
    pos/                          Workspace, carrito, pagos y cierre POS
    production/                   Producción del periodo
    products/                     Productos y stock
    reservations/                 Reservas y coordinación
    rewards/                      Reglas, beneficios y migraciones
    sales/                        Tickets y detalle de ventas
    services/                     Servicios y precios por sede
    settings/                     Configuraciones administrativas
    settlements/                  Liquidaciones y revisión
  lib/
    auth/                         Acceso por rol y permisos de módulo
    supabase/                     Clientes Supabase y autenticación de rutas
    sales/                        Documentos y tickets
    utils/                        Utilidades compartidas
  sql/                            Scripts manuales para Supabase
```

## Rutas de la aplicación

### Autenticación

- `/login`: acceso con email y contraseña.
- `/recuperar-contrasena`: solicitud de enlace con respuesta genérica.
- `/auth/confirm`: callback PKCE o Token Hash de Supabase.
- `/restablecer-contrasena`: creación de nueva contraseña desde un enlace válido.
- `/cambiar-contrasena-obligatoria`: cambio requerido para accesos temporales.
- `/control/mi-cuenta`: datos de cuenta, cambio autenticado y cierre de otras sesiones.

### Dashboard

- `/control`: inicio del panel.
- `/control/sedes`: sedes.
- `/control/equipo`: empleados y personal.
- `/control/caja`: caja y movimientos.
- `/control/pos`: resumen de sesión POS.
- `/control/ventas`: ventas históricas.
- `/control/servicios`: catálogo de servicios.
- `/control/productos`: catálogo y stock.
- `/control/clientes`: clientes.
- `/control/contactos`: contactos operativos.
- `/control/reservas`: reservas.
- `/control/rewards`: rewards.
- `/control/produccion`: producción por periodo.
- `/control/liquidaciones`: preparación, revisión, aprobación y pago.
- `/control/simulaciones-pago`: cálculos sin persistencia.
- `/control/finanzas`: movimientos financieros manuales.
- `/control/configuracion`: métodos, categorías, motivos y reglas.

### POS

- `/pos`: caja operativa independiente.

`/control/pos` administra la sesión. El botón `Abrir POS` abre `/pos` en una pestaña nueva. `/pos` no hereda el sidebar ni el header del dashboard.

## Roles y permisos

Los permisos se resuelven en servidor mediante `getModuleAccess`, `requireAdminSession` y las funciones RLS de Supabase.

| Rol | Alcance general |
| --- | --- |
| `owner` | Acceso completo y administración global |
| `admin` | Administración operativa y financiera |
| `reception` | Clientes, reservas, caja, POS, ventas y rewards operativos |
| `barber` | Acceso limitado a coordinación autorizada |
| `viewer` | Consulta del panel permitido |

La autorización de base de datos no debe depender de valores editables de `user_metadata`. Los helpers RLS y la relación usuario-empleado son la fuente de autorización.

## Flujos principales

### Reserva a POS

1. Se crea o confirma la reserva.
2. El cliente llega y recepción lo marca `En tienda`.
3. Desde el detalle puede aparecer `Pasar a venta`.
4. Mientras POS no exista o no esté listo, esa acción no completa la reserva.
5. En POS se seleccionan los servicios realmente realizados, productos, barbero real, descuentos, cortesías y método de pago.
6. La reserva sólo se marca como atendida cuando corresponde al cierre real de la venta.

### Cierre POS

1. Se abre una sesión POS por sede.
2. Se selecciona el cliente, excepto cuando corresponde al cliente genérico.
3. Se agregan servicios y productos al carrito.
4. Se selecciona barbero cuando la operación lo exige.
5. Se puede aplicar un reward disponible.
6. Se agregan uno o varios pagos.
7. El sistema valida saldo, vuelto, efectivo y métodos configurables.
8. El backend ejecuta el cierre y conserva los datos de auditoría.
9. Se puede consultar o imprimir el ticket interno.

Una venta compuesta sólo por cortesías no puede cerrarse como una venta monetaria normal. Un total cero por reward no debe confundirse con una venta sólo de cortesías.

### Producción y liquidación

1. Se genera la producción del periodo.
2. Se revisan servicios, rewards, cortesías, descuentos, bonos y deudas.
3. Se prepara un borrador de liquidación.
4. `Revisar` abre el detalle snapshot.
5. Se agregan ajustes auditables si existe una diferencia.
6. La liquidación pasa a `En revisión`.
7. Se aprueba y luego se registra el pago.

## API administrativa

Los endpoints administrativos están en `src/app/api/admin`. Las rutas de escritura validan sesión y rol en servidor.

Entre los endpoints principales están:

- `/api/admin/pos/bootstrap`
- `/api/admin/pos/checkout`
- `/api/admin/pos/sessions`
- `/api/admin/settlements`
- `/api/admin/production`
- `/api/admin/rewards/*`
- `/api/admin/customers/*`
- `/api/admin/services/*`
- `/api/admin/products/*`
- `/api/admin/payment-methods/*`
- `/api/admin/finance/*`
- `/api/admin/payment-simulations`

Los mensajes de API deben ser entendibles para el usuario. Los detalles técnicos se registran en servidor con prefijos de módulo, por ejemplo `[settlements/detail]` o `[pos/ui]`.

## Supabase clients

- `src/lib/supabase/client.ts`: cliente para componentes cliente.
- `src/lib/supabase/server.ts`: cliente para Server Components, Server Actions y Route Handlers usando cookies.
- `src/lib/supabase/admin.ts`: cliente con service role, sólo servidor/admin.

No importes `admin.ts` en un archivo con `"use client"`. No envíes la service role key al navegador.

## Seguridad de contraseñas

- La política exige 8 caracteres, mayúscula, minúscula, número y símbolo.
- La recuperación devuelve siempre el mismo mensaje, exista o no el correo.
- La ruta de confirmación acepta PKCE (`code`) y Token Hash (`token_hash`) sin registrar secretos.
- Los cambios autenticados y obligatorios verifican la contraseña actual en servidor antes de actualizarla.
- Al recuperar o cambiar una contraseña se solicita el cierre global de sesiones; desde `Mi cuenta` se pueden cerrar solamente las otras sesiones.
- `must_change_password` bloquea el panel y las rutas de escritura hasta completar el cambio.
- Los eventos se guardan en `audit_logs` sin contraseñas, tokens ni enlaces.

Antes de habilitar recuperación en producción, ejecuta `107_auth_password_security.sql` y sigue [AUTH_PASSWORD_CONFIGURATION.md](docs/AUTH_PASSWORD_CONFIGURATION.md).

## Comandos

```bash
# Desarrollo
npm run dev

# Lint
npm run lint

# Compilación de producción
npm run build

# Servir el build generado
npm run start
```

Para una validación habitual:

```bash
npm run lint
npm run build
```

En Windows PowerShell, si la ejecución directa de npm presenta problemas:

```powershell
cmd /c npm run lint
cmd /c npm run build
```

No se debe dejar `npm run dev` ejecutándose después de una prueba automatizada o de validación.

## Convenciones de desarrollo

- Mantener los cambios acotados al módulo solicitado.
- Preferir funciones pequeñas y componentes claros.
- Reutilizar los helpers existentes antes de crear abstracciones nuevas.
- Mantener la lógica de negocio crítica en servidor o Postgres.
- No duplicar cálculos de precios, descuentos, stock o permisos en frontend.
- Usar SweetAlert2 para errores y confirmaciones operativas.
- Mantener todos los comentarios nuevos en español.
- No mostrar valores crudos de enums o errores técnicos al usuario.
- Mantener `source` y `channel` automáticos cuando la operación tenga origen conocido.
- Los datos de reserva son referenciales y no deben convertirse automáticamente en venta.
- Los ajustes de liquidación deben conservar motivo, monto y actor.

## Solución de problemas frecuentes

### La ruta devuelve 404

Comprueba que la carpeta exista dentro de `src/app` y que no haya dos páginas resolviendo el mismo path. Los route groups como `(control)` y `(auth)` no aparecen en la URL.

Ejemplo:

```text
src/app/(control)/control/clientes/page.tsx -> /control/clientes
src/app/(auth)/login/page.tsx              -> /login
```

### El navegador recibe HTML en vez de JSON

Normalmente se está llamando una ruta API inexistente o una ruta que devolvió una página de error. Revisa primero que el endpoint aparezca en la salida de `npm run build` y que la URL usada por `fetch` coincida exactamente.

### Supabase devuelve `PGRST205` o columnas inexistentes

Ejecuta el SQL pendiente en el SQL Editor, confirma el orden y recarga el esquema de PostgREST. No cambies la consulta del frontend para ocultar una tabla o columna que aún no existe.

### El POS no carga bootstrap

Revisa sesión Auth, `session_id`, sede activa, permisos del empleado y que las tablas POS hayan sido creadas. El endpoint `/api/admin/pos/bootstrap` debe responder JSON; un `<!DOCTYPE html>` indica que la ruta no fue encontrada o falló antes de construir la respuesta.

### La liquidación no abre revisión

Confirma que se ejecutaron `091_employee_settlements.sql`, `103_settlement_mandatory_discount.sql` y `106_settlement_review_adjustments.sql`. El endpoint debe devolver la liquidación base y sus snapshots antes de permitir ajustes.

## Despliegue en Vercel

1. Conecta el repositorio a Vercel.
2. Configura las variables de entorno de producción.
3. Ejecuta todos los scripts SQL en Supabase antes del primer uso.
4. Verifica que `NEXT_PUBLIC_APP_URL` apunte al dominio final.
5. Comprueba los redirects y URLs de Supabase Auth.
6. Ejecuta `npm run lint` y `npm run build` localmente.
7. Realiza una prueba de login, apertura de sesión POS, venta de prueba, impresión de ticket y revisión de liquidación.

La service role key debe configurarse como variable privada de Vercel y nunca como variable pública.

## Estado de validación

La aplicación compila con `npm run build`. `npm run lint` no presenta errores de lint; pueden existir warnings pendientes en módulos anteriores que no bloquean la compilación.

Antes de usar el sistema con datos reales, valida en Supabase:

- El orden completo de SQL.
- Las políticas RLS.
- Las funciones RPC.
- Los empleados y roles.
- Los métodos de pago.
- Las sedes activas.
- Una venta de prueba y su ticket.
- Una liquidación de prueba con revisión y aprobación.

## Licencia y uso

Proyecto privado de LBBS v2. No redistribuir ni publicar credenciales, datos de clientes, claves de Supabase o snapshots operativos.
