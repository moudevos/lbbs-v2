# LBBS — Netinstall limpio (BORRADO BLOQUEADO)

Version objetivo: hEX RB750Gr3, RouterOS 7.23.8, arquitectura mmips.

Esta carpeta NO importa scripts HotSpot antiguos. Los componentes actuales de Staff no aprovisionan usuarios en RouterOS (la API aún puede devolver provisioned: false); falta el instalador funcional Staff y validar la regla Clientes de reconexión de tres minutos. Por ello el reset productivo NO está autorizado todavía.

## 00-lbbs-bootstrap.rsc

Usar únicamente como **Configure script** en Netinstall sobre RouterOS limpio, con **Keep old configuration** desactivado. El comportamiento exacto del selector **Apply Default Config** al usar **Configure Script** se validará con la interfaz de Netinstall antes de instalar; no proceder hasta confirmarlo. No contiene credenciales. Establece **ether2 y ether3** como Administración (192.168.88.1/24), DHCP y WinBox/IP-MAC limitado a Administración. Bloquea enrutamiento y entradas no administrativas. Es un script de una sola instalación, no una actualización idempotente.

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
