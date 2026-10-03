# Fase 1B — Registro Financiero Operativo

## Fuente única

Una operación de costo, gasto u otro ingreso nace una sola vez en **Registro de Costos y Gastos** (`finance_manual_entries`). El documento fuente genera el asiento canónico en `financial_postings`; si el método realmente mueve efectivo, genera también un `cash_movement` enlazado con `source_type` y `source_id`.

Por ello no se vuelve a registrar el mismo alquiler, compra menor o servicio desde Caja. Los movimientos de Caja creados automáticamente se revierten desde su documento de origen, no de forma aislada.

## Estado de pago y cuentas por pagar

- **Pagado:** reconoce el hecho económico en la fecha contable. Si se pagó en efectivo, requiere una sesión POS abierta en la sede y reduce Caja. Un pago digital no modifica el efectivo físico.
- **Pendiente / crédito:** reconoce el hecho económico en su fecha contable y crea una CxP genérica con importe original, saldo, vencimiento opcional, origen, sede y descripción. No modifica Caja.
- **Pago de CxP:** permite importes parciales. Reduce solo la obligación (`liability_decrease`); nunca vuelve a registrar un gasto. Si se paga en efectivo crea un único movimiento de Caja enlazado al pago.

Las categorías de `finance_categories` conservan la clasificación económica. `asset_movement` (por ejemplo inventario) no afecta utilidad aunque un pago en efectivo sí reduzca Caja.

## Fechas y reversas

`accounting_date` determina el período económico. `payment_date` registra cuándo se realizó el pago físico/digital. Las reglas de fechas financieras cerradas se validan en el motor.

Los documentos se anulan con motivo y se conservan. La reversa invierte el asiento fuente y, si su efectivo pertenece a una sesión aún abierta, cancela el movimiento de Caja asociado. Una CxP con pagos no puede anularse hasta reconciliar/revertir esos pagos.

## Caja y corrección de apertura

El monto de apertura original no se edita. Owner o admin pueden crear una corrección auditada únicamente mientras la sesión está abierta. Cada corrección guarda importe original, importe de corrección, dirección, apertura efectiva, razón, nota, usuario y fecha. `OTHER` exige observación.

La fórmula de efectivo esperado es:

```text
apertura registrada
+ correcciones de apertura (+)
- correcciones de apertura (-)
+ ventas en efectivo
+ ingresos de caja
- egresos de caja
- retiros
+ ajustes (+)
- ajustes (-)
```

Los ajustes históricos sin dirección se interpretan como `increase` para preservar el comportamiento previo. Una sesión cerrada no admite correcciones ni cambios a su apertura, cierre o movimientos históricos.

## Liquidaciones: producción, aporte y base

Los documentos de liquidación mantienen snapshots separados:

```text
producción reconocida
- aporte operativo
= base comisionable
```

La producción total reconocida puede incluir atribuciones de productos, Rewards y reglas especiales; eso no implica que todos formen parte de la base porcentual. El descuento obligatorio se calcula sobre el snapshot de producción reconocida, no sobre la base comisionable.

## Alcance histórico

La fase aplica hacia adelante. No reescribe sesiones POS cerradas, aperturas históricas, movimientos anulados, documentos pagados ni registros financieros antiguos.
