# Iteracion 07

## Ejecucion operativa iniciada

- Datos creados con marcador por ejecucion: sede, barbero sin login, cliente, servicio, producto, stock, metodos de pago y sesion POS.
- Navegador visible: Chrome Chromium, `1440x900`, serial, `slowMo=800 ms`, cursor y banner QA activos.
- Flujo verificado con escritura: apertura de sesion, venta de S/150, pago efectivo recibido S/200, detalle de venta y generacion de ticket.
- Limpieza QA: dos ejecuciones parciales anteriores se retiraron con el endpoint exclusivo de owner y banderas QA.

## Defectos encontrados

| ID | Severidad | Estado | Descripcion |
| --- | --- | --- | --- |
| QA-010 | P1 | Corregido en SQL, pendiente de aplicar | `complete_sale` redefinido por rewards calculaba el vuelto con `paid_total` en lugar de `sale_payments.change_amount`. |
| QA-011 | P2 | Corregido en codigo | La limpieza QA eliminaba una venta con cascada y disparaba recalcule sobre una venta ya removida. Ahora elimina primero items y pagos. |
| QA-012 | P2 | Corregido en codigo | Un exceso de pago digital retornaba 400 despues de crear el borrador, sin ejecutar el rollback local. Ahora lanza error y activa la limpieza existente. |

## Bloqueo actual

Antes de reanudar pruebas de pagos, vuelto, caja y conciliaciones se debe ejecutar manualmente en Supabase SQL Editor:

`src/sql/108_pos_payment_integrity_patch.sql`

El script es idempotente y restaura el vuelto desde cada pago. Tambien totaliza caja por `payment_kind` y `counts_as_cash`, no por codigos fijos.

## Cobertura pendiente

No ejecutado aun: pagos mixtos completos, idempotencia, stock concurrente, cortesias, rewards, reserva a POS, caja, tickets anulados, produccion, simulaciones, liquidaciones, finanzas, RLS/IDOR, conciliaciones y dos ciclos headless.

## Estado

**NO APTO PARA PRODUCCION**. La Iteracion 7 no puede cerrarse mientras el parche SQL no este aplicado y la bateria operativa completa no termine.
