import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Dedicated canary route. Does not expose/accept a target voucher ID.
// Supabase service-role operators must explicitly arm exactly one voucher.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Observe = { seen_count: number; missing_count: number; queued_count: number };
type Canary = { canary_state: string; queued_count: number };

export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (body?.canary !== true || body?.enforce !== false) {
    return NextResponse.json({ error: "Modo canario no autorizado." }, { status: 400 });
  }
  const values = body?.activeVoucherIds;
  if (!Array.isArray(values) || values.length > 256 ||
      !values.every((value: unknown) => typeof value === "string" && UUID.test(value))) {
    return NextResponse.json({ error: "Inventario inválido." }, { status: 400 });
  }
  const activeIds = values.map((value: string) => value.toLowerCase());
  if (new Set(activeIds).size !== activeIds.length) {
    return NextResponse.json({ error: "Inventario duplicado." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // Always update observation in no-enforcement mode FIRST, even for the canary.
  const { data: observation, error: obsError } = await db.rpc(
    "reconcile_hotspot_client_sessions_v2", {
      p_router_id: auth.router.id,
      p_active_voucher_ids: activeIds,
      p_enforce: false,
    });
  if (obsError) {
    console.error("[wifi/canary] Observer rejected snapshot.", { code: obsError.code });
    return NextResponse.json({ error: "Inventario rechazado." }, { status: 503 });
  }

  const observed = (Array.isArray(observation) ? observation[0] : observation) as Observe | undefined;
  if (!observed || observed.queued_count !== 0) {
    console.error("[wifi/canary] Observer not safe.");
    return NextResponse.json({ error: "Controlador no seguro." }, { status: 503 });
  }

  // This RPC can queue ONLY the one explicitly armed test voucher, after a
  // new positive sighting and at least 3 minutes of sustained absence.
  const { data, error } = await db.rpc("process_hotspot_client_canary_v1", {
    p_router_id: auth.router.id,
    p_active_voucher_ids: activeIds,
  });
  if (error) {
    console.error("[wifi/canary] Restricted canary check failed.", { code: error.code });
    return NextResponse.json({ error: "Prueba canaria no disponible." }, { status: 503 });
  }
  const result = (Array.isArray(data) ? data[0] : data) as Canary | undefined;
  if (!result || typeof result.canary_state !== "string" ||
      !Number.isInteger(result.queued_count) || result.queued_count < 0 ||
      result.queued_count > 1) {
    console.error("[wifi/canary] Invalid canary result.");
    return NextResponse.json({ error: "Respuesta de prueba inválida." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    version: 1,
    mode: "canary",
    state: result.canary_state,
    queued: result.queued_count,
    seen: observed.seen_count,
    missing: observed.missing_count,
  });
}
