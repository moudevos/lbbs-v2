# Fase 3A.1 — QA manual del outbox Wallet

Estos archivos son diagnósticos de solo lectura. Ejecútalos manualmente en el
Supabase SQL Editor del ambiente **DEVELOPMENT**, nunca en producción, y comparte
el resultado completo de cada consulta.

Orden sugerido:

1. `001_wallet_outbox_schema_check.sql`
2. `002_wallet_functions_check.sql`
3. `003_wallet_triggers_check.sql`
4. `004_wallet_rls_policies_check.sql`
5. `005_wallet_outbox_stats.sql`

Después de que revises y ejecutes la migración de Fase 3A.2, ejecuta además:

6. `006_wallet_outbox_resilience_schema_check.sql`
7. `007_wallet_outbox_claim_check.sql`
8. `008_wallet_outbox_retry_state_check.sql`

No ejecutes ninguna otra sentencia junto con estos diagnósticos. Ningún archivo
llama RPCs de negocio ni cambia datos.
