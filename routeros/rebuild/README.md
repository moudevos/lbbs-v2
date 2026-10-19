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
