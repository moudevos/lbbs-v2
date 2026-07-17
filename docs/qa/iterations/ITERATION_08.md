# Iteracion 08

## Verificacion de SQL 108

- Prueba desplegada: venta QA de S/150 con efectivo aplicado S/150 y recibido S/200.
- Resultado de checkout, detalle y ticket: aplicado S/150, recibido S/200, vuelto S/50.
- Resultado: QA-010 queda corregido, aplicado y verificado por comportamiento desplegado.
- La prueba tambien confirmo que el ticket usa el monto aplicado como total de venta y conserva el recibido y vuelto por pago.

## Pagos y rollback

- Pago mixto QR mas efectivo: correcto.
- Vuelto digital manipulado: rechazado.
- Exceso digital: rechazado sin borrador residual despues de corregir el orden de rollback local.
- QA-012 queda corregido y verificado.

## Defecto encontrado

| ID | Severidad | Estado | Descripcion |
| --- | --- | --- | --- |
| QA-013 | P0 | Corregido en codigo, pendiente de aplicar SQL | Dos requests concurrentes del mismo checkout creaban dos ventas completadas. Faltaba una clave idempotente y una restriccion unica por sesion. |

## Correccion P0

- API: valida y persiste `idempotency_key` por intento de checkout.
- UI POS: reutiliza la misma clave mientras un intento no tenga respuesta exitosa.
- Base de datos: `src/sql/109_pos_checkout_idempotency.sql` agrega la clave y el indice unico parcial por sesion POS.

## Bloqueo actual

Ejecutar manualmente en Supabase SQL Editor, despues de 108:

`src/sql/109_pos_checkout_idempotency.sql`

No se deben continuar las pruebas de concurrencia, stock concurrente, caja ni cierre operativo hasta repetir el caso P0 contra la base con la restriccion desplegada.

## Estado

**NO APTO PARA PRODUCCION**. QA-010 y QA-012 estan verificados; QA-013 requiere aplicar SQL 109 y repetir la prueba concurrente antes de avanzar.
