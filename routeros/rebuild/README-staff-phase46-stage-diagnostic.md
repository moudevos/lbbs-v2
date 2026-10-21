# Fase 46 — diagnóstico por etapas de lbbs-staff-sync (RouterOS 7.23.8)

## Antecedentes verificados
- WiFi Clientes sigue activo; HotSpot Staff instalado y deshabilitado (X).
- Scheduler Staff instalado y deshabilitado (X).
- RSC43: backend Staff en Vercel Production responde "ready" y muestra 1 dispositivo autorizado.
- RSC44: lectura del backend exitosa, pero falla en validacion global "entry_validate".
- RSC45: ALL READONLY CHECKS PASSED para una cuenta; no se detectaron datos invalidos ni colisiones.
- Ejecutar manualmente lbbs-staff-sync devuelve "failed" y 0 cuentas HotSpot Staff. Es probable que falle al crear usuario, pero NO esta comprobado; ACK podria fallar en un momento posterior.

## Parche
Se proporciona el instalador `46-lbbs-staff-sync-stage-patch.rsc` que sustituye EXCLUSIVAMENTE el codigo fuente del script existente `lbbs-staff-sync`. No agrega nuevos usuarios al instalar, no habilita schedulers y no modifica HotSpot Clientes, firewall, DHCP o NAT.

Antes de cambiar nada, comprueba:
- Script/scheduler de Staff existen 1 vez y scheduler sigue deshabilitado.
- HotSpot Staff existe en bridge-staff y sigue deshabilitado.
- HotSpot Clientes esta habilitado.
- Regla WAN amplia Staff sigue deshabilitada.

El nuevo script registra un estado depurado en una variable global, sin imprimir usuario, MAC, contrasena tecnica, token ni errores crudos:
- `failed stage=fetch_desired`
- `failed stage=decode_desired`
- `failed stage=entry_validate`
- `failed stage=create_staff_user`
- `failed stage=update_staff_user`
- `failed stage=verify_staff_user`
- `failed stage=revoke_obsolete_users`
- `failed stage=serialize_ack`
- `failed stage=send_ack`

Si la sincronizacion llega a completarse, devuelve `ok devices=1` (o el numero correspondiente).

## Procedimiento en hEX (WinBox)
Desde la rama feat/wifi-staff-auto-enroll-v42 descargar `routeros/rebuild/46-lbbs-staff-sync-stage-patch.rsc`. Copiarlo al equipo a `flash/46-lbbs-staff-sync-stage-patch.rsc`.

Importar una sola vez:
    /import file-name=flash/46-lbbs-staff-sync-stage-patch.rsc

La importacion debe mostrar: LBBS46_PATCH_INSTALLED_STAGED. No reinstalar RSC40/RSC41.

Luego ejecutar de manera manual una sola vez:
    /system script run lbbs-env
    /system script run lbbs-staff-sync
    :global lbbsStaffLastSync; :put $lbbsStaffLastSync
    /ip hotspot user print count-only where server="lbbs-staff-hotspot"

Compartir los resultados. No imprimir configuracion extendida de usuarios, scripts ni variables de entorno. Una cuenta provisionada no implica Internet Staff habilitado; HotSpot Staff sigue X.

## Vuelta atras
Si hay problemas en la importacion o ejecucion, el archivo `46-lbbs-staff-sync-rollback.rsc` restaura exactamente la fuente RSC41 original, SIN ejecutarla ni cambiar Clientes. Subir a flash e importar solo si es necesario. No ejecutar rollback a la vez que sincronizacion programada activa.

## Siguiente accion tecnica
Si el nuevo estado dice "failed stage=create_staff_user", revisar los parametros concretos de /ip hotspot user add en RouterOS 7.23.8; no deshabilitar controles MAC ni reutilizar usuarios de Clientes. Si falla el ACK, comprobar el endpoint de ACK y la version de esquema actual.

El objetivo final sigue siendo el alta automatica de los primeros dos dispositivos con PIN valido, verificacion fisica MAC/IP por MikroTik y revocacion desde Dashboard. Esta fase NO habilita el portal ni salida WAN de Staff.
