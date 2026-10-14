# Operación dominical retroactiva

Una jornada dominical representa una operación real de domingo ingresada después
por recepción o administración. `business_date` es el domingo operativo;
`created_at` conserva la fecha/hora real de digitación.

## Flujo

1. Abrir una jornada por sede y domingo no futuro, con monto inicial y nota.
2. Registrar ventas en `sunday_sales`, usando precios efectivos de sede,
   inventario, cortesías y medios de pago normales (nunca `internal_credit`).
3. Calcular el pago individual de cada barbero entre 50 % y 65 % de la base
   dominical de sus servicios. Productos no generan pago al barbero.
4. Registrar el pago y cerrar. Una jornada cerrada es solo lectura.

## Aislamiento

Las operaciones dominicales no crean `sales`, `sale_items`, `pos_sessions`,
`employee_service_production`, bonos ni `employee_settlements`. Solo usan sus
propias tablas y, cuando corresponde, crean movimientos de inventario con
`reference_type = 'sunday_sale'` y entradas de acumulación de Rewards con
`sunday_sale_id`.

## Seguridad e integridad

- El servidor vuelve a resolver `vw_services_effective_prices.final_price` y
  `vw_product_stock.final_sale_price`; nunca acepta un precio del navegador.
- El RPC revisa stock dentro de la transacción. Las salidas `sale/courtesy`
  usan cantidades positivas; la función canónica calcula el signo.
- Cada registro requiere una clave de idempotencia. Repetir la misma clave y
  payload devuelve la venta existente; una clave con contenido distinto falla.
- Solo se acumulan Rewards. No existe parámetro ni camino de canje.
- Anular requiere motivo, bloquea si el pago del barbero ya está hecho, genera
  un `adjustment` positivo de inventario y agrega reversas auditables de Rewards.

## Despliegue

Aplicar la migración incremental
`20261013001908_redesign_retroactive_sunday_operations.sql` en el pipeline
habitual. No editar las migraciones históricas 164/165 y no ejecutar SQL manual
contra producción fuera de dicho pipeline.
