# LBBS WiFi Staff — Fase 41

Estado 21/10/2026:
- Fase 40 instalada en hEX. Clientes activo; Staff HotSpot instalado pero DISABLED.
- Backend Staff, sincronizador RouterOS dedicado, PIN, dos MAC, sesión y revocación desarrollados en feat/wifi-staff-rollout-v1. NO promovidos a main.
- Migración 20261021152000_hotspot_staff_sync_state_v41.sql aplicada. Tabla privada con RLS, sin ACK inicial.
- Vercel impidió al conector consultar/configurar variables de entorno (403). Las variables NO están configuradas desde este chat. NUNCA habilitar Staff sin estos requisitos.
- El sincronizador 41 se instala DISABLED, sin abrir WAN ni HotSpot.

## Flujo

1. Administración genera PIN personal de seis dígitos, almacenado únicamente como hash scrypt. Registra hasta DOS dispositivos MAC autorizados manualmente en el Dashboard WiFi Staff; el portal no inscribe MACs por sí solo.
2. El backend autentica al router y calcula una cuenta local por MAC y por router. Cada cuenta tiene usuario técnico sf_ + UUID de dispositivo y contraseña HMAC-SHA256 de clave separada, router, dispositivo y hash del PIN. Renovar PIN rota las contraseñas de esos dispositivos.
3. El script 41 sincroniza SOLO cuentas etiquetadas LBBSSTAFF: en el servidor lbbs-staff-hotspot, protege la MAC, borra sesiones y cookies al revocar o rotar, y confirma por ACK la revisión completa de cuentas.
4. El portal original, desde flash/lbbs-staff/login.html, valida DNI o CE y PIN vía HTTPS en /api/hotspots/staff/authorize. La API tiene límite de intentos y exige MAC previamente registrada y ACK actual del router. Devuelve credencial técnica para HTTP-CHAP; actualiza el desafío CHAP antes de conectar.
5. Tras autenticarse, el perfil Staff utiliza MAC cookie durante 30 días para reconexiones del dispositivo autorizado. Revocaciones eliminan cookies. Hooks de login/logout notifican sesiones a Supabase.

**Nunca confundir shared-users=2 con dos MAC autorizadas**: la DB limita dos dispositivos y cada usuario de RouterOS queda ligado a una MAC.

## Variables seguras

En Settings / Environment Variables del proyecto Vercel, añadir manualmente:
- HOTSPOT_STAFF_PROVISIONING_KEY: clave base64 criptográficamente aleatoria de 32 bytes. Secreto NUEVO, independiente de Clientes.
- LBBS_STAFF_ROUTER_AUTH_ENABLED: true SOLO después de publicar las APIs en producción y preparar piloto con MikroTik; dejar false/no configurado mientras tanto.

Generar localmente en PowerShell, sin compartir el resultado en Git ni en el chat:

    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    [Convert]::ToBase64String($bytes)
    $rng.Dispose()

Importante: el portal de MikroTik llama a https://app.labajaditabarberstudio.com; publicar exclusivamente en Preview NO hace que el router reconozca los endpoints nuevos. No configurar el flag true antes de desplegar en producción las rutas y la nueva librería.

## VS Code / pruebas

    git switch feat/wifi-staff-rollout-v1
    git pull --ff-only origin feat/wifi-staff-rollout-v1
    npx vitest run tests/unit/hotspot-staff-v41-contract.test.ts tests/unit/hotspot-staff-one-device-contract.test.ts
    npx tsc --noEmit

Conservar los archivos locales sin commit que el usuario tiene en el módulo Control. No limpiar ni resetear el repo.

## RouterOS: instalación por etapas

1. Copiar el nuevo login.html (operativo, NO public/wifi-staff-preview) desde routeros/hotspot/portal/lbbs-cautive-staff/ a flash/lbbs-staff/login.html.
2. Tras publicación y configuración de variables de Vercel, subir routeros/rebuild/41-lbbs-staff-sync.rsc a flash/41-lbbs-staff-sync.rsc.
3. Ejecutar UNA vez, con WinBox de administración, no desde Staff:

    /import file-name=flash/41-lbbs-staff-sync.rsc
    /system scheduler print where name="lbbs-staff-sync"
    /ip hotspot user profile print where name="lbbs-staff-user-profile"
    /ip hotspot profile print where name="lbbs-staff-hotspot-profile"
    /ip hotspot print

   Esperar lbbs-staff-sync con X (deshabilitado), HotSpot Staff con X, Clientes habilitado. El import instala hooks de sesión y MAC cookie solo en el perfil Staff.
4. Registrar MAC de prueba en Dashboard. Ejecutar SOLO manualmente:

    /system script run lbbs-env
    /system script run lbbs-staff-sync
    :global lbbsStaffLastSync; :put $lbbsStaffLastSync
    /ip hotspot user print where server="lbbs-staff-hotspot"

   Resultado esperado: ok devices=1 (o 2). No ejecutar /system script print detail ni imprimir contraseñas/tokens.
5. Verificar el ACK de la revisión en hotspot_staff_sync_state_v41. Tras 2–3 sincronizaciones manuales correctas, habilitar solamente scheduler lbbs-staff-sync; no modificar lbbs-sync de Clientes.
6. **NO habilitar todavía Staff HotSpot ni Staff WAN.** Falta instalar la excepción preauth HTTPS hacia la API y la regla de WAN exclusiva hotspot=auth, y realizar pruebas de acceso autorizado/no autorizado antes de abrir navegación.

## Pruebas definitivas

- Primera MAC registrada valida DNI/CE + PIN, HTTP-CHAP y LOGIN Staff.
- Segunda MAC del mismo empleado accede; tercera MAC es rechazada y no se registra por la web.
- Revocar una MAC, cambiar el PIN o deshabilitar empleado elimina cuenta, cookie y sesión afectadas en RouterOS mediante el siguiente sync. Mantener Clientes intacto.
- Reconexion por MAC cookie y registros LOGIN/LOGOUT.
- Simular falla HTTPS: sin snapshot entero NO ACK ni revocaciones por ausencia inferida.
- Reiniciar el router y revisar que lbbs-env se recarga desde el scheduler.
- Sin login Staff, Internet permanece bloqueado. La regla general LBBS-GATE staff WAN OFF until captive proven debe permanecer DISABLED SIEMPRE.

Contención sin afectar Clientes:

    /system scheduler disable [find where name="lbbs-staff-sync"]
    /ip hotspot disable [find where name="lbbs-staff-hotspot"]

El portal HTTP-CHAP no es una página HTTPS cifrada de extremo a extremo: aunque la API sí usa HTTPS, existe un riesgo de modificación de HTML en la red local. Considerar TLS del portal para despliegue general.
