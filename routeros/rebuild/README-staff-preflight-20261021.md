# LBBS WiFi Staff — auditoría y puesta en marcha segura

## Estado auditado el 21/10/2026

- WiFi Clientes v2.1 está operativo: **no modificar** scripts 31/32/35, `lbbs-sync`, HotSpot Clientes ni sus reglas WAN.
- Backend Staff ya tiene `hotspot_staff_credentials`, `hotspot_staff_devices`, `hotspot_staff_sessions`, Dashboard Staff, validación de identidad DNI/CE y bloqueo de intentos. Actualmente la autenticación Router-origin Staff está bloqueada por `LBBS_STAFF_ROUTER_AUTH_ENABLED`; las rutas públicas de autorización devuelven 503.
- El Portal Staff HTML estaba preparado **solamente** en `infra/wifi-netinstall-rebuild`. Su formulario no aprovisiona usuarios en RouterOS; por tanto **no** basta con copiar HTML y activar WAN.
- En producción hay 1 credencial Staff, **0 dispositivos autorizados** y **0 sesiones Staff**. El código se guarda como hash scrypt, sin contraseña reversible; no existe aún aprovisionamiento de perfiles/usuarios HotSpot. No activar el flag de autenticación hasta resolver este paso.
- Requisito de negocio actualizado: Staff **máximo 1 dispositivo autorizado por empleado**, acceso persistente, independiente de vouchers de Clientes. Esta rama prepara la corrección del límite en SQL/Dashboard. No se aplicó todavía en producción.
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
5. Una cuenta Staff solo podrá aprovisionarse al router después de vincular **un único MAC** a una credencial activa y a un empleado activo de la sede; DNI/CE + código deben coincidir con la credencial, y el secreto no puede exponerse a usuarios anónimos.
6. Un código actualmente almacenado como hash no puede transmitirse a MikroTik; la implementación necesita generar una credencial nueva/rotar bajo cifrado autenticado durante el aprovisionamiento por canal firmado RouterOS. No almacenar el PIN en texto plano en DB/logs/frontend.
7. La deshabilitación o revocación de empleado/dispositivo debe desactivar acceso y retirar sesiones/cookies Staff, exclusivamente en el servidor HotSpot Staff. Nunca tocar cookies/usuarios de `lbbs-hotspot` Clientes.
8. Validar 1 Staff autorizado y 1 Staff no autorizado antes de abrir la regla `hotspot=auth`; después verificar reinicio de hEX y desconexiones/reconexiones, separación de redes y revocación.

## Estado de despliegue de esta rama

**Fase de hardening desarrollada, NO desplegada todavía:** `feat/wifi-staff-rollout-v1` incluye migración que impone un dispositivo, protecciones de conflicto preexistente y UI/API adaptadas. El aprovisionamiento RouterOS Staff y su HotSpot separado quedan pendientes de la inspección del hardware. No activar Staff solo por tener esta rama compilada.

Una vez recibidos los siete listados anteriores, construir el **instalador incremental no destructivo** específico del estado del hEX (solo Staff) y el backend de aprovisionamiento cifrado. Auditar en rama, instalar primero deshabilitado, probar credencial de ensayo, y entonces habilitar WAN auth-only.
