# LBBS Staff v42 - 2 dispositivos de confianza automaticos

## Funcionamiento
El barbero conecta un telefono al AP Staff, abre el portal cautivo original y escribe DNI/CE y PIN personal. No ingresa la MAC. El MikroTik obtiene MAC e IP reales desde la tabla /ip hotspot host de lbbs-staff-hotspot, y reporta hosts por HTTPS usando el token privado del router. El backend solamente registra la MAC si PIN valido, empleado activo, host observado en los ultimos 75 segundos, y menos de dos dispositivos autorizados. El RPC de Supabase toma lock de credencial para evitar dos altas paralelas que excedan limite. La MAC revocada no se reactiva automaticamente.

El Dashboard muestra 0/2,1/2,2/2; una lista de MACs activas y revocadas, y el boton Revocar. Revocar deja hueco para un nuevo equipo que autentique por primera vez. El historial de MAC revocada permanece. Una MAC privada rotativa del movil cuenta como MAC distinta.

## Estado y seguridad
HotSpot Staff y sus schedulers SIGUEN DESHABILITADOS; Clientes debe permanecer operativo. En un intento previo, el script de fase 41 reporto failed; no hubo ACK ni usuarios nuevos. Esto NO equivale a un fallo de limite de dispositivos, y la causa de la sincronizacion aun requiere diagnostico. No abrir WAN ni activar Staff por este cambio.

Supabase: migracion 20261021163500_hotspot_staff_seen_host_autotrust_v42.sql (tabla privada y funcion de inscripcion). Portal: routeros/hotspot/portal/lbbs-cautive-staff/login.html. Router reportero: routeros/rebuild/42-lbbs-staff-host-attestation.rsc, scheduler inicialmente X disabled. Diagnostico sin secretos: routeros/rebuild/42-lbbs-staff-safe-diagnostic.rsc.

## Diagnostico inmediato de la fase 41, sin alterar red
1. Actualizar rama feat/wifi-staff-auto-enroll-v42 en VS Code.
2. Desde WinBox Files copiar 42-lbbs-staff-safe-diagnostic.rsc a flash/42-lbbs-staff-safe-diagnostic.rsc.
3. Ejecutar estos comandos:

    /system script run lbbs-env
    /import file-name=flash/42-lbbs-staff-safe-diagnostic.rsc

4. Compartir el resultado seguro: staff_backend_url_set, staff_router_token_set, staff_api_mode, staff_device_count y/o staff_api_failed_stage. No enviar valores secretos ni imprimir usuarios/router scripts.
5. Si falla fetch revisar en Vercel Production HOTSPOT_STAFF_PROVISIONING_KEY, LBBS_STAFF_ROUTER_AUTH_ENABLED=true y que se redeployo al cambiar variables. Si API responde staff-v41 pero sincronizador aun indica failed, inspeccionar su comportamiento en un piloto separado.

## Instalacion del reportero de hosts, aun deshabilitado
Tras confirmar API staff-v41, subir 42-lbbs-staff-host-attestation.rsc a flash y ejecutar una sola vez:

    /import file-name=flash/42-lbbs-staff-host-attestation.rsc
    /system scheduler print where name="lbbs-staff-hosts-v42"
    /ip hotspot print

El scheduler y el hotspot Staff deben permanecer con X. Para comprobar manualmente la API sin hosts:

    /system script run lbbs-env
    /system script run lbbs-staff-hosts-v42
    :global lbbsStaffHostsResult; :put $lbbsStaffHostsResult

Esperado al no haber equipos en Staff: ok seen=0. No habilitar el scheduler sin validar el backend.

## Proximo piloto de activacion de red
Necesita resolver fase41 y asegurar el Walled Garden HTTPS de app.labajaditabarberstudio.com y la regla separada hotspot=auth exclusivamente para bridge-staff. Con acceso de administracion Ethernet y control de rollback, activar HotSpot Staff, reporte de hosts 10s y sincronizador 20s. Probar: primero y segundo MAC obtienen 1/2 y 2/2 tras DNI/CE+PIN, tercero falla, PIN incorrecto falla; al revocar un equipo pierde su cuenta, cookie y sesion, y una tercera MAC nueva puede ocupar la vacante.

Nunca habilitar LBBS-GATE staff WAN OFF until captive proven. No cambiar lbbs-hotspot, lbbs-sync ni scripts de Clientes.

Nota: MAC+IP de RouterOS son evidencia de presencia local, pero no identidad de hardware criptografica. Para mayor garantia usar portal HTTPS y autenticacion WPA-Enterprise/certificados.
