# Red Hotspot — RouterOS base

El RB750Gr3 (hEX) enruta y ejecuta HotSpot; no tiene radio Wi‑Fi. El SSID lo emite un access point externo conectado a la interface, bridge o VLAN de clientes que se determine en sitio. El portal vive en el filesystem de RouterOS para poder cargar HTML, CSS, JavaScript y el logo aun cuando el cliente no tenga Internet. Next.js no corre en el router: el router sólo hace llamadas HTTPS salientes al dashboard.

## Archivos

- `routeros/hotspot/install.rsc.template`: instalación incremental y schedulers.
- `routeros/hotspot/scripts/lbbs-sync.rsc`: pull, `CREATE_VOUCHER` y ACK individual.
- `routeros/hotspot/scripts/lbbs-heartbeat.rsc`: heartbeat de RouterOS.
- `routeros/hotspot/portal/`: páginas locales que se cargan en `hotspot/lbbs-portal/`.

Sube los scripts y los archivos del portal por Files/WinBox o SFTP. Luego revisa, completa los placeholders y ejecuta manualmente el template. El template no resetea el equipo, no toca WAN, firewall, bridges existentes ni DHCP existente. Antes de importar, conviene probar los scripts manualmente en un router aislado y verificar sus logs sin copiar tokens a capturas.

Los scripts usan RouterOS v7 y `:deserialize from=json` / `:serialize to=json`; una versión sin esas funciones debe actualizarse, no recibir un parser JSON improvisado. La hora del router y su cadena de CA deben ser correctas para HTTPS. No se debe dejar `check-certificate=no` como solución permanente.

## Flujo

`lbbs-sync` usa el token local `LBBS_ROUTER_TOKEN` para llamar a `/api/wifi/router/pull`, crea el usuario HotSpot con `disabled=yes` y comentario `LBBS:<voucher-id>`, y confirma cada resultado a `/api/wifi/router/ack`. Buscar por nombre antes de crear hace la entrega idempotente. Nunca imprime token, username o password en logs.

Un voucher sincronizado sigue deshabilitado intencionalmente: la Parte 4 realizará DNI/código y sólo entonces podrá enviar `ACTIVATE_VOUCHER`, habilitar el usuario y vincular MAC. Esta etapa no integra DNI, customers ni activa sesiones.

El portal muestra el formulario final y contiene el form oculto CHAP (`$(chap-id)`, `$(chap-challenge)`, `$(link-login-only)`, `$(link-orig)`), pero el botón no hace login ni habilita Internet todavía. `status.html`, `logout.html` y `error.html` son locales y no revelan mensajes internos de RouterOS.

## Datos requeridos antes de instalar

1. Versión exacta RouterOS.
2. Interface, bridge o VLAN de clientes.
3. Subnet y gateway de clientes.
4. Pool DHCP/HotSpot.
5. HotSpot DNS name.
6. Access point externo.
7. SSID.
8. Contraseña Wi‑Fi.
9. URL pública HTTPS del dashboard/API.
10. Token individual del router.

Completa únicamente estos placeholders: `{{HOTSPOT_INTERFACE}}`, `{{HOTSPOT_SERVER_NAME}}`, `{{HOTSPOT_PROFILE_NAME}}`, `{{HOTSPOT_ADDRESS}}`, `{{HOTSPOT_POOL_NAME}}`, `{{HOTSPOT_POOL_RANGE}}`, `{{HOTSPOT_DNS_NAME}}`, `{{LBBS_API_BASE_URL}}`, `{{LBBS_ROUTER_TOKEN}}`, `{{SYNC_INTERVAL}}` y `{{HEARTBEAT_INTERVAL}}`. Valores recomendados para los dos últimos son `5s` y `30s`; siguen siendo placeholders hasta la instalación.

Queda para Parte 4: endpoint público cautivo, DNI/customers, activar usuario, bind MAC y el login CHAP efectivo. Parte 5 añadirá lifecycle de sesión y hooks de login/logout.
