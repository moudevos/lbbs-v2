# Iteracion 09

## Alcance ejecutado

- SQL 109 fue aplicado manualmente antes de esta iteracion.
- Se verifico el comportamiento desplegado mediante checkout POS real, no solo por la existencia del archivo.
- La columna usada por la aplicacion es `sales.checkout_idempotency_key`.
- El contrato esperado es unicidad parcial por `pos_session_id` y `checkout_idempotency_key`.

## QA-013

| Caso | Resultado |
| --- | --- |
| Dos requests simultaneos con misma sesion, clave y payload | Una sola venta completada; las respuestas exitosas apuntan al mismo `saleId`. |
| Retry posterior con misma clave y payload | Recupera el `saleId` original sin crear otra venta. |
| Misma clave con pago diferente | Rechazo explicito `409` sin modificar la venta original. |
| Pago digital excedido | Rechazado y sin borrador residual. |
| Pago mixto QR mas efectivo | Correcto; el vuelto queda solo en efectivo. |

La prueba visible de Playwright termino con 5 de 5 escenarios correctos. El caso concurrente confirma de forma observable que la restriccion desplegada bloquea el segundo insert dentro de la misma sesion POS. Dos ciclos headless consecutivos tambien terminaron con 5 de 5 escenarios correctos cada uno.

## Correccion adicional

La recuperacion idempotente ahora compara los datos normalizados del intento con la venta persistida: sede, cliente, barbero, reserva, reward, notas, items y pagos. Si la misma clave pertenece a datos distintos, responde `409` con un mensaje controlado. No se agrego otro parche SQL.

## Conciliacion disponible

Se agrego `src/sql/qa/checkout_idempotency_reconciliation.sql`, de solo lectura y para ejecucion manual. Revisa claves duplicadas, ventas QA sin clave y conteos de items, pagos, movimientos de stock, produccion y snapshots de ticket por venta.

## Pendiente

Faltan ejecutar las pruebas independientes de stock concurrente, anulacion concurrente, caja, cortesia, rewards, reservas, produccion, liquidaciones, finanzas y RLS/IDOR. Por ello el estado global permanece **NO APTO PARA PRODUCCION**.
