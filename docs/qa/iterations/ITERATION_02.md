# Iteración 02

## Precondiciones verificadas

- `playwright.config.ts` carga `.env.local` con `loadEnvConfig(process.cwd())`.
- `QA_EMAIL`, `QA_PASSWORD` y `QA_BASE_URL` estuvieron presentes.
- No se imprimieron valores de credenciales.

## Pruebas ejecutadas

- E2E público: login, recuperación inválida y redirect sin sesión.
- Login autenticado mediante Playwright.
- Autenticación directa contra Supabase usando las variables cargadas, con salida limitada a estado y código de error.

## Defecto

| ID | Módulo | Severidad | Resultado | Causa raíz | Estado |
| --- | --- | --- | --- | --- | --- |
| QA-004 | Credenciales QA | P1 | Login bloqueado | Supabase respondió `invalid_credentials` con estado 400 | Bloqueado externo |

## Evidencia segura

- Las variables están presentes.
- La autenticación directa no creó sesión y devolvió únicamente `AuthApiError`, estado `400` y código `invalid_credentials`.
- Las capturas y traces de fallo se eliminaron para evitar conservar campos de login.

## Acciones no ejecutadas

No se ejecutaron RLS/IDOR, módulos autenticados, POS, pagos, stock, caja, rewards, reservas, producción, liquidaciones, finanzas ni concurrencia. Ejecutarlos sin una sesión QA válida no produciría evidencia útil y no se intentaron escrituras.

## Reanudación

Corregir o rotar la contraseña de la cuenta QA en Supabase, actualizar `.env.local` fuera del repositorio y reejecutar `npm run test:e2e`.
