# Sprint 8.8 - Orden SQL manual

Ejecutar en Supabase SQL Editor, en este orden:

1. `086_payroll_periods.sql`
2. `087_employee_production.sql`
3. `088_employee_bonus_rules.sql`
4. `089_employee_accounts.sql`
5. `090_employee_benefits.sql`
6. `091_employee_settlements.sql`
7. `092_employee_compensation_functions.sql`
8. `093_employee_compensation_rls.sql`

Requisitos previos: scripts base hasta `085_pos_session_history_and_closure.sql`.

Los scripts crean tablas complementarias y no eliminan ventas, empleados, productos,
stock, pagos ni rewards. Las liquidaciones pagadas se conservan mediante snapshots.

