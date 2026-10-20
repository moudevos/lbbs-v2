# LBBS WiFi Clientes v2.1 — cierre de producción (20/10/2026)

**Despliegue realizado:** Supabase migraciones `20261020162500` y `20261020163500` aplicadas. API y Dashboard publicados selectivamente en `main` commit `35c3abe127d0254799efba8a805e73cb0d03d232`; Vercel producción `dpl_2N8TxfsyYB6gJgFMjF5YvyPm51oj` READY. Configuración `hotspot_general_reconcile_config_v21` habilitada SOLO en router `lbbs-la-bajadita-san-juan` a las **2026-10-20 21:24:57 UTC (16:24:57 Perú)**. Primera lectura posterior: router online, 1 presencia activa verificada, 1 voucher histórico ausente, 0 órdenes generales encoladas. El voucher histórico no se revoca retroactivamente sin nueva presencia real.

**Corrección posterior al despliegue:** la prueba con logs reales detectó PostgreSQL `42702` en la validación de inventario del RPC general (alias `v` colisionaba con variable PL/pgSQL). Hotfix aplicado y versionado en `supabase/migrations/20261020164500_hotspot_general_v21_fix_42702.sql`: se renombró el alias SQL a `w`. Prueba SQL de RPC con router inexistente devolvió `disabled,0`; Vercel dejó de registrar errores 42702, y a las 21:32:14 UTC el router estaba en línea, los snapshots se actualizaban (<12s), 1 sesión verificada y 0 expiraciones generales incorrectas. **No ejecutar otra vez el SQL a mano.**

**Pendiente de ensayo físico final:** apagar/reactivar WiFi en un voucher nuevo posterior a habilitación y comprobar `EXPIRE_VOUCHER` con `source=general_v21` en status `applied`, Dashboard `Expirado` y rechazo de código. Sin ese ensayo, considerar desplegado y habilitado, **no verificado todavía extremo a extremo en modo general**; la lógica canaria sí fue validada end-to-end.

## Alcance verificado y cambio

Se validó el voucher canario LBBS36: un `EXPIRE_VOUCHER`, un `applied`, estado `expired`, evento `SESSION_EXPIRED`, rechaza reutilización. La automatización general usa exclusivamente el inventario **ya operativo** de `lbbs-presence-v2` (35), cada 30s. **No instalar otro script** ni tocar HotSpot, portal o Staff.

- SQL nuevo: `supabase/migrations/20261020162500_hotspot_general_reconcile_v21.sql`.
- API POST `/api/wifi/router/reconcile`: llama al observador v2 siempre con `p_enforce=false`, y después a un RPC aislado de generalización. **Mantiene** `version=2,mode=observe,queued=0` para el script 35. Nuevo campo informativo de API `autoQueued` (0/1), que el script 35 ignora.
- Tabla `hotspot_general_reconcile_config_v21`: privada RLS, una fila por router, `enabled=false` por defecto, `enabled_at` no nulo para habilitar.
- Dashboard: `Conectados` requiere presencia **positiva** de `/ip hotspot active`, `missing_since=null`, snapshots <90s y router online; voucher `active` sin sesión **ya no cuenta** como conectado. Estado comercial del voucher sigue `Activo` hasta expiración ACK.
- `EXPIRE_VOUCHER` se encola uno por iteración (máximo uno cada 30s); `lbbs-sync` lo ejecuta y confirma. Solo el ACK permite modificar voucher a `expired`.

## Barreras antiexpulsión

En modo general se requieren: voucher `active`, primer LOGIN, MAC fija, sin solicitud de revocación, últimos snapshots frescos, **primera presencia positiva posterior al instante de activar general**, ningún LOGIN posterior a esa presencia. Para desconexiones: inventario actual excluye UUID, `missing_since` posterior a habilitación y a la presencia, >=4 snapshots negativos consecutivos sin saltos >90s (reconciliador base reinicia conteo), >=3min desde primera ausencia, >=3min desde último LOGIN. Se evita toda orden previa `EXPIRE_VOUCHER` y `REVOKE_VOUCHER`. Para límite de 3h, expire cuando `session_expires_at <= now()` aun si sigue conectado, pero solamente para vouchers con presencia verificada posterior al encendido del sistema general.

**Arranque sin expulsiones históricas:** la DB conserva en modo `active` vouchers desconectados antes del encendido, hasta intervención manual. No se revocan retroactivamente con datos antiguos, para evitar el bug v33.

**No garantía física exacta de 3min:** el timeout HotSpot puede consumir ~3min adicionales antes de que `/ip hotspot active` deje de reportar sesión; se exigen luego 3min de ausencia observada. El Dashboard refleja la ausencia solo después de que el router la detecta.

## Puesta en producción

1. Aplicar SQL. La tabla nace vacía con todo deshabilitado.
2. Tests: `npx vitest run tests/unit/hotspot-client-reconcile-v2-contract.test.ts tests/unit/hotspot-client-single-canary.test.ts tests/unit/hotspot-general-reconcile-v21-contract.test.ts`. Compilación Vercel Preview => READY.
3. Promover exclusivamente los archivos de `src/app/api/admin/wifi/vouchers/route.ts`, `src/app/api/wifi/router/reconcile/route.ts`, `src/features/wifi/WifiPageClient.tsx` desde `infra/wifi-netinstall-rebuild` a `main`, no toda la rama. Compilación Vercel Prod => READY.
4. Comprobar schedulers: `lbbs-reconcile` (33) OFF, `lbbs-presence-v2` (35) ON, `lbbs-canary-v1` (36) OFF, `lbbs-sync` ON. No imprimir fuentes con tokens.
5. En DB, habilitar **solamente router San Juan** tras verificar que se mantiene online:

```sql
insert into public.hotspot_general_reconcile_config_v21(
  router_id, enabled, enabled_at, last_queued_at, updated_at
)
select id, true, now(), null, now()
from public.hotspot_routers
where identifier = 'lbbs-la-bajadita-san-juan'
  and status = 'active' and is_active = true
  and last_seen_at > now() - interval '90 seconds'
on conflict (router_id) do update
set enabled = true, enabled_at = excluded.enabled_at,
    last_queued_at = null, updated_at = now()
returning enabled, enabled_at;
```

Esperar EXACTAMENTE 1 fila `true`. Por diseño exige un snapshot **posterior** a `enabled_at` y, por tanto, NO expira históricos instantáneamente.

6. Prueba no destructiva inmediata: nuevos snapshots del teléfono conectado y Dashboard `Conectados: 1`. En la DB vigilar `EXPIRE_VOUCHER` con `payload->>'source'='general_v21'`, estado `applied`, un voucher a la vez.
7. Prueba funcional final usando **nuevo voucher de prueba**: conectado >3min, apagar WiFi, esperar a que RouterOS detecte desconexión +3min, ver `applied`, `expired`, Dashboard 0 y rechazo del código.
8. Habilitar en otras sedes únicamente tras pruebas de su propio router. La configuración es por router, no global.

## Parada inmediata sin romper navegación

**SQL**:

```sql
update public.hotspot_general_reconcile_config_v21
set enabled=false, updated_at=now()
where router_id in (
  select id from public.hotspot_routers
  where identifier = 'lbbs-la-bajadita-san-juan'
);
```

Detiene nuevas órdenes; **no revierte** órdenes `pending/processing` ya generadas. Mantener observador 35 y sync habilitados. Para incidentes graves, además deshabilitar únicamente `lbbs-presence-v2`, pero perderá el dato de conectados real. Nunca habilitar el 33.

## Comprobaciones SQL seguras

```sql
select enabled,enabled_at,last_queued_at
from public.hotspot_general_reconcile_config_v21
where router_id=(select id from public.hotspot_routers where identifier='lbbs-la-bajadita-san-juan');
select command_type,status,created_at,processed_at,payload->>'reason' as reason
from public.hotspot_router_commands
where payload->>'source'='general_v21'
order by created_at desc limit 10;
```

No compartir tokens, voucher en claro ni credenciales. `acknowledged_at` puede ser NULL en el esquema actual; `status=applied` y `processed_at` confirman el ACK realizado.
