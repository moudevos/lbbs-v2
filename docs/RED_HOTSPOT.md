# Red Hotspot LBBS

El portal cautivo es HTML, CSS y JavaScript estático dentro de RouterOS (`routeros/hotspot/lbbs`), no una aplicación Next.js. Antes de iniciar sesión CHAP solicita DNI y código; el Walled Garden solo permite los tres endpoints cautivos de LBBS.

Recepción genera un voucher, el router crea el usuario deshabilitado y solo un flujo cautivo válido lo vincula a un cliente y a una MAC. La cola entrega `ACTIVATE_VOUCHER`; el router fija la MAC y habilita el usuario. El primer LOGIN, no la identificación, inicia las tres horas. La reconexión de la misma MAC usa mac-cookie sin extender el vencimiento.

Los visitantes nuevos crean únicamente `customers` con `source=hotspot`; no se crean cuentas Auth, rewards ni beneficios. “PREMIUM” es copy comercial. DNI, teléfono y nombre no se envían al router ni se guardan en username/comentarios.

Pendiente para instalación: bridge/VLAN de clientes, subnet, pool, gateway, DNS name HotSpot, AP, SSID, contraseña Wi-Fi, dominio público LBBS, versión RouterOS y token por router. El hEX RB750Gr3 no tiene radio Wi-Fi; el AP externo entrega el SSID.
