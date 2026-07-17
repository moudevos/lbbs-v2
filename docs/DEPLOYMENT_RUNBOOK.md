# Runbook de despliegue

1. Verificar rama aprobada, `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`.
2. Ejecutar SQL manual en orden de `README.md`, incluido `107_auth_password_security.sql`.
3. Configurar en Vercel únicamente las variables requeridas; `SUPABASE_SERVICE_ROLE_KEY` debe permanecer privada.
4. Configurar Site URL, Redirect URLs de `/auth/confirm`, SMTP y Storage en Supabase.
5. Desplegar en preview y ejecutar smoke tests con datos QA aislados.
6. Validar login, cambio de contraseña, recuperación, apertura POS, venta controlada, ticket, caja y finanzas.
7. Promover a producción solo con checklist de release aprobado.

## Estado QA Sprint 9

La validación de login, sesión, navegación owner, RLS anónimo de muestra y E2E crítico está documentada en `docs/qa`. Antes de promover, se deben ejecutar en un entorno aislado los flujos con escritura de POS, pagos, stock, caja, rewards, liquidaciones y finanzas, además de IDOR y roles restringidos. No sustituir esas pruebas con datos operativos reales.

## Rollback

- Revertir el deployment de Vercel al último build aprobado.
- No revertir datos mediante comandos destructivos.
- Si hubo SQL, aplicar únicamente un script de reversión revisado y respaldado.
- Abrir incidente, preservar evidencias y validar las operaciones críticas antes de reabrir el acceso.
