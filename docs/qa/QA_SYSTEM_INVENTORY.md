# Inventario del sistema

| Módulo | Ruta | Endpoints principales | Datos críticos | Roles previstos | Cobertura Sprint 9 | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | `/login`, recuperación y cuenta | `/api/auth/*` | `employees`, `audit_logs` | usuario autenticado, owner/admin | unitario y E2E público | Parcial, falta QA real |
| Control | `/control` | `/api/admin/control/kpis` | datos operativos agregados | todos según módulo | redirect sin sesión | Parcial |
| POS | `/pos`, `/control/pos` | bootstrap, sessions, checkout, sales | sesiones, ventas, pagos, stock | owner/admin/reception | unitario de pagos/cortesías | Parcial |
| Caja | `/control/caja` | cash bootstrap y movements | caja, sesiones POS | owner/admin/reception | pendiente integración | Pendiente |
| Clientes | `/control/clientes` | customers y búsqueda | customers | owner/admin/reception | pendiente QA autenticada | Pendiente |
| Reservas | `/control/reservas` | reservations y contacts | reservations, notes, logs | según sede/rol | pendiente QA autenticada | Pendiente |
| Rewards | `/control/rewards` | rules, benefits, migrations | ledger, entitlements, redemptions | owner/admin/reception | unitario de descuento | Parcial |
| Catálogos | servicios y productos | services, products, precios | catálogos, stock | owner/admin, lectura operativa | carrito y stock local | Parcial |
| Producción | `/control/produccion` | production | producción y bonos | owner/admin | SQL de conciliación | Pendiente |
| Liquidaciones | `/control/liquidaciones` | settlements | snapshots y pagos | owner/admin | pendiente integración | Pendiente |
| Finanzas | `/control/finanzas` | finance | registros manuales | owner/admin | SQL de conciliación | Pendiente |
| Configuración | `/control/configuracion` | methods, reasons, rules | maestros operativos | owner/admin | pendiente QA autenticada | Pendiente |

## Superficies transversales

- RLS y alcance por sede: scripts `004`, `005`, `030`, `040`, `050`, `070`, `080`, `093`, `095` y posteriores.
- Service role: solo `src/lib/supabase/admin.ts`, importado en Route Handlers de servidor.
- Storage: no se audita en este Sprint sin acceso al proyecto Supabase.
- Integraciones externas: API Perú y correo de recuperación de Supabase.
- SQL manual: `src/sql/001` a `107`; consultas QA en `src/sql/qa`.
