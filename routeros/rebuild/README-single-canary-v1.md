# LBBS WiFi Clientes — piloto de expiración de UN voucher (LBBS36)

Fecha: 20 octubre 2026. Rama: `infra/wifi-netinstall-rebuild`.

## Estado real y protección

- Migración `20261020145000_hotspot_reconcile_one_voucher_canary.sql` aplicada en Supabase `db_lbbs_v2`. Tabla privada `hotspot_reconcile_canary_v1` creada con **cero filas** y RLS.
- Despliegue **main** verificado: `a5de34632c78736cfcc0972c314615bdbcb2efc5`, Vercel producción READY (`dpl_9GVSUDjG91zkkFGrj83mvE2HHfBC`). La ruta habitual y la canaria devuelven GET=405 en el dominio oficial (son POST). Sin POST autenticado aún.
- Comprobación SQL tras deploy: `canary_rows=0`, `armed_canaries=0`, `canary_commands=0`, `active_vouchers=1`. El voucher activo existente **no** fue armado automáticamente.
- La API normal `/api/wifi/router/reconcile` se ha fijado en **observe-only** (sin opción de revocación masiva), con publicación selectiva a `main`.
- API independiente `POST /api/wifi/router/reconcile/canary`: acepta inventario autenticado del router y `{canary:true,enforce:false,activeVoucherIds:[...]}`. No acepta ID objetivo desde MikroTik. Lee el único ID autorizado por operador en Supabase.
- El instalador `36-lbbs-clientes-single-canary.rsc` es independiente de LBBS35, se instala con scheduler **deshabilitado**, jamás selecciona vouchers ni modifica red, perfiles ni portal.
- Una vez que la orden canaria se ENCOLA, la propia base desactiva la autorización y el script deshabilita su scheduler. La expiración en Dashboard ocurre solamente tras el ACK aplicado de `lbbs-sync` (trigger del parche v2 anterior).

## Barreras antirrevocación incorrecta

1. El operador debe seleccionar **a mano** el UUID del voucher de prueba. No seleccionar automáticamente el último voucher `active`.
2. La autorización dura como máximo 45 minutos (usar 25 para el piloto).
3. El voucher debe ser realmente `active`, con MAC asociada, mismo router y sin revocación pendiente.
4. **Después de armar**, el router debe reportar al voucher PRESENTE por lo menos una vez; un `active` viejo de DB no sirve.
5. Después debe registrar ausencia; al menos 4 lecturas, 3 min de ausencia sostenida y 3 min desde último LOGIN, en snapshots recientes (<=75s).
6. Se rechaza una orden previa de expiración del mismo voucher.
7. La orden SQL usa exclusivamente el UUID de la fila canaria; todos los demás vouchers quedan fuera del proceso.
8. El controlador 33 sigue deshabilitado, el 35 sigue funcionando solo en observación. El código local nunca solicita `enforce=true`.

## Instalación segura de RouterOS (una sola vez)

Mantener 33 deshabilitado:

```routeros
/system scheduler disable [find where name="lbbs-reconcile"]
/system script print where name="lbbs-canary-v1"
/system scheduler print where name="lbbs-canary-v1"
```

Los dos últimos deben mostrar listas vacías. Subir mediante WinBox/Files `routeros/rebuild/36-lbbs-clientes-single-canary.rsc` a `flash/36-lbbs-clientes-single-canary.rsc`, luego:

```routeros
/import file-name=flash/36-lbbs-clientes-single-canary.rsc
/system script run lbbs-env
/system script run lbbs-canary-v1
:global lbbsCanaryLastResult; :put $lbbsCanaryLastResult
/system scheduler print where name="lbbs-canary-v1"
```

Antes de armar, esperar `state=unarmed queued=0` y scheduler con bandera `X`. Si responde error, detener; nunca imprimir el secreto del script `lbbs-env`.

## ARMAR solo tras identificar un voucher nuevo de prueba

Recomendado: generar voucher nuevo, conectar el teléfono, confirmar `/ip hotspot active` y Dashboard `Activo`; leer su ID de UUID desde consultas administrativas, **sin publicar código WiFi, DNI o MAC en el chat**.

SQL de armado en Supabase SQL Editor con permisos administrativos. Sustituir exclusivamente `REEMPLAZAR_UUID_VOUCHER_PRUEBA` por el UUID correcto:

```sql
with selected as (
  select v.id, v.router_id
  from public.wifi_access_vouchers v
  where v.id = 'REEMPLAZAR_UUID_VOUCHER_PRUEBA'::uuid
    and v.status = 'active'
    and v.device_mac is not null
    and v.revocation_requested_at is null
    and not exists (
      select 1 from public.hotspot_router_commands c
      where c.voucher_id=v.id and c.command_type='EXPIRE_VOUCHER'
    )
)
insert into public.hotspot_reconcile_canary_v1 (
  router_id,voucher_id,enabled,armed_at,expires_at,command_queued_at
)
select router_id,id,true,now(),now()+interval '25 minutes',null from selected
on conflict (router_id) do update
set voucher_id=excluded.voucher_id,enabled=true,armed_at=excluded.armed_at,
    expires_at=excluded.expires_at,command_queued_at=null,updated_at=now()
returning router_id,voucher_id,enabled,expires_at;
```

**Abort if 0 rows returned.** No conectar un segundo dispositivo. No armar un voucher antiguo ya desconectado. Debe observarse `seen=1` en LBBS35 *después* del armado; en caso contrario, la expiración canaria quedará bloqueada por diseño.

## Ensayo piloto

1. Instalar LBBS36, **NO habilitar scheduler todavía**, probar manual: `state=unarmed queued=0`.
2. Conectar teléfono con voucher **nuevo**, esperar LBBS35 `seen=1`.
3. Armar SQL con ese voucher. Con el teléfono todavía conectado, ejecutar `/system script run lbbs-canary-v1` y esperar `state=voucher_present queued=0`; ello también captura presencia posterior al armado.
4. Habilitar SÓLO el canario: `/system scheduler enable [find where name="lbbs-canary-v1"]`; el 35 continúa, y el 33 permanece deshabilitado.
5. Apagar WiFi. Esperar expulsión HotSpot y luego 3+ min de ausencia observada (pueden ser 6-8min desde apagado físico).
6. Consultar `lbbsCanaryLastResult`; esperado `state=queued queued=1`. El scheduler LBBS36 debe autodeshabilitarse (bandera X). `lbbs-sync` debería ejecutar la orden de único voucher y enviar ACK.
7. Confirmar Dashboard `Expirado`, RouterOS sin usuario/sesión/cookie del voucher y **otro voucher no afectado**. Evitar imprimir códigos, tokens, DNI o MAC.

**Asegurar que haya una observación positiva posterior al armado**, porque la SQL impide encolar si `last_present_at <= armed_at`. Si se ejecuta el script inmediatamente tras armar cuando el teléfono está conectado, v2 observará esa presencia.

## Rollback inmediato

En MikroTik:

```routeros
/system scheduler disable [find where name="lbbs-canary-v1"]
```

En Supabase (no borra sesiones ni emite comandos):

```sql
update public.hotspot_reconcile_canary_v1
set enabled=false,updated_at=now()
where enabled=true;
```

**Advertencia:** si una orden ya está `pending/processing`, desarmar no cancela esa orden; comprobar estado ANTES de actuar. Nunca revertir una orden aplicada borrando filas de auditoría. Si falta el ACK, investigar `lbbs-sync` y cola.

## Límite temporal real

No se garantiza expiración física exactamente a los 3 minutos: RouterOS puede mantener `/ip hotspot active` hasta el timeout de detección (~3m), y el observador espera otros 3 minutos de ausencia. El piloto medirá ese desfase antes de diseñar la política general.
