# Auditoría RLS y seguridad

## Cierre definitivo - 2026-07-16

SQL 119 limita la reparacion a sesiones heredadas autorizadas antes del corte, exige owner/admin, bloquea lectura de recepcion sobre el detalle sensible y revoca escritura directa de cierres. La validacion funcional confirmo `legacy_expected_amount = -590`, retry y concurrencia sin duplicados y rechazo de recepcion.

QA-026, QA-027, QA-028 y QA-029 quedaron `verified` con el pago real de liquidacion, RLS, trazabilidad financiera e inmutabilidad `paid`. No hay hallazgos P0/P1 abiertos. Decision vigente: **APTO PARA DESPLEGAR HOY**.

## Actualizacion historica - 2026-07-16

No se pudo completar la validacion funcional de RLS del egreso real de liquidacion ni la inmutabilidad `paid` debido al bloqueo previo de Caja. `QA_RUN_20260716_014` se cerro `blocked` y `QA-029` registra que una sesion historica con saldo esperado negativo no puede cerrarse con la funcion remota vigente.

`src/sql/119_pos_session_legacy_negative_closure.sql` mantiene la restriccion operativa de efectivo no negativo, conserva el importe heredado como auditoria y permite cerrar la sesion de forma trazable. El SQL no fue detectado tras el periodo obligatorio de espera. RLS financiero y Caja continuan sin certificacion final; decision vigente: **NO APTO PARA PRODUCCION**.

La seccion siguiente es evidencia historica anterior.

## Estado de seguridad - Iteracion 11

- Clientes activos se validaron globales para owner, admin y reception.
- Reception no puede leer ni operar reservas, POS, ventas, items, pagos, tickets, caja ni modulos administrativos de otra sede.
- Anon no puede consultar clientes.
- La funcion de revision mantiene `security definer`, `search_path` fijo y permisos restringidos en SQL 114; fue ejercida funcionalmente en el run 011.
- SQL 115 aplica el mismo patron a `pay_employee_settlement`, bloquea la sesion POS antes de comprobar efectivo disponible y fue detectado en remoto.
- QA-026 detecto que reception puede leer cualquier movimiento de Caja de su sede, incluido el egreso sensible de liquidacion; SQL 116 restringe solo esa categoria.
- SQL 117 agrega el enlace financiero unico de cada liquidacion futura, sin modificar liquidaciones historicas pagadas.
- SQL 118 bloquea la anulacion directa de liquidaciones pagadas hasta contar con un flujo de reversión autorizado y conciliado.
- QA-025, QA-026, QA-027 y QA-028 impiden certificar Liquidaciones hasta aplicar SQL 118 y repetir la matriz.
- No se registraron secretos y service role no fue expuesto al cliente.

## Evidencia estática

## Iteracion 10

- SQL 110 habilita RLS en las cuatro tablas QA.
- Las politicas usan `public.is_admin()` y exigen `TO authenticated`.
- Reception y anon no tienen politicas de acceso.
- No se concede `DELETE` a authenticated; la evidencia se archiva.
- Las tres vistas usan `security_invoker = true`.
- Los grants son explicitos para evitar depender de defaults de Data API.
- Los helpers exigen owner, banderas QA y base local; no importan el cliente service role.

Pendiente: aplicar SQL 110 y ejecutar pruebas reales owner/admin/reception/anon antes de aprobar esta superficie.

## Iteracion 05

- El API de empleados rechaza `can_login = true` para barber y viewer antes de invocar `auth.admin.createUser`.
- El formulario deshabilita el acceso al sistema para roles operativos.
- Un empleado con Auth no puede cambiarse a rol operativo conservando acceso; el API responde `400`.
- Al desactivar admin o reception, sus sesiones existentes recibieron `403` para mutaciones protegidas.
- Falta comprobar RLS e IDOR para cada recurso y cada UUID de SED-002 con una sesion reception SED-001.

## Iteracion 06

- El modo visual se limita a fixtures Playwright y no se incluye en la aplicacion.
- Cursor, banner, pausas y resaltados se activan exclusivamente con `QA_VISUAL=true`.
- Los artefactos de fallos se eliminan al cierre de la iteracion para no retener sesiones o formularios QA.
- RLS e IDOR completos por sede siguen pendientes.

- El cliente admin usa `server-only`; no se importa desde componentes cliente.
- `NEXT_PUBLIC_*` se limita a URL y clave anónima de Supabase.
- `proxy.ts` solo redirige de forma optimista; layouts y Route Handlers mantienen la autorización definitiva.
- Los cambios de contraseña verifican la contraseña actual en servidor cuando corresponde y no registran secretos.
- Los redirects de Auth admiten únicamente rutas internas permitidas.

## Pendiente de ejecución contra QA

Para cada tabla expuesta se deben probar `select`, `insert`, `update`, `delete`, anon, alcance por sede e IDOR. Incluye branches, employees, customers, catálogos, reservations, sales, payments, sessions POS, stock, caja, rewards, producción, liquidaciones, finanzas y audit logs.

No se declara RLS aprobado mientras no se ejecuten estas pruebas con cuentas owner, admin, reception, barber y viewer en un proyecto no productivo.

## Ejecución Iteración 03

Con cliente anónimo se comparó presencia de filas contra la sesión owner, sin recuperar contenido de registros. En `employees`, `customers`, `sales`, `sale_payments`, `stock_movements` y `customer_reward_entitlements` había datos visibles para owner y cero filas visibles para anon. `employee_settlements` y `finance_manual_entries` devolvieron denegación explícita para anon.

Esto verifica ausencia de exposición anónima en la muestra, no reemplaza pruebas de insert, update, delete, IDOR ni branch scope con roles restringidos.
# Actualizacion Iteracion 10

- Regla confirmada: clientes activos globales para owner, admin y reception; sede aplicada a entidades transaccionales.
- QA-017: `NOT_A_BUG / BUSINESS_RULE_CONFIRMED`; SQL 112 descartado y eliminado.
- SQL 111: aplicado; `authenticated` recibe `42501` al intentar DELETE sobre evidencia QA.
- Anon no puede leer clientes ni laboratorio QA.
- Barber y viewer QA conservan `user_id=null` y `can_login=false`.
- QA-018 P1: owner/admin leen el cliente del run 002, reception obtiene cero filas.
- Diagnostico remoto: existe `can_access_customer(uuid)` pero no `customers.created_branch_id`, compatible con una aplicacion parcial/anterior del guard.
- Se requiere correccion SQL manual para retirar el filtro de SELECT por sede. No se creo SQL 113 ni se aplico SQL automatico.
- RLS/IDOR transaccional completo permanece pendiente tras resolver QA-018.
# Cierre de seguridad Iteracion 10 - 2026-07-16

QA-018 quedo `verified`. `can_access_customer(uuid)` y las politicas desplegadas permiten clientes globales a owner/admin/reception activa y excluyen anon, barber y viewer. El contrato local usa `employees.status = 'active'::public.employee_status`; no usa `employees.is_active`, sede, reservas ni ventas para decidir acceso al cliente.

La matriz IDOR comprobo con UUID conocido y `branch_id` manipulado que reception de QA-SED-001 no lee transacciones de QA-SED-002: reservas, sesiones POS, ventas, sale_items, sale_payments y sale_document_snapshots. Los endpoints administrativos de produccion, liquidaciones, finanzas y simulaciones devolvieron 403 para reception. P0/P1 abiertos: cero.
