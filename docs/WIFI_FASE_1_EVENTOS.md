# LBBS WiFi — Fase 1: eventos de sesión y estados reales

Esta fase instala la notificación de LOGIN/LOGOUT del MikroTik al Dashboard y habilita en `/control/wifi` la visualización del dispositivo, IP, primer acceso y tiempo restante. No cambia reglas WAN, NAT, HotSpot ni los intervalos de sincronización.

## Diagnóstico

El perfil `lbbs-client-profile` no tenía `on-login` / `on-logout`, aunque RouterOS mostraba usuarios en `/ip hotspot active`. La función `public.record_hotspot_session_event` y la ruta `/api/wifi/router/session` ya existen en la base de datos y aplicación.

## Instalación en San Juan (RouterOS v7)

1. Confirmar que el sync y el heartbeat funcionen. Hacer backup de la configuración del perfil, por ejemplo:
   ```routeros
   /ip hotspot user profile print detail where name="lbbs-client-profile"
   ```
2. Descargar `routeros/hotspot/scripts/lbbs-install-session-hooks.rsc` del branch desplegado. Subirlo a WinBox > Files como `flash/lbbs-install-session-hooks.rsc`. **No copiar el token del router al archivo**.
3. En RouterOS, ejecutar:
   ```routeros
   /import file-name=flash/lbbs-install-session-hooks.rsc
   /ip hotspot user profile print detail where name="lbbs-client-profile"
   ```
4. Verificar que aparezcan `on-login` y `on-logout` no vacíos. El instalador intenta reconciliar una vez las sesiones LBBS que ya estén activas: **no desconecta dispositivos**. No ejecutar el instalador recurrentemente.
5. Consultar los nuevos eventos en el Dashboard y, en el router, los mensajes recientes:
   ```routeros
   /log print where message~"LBBS:"
   /ip hotspot active print detail
   ```
6. Probar con **un voucher nuevo**: emitirlo, copiarlo, autenticar un teléfono y verificar que el estado cambie `activation_ready → active`, con `first_used_at` y `session_expires_at`. En pruebas con cliente existente, el instalador intenta completar ese estado sin forzar un logout.
7. Al desconectarse, RouterOS ejecutará el hook de LOGOUT cuando expire la sesión según el `keepalive-timeout=3m`; el backend marcará el voucher como `expired` y registrará el evento. El instalador reutiliza la lógica de expiración local ya definida: elimina el usuario y la mac-cookie al ejecutarse LOGOUT. **No usar `/ip hotspot active remove` como forma de refrescar el Dashboard**: se considerará desconexión y anulará el acceso.

## Validaciones esperadas

- En `public.hotspot_session_events` debe aparecer un evento `LOGIN` con voucher, MAC, IP y fecha. En `wifi_access_vouchers` el estado será `active`, con `first_used_at` y `session_expires_at`.
- La UI cuenta como activos solo los vouchers con estado `active` y no vencidos; los `available` con `unused_expires_at` anterior a ahora se visualizan como expirados, aunque el cierre administrativo se trate en otra fase.
- La duración visible se calcula con los tiempos guardados. No es un contador en tiempo real leído del router; la exactitud depende de recibir los eventos LOGIN/LOGOUT.
- Código WiFi de un solo uso: se muestra al generarse y después solo se conservan sus cuatro dígitos finales y su hash. Si se extravía, será necesario anularlo y emitir otro. Esta fase **no agrega** recuperación ni nuevos endpoints de revocación.

## Diagnóstico de fallos

Si RouterOS muestra sesión activa pero Supabase sigue en `activation_ready`, comprobar en primer lugar los campos `on-login` / `on-logout`. Si en el log aparecen `LBBS: LOGIN no enviado` o `LBBS: reconciliacion de sesion pendiente`, revisar la salida HTTPS y los registros del endpoint `/api/wifi/router/session` en Vercel; la ruta registra solo el código de error SQL y el tipo de evento, nunca el token.

**Requisitos:** el perfil debe seguir siendo `lbbs-client-profile`; las variables globales `lbbsApiBaseUrl` y `lbbsRouterToken` deben existir; la API debe disponer de las funciones SQL ya desplegadas. No se requiere ninguna migración SQL nueva para esta fase.
