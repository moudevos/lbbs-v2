# LBBS WiFi Clientes — Reconciliación de sesiones v2 (20/10/2026)

**Implementación en etapas. No activar el scheduler anterior `lbbs-reconcile`.**

## Incidente que motiva el reemplazo

El controlador v33 expiró un voucher ~24 segundos después del LOGIN porque una sola observación de `/ip hotspot active` omitió esa sesión (`session_missing`). En la siguiente prueba MikroTik terminaba una sesión por comportamiento del HotSpot, pero el Dashboard conservaba `Activo`. Se corrigieron el portal HTTP-CHAP y los parámetros de IP por MAC. Hoy es posible navegar de forma estable.

Este parche **no modifica POS, Staff, Starlink, NAT, firewall, DHCP ni el portal cautivo**. Implementa persistencia de presencia, una API v2 y un nuevo script MikroTik de **observación**, sin revocaciones automáticas en esta fase.

## Archivos

- `supabase/migrations/20261020131500_hotspot_reconcile_v2_safe.sql`: nueva tabla privada `hotspot_client_presence_v2`, RPC con aislamiento por router y trigger para reflejar EXPIRE_VOUCHER una vez que RouterOS confirma el ACK.
- `src/app/api/wifi/router/reconcile/route.ts`: endpoint POST autenticado por router; sólo puede encolar si coinciden `body.enforce=true` y `HOTSPOT_RECONCILE_V2_ENFORCE=true`. Sin ambos, `mode=observe`.
- `routeros/rebuild/35-lbbs-clientes-presence-v2.rsc`: instala `lbbs-presence-v2` y scheduler cada 30s, **DESHABILITADO**. Envía `enforce=false` siempre y detiene la prueba si la API no responde con `version=2,mode=observe,queued=0`.
- `tests/unit/hotspot-client-reconcile-v2-contract.test.ts`: invariantes de seguridad, presencia, plazo fijo y ACK.
- Este README.

## Reglas de negocio

1. Se reconoce presencia solamente cuando el router reporta el voucher dentro de su inventario auténtico de sesiones HotSpot activas, sin códigos/contraseñas/MAC en el cuerpo.
2. Una sesión `active` en Supabase sin **alguna observación positiva anterior** nunca se considera ausente por primera vez.
3. Un nuevo evento LOGIN posterior a la observación positiva cancela la inferencia anterior y obliga a una nueva presencia positiva.
4. Para evaluar vencimiento por desaparición de RouterOS: >=3min continuos desde primer snapshot sin presencia; >=4 snapshots negativos; una ventana de polling sin saltos >90s; >=3min desde último LOGIN.
5. Una observación positiva posterior reinicia el plazo. Si el router pierde conectividad y no envía inventario, el plazo no avanza de manera irreversible.
6. El límite absoluto de 3h sigue anclado en `session_expires_at` fijado por el primer LOGIN; reconectar no lo reinicia.
7. Aun con enforcement futuro, la DB **no** marca `expired` al insertar la orden. El Dashboard cambia cuando MikroTik devuelve el ACK `EXPIRE_VOUCHER` correctamente aplicado.
8. El perfil de usuario sigue con `shared-users=1`, y cada voucher está enlazado a una MAC. El nuevo script deduplica UUID por si RouterOS reporta varias IP del mismo dispositivo.

**Limitación:** El MikroTik detrás de TP-Link puede tardar ~3min (`keepalive-timeout`) en detectar pérdida física de WiFi. Como el plazo persistente empieza cuando la ausencia aparece en el inventario, el total hasta revocación podría acercarse a 6min + ciclos de 30s y sincronización. NO afirmar todavía cumplimiento exacto de 3min desde la desconexión física.

## Orden estricto de despliegue

1. Revisar backup y aplicar **primero** la migración de Supabase LBBS. En 20/10/2026 fue aplicada desde la rama `infra/wifi-netinstall-rebuild`; la tabla y RLS se confirmaron mediante herramientas de Supabase. No ejecutar otra vez por inercia.
2. Probar `npx vitest run tests/unit/hotspot-client-reconcile-v2-contract.test.ts`, `npm run typecheck` y la compilación del branch. La rama infra contiene cambios adicionales, **NO promoverla íntegra a main**.
3. Desplegar en producción **solo** `src/app/api/wifi/router/reconcile/route.ts` sobre la `main` actual después de QA en Vercel preview. Garantizar que `HOTSPOT_RECONCILE_V2_ENFORCE` NO esté activa. Validar GET=>405 y la prueba POST autenticada desde RouterOS `version=2,mode=observe,queued=0`.
4. En MikroTik comprobar `/system scheduler print where name="lbbs-reconcile"` con `X` (deshabilitado).
5. Subir `35-lbbs-clientes-presence-v2.rsc` a `flash/` mediante WinBox Files e importar **una sola vez**:

   `/import file-name=flash/35-lbbs-clientes-presence-v2.rsc`

   Se crea script y scheduler nuevos en modo **deshabilitado**.

6. Prueba manual, sin mostrar tokens:

   `/system script run lbbs-env`
   
   `/system script run lbbs-presence-v2`

   `:global lbbsPresenceV2LastOk; :put $lbbsPresenceV2LastOk`

   `:global lbbsPresenceV2LastResult; :put $lbbsPresenceV2LastResult`

   `/log print where message~"LBBS35"`

   Respuesta esperada: fecha/hora fresca y `queued=0`. Si falla, detener. No imprimir `/system script print detail` o cualquier fuente que exponga el token.

7. Si pasa, habilitar exclusivamente **el observador v2**:

   `/system scheduler enable [find where name="lbbs-presence-v2"]`

8. Ensayos supervisados: A) navegación estable >15min (`wouldExpire=0`); B) WiFi OFF 60s/reconexión (`wouldExpire=0`); C) WiFi OFF 6-8min (`wouldExpire` debería llegar a 1, pero `queued=0`); D) pérdida de Internet del router y reinicio (`wouldExpire` no debe generarse falsamente); E) segundo dispositivo con voucher existente rechazado. Examinar tablas sin exponer datos de personas.
9. **Solo en otra fase**, con logs y pruebas de tolerancia, diseñar enforcement de **un solo voucher canario** y su rollback; no habilitar masivamente `HOTSPOT_RECONCILE_V2_ENFORCE=true` ni editar `"enforce"=false` de esta versión del script.

## Parada inmediata

`/system scheduler disable [find where name="lbbs-presence-v2"]`

`/system scheduler disable [find where name="lbbs-reconcile"]`

Esto no modifica Internet autenticado ni deshabilita `lbbs-sync` o `lbbs-heartbeat`. El antiguo API v1 NO debe restaurarse: provocó desconexiones prematuras.
