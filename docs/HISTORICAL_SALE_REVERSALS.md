# Reversas historicas de ventas POS

## Alcance y permisos

Solo owner y admin pueden ejecutar una reversa historica desde **Control > Ventas**. Aplica a una venta `completed` cuya sesion POS este `closed` y cuya antiguedad, calculada como `pos_business_date() - accounting_date`, sea de 0 a 15 dias inclusive.

La anulacion rapida del POS no cambia: sigue siendo el flujo exclusivo para la sesion abierta. Una venta de sesion abierta recibe el bloqueo `USE_POS_CANCELLATION`.

## Garantias operativas

- No reabre la sesion POS ni cambia sus totales, cierre, pagos originales o ticket original.
- Crea un registro unico e inmutable en `sale_reversals` y una nota de credito **interna, no fiscal** en `sale_document_snapshots`.
- Restaura stock mediante movimientos compensatorios, revierte Rewards disponibles y deja que el trigger de estado revierta produccion y bonos no liquidados.
- Crea contraasientos financieros trazables desde los asientos originales con fecha `pos_business_date()` actual. La fecha debe pertenecer a un periodo financiero abierto.
- Un reembolso solo es una auditoria en `sale_reversal_payments`: no modifica los `sale_payments`, no cambia caja historica y nunca permite `internal_credit`.

## Bloqueos intencionales

La operacion se rechaza si la venta ya fue revertida, esta fuera de ventana, tiene una sesion no cerrada, esta en una liquidacion activa o pagada, un Reward originado por ella fue usado en otra venta, o un credito interno asociado ya tuvo movimientos. Los codigos incluyen `SALE_INCLUDED_IN_ACTIVE_SETTLEMENT`, `SALE_INCLUDED_IN_PAID_SETTLEMENT`, `REWARD_ALREADY_CONSUMED_BY_ANOTHER_SALE` e `INTERNAL_CREDIT_ALREADY_CHANGED`.

## Deudas de colaboradores

En **Personal > Deudas**, owner/admin puede usar **Sin efecto** para toda deuda `pending` o `partial` (prestamo, adelanto, insumo, credito interno, penalidad u otro tipo). La accion exige motivo, conserva la deuda y sus movimientos, genera un movimiento `write_off`, deja saldo cero y bloquea el caso en que la deuda ya este comprometida en una liquidacion `draft`, `review` o `approved`.
