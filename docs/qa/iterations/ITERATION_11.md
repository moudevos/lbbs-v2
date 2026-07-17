# Iteracion 11 - cierre condicionado del Sprint 9

## Cierre definitivo - 2026-07-16

**APTO PARA DESPLEGAR HOY.** SQL 119 se aplico y se verifico funcionalmente sobre la sesion heredada `0e917327-ee72-4806-b341-35f5ae1dd69b`: el importe original `-590` quedo en `legacy_expected_amount`, el efectivo operativo final quedo en cero y el cierre conserva usuario, fecha, motivo y evento auditado.

`QA_RUN_20260716_016` aprobo la corrida visible en Chromium (18/18, 7.0 min). `QA_RUN_20260716_019` y `QA_RUN_20260716_020` aprobaron dos regresiones headless consecutivas (18/18 cada una). QA-024, QA-025, QA-026, QA-027, QA-028 y QA-029 estan `verified`; P0 abiertos: 0, P1 abiertos: 0, P2 abiertos: 0, P3 abiertos: 0.

Validacion final: lint exit 0 con cinco warnings heredados, typecheck exit 0, unitarios 26/26, integracion 8/8, E2E 18/18 y build exit 0 con 79 rutas. Los runs 012, 013, 014, 015 y 018 permanecen como evidencia historica cerrada; no invalidan las dos regresiones finales consecutivas.

La seccion siguiente conserva el historial de estabilizacion.

## Actualizacion vigente - bloqueo externo de SQL 119

Estado al 2026-07-16: **NO APTO PARA PRODUCCION**. Los runs `QA_RUN_20260716_012` y `QA_RUN_20260716_013` son historicos `failed` por fixtures de sesiones POS pendientes; no fueron modificados. El siguiente correlativo, `QA_RUN_20260716_014`, se cerro `blocked` antes de ejecutar la bateria porque una sesion historica con efectivo esperado negativo no puede cerrarse con la funcion remota actual.

El unico parche pendiente es `src/sql/119_pos_session_legacy_negative_closure.sql`. Se consulto su marcador remoto 12 veces durante 60 segundos y no fue detectado. El parche conserva el importe heredado en `legacy_expected_amount`, lo deja visible en auditoria y mantiene el efectivo operativo de la sesion cerrada en un valor no negativo. No se inicio la Iteracion 12 ni se alteraron runs historicos.

SQL 118 fue indicado como aplicado, pero su marcador no estuvo disponible y su validacion funcional permanece pendiente de la bateria nueva. QA-024 a QA-029 siguen abiertos o en progreso; no hay P0 abiertos y hay 6 P1 sin verificar.

La seccion siguiente es evidencia historica previa a este bloqueo.

Fecha: 2026-07-16.

## Resultado

**NO APTO PARA PRODUCCION.** La infraestructura QA, el runtime local y la asociacion de evidencia quedaron corregidos. SQL 114, SQL 115 y SQL 117 fueron detectados en remoto. Antes del nuevo run visible se detectaron QA-026 P1 (RLS de Caja), QA-027 P1 (trazabilidad financiera) y QA-028 P1 (anulacion directa de liquidacion pagada).

El parche obligatorio es `src/sql/118_settlement_paid_transition_guard.sql`. Debe ejecutarse manualmente desde Supabase SQL Editor antes de reanudar la bateria. SQL 116 se validara funcionalmente con el egreso del run nuevo. No se inicia una Iteracion 12: la correccion y su revalidacion pertenecen a esta misma Iteracion 11.

## Runs

| Run | Modo | Resultado | Evidencia |
| --- | --- | --- | --- |
| `QA_RUN_20260716_007` | Chromium visible, 1440x900, worker 1, slowMo 800 | `passed`, 17/17 | Matriz vigente antes de ampliar Liquidaciones |
| `QA_RUN_20260716_008` | Headless | `passed`, 17/17 | 26 escenarios y 72 entidades asociadas |
| `QA_RUN_20260716_009` | Headless | `passed`, 17/17 | 26 escenarios y 72 entidades asociadas |
| `QA_RUN_20260716_010` | Headless ampliado | `failed`, 14 passed, 1 failed, 2 no ejecutadas | `SETTLEMENT-001` bloqueado por `PGRST202`; run cerrado correctamente |
| `QA_RUN_20260716_011` | Chromium visible, 1440x900, worker 1, slowMo 800 | `failed`, 14 passed, 1 failed | SQL 114 verificado en flujo; QA-025 detectado al conciliar el pago en efectivo de S/990 |

Los runs `008` y `009` prueban que el runtime y la trazabilidad son repetibles. No certifican el nuevo ciclo completo de Liquidaciones porque esa prueba se agrego despues; por eso la decision final usa el resultado de `010`.

## Correcciones aplicadas

- Servidor QA determinista en `scripts/qa-server.mjs`, con PID, puerto exclusivo, readiness `/api/health`, cierre de hijos y limpieza del estado runtime.
- Build encapsulado en `scripts/qa-build.mjs`, con logs por etapa y limite de memoria estable.
- `global-setup.ts` crea o reutiliza un solo run por `QA_RUN_CODE`; el reporter cierra exactamente el mismo run aun ante fallos.
- `playwright.config.ts` carga `.env.local`, usa un worker, no reutiliza listeners ajenos y conserva evidencia por run.
- QA-020 aceptado: Simulaciones es un calculo temporal por contrato; la UI no promete persistencia y el calculo tiene unitarios.
- QA-021 verificado: Caja restaura solo categorias base ausentes y evita escrituras repetidas.
- QA-022 verificado: Finanzas restaura solo categorias base ausentes y evita escrituras repetidas.
- QA-023 verificado: el script E2E selecciona solo la bateria persistente vigente.
- Cortesias valida regla, sede, vigencia, servicio calificador individual, beneficio, maximos, stock, reward y motivo antes de cerrar la venta.
- Caja valida cierre exacto, diferencias por metodo `+10/-10`, neto cero, observacion y retry rechazado.
- Liquidaciones incorpora la prueba completa borrador, edicion, revision, aprobacion, pago concurrente, retry e inmutabilidad; queda bloqueada por SQL remoto ausente.

## Hallazgos

| Codigo | Severidad | Estado | Causa y resultado |
| --- | --- | --- | --- |
| QA-020 | P2 | accepted | La persistencia no pertenece al contrato aprobado de Simulaciones; UI y unitarios alineados |
| QA-021 | P2 | verified | Seeds de Caja incompletos en remoto; restauracion idempotente verificada |
| QA-022 | P2 | verified | Seeds de Finanzas incompletos en remoto; restauracion idempotente verificada |
| QA-023 | P2 | verified | Patron E2E demasiado amplio incluia pruebas historicas; selector corregido |
| QA-024 | P1 | in_progress | SQL 114 respondio y la revision concurrente fue ejercida; falta la repeticion integral posterior a QA-025 |
| QA-025 | P1 | open | SQL 115 fue detectado en remoto; falta verificar rechazo sin fondos, pago y cierre dentro de un nuevo ciclo completo |
| QA-026 | P1 | open | La politica de Caja expone el egreso de liquidacion a reception de la misma sede; SQL 116 pendiente |
| QA-027 | P1 | open | El pago no deja un egreso financiero con origen enlazado; SQL 117 pendiente |
| QA-028 | P1 | open | Una liquidacion pagada puede anularse directamente; SQL 118 pendiente |

P0 abiertos: 0. P1 abiertos: 1. P2 abiertos: 0. P3 abiertos: 0.

## Validacion tecnica final

| Comando | Resultado | Duracion |
| --- | --- | --- |
| `npm run lint` | exit 0, cero errores y cinco warnings heredados | 30.3 s |
| `npm run typecheck` | exit 0 | 5.2 s |
| `npm run test` | 26/26 | 3.2 s |
| `npm run test:integration` | 8/8 | 141.8 s |
| `npm run test:e2e` con run 010 | exit 1 por QA-024 | 344.7 s |
| `npm run build` | exit 0, 79 rutas | 52.8 s |

## Accion manual exacta

1. Abrir Supabase SQL Editor para el proyecto QA.
2. Ejecutar completo `src/sql/118_settlement_paid_transition_guard.sql`.
3. Confirmar que devuelve la firma de `transition_employee_settlement(uuid,text,text)`, `security_definer=true` y `authenticated_can_execute=true`.
4. Ejecutar un nuevo run visible y dos headless con codigos no reutilizados.
5. Confirmar rechazo controlado sin fondos, pago unico con fondo suficiente, cierre conciliable, RLS de reception, egreso financiero enlazado, `SETTLEMENT-001` en passed y cero P0/P1 abiertos.

## Seguridad y retencion

No se imprimieron credenciales, tokens ni cookies. `QA_EMAIL` y `QA_PASSWORD` solo se comprobaron como booleanos. El OWNER no fue editado. Los maestros y transacciones QA se conservaron; no hubo limpieza destructiva. Al cierre no quedo proceso Node, listener en `3100` ni `.qa/server.json`.
