# Acceptance Phase 1A + 1B

The mutable acceptance matrix is intentionally gated by
`scripts/qa-phase-1a-1b-safety.mjs`. It may run only with explicit mutation
consent, an approved non-production environment, a matching Supabase project
reference, and a local Playwright base URL. This directory remains empty until
those prerequisites and isolated QA credentials/fixtures are available.

Do not point this configuration at production or reuse non-QA economic data.
