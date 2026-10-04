# QA automática final — Fase 1A + 1B

Fecha: 2026-09-29

## Inspección

Playwright `@playwright/test` y Chromium ya están presentes. Existe configuración
E2E con servidor automático y suites históricas, pero no una matriz aislada de
aceptación para 1A/1B ni un guard que pruebe explícitamente entorno no productivo,
proyecto Supabase permitido y consentimiento de mutaciones.

Se añadió infraestructura exclusiva de test: `playwright.phase-1a-1b.config.ts`,
`scripts/qa-phase-1a-1b-safety.mjs` y el script `test:e2e:acceptance`. El guard
requiere `QA_ALLOW_MUTATIONS=true`, `QA_ENVIRONMENT` en `development`, `test` o
`staging`, `QA_SAFE_SUPABASE_PROJECT_REF` coincidente y base URL localhost.

## Resultado

| ID           | Caso                    | Resultado | Esperado                        | Obtenido                                                             | Evidencia                   | Bloqueante | Notas                                                 |
| ------------ | ----------------------- | --------- | ------------------------------- | -------------------------------------------------------------------- | --------------------------- | ---------- | ----------------------------------------------------- |
| PRE-01       | Typecheck               | PASS      | Sin errores TS                  | PASS                                                                 | `npm run typecheck`         | No         | Ejecutado antes de E2E.                               |
| PRE-02       | Unit/contract           | PASS      | Suite verde                     | 214/214 PASS                                                         | `npm test`                  | No         | No sustituye E2E.                                     |
| PRE-03       | Build                   | PASS      | Build de producción             | PASS                                                                 | `npm run build`             | No         | Compilación completada.                               |
| ENV-01       | Guard mutable           | BLOCKED   | Entorno explícitamente seguro   | Falta consentimiento/identificador seguro exigido por el nuevo guard | `qa-phase-1a-1b-safety.mjs` | Sí         | No se realizaron escrituras E2E.                      |
| 1A-01..1A-20 | Liquidaciones           | BLOCKED   | Matriz UI → API → RPC → DB → UI | No ejecutada                                                         | ENV-01                      | Sí         | Evita crear datos económicos fuera de entorno seguro. |
| 1B-01..1B-24 | Deudas/CxP/POS employee | BLOCKED   | Matriz UI → API → RPC → DB → UI | No ejecutada                                                         | ENV-01                      | Sí         | Evita datos QA en proyecto no verificado.             |
| CASH-01..03  | Reconciliación caja     | BLOCKED   | Movimientos conciliados         | No ejecutada                                                         | ENV-01                      | Sí         | Requiere POS y datos QA aislados.                     |
| HIST-01..06  | Inmutabilidad histórica | BLOCKED   | Históricos inmutables           | No ejecutada                                                         | ENV-01                      | Sí         | Requiere fixture económico canónico.                  |

## Cierre

Fase 0: no declarada en esta ejecución.

Fase 1A: no cerrada — E2E crítica bloqueada por seguridad de entorno.

Fase 1B: no cerrada — E2E crítica bloqueada por seguridad de entorno.

Datos QA creados: ninguno. No se ejecutó SQL remoto, migraciones, resets ni E2E mutable.

