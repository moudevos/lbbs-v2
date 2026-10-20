import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** LBBS Clientes: observe-only V2 snapshot + guarded V2.1 expiry.
 * RouterOS 35's existing contract NEVER permits p_enforce=true or queued>0.
 * Separately gated v2.1 processes at most one verified voucher per poll,
 * only after a positive presence snapshot taken after per-router activation.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDS = 256;

type ReconcileRow = {
  seen_count: number;
  missing_count: number;
  grace_count: number;
  queued_count: number;
  would_queue_count: number;
};

export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok) {
    return NextResponse.json({ error: "Router no autorizado." }, { status: authenticated.status });
  }

  const body = await request.json().catch(() => null);
  const rawIds = body?.activeVoucherIds;
  if (!Array.isArray(rawIds) || rawIds.length > MAX_IDS ||
      !rawIds.every((id: unknown) => typeof id === "string" && UUID.test(id))) {
    return NextResponse.json({ error: "Inventario del router inválido." }, { status: 400 });
  }
  const ids = rawIds.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Inventario duplicado." }, { status: 400 });
  }
  if (body?.enforce !== undefined && body.enforce !== false) {
    return NextResponse.json({ error: "Modo de control inválido." }, { status: 400 });
  }

  // FAIL-CLOSED: never call the broad v2 RPC in enforce mode.
  // The separately authorized canary route can queue only a selected UUID.
  const { data, error } = await getSupabaseAdmin().rpc("reconcile_hotspot_client_sessions_v2", {
    p_router_id: authenticated.router.id,
    p_active_voucher_ids: ids,
    p_enforce: false,
  });

  if (error) {
    // Never log vouchers, tokens, device identifiers or SQL query contents.
    console.error("[wifi/reconcile-v2] Snapshot rejected.", { code: error.code });
    return NextResponse.json({ error: "No pudimos verificar el inventario del router." }, { status: 503 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReconcileRow | undefined;
  if (!row || typeof row.seen_count !== "number" ||
      typeof row.queued_count !== "number" || typeof row.would_queue_count !== "number") {
    console.error("[wifi/reconcile-v2] Invalid database response.");
    return NextResponse.json({ error: "Respuesta de reconciliación inválida." }, { status: 503 });
  }

  // Separate service-role RPC: no mass revocation path. Database config
  // defaults disabled, mandates a post-enable positive sighting and >=3min
  // sustained absence, and rate-limits to one command per poll. This is
  // intentionally independent from the 'queued' field used by RouterOS 35.
  const { data: automation, error: autoError } = await getSupabaseAdmin().rpc(
    "process_hotspot_general_reconcile_v21", {
      p_router_id: authenticated.router.id,
      p_active_voucher_ids: ids,
    }
  );
  if (autoError) {
    console.error("[wifi/reconcile-v21] Guarded follow-up failed.", { code: autoError.code });
    return NextResponse.json({ error: "Reconciliación segura no disponible." }, { status: 503 });
  }
  const safe = (Array.isArray(automation) ? automation[0] : automation) as
    { auto_mode?: unknown; auto_queued?: unknown } | undefined;
  if (!safe || !["disabled", "enabled", "rate_limited"].includes(String(safe.auto_mode)) ||
      !Number.isInteger(safe.auto_queued) ||
      (safe.auto_queued !== 0 && safe.auto_queued !== 1)) {
    console.error("[wifi/reconcile-v21] Unexpected guarded follow-up response.");
    return NextResponse.json({ error: "Respuesta de control inválida." }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    version: 2,
    mode: "observe",
    autoMode: safe.auto_mode,
    autoQueued: safe.auto_queued,
    seen: row.seen_count,
    missing: row.missing_count,
    gracePending: row.grace_count,
    wouldExpire: row.would_queue_count,
    queued: row.queued_count,
  });
}
