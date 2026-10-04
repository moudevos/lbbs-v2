# Fase 5 — nómina devengada

## Modelo económico

La producción, el costo laboral, la liquidación y el pago son eventos distintos.

| Evento | Costo laboral | Liquidación | Tesorería | P&L |
| --- | --- | --- | --- | --- |
| Producción con comisión | Base × tasa congelada | Aún no creada | 0 | Reconoce el costo devengado |
| Empleado fijo | Fijo proporcional para análisis / fijo completo al liquidar período | Aún no creada | 0 | Reconoce el costo devengado |
| Bono de producto | Valor del bono activo | Aún no creada | 0 | Reconoce una sola vez |
| Preparar liquidación | No se duplica | Congela líneas y cabecera | 0 | Sin efecto adicional |
| Recuperar deuda | No reduce el costo | Reduce neto a pagar | Solo cuando se paga | No es gasto nuevo |
| Pagar liquidación | Sin cambio | Parcial o pagada | Salida por el neto pagado | Sin efecto adicional |

## Vigencias y snapshots

- `employee_compensation_terms` conserva una modalidad efectiva por empleado y no permite rangos superpuestos.
- Crear una condición posterior cierra explícitamente la anterior el día previo; nunca edita el histórico.
- Producción nueva guarda modalidad, tasa, fijo y término. Las filas anteriores quedan legacy: no hay backfill automático.
- Una liquidación nueva conserva sus valores propios; un cambio de término posterior no la recalcula.

## Modalidades soportadas

- `commission`: tasa sobre base comisionable.
- `commission_plus_bonus`: comisión más bonos activos.
- `fixed`: fijo por período de nómina.
- `fixed_plus_bonus`: fijo más bonos activos.

Rewards y cortesías siguen la regla snapshot existente: fijo se paga como fijo; porcentual usa la base comisionable y la tasa congelada.

## Estado de confiabilidad

- Producción sin liquidar pero con snapshot: costo conocido; se informa como pendiente de liquidar y no vuelve provisional la utilidad por sí sola.
- Producción con base pero sin snapshot/tasa: `UNRESOLVED_COMPENSATION_RATE`; requiere resolución administrativa antes de cerrar nómina.
- El pago pendiente no vuelve desconocido el costo; representa una cuenta por pagar, no un gasto adicional.

## Cutover legacy

Si no existe término ni snapshot, la preparación permanece en ruta legacy y exige un porcentaje administrativo explícito. No se asume 50 % ni otra tasa. Las liquidaciones pagadas y snapshots financieros cerrados no se modifican.

## Aplicación local

Antes de probar contra una base no productiva, ejecutar manualmente `src/sql/174_employee_compensation_accruals.sql` después de 173. Esta fase no aplica ninguna migración automáticamente.
