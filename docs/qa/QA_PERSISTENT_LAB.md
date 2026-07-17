# Laboratorio QA persistente

## Estado del laboratorio - Iteracion 11

El contexto se prepara una sola vez en `global-setup.ts`, se comparte mediante `.qa/current-run.json` sin secretos y se cierra en el reporter. Los runs 008 y 009 confirmaron IDs distintos, 26 escenarios y 72 entidades por run. El archivo del servidor se elimina al terminar y el puerto 3100 queda libre.

Un fallo funcional tambien cierra el run: 010 termino `failed`, y QA-024/SETTLEMENT-001 quedaron asociados a ese mismo ID. Nunca debe reutilizarse un run cerrado.

## Objetivo

El laboratorio conserva evidencia operativa entre ejecuciones sin modificar tablas de negocio ni eliminar datos reales. Cada corrida se identifica con `QA_RUN_YYYYMMDD_NNN`.

## Componentes

| Componente | Responsabilidad |
| --- | --- |
| `qa_runs` | Identidad, estado, version de aplicacion y resultado de la corrida. |
| `qa_scenario_results` | Resultado esperado, resultado real, duracion y evidencia sanitizada por escenario. |
| `qa_entity_registry` | Relacion entre el run y cualquier registro de negocio creado o reutilizado. |
| `qa_findings` | Defectos P0-P3, causa, correccion y regresion. |
| Vistas QA | Resumen de runs, entidades y hallazgos abiertos sin omitir RLS. |

## Seguridad

- Solo owner inicia y escribe una ejecucion desde los helpers servidor.
- Owner/admin pueden administrar las tablas bajo RLS.
- Reception, barber, viewer y anon no tienen acceso administrativo.
- Las vistas usan `security_invoker` para conservar las politicas de las tablas base.
- `authenticated` no recibe `DELETE`; la evidencia se archiva mediante estado.
- Service role permanece exclusivamente en servidor y no es necesario para el flujo normal del laboratorio.
- Metadata y evidencia no deben contener contrasenas, cookies, tokens, enlaces de recuperacion ni claves.

## Datos maestros y transaccionales

Los maestros persistentes son las dos sedes QA, usuarios admin/reception, barberos sin login, catalogos, precios, metodos y reglas. Se localizan por codigos estables y se reutilizan.

Clientes de escenario, reservas, sesiones, ventas, pagos, tickets, stock, rewards, caja, produccion, simulaciones, liquidaciones y finanzas pertenecen a un run. Se conserva el registro original y se asocia en `qa_entity_registry`.

## Orden de instalacion

1. Confirmar que los SQL 001 a 109 estan aplicados.
2. Ejecutar `src/sql/110_persistent_qa_lab.sql` completo en Supabase SQL Editor.
3. Confirmar las cuatro tablas y tres vistas.
4. Ejecutar `src/sql/111_qa_lab_authenticated_delete_guard.sql` si la verificacion confirma que sigue pendiente.
5. Verificar clientes globales para owner/admin/reception y rechazo anon.
6. Verificar aislamiento por sede en entidades transaccionales.
7. Iniciar o reanudar el run mediante `createQaRun()`.

No ejecutar scripts alternativos ni crear tablas QA manualmente desde el Dashboard.
# Estado desplegado

SQL 110 esta operativo. El run 001 permanece `blocked` historico. QA-017 fue reclasificado como regla de negocio confirmada: los clientes son globales. SQL 112 fue descartado y eliminado; SQL 111 esta aplicado y verificado.

El run 002 visible termino `blocked` por QA-018 P1: el remoto conserva un guard RLS parcial que oculta clientes a reception. Sus entidades y evidencia se conservan. Los runs 003/004 no deben iniciarse hasta resolver el guard manual. No invocar rutas historicas `cleanup-*`.
# Cierre operativo Iteracion 10 - 2026-07-16

El laboratorio conserva `qa_runs`, `qa_scenario_results`, `qa_entity_registry` y `qa_findings`. Los runs 001/002 permanecen historicos; 003 cerro `passed_with_observations`; 004/005 cerraron `blocked`, nunca quedaron en `running`.

El arnes ahora reutiliza `.qa/current-run.json` cuando `QA_RUN_CODE` no esta definido y acepta que existan varios runs preabiertos cuando el codigo se fija explicitamente. `playwright.config.ts` carga `.env.local`, usa un worker y permite 180 s para iniciar el servidor local. Los storage states y `.qa/` permanecen ignorados.

Consultas de solo lectura disponibles: stock, caja, produccion, finanzas, idempotencia y conciliacion integral. `cash_reconciliation.sql` y `full_run_reconciliation.sql` identifican resultados por `run_code` mediante el registro persistente.
