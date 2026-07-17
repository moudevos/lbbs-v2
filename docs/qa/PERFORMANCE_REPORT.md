# Reporte de rendimiento Sprint 9

## Cierre definitivo - 2026-07-16

La corrida visible `016` completo 18 escenarios en 7.0 min con `slowMo=600`. Las regresiones headless consecutivas `019` y `020` completaron 18 escenarios cada una en 6.4 y 7.3 min. Estas duraciones incluyen operaciones reales de QA y no son percentiles de produccion.

No hubo timeout de build ni procesos residuales. Decision vigente: **APTO PARA DESPLEGAR HOY**.

## Actualizacion vigente - 2026-07-16

No se genero una nueva medicion de rendimiento: `QA_RUN_20260716_014` quedo bloqueado antes de iniciar Playwright por el SQL manual pendiente `119_pos_session_legacy_negative_closure.sql`. La causa es integridad de Caja historica, no latencia, memoria ni disponibilidad del runtime.

La seccion siguiente conserva mediciones historicas; no debe interpretarse como certificacion de release vigente.

## Estado de rendimiento - Iteracion 11

- Run visible 007: 17/17 en 464 s con `slowMo=800`; no representa rendimiento de produccion.
- Headless 008: 17/17 en 332 s.
- Headless 009: 17/17 en 391.5 s.
- Integracion final: 8/8 en 141.8 s.
- Build final: 52.8 s, 79 rutas, sin timeout.
- Runtime limpio despues de cada ciclo: cero Node y cero listeners en 3100.

No se detecto una regresion de rendimiento bloqueante. El run 010 fallo por dependencia SQL ausente, no por tiempo o memoria.

## Iteracion 10

La corrida visible del run 002 duro 248.2 segundos con `slowMo=800`, por lo que no representa rendimiento real. El build genero 78 rutas sin timeout. No se calcularon p50/p95 ni perfiles SQL.

El recorrido se detuvo por QA-018 P1 antes de Caja, Cortesias, Rewards, Produccion, Simulaciones, Liquidaciones, Finanzas y conciliaciones. No se atribuye el bloqueo a rendimiento.

## Iteracion 06

La ejecucion visual uso slowMo de 800 ms para observacion, por lo que no representa una medicion de rendimiento. Las dos corridas headless posteriores completaron 14 pruebas seriales sin 5xx en el recorrido cubierto. Los percentiles de endpoints operativos permanecen pendientes.

## Iteracion 05

Dos ciclos de alta, cambio obligatorio, desactivacion y limpieza completaron sin respuestas 5xx. No se registraron percentiles ni perfiles SQL; estas mediciones siguen pendientes para los flujos de checkout, stock, caja y finanzas.

## Estado de medición

No se midieron endpoints autenticados: no hubo credenciales QA disponibles y no se ejecutaron consultas contra Supabase desde este Sprint.

## Objetivos de la próxima ejecución QA

Medir login, bootstrap POS, checkout, ticket, ventas recientes, reservas, caja, producción, liquidaciones y finanzas. Registrar endpoint, percentil, payload, número de consultas y rol/sede de prueba sin datos sensibles.

## Observaciones estáticas

- POS concentra cálculos de interfaz en utilidades puras ahora cubiertas por pruebas unitarias.
- Las operaciones críticas deben seguir validándose en servidor/Postgres; no se añadió optimistic update financiero.
- No se añadieron índices sin evidencia de una consulta lenta.

## Ejecución Iteración 03

- Smoke autenticado owner: módulos globales cargaron sin respuestas API 500; el recorrido completo tomó alrededor de un minuto por corrida.
- No se midieron percentiles ni consultas SQL porque no se realizaron escrituras ni se habilitó instrumentación de Supabase.
- No se encontraron fallos de disponibilidad durante las dos corridas E2E completas.
# Estado Iteracion 10

No se emite conclusion final de rendimiento mientras QA-018 impida completar la bateria y los ciclos headless.
# Medicion Iteracion 10 - 2026-07-16

No se inventaron percentiles. La corrida visible integral duro 342 s y reporto 15 pruebas correctas mas un fallo de bootstrap posteriormente corregido. La especificacion final de modulos tuvo ejecuciones visibles de 60.8 s y 65.5 s. La primera regresion headless emitio reporte en 402.2 s con 15 pruebas correctas y un fallo de asociacion del run.

El segundo ciclo headless agoto 1,207 s sin reporte y el build agoto 904 s antes de emitir salida. Esto se clasifica como bloqueo del runtime local, no como metrica de endpoint. Las duraciones por endpoint y percentiles quedan pendientes de una ejecucion estable.
