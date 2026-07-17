# Retencion de datos QA

## Registro de retencion - Iteracion 11

- Conservar indefinidamente 007, 008, 009 y 010 por formar parte de la decision de release.
- Conservar QA-024 y el borrador de liquidacion asociado al run 010 hasta verificar SQL 114.
- No cambiar 010 a passed despues de aplicar el SQL; crear dos runs nuevos.
- Mantener los maestros persistentes y generar solo transacciones nuevas.

## Politica

- Conservar todos los runs asociados a defectos P0 o P1.
- Conservar indefinidamente los runs usados para una decision de release.
- Conservar los demas runs por un minimo de 90 dias.
- No eliminar automaticamente runs, escenarios, findings ni entidades registradas.
- No eliminar evidencia vinculada a una certificacion o incidente.
- Archivar mediante `status` y `lifecycle_status`; no usar `TRUNCATE` ni borrado masivo.

## Cierre de una corrida

Se conservan sedes, usuarios QA, barberos, catalogos, clientes, reservas, ventas, pagos, tickets, movimientos de stock, sesiones, cierres, produccion, simulaciones, liquidaciones, finanzas y auditoria.

Se eliminan solo storage states, cookies locales, contrasenas efimeras en memoria, videos sin fallos, traces sin fallos, servidores y workers. Estados incompletos se cierran o archivan de forma controlada sin borrar la evidencia.

## Eliminacion futura

Cualquier eliminacion futura requiere aprobacion humana, seleccion explicita por `run_code`, verificacion de dependencias y respaldo de evidencia de release. Esta politica se documenta en Iteracion 10, pero no se ejecuta todavia.
# Evidencia conservada del primer run

`QA_RUN_20260716_001` conserva clientes, reservas, sesiones POS, ventas, items, pagos, tickets, movimientos de stock y hallazgos. El run esta `blocked`, no `running`. No ejecutar limpieza destructiva; cerrar o anular entidades mediante flujos operativos.
