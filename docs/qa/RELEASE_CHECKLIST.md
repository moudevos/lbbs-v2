# Checklist de release

## Cierre definitivo - 2026-07-16

- [x] SQL 119 aplicado y verificado con cierre legado auditado.
- [x] QA-024, QA-025, QA-026, QA-027, QA-028 y QA-029 en `verified`.
- [x] Run visible `QA_RUN_20260716_016` passed.
- [x] Runs headless consecutivos `QA_RUN_20260716_019` y `QA_RUN_20260716_020` passed.
- [x] Lint, typecheck, unitarios, integracion, E2E y build correctos.

Decision vigente: **APTO PARA DESPLEGAR HOY**. La seccion siguiente es historial de bloqueos resueltos.

## Actualizacion vigente - bloqueo SQL 119

- [ ] Ejecutar `src/sql/119_pos_session_legacy_negative_closure.sql` en Supabase SQL Editor. El marcador remoto no aparecio tras 12 consultas en 60 segundos.
- [x] Cerrar `QA_RUN_20260716_014` como `blocked`; no se modificaron los runs historicos `012` y `013`.
- [ ] Repetir una corrida visible y dos regresiones headless con los siguientes codigos libres, solo despues de detectar SQL 119.
- [ ] Verificar funcionalmente SQL 116, SQL 117 y SQL 118 con el egreso real de liquidacion.
- [ ] Cerrar QA-024, QA-025, QA-026, QA-027, QA-028 y QA-029 con conciliaciones correctas.

Decision vigente: **NO APTO PARA PRODUCCION**. La seccion siguiente conserva la evidencia historica anterior.

## Estado vigente de release - Iteracion 11

| Categoria | Estado | Evidencia |
| --- | --- | --- |
| Runtime y build | Correcto | lint/typecheck/unit/integration/build con exit 0 |
| Run visible | Correcto | 007, 17/17 |
| Dos headless trazables | Correcto para matriz previa | 008 y 009, 17/17; IDs distintos y runs cerrados |
| Liquidaciones completas | Bloqueado | QA-025, QA-026, QA-027 y QA-028 P1; SQL 115/117 detectados y SQL 118 pendiente en Supabase |
| Decision de release | No apto | Existe un P1 financiero y el E2E ampliado 011 fallo |

- [x] Detectar `src/sql/115_settlement_cash_availability.sql` en remoto.
- [ ] Verificar funcionalmente `src/sql/116_settlement_cash_movement_rls.sql` con el egreso real del run nuevo.
- [x] Detectar `src/sql/117_settlement_finance_ledger.sql` en remoto.
- [ ] Ejecutar `src/sql/118_settlement_paid_transition_guard.sql`.
- [ ] Repetir un ciclo visible y dos ciclos headless con run codes nuevos.
- [ ] Verificar QA-024, QA-025, QA-026, QA-027 y QA-028 y confirmar cero P0/P1.

## Actualizacion Iteracion 10

| Categoria | Estado | Evidencia |
| --- | --- | --- |
| Laboratorio QA persistente | Preparado, no desplegado | SQL 110 y helpers servidor creados |
| Seguridad del laboratorio | Revision estatica correcta | RLS, grants minimos y vistas `security_invoker` |
| Retencion | Documentada | Conservacion minima de 90 dias y archivo no destructivo |
| Bateria integral | Bloqueada | Requiere aplicar manualmente SQL 110 |
| Decision de release | No apto | Modulos criticos y RLS/IDOR aun no certificados |

## Actualizacion Iteracion 06

| Categoria | Estado | Evidencia |
| --- | --- | --- |
| Modo visual QA | Parcial | Chromium visible 4/4 para preparacion y roles |
| Regresion headless | Correcto | Dos ciclos consecutivos de 14/14 |
| Flujos operativos | Pendiente | POS, pagos, stock, caja, reservas, rewards, produccion y finanzas sin ejecucion real |

## Actualizacion Iteracion 05

| Categoria | Estado | Evidencia |
| --- | --- | --- |
| Acceso de empleados | Parcial | Dos ciclos E2E de owner/admin/reception/barberos y limpieza correctos |
| Roles barber/viewer | Corregido | QA-006 bloqueado en cliente y servidor antes de Auth |
| Bloqueo por desactivacion | Parcial | Admin y reception recibieron `403` en mutaciones protegidas |
| RLS/IDOR por sede | Pendiente | Falta matriz completa entre SED-001 y SED-002 |
| Flujos transaccionales | Pendiente | POS, pagos, stock, caja, rewards, reservas y finanzas sin ejecucion de escritura QA |

| Categoría | Estado | Evidencia | Observación |
| --- | --- | --- | --- |
| SQL | Pendiente | `src/sql/001` a `107` | Ejecutar y validar orden en QA/producción |
| Auth y contraseñas | Parcial | Login QA, sesión y recuperación genérica E2E correctos | Falta enlace real y cambio obligatorio controlado |
| RLS y roles | Parcial | Owner global y muestra RLS anon correctos | Faltan roles restringidos, branch scope e IDOR |
| POS, pagos y tickets | Parcial | POS independiente y validación de payload E2E correctos | Falta checkout real, pagos y tickets |
| Stock y caja | Pendiente | SQL QA creado | Falta conciliación contra QA |
| Rewards y cortesías | Parcial | unitarios de reward/cortesía | Falta flujo E2E |
| Producción, liquidaciones y finanzas | Pendiente | SQL QA creado | Falta datos QA y conciliación |
| Responsive y accesibilidad | Pendiente | configuración E2E | Chromium no instalado |
| Secretos | Parcial | búsqueda estática | Revisar historial y Vercel manualmente |
| Backup, despliegue y rollback | Pendiente | runbooks creados | Requiere responsable de infraestructura |
| Build, lint y typecheck | Parcial | build y typecheck correctos | Lint sin errores, con cinco warnings heredados |

Las operaciones de QA con escritura están bloqueadas mientras `QA_ALLOW_WRITES` y `QA_RESET_CONFIRMED` no se activen en el entorno local.
# Bloqueos Iteracion 10

- [x] SQL 110 desplegado y laboratorio persistente operativo.
- [x] Run `QA_RUN_20260716_001` cerrado, no queda `running`.
- [x] SQL 111 aplicado; `DELETE` autenticado rechazado con `42501`.
- [x] QA-017 reclasificado como regla de negocio; SQL 112 descartado y eliminado.
- [x] Run visible `QA_RUN_20260716_002` cerrado `blocked`.
- [ ] Resolver QA-018 P1: restaurar lectura global de clientes para reception.
- [ ] Completar dominios restantes y dos ciclos headless.
- [ ] Declarar APTO solo despues de conciliaciones y cero P0/P1.
# Estado de release Iteracion 10 - 2026-07-16

- [x] QA-018 corregido y verificado.
- [x] Cero P0/P1 abiertos.
- [x] Clientes globales y RLS/IDOR transaccional verificados.
- [x] Pagos, vuelto, idempotencia, stock, anulacion y snapshots conciliados.
- [x] Run visible persistente cerrado.
- [ ] Dos ciclos headless trazables cerrados correctamente.
- [ ] Persistencia operativa de simulaciones.
- [ ] Seeds base de Caja y Finanzas reflejados en el entorno.
- [ ] Build final correcto en un runtime local estable.
- [ ] Lint, typecheck final, unitarios e integracion reejecutados despues de los ultimos cambios del arnes.

`git diff --check` fue correcto. El typecheck intermedio paso; la validacion final de npm quedo bloqueada antes de emitir salida. No hay procesos Node ni servidor en 3100 al cierre.

Decision: **NO APTO PARA PRODUCCION**.
