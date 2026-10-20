import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** LBBS Clientes: router-authenticated, observation-first presence reconciliation.
 * Enforcement requires BOTH HOTSPOT_RECONCILE_V2_ENFORCE=true and body.enforce=true.
 * Do not switch to enforcement before supervised canary tests pass.
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
  if (body?.enforce !== undefined && typeof body.enforce !== "boolean") {
    return NextResponse.json({ error: "Modo de control inválido." }, { status: 400 });
  }

  // Server-side switch OFF by default, regardless of what RouterOS sends.
  const mayEnforce = process.env.HOTSPOT_RECONCILE_V2_ENFORCE === "true";
  const enforce = body?.enforce === true && mayEnforce;
  const { data, error } = await getSupabaseAdmin().rpc("reconcile_hotspot_client_sessions_v2", {
    p_router_id: authenticated.router.id,
    p_active_voucher_ids: ids,
    p_enforce: enforce,
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

  return NextResponse.json({
    ok: true,
    version: 2,
    mode: enforce ? "enforce" : "observe",
    seen: row.seen_count,
    missing: row.missing_count,
    gracePending: row.grace_count,
    wouldExpire: row.would_queue_count,
    queued: row.queued_count,
  });
}
