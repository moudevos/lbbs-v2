# Motor financiero Fase 0

## Alcance y compatibilidad

La Fase 0 incorpora una capa financiera canónica y rige solo los hechos nuevos
posteriores a la migración `175_financial_engine_phase_0.sql`. No migra ventas,
entregas de insumos, deudas ni liquidaciones históricas a los nuevos documentos;
en especial, no modifica liquidaciones pagadas ni periodos cerrados.

Cada asiento se conserva en `financial_postings` con `source_type`, `source_id`
y `posting_code`. Su índice único parcial evita que una misma fuente origine el
mismo hecho dos veces. Las correcciones se hacen con un asiento de reversa ligado
por `reversal_of_id`; nunca eliminando el original.

## Qué representa cada capa

- **P&L:** ingresos operativos, costo de ventas, costo de cortesías, pérdidas de
  inventario, gasto operativo y costo aprobado de personal.
- **Caja/tesorería:** se mantiene en `treasury_movements`; pagar una obligación
  no crea otra vez un gasto.
- **Inventario:** las recepciones, transferencias y mermas son documentos
  propios. `stock_movements` queda como consecuencia operacional.
- **Cuentas por cobrar/pagar:** crédito del empleado y compras a crédito crean
  activos/pasivos sin alterar ingresos ni gastos al momento del cobro/pago.
- **Aportes operativos:** se guardan por ítem de venta como métrica de cobertura;
  reducen base comisionable cuando aplique, pero no son un gasto P&L.

## Ventas, productos y cortesías

`sale_items` congela para las operaciones nuevas la línea de negocio, ámbito de
venta, costo aplicado, tipo de descuento, aporte operativo, valor comercial de
cortesía y costo real de cortesía. Para productos, el costo proviene de
`product_branch_inventory_costs` por sede y se mantiene como snapshot, por lo que
un cambio posterior del costo promedio no reescribe ventas antiguas.

Las categorías de productos usan `business_line`:
`barbershop_products`, `cafeteria_products` u `other`; los servicios se
clasifican como `services` en el momento de vender.

El catálogo conserva `visibility_scope`: `pos`, `internal` o `both`. Para un
cliente vinculado a empleado, el checkout resuelve el precio en servidor desde
`employee_supply_catalog_items`. El navegador no determina el precio empleado.
Un crédito de empleado crea una cuenta por cobrar y no entrada de caja; su
recuperación disminuye dicha cuenta, sin crear un segundo ingreso.

## Inventario y proveedores

- `inventory_receipts` e `inventory_receipt_lines` documentan compras.
- `receive_inventory_receipt` aumenta stock, calcula el costo promedio ponderado
  por producto/sede y crea una cuenta por pagar o salida de tesorería según el
  pago.
- `pay_accounts_payable` baja la obligación y registra solo la salida de dinero.
- `inventory_transfers` se despacha a estado `in_transit`; el destino incrementa
  stock únicamente al ejecutar `receive_inventory_transfer`.
- `inventory_losses` y `record_inventory_loss` registran merma por costo real y
  generan la pérdida P&L correspondiente.

## Personal, liquidaciones y periodos

La producción solo captura base y métricas. El costo oficial de personal nace
cuando una liquidación pasa a `approved`, y se fecha al cierre de su
`payroll_period`. Sus deudas, adelantos y consumos son recuperaciones, por lo que
no reducen el costo económico de personal. Si una liquidación aprobada se anula,
se agrega una reversa trazable. Pagarla únicamente mueve tesorería y cancela la
obligación.

`assert_financial_date_open` bloquea nuevos hechos con fecha dentro de un periodo
financiero cerrado. La corrección de un periodo cerrado debe ser una reversa o
ajuste en una fecha abierta, haciendo referencia al asiento original.

## Impuestos

Las nuevas ventas quedan preparadas para `tax_status` y `tax_rate`. La operación
actual usa `EXONERATED` y tasa `0`; se conserva `TAXED` para facturación futura,
sin implementar lógica SUNAT en esta fase.

## RPC principales

- `receive_inventory_receipt`
- `pay_accounts_payable`
- `dispatch_inventory_transfer`
- `receive_inventory_transfer`
- `record_inventory_loss`
- `reverse_financial_posting`
- `assert_financial_date_open`

La vista `vw_financial_phase0_summary` deja disponible el agregado de P&L,
activos y pasivos para el dashboard financiero posterior, sin mezclar aporte
operativo ni flujo de caja con resultado.
