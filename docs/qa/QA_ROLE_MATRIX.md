# Matriz de roles QA

## Iteracion 10

| Rol | Login | Laboratorio QA | Alcance previsto |
| --- | --- | --- | --- |
| owner | Si | Crear y administrar runs | Global, sin modificar su registro base. |
| admin QA | Si | Lectura y administracion bajo RLS | Global segun la regla vigente. |
| reception QA | Si | Sin acceso | Clientes globales; solo QA-SED-001 en transacciones. |
| barber QA | No | Sin acceso | Empleado seleccionable, `user_id=null` y `can_login=false`. |
| viewer | No | Sin acceso | Sin Auth ni escritura operativa. |

SQL 110 esta operativo. Owner/admin validaron lectura global de clientes; reception esta bloqueada incorrectamente por QA-018 P1 remoto.

## Iteracion 06

La ejecucion visual observo owner, admin QA, reception QA y barberos sin login. La regresion headless posterior repitio las restricciones de acceso y bloqueo por desactivacion. El scope completo de entidades entre SED-001 y SED-002 sigue pendiente.

## Iteracion 05

| Rol | Resultado ejecutado |
| --- | --- |
| owner | Login y acceso global correctos; permanece intacto. |
| admin QA | Login, cambio obligatorio y bloqueo de escritura tras desactivacion correctos. |
| reception QA | Login con SED-001, restriccion de Finanzas y bloqueo de escritura tras desactivacion correctos. |
| barber QA | Creado solo como empleado activo por sede, sin Auth ni acceso. Payload manipulado con login rechazado. |
| viewer | No se creo login. El servidor comparte la misma prohibicion de acceso que barber. |

Pendiente: IDOR y scope de todas las entidades operativas entre ambas sedes.

| Rol | Panel | POS | Caja | Clientes/Reservas | Catálogos | Producción/Liquidaciones/Finanzas | Equipo/Configuración | Evidencia requerida |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| owner | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Login y API QA |
| admin | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Login y API QA |
| reception | Sí | Sí | Sí | Sí | No administración | No | No | Login y API QA |
| barber | Sí | No | No | Reservas autorizadas | No | No | No | Login y API QA |
| viewer | Sí | No | No | No escritura | No | No | No | Login y API QA |

La visibilidad en sidebar no es una barrera. La validación definitiva debe realizarse en layout, Route Handler, RLS y alcance de sede. La matriz está pendiente de ejecución porque no se entregaron cuentas QA por rol.

## Ejecución Iteración 03

- Cuenta validada: `owner` sin sede asignada.
- Navegación: todos los módulos globales del owner respondieron sin 404 ni 500.
- Pendiente: cuentas QA de admin, reception, barber y viewer; owner con sede; y pruebas de cruce entre sedes.
# Evidencia Iteracion 10

| Recurso | Owner | Reception sede propia | Reception otra sede |
| --- | --- | --- | --- |
| Sedes | Global | Permitido | Bloqueado |
| Empleados | Global | Permitido | Bloqueado |
| Reservas | Global | Permitido | Bloqueado |
| Stock | Global | Permitido | Bloqueado |
| QA runs | Permitido | Bloqueado | Bloqueado |
| Clientes | Global | Global esperado | Global esperado; QA-018 bloquea reception actualmente |

Barber y viewer no tienen login. El aislamiento por sede se exige en reservas, POS, ventas, pagos, stock, caja, tickets, produccion, liquidaciones y finanzas, no en clientes.
# Actualizacion Iteracion 10 - 2026-07-16

- Owner: acceso global y administracion QA verificados.
- Admin: lectura global de clientes verificada.
- Reception activa: clientes globales; operaciones limitadas a su sede activa.
- Reception QA-SED-001 no pudo leer reserva, sesion POS, venta, items, pagos ni snapshot de QA-SED-002; Caja ignoro el `branchId` manipulado.
- Barber QA: `user_id = null`, `can_login = false`; seleccionable operativamente.
- Viewer: sin login de panel en el laboratorio.
- Anon: sin lectura de clientes.
