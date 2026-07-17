# Sprint 9: baseline y congelamiento

- Fecha: 2026-07-15.
- Rama: `main`.
- Commit base: `a585a22`.
- Node: `v24.11.1`.
- npm: `11.7.0`.
- URL QA local prevista: `http://127.0.0.1:3100`.
- Proyecto Supabase: configurado en `.env.local`; host no expuesto en este informe.
- Entorno de ejecución: local. No se ejecutó SQL ni operación destructiva.

## Herramientas y scripts

- Existentes: `dev`, `build`, `start`, `lint`.
- Agregados para QA: `typecheck`, `test`, `test:watch`, `test:e2e`.
- Dependencias QA: Vitest y Playwright.
- No existía framework de pruebas antes de este Sprint.

## Resultado inicial

- `npm run lint`: sin errores; cinco warnings preexistentes en Ventas y reglas de compensación.
- `npm run typecheck`: pendiente de ejecutar tras incorporar la suite.
- `npm run test`: no existía antes de este Sprint.
- `npm run build`: correcto antes de la suite de QA.
- Rutas: inventariadas en `QA_SYSTEM_INVENTORY.md`.

## Riesgos y bloqueos

- El proceso no recibió `QA_EMAIL` ni `QA_PASSWORD`; no se ejecutó login ni pruebas autenticadas.
- Sin credenciales de roles alternos no puede confirmarse RLS ni matriz de roles contra Supabase.
- Los scripts `107_auth_password_security.sql` y sus predecesores deben estar ejecutados antes de pruebas de Auth en entorno QA.
- Las consultas de conciliación son manuales, de solo lectura y no fueron ejecutadas contra Supabase.
