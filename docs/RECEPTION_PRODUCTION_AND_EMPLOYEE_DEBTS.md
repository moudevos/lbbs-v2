# Recepción: producción y deudas de empleados

## Alcance

Después de aplicar `138_reception_production_and_employee_debts.sql`, recepción puede:

- Consultar Producción únicamente para su sede asignada.
- Consultar las deudas y movimientos de empleados de su sede.
- Registrar deudas manuales de tipo préstamo, adelanto, insumo u otro para empleados activos de su sede.

No puede generar producción, liquidar, cobrar, editar, anular deudas ni crear crédito POS manualmente.

## Aplicación en una base existente

Ejecuta `src/sql/138_reception_production_and_employee_debts.sql` en el SQL Editor de Supabase y espera la recarga del esquema de PostgREST. Luego despliega la aplicación que contiene este cambio.

La restricción se aplica tanto en la interfaz como en las API y RLS. Una cuenta de recepción sin sede asignada recibirá un error y no podrá consultar ni registrar deudas.
