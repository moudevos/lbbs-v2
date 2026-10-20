# LBBS — Netinstall limpio (BORRADO BLOQUEADO)

Version objetivo: hEX RB750Gr3, RouterOS 7.23.8, arquitectura mmips.

Esta carpeta NO importa scripts HotSpot antiguos. Los componentes actuales de Staff no aprovisionan usuarios en RouterOS (la API aún puede devolver provisioned: false); falta el instalador funcional Staff y validar la regla Clientes de reconexión de tres minutos. Por ello el reset productivo NO está autorizado todavía.

## 00-lbbs-bootstrap.rsc

Usar como **Configure Script** en Netinstall sobre RouterOS limpio. Desactivar **Keep Old Configuration**. Con **Configure Script** marcado, Netinstall 7.23.8 deshabilita **Apply Default Config** en la interfaz; no intentar forzarlo. RouterOS aplica el script personalizado en vez de la configuración de fábrica. El script personalizado persiste en futuros resets. Nunca cargarlo como Mode Script. No contiene credenciales. Establece **ether2 y ether3** como Administración (192.168.88.1/24), DHCP y WinBox/IP-MAC limitado a Administración. Bloquea enrutamiento y entradas no administrativas. Es un script de una sola instalación, no una actualización idempotente.

Requisito: contar con copia externa del .rsc, .backup cifrado, la carpeta HotSpot antigua y scripts históricos; WinBox por MAC ya verificado; disponer de plan Netinstall para volver a configuración predeterminada si el bootstrap falla.

Durante Netinstall el PC de Windows 11 usa **ether1** temporalmente. Una vez reinstalado, conectar PC a **ether2**, confirmar DHCP/WinBox IP y MAC, y **asegurar inmediatamente la contraseña admin** antes de volver a conectar Starlink. Verificar:
```routeros
/ip address print
/ip dhcp-server print
/ip firewall filter print
/tool mac-server mac-winbox print
```

## 10-lbbs-base.rsc

Importar solo después de confirmar acceso administrativo estable por ether2. Introduce WAN Starlink DHCP en ether1, dos segmentos físicos sin VLAN (ether4 Staff y ether5 Clientes), DNS y DHCP, firewall con denegación predeterminada y NAT único. Las reglas **LBBS-GATE** de salida WAN de Clientes/Staff permanecen expresamente deshabilitadas hasta verificar sus respectivos portales y autorizaciones.

Con el archivo cargado en Files, importar manualmente desde WinBox:
```routeros
/import file-name=10-lbbs-base.rsc
```

Verificar los comentarios LBBS-BASE en firewall y el log `LBBS BASE READY`. No activar LBBS-GATE antes de completar y probar los servidores HotSpot.

## Seguridad y condiciones de salida

Nunca incluir tokens, contraseñas, vouchers ni credenciales en GitHub, Netinstall Configure script o archivos HTML. Mantener Starlink y los AP desconectados durante Netinstall. No ejecutar scripts sobre la configuración actual: sus precondiciones detectan una configuración no limpia, pero una importación incompleta debe recuperarse por Netinstall. El código se ha revisado estáticamente: no se ha probado el parser RouterOS ni se ha ejecutado en hardware; el resultado operativo requiere pruebas reales antes del reset.

## Windows 11: Netinstall y recuperación inmediata

1. Resguardos externos: export .rsc, .backup cifrado, carpeta hotspot y scripts antiguos. No empezar si falta copia.
2. PC: Ethernet exclusivo, IPv4 estático 192.168.88.2/24 sin gateway; desactivar temporalmente WiFi, VPN y otras NIC.
3. Netinstall Win64 como Administrador: habilitar Net booting, Client IP 192.168.88.3.
4. Apagar hEX, retirar Starlink y AP de puertos; conectar PC directo a ether1.
5. Presionar RESET durante arranque hasta detectar hEX en Netinstall; verificar el modelo antes de proceder.
6. Seleccionar routeros-7.23.8-mmips.npk. Keep Old Configuration: OFF; Configure Script: 00-lbbs-bootstrap.rsc; Apply Default Config: deshabilitado automáticamente al seleccionar Configure Script.
7. Instalar y esperar confirmación de éxito. Cambiar el PC a ether2 y entrar WinBox a 192.168.88.1 o por MAC. Asegurar de inmediato cuenta admin.
8. Verificar firewall, DHCP y bridge-admin; importar 10-lbbs-base.rsc desde WinBox. Solo después conectar Starlink a ether1; validar DNS y salida a Internet desde administración.
9. Clientes y Staff permanecen SIN salida a Internet hasta probar sus HotSpots y el backend, nunca habilitar LBBS-GATE como simple bypass.

Requisito actualizado por el usuario: Clientes: tipo de documento + número + código temporal, sesión máxima 3h, reconexión de 3 minutos. Staff: tipo/número de documento + código individual, reconexión automática con máximo 1 dispositivo. La versión de backend Staff en main admite actualmente 2 dispositivos: NO activar Staff sin corregir el límite y tener el aprovisionamiento operativo. Persistencia: usar sistema de scripts y schedulers de RouterOS, no variables :global manuales.

## 20-lbbs-clientes.rsc (portal cautivo preparado, sin apertura de WAN)

Después de 00 y 10, ya comprobados en el hEX real, se puede preparar el HotSpot Clientes **sin habilitar su salida general a Internet**.

1. Abrir WinBox > Files > flash; crear la carpeta `lbbs-clients` y dentro `assets`.
2. Copiar el **contenido**, sin cambiar su diseño, de `routeros/hotspot/portal/lbbs-cautive-clients/` a `flash/lbbs-clients/`; el instalador valida `login.html` y `md5.js`. Debe incluirse `api.json` para detección cautiva moderna.
3. Subir `routeros/rebuild/20-lbbs-clientes.rsc` a Files en la ruta elegida. Si está en la raíz de `flash`, importarlo con `/import file-name=flash/20-lbbs-clientes.rsc`. Si WinBox lo muestra en la raíz del listado, usar la ruta exacta que se muestre.
4. Antes de importar: `/system/device-mode/print`; validar que la función HotSpot está permitida. El script no altera device-mode.
5. Verificar `/ip hotspot print detail`, `/ip hotspot profile print detail`, `/ip hotspot walled-garden print detail` y `/ip firewall filter print where comment~"LBBS-"`.
6. Conectar el AP TP-Link a ether5 y revisar por Android que DHCP es 10.10.10.0/24, DNS apunta a 10.10.10.1 y se ve el login local. **Todavía no hay Internet general para Clientes.**
7. No habilitar `LBBS-GATE customer WAN OFF until captive proven` hasta integrar el token de router, el sync / ACK y hooks correctos para reconexión de 3 minutos. No usar el on-logout histórico: expira el voucher inmediatamente y no cumple la ventana.

**Limitaciones a resolver:** el backend Clientes disponible actualmente acepta solo DNI; extender tipo de documento antes de considerarlo listo. `session-timeout=3h` en RouterOS limita la sesión en línea, pero no basta para imponer 3h absolutas contando reconexiones; el límite definitivo debe basarse en `first_used_at + interval '3 hours'` y programarse en RouterOS. La política de gracia de 3m requiere un estado de desconexión, reversión de login si vuelve antes de vencer y evento expirado definitivo tras la gracia. El script no afirma cumplir aún esas características.

## 30-lbbs-router-integration.rsc.template (STAGED / credential safe)

Newly installed Clients HotSpot currently displays the portal, but lacks RouterOS scripts and its WAN gate is intentionally disabled. To restore authenticated voucher provisioning without revealing secrets:

1. On an administration PC, obtain the router token in Dashboard > /control/wifi > Configuración MikroTik > Regenerar token de conexión. Do NOT paste it in this chat or commit it to Git.
2. Copy `30-lbbs-router-integration.rsc.template` to a **local outside-repository** file `30-lbbs-router-integration.rsc`. Replace the single `{{LBBS_ROUTER_TOKEN}}` placeholder with the current token; this must stay PRIVATE. Never store it under the git working tree.
3. Upload `routeros/hotspot/scripts/lbbs-sync.rsc` and `routeros/hotspot/scripts/lbbs-heartbeat.rsc` to `flash/` as `lbbs-sync.rsc` and `lbbs-heartbeat.rsc`. Upload your local `30-lbbs-router-integration.rsc` to `flash/`.
4. Before import, inspect `/system script print` (names only) and `/system scheduler print`. Scripts `lbbs-env`, `lbbs-sync`, `lbbs-heartbeat` must not already exist. Import `/import file-name=flash/30-lbbs-router-integration.rsc`. On error, STOP; do not repeat blindly.
5. Immediately delete the private upload from the router filesystem: `/file remove [find where name="flash/30-lbbs-router-integration.rsc"]`. The secret remains in `/system script lbbs-env` as an administrator-readable configuration and survives reboot via scheduler. Do not print its source or export show-sensitive.
6. Test `/system script run lbbs-env`, `/system script run lbbs-heartbeat`, and confirm the router online in Dashboard. Only then test `lbbs-sync` and voucher CRUD+ACK; do not assert success from a no-error return. Check the API heartbeat response, last_seen_at, and command states.
7. DO NOT install `lbbs-install-session-hooks.rsc` in its old form: it removes Client voucher on every LOGOUT and contradicts the 3-minute reconnect policy. DO NOT enable `LBBS-GATE customer WAN OFF until captive proven` yet.

This staged integration does NOT fulfill the complete Customer three-minute grace rule or Staff automatic reconnection. Type-of-document support for Clients and max-one-device Staff policy also require backend changes.


## Clientes - Rediseño DNI/CE e intermediario (Oct 19, 2026)

El portal físico instalado originalmente en `flash/lbbs-clients/` sigue mostrando los HTML subidos anteriormente hasta que se reemplacen manualmente; un commit GitHub NO actualiza RouterOS.

- Nuevo flujo en `routeros/hotspot/portal/lbbs-cautive-clients/login.html`: bienvenida → DNI/CE + código → registro, si procede → espera **real** del ACK de activación → HTTP-CHAP contra MikroTik → `alogin.html` confirma y transiciona a estado.
- `rlogin.html` y `redirect.html` encauzan peticiones HTTP cautivas al nuevo login. `api.json` está incluido, pero no garantiza popup por sí solo.
- `src/lib/hotspot/captive.ts` y ambos endpoints `identify`/`register` ahora aceptan DNI y CE (número 6-12 alfanumérico para CE). DNI anterior sin tipo sigue aceptado. **No requiere SQL nuevo.**
- ORDEN IMPORTANTE: publicar primero la API en producción para habilitar CE; el HTML nuevo conserva compatibilidad de DNI con el endpoint viejo durante el despliegue, pero CE no funcionará hasta publicar el backend.
- Después de publicar API, actualizar por WinBox **todo el contenido** de `routeros/hotspot/portal/lbbs-cautive-clients/` en `flash/lbbs-clients/`, sobreescribiendo todos los HTML/CSS existentes y copiando `assets/lbbs-logo.svg` dentro de la subcarpeta assets. NO reimportar el instalador 20.
- Comprobar tras subir: abrir `http://10.10.10.1/login` desde el móvil sin datos y confirmar bienvenida/selector; probar DNI y CE únicamente con voucher de prueba en ambiente seguro, no asumir Internet todavía.
- La apertura automática del miniportal en Android/iOS depende también de los probes del sistema y/o RFC7710; RouterOS sólo anuncia el endpoint DHCP automáticamente si el HotSpot tiene **DNS válido más certificado SSL válido**. `wifi.lbbs.test` no dispone actualmente de certificado público validable. No forzar DHCP option 114 HTTP ni abrir WAN para disfrazar el estado.
- **SEGURIDAD**: tokens de router aparecieron en `/system script print` y `/log print` del historial; rotar en Dashboard, actualizar exclusivamente `lbbs-env` (sin eliminarlo), y nunca imprimir script source/log entries que contengan secretos. Eliminar el instalador 30 personalizado del RouterOS una vez instalado.
- No habilitar `LBBS-GATE customer WAN OFF until captive proven` antes de auditar activación, hook de LOGIN, expiración absoluta (3h) y gracia desconectado (3min). Estado actual: voucher CREATE sincroniza, pero no prueba acceso final.

## 31-lbbs-client-login-events.rsc (real LOGIN event, NO LOGOUT yet)

Field check on Oct 19: a client successfully authenticated in RouterOS (`/ip hotspot active print count-only` = 1; host `HA`), but the Dashboard still displayed "Listo para conectar"/Connected=0. This is EXPECTED while `lbbs-client-profile` lacks a login hook: ACTIVATE_VOUCHER ACK is not a SESSION LOGIN event.

Only after confirming the existing active HotSpot session:
1. Download `31-lbbs-client-login-events.rsc` from this branch; upload to `flash/31-lbbs-client-login-events.rsc` in WinBox.
2. Do NOT install the old `lbbs-install-session-hooks.rsc`. It force-deletes the user and expires the voucher immediately on logout, breaking the 3-minute grace requirement.
3. Run `/import file-name=flash/31-lbbs-client-login-events.rsc` **once**. Stop if an error appears, since the profile might already have been changed before reconciliation.
4. Check only non-secret status: `/ip hotspot active print count-only`, `:put [:len [/ip hotspot user profile get [find where name="lbbs-client-profile"] on-login]]` and `/log print where message~"LBBS31"`. Do NOT print system scripts or the router credential.
5. Refresh WiFi Dashboard; the genuine 1 active session should change voucher status to `active`/connected after successful authenticated HTTPS event reconciliation. If it does not, investigate the API response / Supabase RPC and profile permissions without inventing session events.

This change DOES NOT open Internet, enforce the 3h absolute max across reconnects, or implement the 3-minute disconnection grace. A later phase must implement a reconciling monitor with logout/disconnection state and router authorization checks. Until then keep the Client WAN gate disabled, and note the Dashboard active state may be stale after a disconnect due to intentionally deferred logout events. No change to Staff.

## 32-lbbs-clientes-wan-auth-only.rsc (piloto de Internet con autorización)

Comprobación real 19 Oct 2026: cliente HotSpot con `/ip hotspot active print count-only` = 1, `host HA`, evento LOGIN confirmado en Dashboard; NAT único `out-interface=ether1`, `LBBS-BOOT-Forward-Drop` activo, las dos reglas WAN amplias continúan deshabilitadas.

1. Subir `routeros/rebuild/32-lbbs-clientes-wan-auth-only.rsc` a `flash/`.
2. Ejecutar una sola vez `/import file-name=flash/32-lbbs-clientes-wan-auth-only.rsc`.
3. Verificar `/ip firewall filter print stats where comment="LBBS-CLIENTES-WAN-AUTH-ONLY"`; la regla debe aparecer **antes** de `LBBS captive preauth HTTPS exception` y del DROP final. `LBBS-GATE customer WAN OFF until captive proven` y `LBBS-GATE staff WAN OFF until captive proven` deben seguir DESHABILITADAS.
4. Prueba: teléfono autorizado (primero probar una URL HTTPS externa en navegador; Android podría tardar en re-evaluar la indicación “Sin Internet”). Segundo teléfono **no autenticado**: no debe poder navegar por Internet salvo destinos LBBS que formen parte de la excepción de preautorización. Confirmar desde WinBox que el perfil y aislamiento Staff no cambiaron.
5. Rollback inmediato SIN deshacer Netinstall: `/ip firewall filter disable [find where comment="LBBS-CLIENTES-WAN-AUTH-ONLY"]`. Dejar los gateways amplios deshabilitados.

**No habilitar la red Clientes para público todavía**: esto es un piloto de tráfico AUTH-only, NO completa el requisito de 3h absolutas contando reconexiones ni la gracia de 3min. Mientras on-logout esté deliberadamente deshabilitado, el Dashboard puede mostrar sesiones históricas como aún conectadas. Necesitamos un reconciliador de estado a prueba de reinicio, desvinculación + expiración y pruebas de fallos de red antes de producción general.
