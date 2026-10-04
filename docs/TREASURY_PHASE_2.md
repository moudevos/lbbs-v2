# Tesorería — Fase 2

`cash_movements` permanece reservado para una sesión POS. Los pagos de liquidación se registran en `employee_settlement_payments` y generan un `treasury_movement` de salida; no generan movimientos de caja POS.

Una liquidación puede tener varios pagos. Solo cambia a `paid` cuando la suma de pagos `posted` iguala su neto. Las deducciones de deuda se aplican al completar ese pago total y permanecen separadas del costo laboral.
