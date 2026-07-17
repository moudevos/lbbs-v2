# Iteracion 06

## Modo visual supervisado

- Chromium visible: abierto y ejecutado correctamente.
- Resolucion: `1440x900`.
- `slowMo`: `800 ms`.
- Workers: `1`; ejecucion serial.
- Cursor artificial, resaltado, pausas y banner de escenario: activos solo bajo `QA_VISUAL=true`.
- Escenarios observados: preparacion de sedes QA, altas admin/reception/barberos, cambio obligatorio, restricciones de reception, desactivacion, reactivacion y limpieza.

## Correcciones del arnes

| ID | Severidad | Estado | Descripcion |
| --- | --- | --- | --- |
| QA-008 | P3 | Corregido | Faltaba el binario Playwright FFmpeg para retener video ante fallo visual. Se instalo el componente de Playwright, sin cambiar dependencias de la app. |
| QA-009 | P3 | Corregido | El slowMo visual superaba el timeout del escenario. El timeout ahora es 120 segundos visual y 90 segundos normal. |

## Regresion

- Visual: 4/4 correctas.
- Headless posterior: 14/14 correctas en dos ciclos consecutivos.
- No se conservan storage states, videos, traces, capturas ni datos QA al finalizar.

## Alcance pendiente

POS completo, pagos, cortesias, rewards, reservas, stock, caja, tickets, produccion, simulaciones, liquidaciones, finanzas, concurrencia, conciliaciones, RLS e IDOR entre sedes siguen pendientes de ejecucion operativa con datos QA. Estado: **NO APTO PARA PRODUCCION**.
