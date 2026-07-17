# Iteracion 10

## Cierre del 16 de julio de 2026

- `QA_RUN_20260716_001`: `blocked` historico, sin cambios.
- `QA_RUN_20260716_002`: `blocked` historico, sin cambios.
- `QA_RUN_20260716_003`: `passed_with_observations`; 24 escenarios aprobados, 99 entidades registradas y cero escenarios fallidos.
- `QA_RUN_20260716_004`: `blocked`; la salida funcional tuvo 15 pruebas correctas, pero bootstrap fallo antes de asociar la evidencia al run.
- `QA_RUN_20260716_005`: `blocked`; 10 escenarios aprobados y uno bloqueado porque el runtime local no volvio a iniciar `next start` y `npm run build` agoto el timeout.

QA-018 quedo `verified`: reception activa consulta clientes globales, abre/edita detalle y usa el cliente en reserva y POS de su sede. El aislamiento por sede se comprobo para reservas, sesiones POS, ventas, items, pagos, snapshots y caja. QA-017 permanece `accepted` como regla de negocio confirmada.

Hallazgos abiertos: QA-020, QA-021 y QA-022, todos P2. No hay P0/P1 abiertos. La recomendacion final es **NO APTO PARA PRODUCCION** porque no se completaron dos ciclos headless trazables ni el build final.

## Runs

- `QA_RUN_20260716_001`: historico `blocked`; no se modifico.
- `QA_RUN_20260716_002`: certificacion visible, cerrada `blocked` por QA-018 P1.
- Runs 003 y 004: no iniciados porque el criterio de detencion exige resolver primero el P1 manual.

## Regla confirmada

Los clientes activos son globales para owner, admin y reception. La sede limita reservas, POS, ventas, pagos, stock, caja, tickets, produccion, liquidaciones y finanzas.

QA-017 fue reclasificado como `NOT_A_BUG / BUSINESS_RULE_CONFIRMED`. El esquema del laboratorio no admite ese status literal ni severidad nula, por lo que la fila se conserva como `accepted`, P3, con la resolucion real en metadata. No cuenta como P1 abierto.

SQL 112 fue eliminado del directorio ejecutable y no debe aplicarse. No se creo SQL 113 ni otro reemplazo.

## Ejecucion visible

Chromium se abrio en modo visible con viewport 1440x900, un worker y slow motion de 800 ms. La ventana permanecio activa durante 248.2 segundos.

Resultado:

- 10 pruebas descubiertas;
- 5 correctas;
- 1 fallida;
- 4 no ejecutadas por dependencia serial;
- build previo correcto con 78 rutas.

Pasaron bootstrap del run, reclasificacion QA-017, verificacion SQL 111, flujo integral previo y reutilizacion de maestros. El flujo integral cubrio reservas, POS, pagos, vuelto, idempotencia, ultima unidad y anulacion.

## Bloqueo QA-018

Owner y admin encontraron el cliente global creado por el run. Reception autenticada obtuvo cero filas. La consulta remota confirmo que existe `can_access_customer(uuid)`, pero `customers.created_branch_id` no existe. El entorno conserva una version parcial o anterior del guard RLS que contradice la regla global.

QA-018 se registro P1 abierto. Requiere retirar manualmente el guard de SELECT por sede y restaurar lectura global de clientes activos para reception. No se preparo ni aplico SQL automatico.

## SQL 111

SQL 111 esta aplicado. Un DELETE autenticado contra UUID inexistente fue rechazado con `42501`; no se elimino evidencia.

## Estado

**NO APTO PARA PRODUCCION**.

No se ejecutaron Caja completa, Cortesias, Rewards, Produccion, Simulaciones, Liquidaciones, Finanzas, conciliaciones ni los dos ciclos headless porque QA-018 cumple el criterio explicito de detencion por P1 que necesita SQL manual.
