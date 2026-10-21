# LBBS WiFi Staff — auditoría y puesta en marcha segura

## Estado auditado el 21/10/2026

- WiFi Clientes v2.1 está operativo: **no modificar** scripts 31/32/35, `lbbs-sync`, HotSpot Clientes ni sus reglas WAN.
- Backend Staff ya tiene `hotspot_staff_credentials`, `hotspot_staff_devices`, `hotspot_staff_sessions`, Dashboard Staff, validación de identidad DNI/CE y bloqueo de intentos. Actualmente la autenticación Router-origin Staff está bloqueada por `LBBS_STAFF_ROUTER_AUTH_ENABLED`; las rutas públicas de autorización devuelven 503.
- El Portal Staff HTML estaba preparado **solamente** en `infra/wifi-netinstall-rebuild`. Su formulario no aprovisiona usuarios en RouterOS; por tanto **no** basta con copiar HTML y activar WAN.
- En producción hay 1 credencial Staff, **0 dispositivos autorizados** y **0 sesiones Staff**. El código se guarda como hash scrypt, sin contraseña reversible; no existe aún aprovisionamiento de perfiles/usuarios HotSpot. No activar el flag de autenticación hasta resolver este paso.
- Requisito de negocio actualizado: Staff **máximo 2 dispositivos autorizados por empleado**, acceso persistente, independiente de vouchers de Clientes. Esta rama prepara la corrección del límite en SQL/Dashboard. No se aplicó todavía en producción.
- Hardware previsto: AP Staff en **ether4** > `bridge-staff`, 10.10.20.0/24, gateway 10.10.20.1; Clientes en ether5/10.10.10.0/24. No puentear ambas redes.

## Inspección RouterOS: SOLO CONSULTA, NO MODIFICA NADA

Ejecutar en terminal WinBox, devolver salidas sin secretos:

```routeros
/interface bridge port print where bridge="bridge-staff"
/ip address print where interface="bridge-staff"
/ip dhcp-server print where interface="bridge-staff"
/ip hotspot print
/ip hotspot profile print
/ip hotspot user profile print
/ip firewall filter print where comment~"STAFF"
/ip firewall filter print where comment~"staff"
```

Pegar salidas sin `/system script print detail`, `/export show-sensitive`, contraseñas, códigos Staff ni token de `lbbs-env`.

## Condiciones de seguridad previas a instalar Staff

1. `bridge-staff` debe contener **solo** ether4, con dirección 10.10.20.1/24 y DHCP `dhcp-staff`; no debe verse ningún puente al `bridge-hotspot` de Clientes.
2. Comprobar acceso administrativo independiente por ether2/3. No alterar NAT, rutas, WAN Starlink, AP Clientes ni configuración persistente de LBBS.
3. `/ip hotspot print` debe permitir saber si existe ya un HotSpot Staff en `bridge-staff`. Si existe, auditarlo y preparar un parche in-place, NO importarlo dos veces.
4. El firewall debe **denegar tráfico Staff no autenticado** hacia Internet y hacia Clientes/Admin; su futura regla de WAN será estrictamente `hotspot=auth`, colocada antes del `LBBS-BOOT-Forward-Drop`. **NO** habilitar `LBBS-GATE staff WAN OFF until captive proven` (regla amplia sin `hotspot=auth`).
5. Una cuenta Staff solo podrá aprovisionarse al router después de vincular **hasta dos MAC** a una credencial activa y a un empleado activo de la sede; DNI/CE + código deben coincidir con la credencial, y el secreto no puede exponerse a usuarios anónimos.
6. Un código actualmente almacenado como hash no puede transmitirse a MikroTik; la implementación necesita generar una credencial nueva/rotar bajo cifrado autenticado durante el aprovisionamiento por canal firmado RouterOS. No almacenar el PIN en texto plano en DB/logs/frontend.
7. La deshabilitación o revocación de empleado/dispositivo debe desactivar acceso y retirar sesiones/cookies Staff, exclusivamente en el servidor HotSpot Staff. Nunca tocar cookies/usuarios de `lbbs-hotspot` Clientes.
8. Validar 1 Staff autorizado y 1 Staff no autorizado antes de abrir la regla `hotspot=auth`; después verificar reinicio de hEX y desconexiones/reconexiones, separación de redes y revocación.

## Diagnóstico del hEX verificado por el operador

- `bridge-staff`: **solo** `ether4`.
- Gateway Staff: **10.10.20.1/24**.
- DHCP Staff: `dhcp-staff` con pool `pool-staff`, lease 1h.
- `/ip hotspot print`: **solo** `lbbs-hotspot` en `bridge-hotspot` (Clientes).
- No existe todavía `lbbs-staff-hotspot`, su perfil ni un perfil Staff.
- `LBBS-GATE staff WAN OFF until captive proven`: **X deshabilitada**. Mantener así; no hay Internet Staff abierto.
- Las reglas Staff activas en INPUT permiten únicamente DHCP/DNS y servicios internos del portal en `bridge-staff`.
- Confirmación: **no realizar reset, bridge adicional ni reaplicar 00/10/20/30**.

## Paso siguiente: instalador 40 — HotSpot Staff creado pero DESHABILITADO

La rama `feat/wifi-staff-rollout-v1` contiene:

- `routeros/rebuild/staff-staged-portal/login.html`: splash de preparación, **no solicita credenciales ni abre sesión**.
- `routeros/rebuild/40-lbbs-staff-hotspot-stage.rsc`: instalador con precondiciones del router real. Crea `lbbs-staff-hotspot-profile`, `lbbs-staff-user-profile` y `lbbs-staff-hotspot` **disabled=yes**, y no cambia ninguna ruta, puerto, regla WAN, HotSpot Clientes ni credenciales.
- `supabase/migrations/20261021141000_hotspot_staff_one_device_safe.sql`: **aplicada inicialmente** con máximo 1; quedó reemplazada por la migración posterior de máximo 2 dispositivos. El trigger actualmente garantiza 2 MAC Staff autorizadas; validado en Supabase (1 credencial, 0 dispositivos, 0 sesiones).

**Instalación física por WinBox (no ejecutar hasta tener ambos archivos):**

1. WinBox > Files > `flash` > New Folder `lbbs-staff`.
2. Copiar *solo* `staff-staged-portal/login.html` a `flash/lbbs-staff/login.html`.
3. Subir `40-lbbs-staff-hotspot-stage.rsc` a `flash/40-lbbs-staff-hotspot-stage.rsc`.
4. Confirmar que se mantiene una conexión WinBox desde la red de administración, no por la red Staff.
5. Ejecutar en Terminal:

```routeros
/import file-name=flash/40-lbbs-staff-hotspot-stage.rsc
/ip hotspot print where name="lbbs-staff-hotspot"
/ip hotspot profile print where name="lbbs-staff-hotspot-profile"
/ip hotspot user profile print where name="lbbs-staff-user-profile"
/ip firewall filter print where comment="LBBS-GATE staff WAN OFF until captive proven"
/ip hotspot print where name="lbbs-hotspot"
```

**Éxito:** `lbbs-staff-hotspot` aparece con **X / DISABLED**, el portal Clientes `lbbs-hotspot` sigue habilitado y la regla WAN general Staff permanece con **X / DISABLED**. No hay acceso Staff a Internet todavía (intencional).

**Si el import muestra un error**, parar y compartir sólo mensaje de error y `/ip hotspot print`. No repetir el import de forma automática: pudo quedar parte de la configuración creada.

**No ejecutar todavía:**

```routeros
/ip hotspot enable [find where name="lbbs-staff-hotspot"]
/ip firewall filter enable [find where comment="LBBS-GATE staff WAN OFF until captive proven"]
```

La segunda instrucción abriría WAN Staff sin `hotspot=auth` y no se usará ni al finalizar. La futura regla autorizada debe estar limitada a `in-interface=bridge-staff src-address=10.10.20.0/24 out-interface=ether1 hotspot=auth`. Antes de activar cualquier WAN hace falta integrar el PIN cifrado, alta/revocación por MAC en el servidor Staff y sincronización independiente de Clientes.

## Estado de despliegue de esta rama

**Fase de hardening desarrollada (SQL de máximo 2 dispositivos aplicada en Supabase; frontend sin promover a producción):** `feat/wifi-staff-rollout-v1` incluye migración que impone dos dispositivos, protecciones de conflicto preexistente y UI/API adaptadas. El aprovisionamiento RouterOS Staff y su HotSpot separado quedan pendientes de la inspección del hardware. No activar Staff solo por tener esta rama compilada.

Una vez recibidos los siete listados anteriores, construir el **instalador incremental no destructivo** específico del estado del hEX (solo Staff) y el backend de aprovisionamiento cifrado. Auditar en rama, instalar primero deshabilitado, probar credencial de ensayo, y entonces habilitar WAN auth-only.

## Ajuste confirmado de firewall + error del instalador 40

El operador verificó en el hEX que la regla final real existe:

```routeros
12 ;;; LBBS-BOOT-Forward-Drop
   chain=forward action=drop
```

El instalador viejo abortó en la línea 15 con `LBBS40: default forward deny not active` por una consulta `find where comment=... and disabled=no` que no coincidió en RouterOS. La versión corregida **no elimina ese control de seguridad**: localiza la regla por comentario y comprueba `chain=forward`, `action=drop` y `disabled=false` por separado. Los cambios se hacen únicamente en el archivo `40-lbbs-staff-hotspot-stage.rsc` de la rama `feat/wifi-staff-rollout-v1`.

**Import anterior se detuvo antes de crear objetos** (todos los `add` están por debajo de la comprobación que falló); `/ip hotspot print where interface="bridge-staff"` estaba vacío. Para reintentar:

1. En terminal de VS Code, desde el directorio de `lbbs-v2`: `git status`, `git fetch origin`, `git switch feat/wifi-staff-rollout-v1` (si no existe: `git switch -c feat/wifi-staff-rollout-v1 --track origin/feat/wifi-staff-rollout-v1`), `git pull --ff-only origin feat/wifi-staff-rollout-v1`.
2. **Reemplazar** en WinBox Files el archivo `flash/40-lbbs-staff-hotspot-stage.rsc` por el más reciente. Importar ese archivo actualizado **una sola vez**. No usar el que quedó anteriormente en el hEX.
3. Ejecutar `/ip hotspot print`; buscar un nuevo `lbbs-staff-hotspot` con **X (disabled)**, y verificar `lbbs-hotspot` de Clientes sigue habilitado.
4. En cualquier nuevo error, detener. No abrir WAN Staff ni habilitar el servidor HotSpot antes de la fase de autenticación.

**Límite Staff actualizado:** migración `20261021144500_hotspot_staff_two_devices_safe.sql` **aplicada**, elimina el índice único de un dispositivo y cambia el trigger a **2 MAC autorizadas** con bloqueo de concurrencia. La migración previa `20261021141000` queda en historial por trazabilidad. El Dashboard en esta rama muestra `0/2`, `1/2`, `2/2`; aún es staging, sin provisión de acceso real en RouterOS.
