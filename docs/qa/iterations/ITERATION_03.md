# Iteración 03

## Autenticación y sesión

- Validación directa de Supabase Auth: correcta, con usuario y sesión disponibles.
- Login Playwright: correcto.
- Rol detectado: `owner`.
- Sede: sin sede asignada; el alcance del owner se verificó como global en navegación.
- Sesión: persiste tras recarga y en una segunda pestaña.
- Cambio obligatorio: no activo para esta cuenta.

## Pruebas verificadas

- Ocho E2E correctas en dos corridas consecutivas.
- Recuperación con respuesta genérica y enlace inválido controlado.
- Todos los módulos permitidos para owner: sin 404, 500 ni overlay de Next durante el smoke.
- POS independiente: responde y no hereda el panel de control.
- Payloads inválidos: checkout incompleto, cambio de contraseña inválido e ID de venta inválido se rechazan sin 500 ni escritura.
- RLS anónimo: no se observaron filas visibles de tablas sensibles que tienen datos para owner.

## Defecto corregido

| ID | Severidad | Módulo | Causa raíz | Solución | Regresión |
| --- | --- | --- | --- | --- | --- |
| QA-005 | P2 | Detalle de ventas | UUID inválido llegaba a Postgres y generaba log técnico | Validación local antes de consultar | Payload E2E correcto; dos corridas E2E completas correctas |

## Límites de cobertura

- No se crearon datos `QA_TEST_DATA`: no se confirmó que el proyecto Supabase sea aislado de producción.
- No se ejecutaron checkout real, pagos, cortesías, rewards, stock, caja, reservas, tickets, producción, simulaciones, liquidaciones, finanzas ni concurrencia con escritura.
- No se probaron roles reception, barber y viewer ni IDOR entre sedes; solo existe la cuenta QA owner sin sede.
- No se ejecutaron los SQL de conciliación: son manuales y no se ejecuta SQL automáticamente.
