# Iteracion 05

## Barreras verificadas

- `QA_ALLOW_WRITES`: `true`.
- `QA_RESET_CONFIRMED`: `true`.
- Base URL QA local configurada para `127.0.0.1:3100`.
- Credenciales owner configuradas sin exponer valores.
- `.env.local` ignorado por Git.
- El proyecto remoto fue usado por autorizacion explicita de QA; el repositorio no contiene una prueba tecnica de que dicho proyecto no sea produccion.

## Cobertura ejecutada

- Login owner, sesion despues de recarga y acceso global sin sede.
- Alta por interfaz de SED-001 y SED-002 cuando no existian, con reutilizacion si el codigo ya estaba presente.
- Alta por interfaz de admin QA y reception QA con Auth y cambio obligatorio de contrasena.
- Alta por interfaz de dos barberos QA, uno por sede, con `user_id = null` y `can_login = false`.
- Rechazo de API para un payload manipulado de barber con login antes de crear Auth.
- Desactivacion y reactivacion de admin y reception; las sesiones existentes recibieron `403` en endpoints de escritura protegidos.
- Reception sin acceso al modulo de finanzas.
- Dos ciclos consecutivos correctos del flujo anterior.

## Defecto corregido

| ID | Severidad | Estado | Descripcion |
| --- | --- | --- | --- |
| QA-006 | P1 | Corregido | Equipo permitia solicitar Auth para barber o viewer. Cliente y servidor ahora limitan el login a owner, admin y reception. |
| QA-007 | P2 | Corregido | Caja intentaba filtrar movimientos con UUID vacio cuando owner no tenia sede seleccionable. Ahora devuelve bootstrap vacio controlado. |

## Limpieza

- Los empleados y usuarios Auth con prefijo exacto `QA_TEST_DATA` se eliminaron por una ruta server-only protegida por owner y ambas banderas QA.
- Las sedes QA marcadas se eliminaron despues de los empleados.
- Los storage states temporales se eliminaron.
- No se modifico el owner ni se registraron contrasenas en documentos.

## Pendiente

No se ejecutaron aun flujos operativos con escritura de catalogos, POS, pagos, cortesias, rewards, reservas, stock, caja, tickets, produccion, simulaciones, liquidaciones o finanzas. Tampoco se completo la matriz RLS/IDOR entre SED-001 y SED-002. El Sprint 9 permanece no apto para produccion.

## Validacion final

- `npm run lint`: correcto con cinco warnings heredados.
- `npm run typecheck`: correcto.
- `npm run test`: 12/12.
- `npm run test:integration`: 8/8 en dos ciclos consecutivos.
- `npm run test:e2e`: 14/14 en un unico worker para aislar la base QA compartida.
- `npm run build`: correcto.
