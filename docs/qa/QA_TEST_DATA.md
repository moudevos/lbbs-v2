# Estrategia de datos QA

## Estado de datos - Iteracion 11

Los runs 007, 008, 009, 010 y 011 conservaron maestros y generaron transacciones nuevas. Los headless 008 y 009 registraron 72 entidades cada uno con `qa_run_id` distinto. El run 010 conserva evidencia de QA-024 y el run 011 conserva la liquidacion y el egreso QA-025 para diagnostico; no se elimina ni se recicla ningun codigo.

El OWNER base permanecio intacto. No se imprimieron credenciales y no se ejecutaron borrados masivos. Tras aplicar SQL 115 deben usarse run codes nuevos.

## Iteracion 10

Desde esta iteracion los datos QA son persistentes. Cada ejecucion usa `QA_RUN_YYYYMMDD_NNN`; los maestros QA se reutilizan y las transacciones se asocian mediante `qa_entity_registry`. No se ejecuta limpieza destructiva al terminar.

`QA_RUN_20260716_002` creo transacciones nuevas y conserva su evidencia aunque termino `blocked`. Los runs 003/004 no existen. El owner base no fue modificado. Los cambios temporales del empleado reception se restauran mediante `finally` en las pruebas.

- No eliminar sedes, usuarios, barberos, catalogos ni transacciones QA.
- No usar `TRUNCATE` ni `DELETE` masivo.
- Ajustar stock exclusivamente mediante movimientos compensatorios registrados.
- Archivar datos incompletos mediante estados, conservando la evidencia.
- Eliminar solo storage state, cookies y artefactos temporales que puedan contener sesion.
- Guardar credenciales persistentes unicamente en `.qa/runtime-secrets.json`, ignorado por Git.

## Iteracion 05

Las altas de sedes y empleados se realizaron con el marcador `QA_TEST_DATA` y se eliminaron al finalizar cada ciclo. La limpieza de empleados QA se limita a owner, requiere las dos banderas QA y elimina primero Auth asociado; luego elimina empleados sin Auth y sedes marcadas. No usa `TRUNCATE` ni afecta al owner.

- Ejecutar pruebas operativas solo en un proyecto Supabase no productivo.
- Usar el marcador literal `QA_TEST_DATA` en nombres, notas, referencias y descripciones creadas por pruebas.
- No reutilizar clientes, ventas, productos o liquidaciones reales.
- No ejecutar `TRUNCATE` ni eliminar maestros.
- La limpieza debe filtrar por el marcador, validar primero los IDs encontrados y eliminar en orden de dependencias mediante scripts aprobados por un responsable.
- Las pruebas de checkout, stock, rewards, caja y finanzas requieren una sede QA dedicada para evitar mezcla de saldos.
- No incluir contraseñas, tokens ni enlaces de recuperación en fixtures, snapshots, traces o informes.
# Maestros persistentes Iteracion 10

- Sedes: `QA-SED-001`, `QA-SED-002`.
- Usuarios: ADMIN QA, RECEPTION QA.
- Barberos sin login: Barbero QA Uno, Barbero QA Dos.
- Servicios: S/50, S/100, S/150, Cortesia y Reward.
- Productos: S/50, S/100, Cortesia, Ultima Unidad y Agotado.
- Metodos: efectivo, QR y tarjeta.
- Los UUID se resuelven por codigos y slugs; no se documentan como contrato.
# Datos conservados por Iteracion 10 - 2026-07-16

Se conservaron los runs 001-005, escenarios, findings y registros de entidades. Los maestros QA-SED-001/002, admin, reception, barberos sin login, catalogo, precios, stock y metodos de pago se reutilizaron. Cada run creo transacciones con su identificador cuando el bootstrap pudo asociarlas.

Tambien se conservaron la categoria `qa_operational_income` y la categoria financiera `qa_other_income`, creadas por owner para poder probar el entorno que no tenia seeds activos. No se eliminaron clientes, reservas, sesiones, ventas, pagos, snapshots, movimientos, rewards ni auditoria. OWNER permanecio intacto y no se registraron secretos.
