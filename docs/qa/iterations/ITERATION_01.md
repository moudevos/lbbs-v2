# Iteración 01

## Pruebas ejecutadas

- Inventario de rutas, SQL, scripts y dependencias.
- Búsqueda estática de secretos, service role y recargas forzadas.
- Pruebas unitarias de Auth, permisos y cálculos POS.
- Typecheck.

## Defectos y bloqueos

| ID | Severidad | Resultado | Causa | Estado |
| --- | --- | --- | --- | --- |
| QA-001 | P2 | E2E inicialmente bloqueado | Chromium de Playwright no instaló dentro de 180 segundos; se usó Chrome local | Corregido |
| QA-002 | P1 | RLS, roles y flujos financieros sin validar | No se recibieron credenciales QA ni cuentas por rol | Bloqueado |
| QA-003 | P2 | Cinco warnings de lint heredados | Código previo de Ventas y reglas de compensación | Pendiente, fuera del alcance acotado |

## Evidencia

- Unitarios: 11 correctos.
- Typecheck: correcto.
- E2E público: 3 correctas y 1 omitida por cada corrida; dos corridas consecutivas correctas con Chrome local.
- La integración externa de versículos devolvía 404 durante login; se reemplazó por catálogo local y la regresión E2E quedó limpia.
- No se modificó SQL operativo ni se realizaron operaciones destructivas.

## Próximo paso

Proveer variables QA fuera del repositorio e instalar Chromium en el runner para ejecutar E2E crítico dos veces y la matriz de roles/RLS.
