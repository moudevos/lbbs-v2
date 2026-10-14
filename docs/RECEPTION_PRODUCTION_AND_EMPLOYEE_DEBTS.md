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

## Idempotencia en creación de deudas

Cada vez que se abre **Registrar deuda**, la interfaz genera un UUID de intención.
Ese UUID se conserva durante validaciones, errores de red y reintentos del mismo
formulario. Al confirmar, la base de datos guarda la intención junto con una huella
normalizada del payload y crea la deuda dentro de la misma transacción.

- Dos clics o dos solicitudes concurrentes con el mismo UUID devuelven la misma deuda;
  no generan un segundo cargo, desembolso, aplicación POS ni asiento financiero.
- Reutilizar una misma clave con datos distintos devuelve un conflicto explícito, para
  evitar asociar accidentalmente dos operaciones diferentes.
- Al cerrar el formulario o completar una creación exitosa, la siguiente operación recibe
  un UUID nuevo. Por eso dos adelantos legítimos con el mismo monto y descripción sí
  pueden registrarse como operaciones distintas.

La unicidad no se basa en monto, empleado ni descripción. La tabla interna
`employee_debt_creation_requests` solo puede ser escrita por la RPC canónica; no se
expone directamente al frontend.
