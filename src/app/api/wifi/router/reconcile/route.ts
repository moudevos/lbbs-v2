import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { customerExpiryReason } from "@/lib/hotspot/session-policy";

// RouterOS HotSpot keeps a disconnected client active until keepalive-timeout=3m.
// A complete authenticated snapshot therefore distinguishes clients still inside
// the reconnection window from clients whose RouterOS session has ended.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_IDS = 256;
const MAX_SERVER_ROWS = 257;

type Voucher = {
  id: string;
  device_mac: string | null;
  device_ip: string | null;
  session_expires_at: string | null;
  revocation_requested_at: string | null;
};

export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const ids = body?.activeVoucherIds;
  if (!Array.isArray(ids) || ids.length > MAX_ACTIVE_IDS ||
      !ids.every((id: unknown) => typeof id === "string" && UUID.test(id))) {
    return NextResponse.json({ error: "Inventario HotSpot inválido." }, { status: 400 });
  }
  const activeIds = new Set<string>(ids.map((id: string) => id.toLowerCase()));
  if (activeIds.size !== ids.length) {
    return NextResponse.json({ error: "Inventario HotSpot duplicado." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  // Query ALL active vouchers for THIS router; never use a truncated list to
  // decide a disconnect. In the unlikely >256 case, abort rather than guessing.
  const { data, error } = await admin.from("wifi_access_vouchers")
    .select("id,device_mac,device_ip,session_expires_at,revocation_requested_at")
    .eq("router_id", auth.router.id)
    .eq("status", "active")
    .limit(MAX_SERVER_ROWS);
  if (error) {
    console.error("[wifi/reconcile] No se pudo leer el estado de los vouchers.", { code: error.code });
    return NextResponse.json({ error: "No se pudo reconciliar la red." }, { status: 503 });
  }
  if ((data ?? []).length >= MAX_SERVER_ROWS) {
    return NextResponse.json({ error: "Inventario supera el límite seguro." }, { status: 503 });
  }

  // A LOGOUT may already have marked the voucher expired while its RouterOS
  // EXPIRE command subsequently failed. Retry those failed commands even if
  // the voucher no longer has status=active, otherwise access could linger.
  const { data: failedCommands, error: failedError } = await admin
    .from("hotspot_router_commands")
    .select("id,updated_at")
    .eq("router_id", auth.router.id)
    .eq("command_type", "EXPIRE_VOUCHER")
    .eq("status", "failed")
    .limit(50);
  if (failedError) {
    console.error("[wifi/reconcile] No se pudieron revisar órdenes fallidas.", { code: failedError.code });
    return NextResponse.json({ error: "No se pudo revisar la cola de expiración." }, { status: 503 });
  }

  const now = Date.now();
  for (const command of failedCommands ?? []) {
    // Give the operator and router time to recover; do not hammer Vercel/RouterOS.
    if (now - new Date(command.updated_at).getTime() < 90_000) continue;
    const { error: retryError } = await admin.from("hotspot_router_commands")
      .update({
        status: "pending",
        attempts: 0,
        claimed_at: null,
        processed_at: null,
        error_code: null,
        error_message: null,
        available_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", command.id)
      .eq("router_id", auth.router.id)
      .eq("status", "failed");
    if (retryError) {
      console.error("[wifi/reconcile] Reprogramación de expiración fallida.", { code: retryError.code });
      return NextResponse.json({ error: "No se pudo reprogramar expiración." }, { status: 503 });
    }
  }

  let queued = 0;
  let loggedOut = 0;
  for (const voucher of (data ?? []) as Voucher[]) {
    if (voucher.revocation_requested_at) continue; // Dashboard REVOKE has priority.
    const reason = customerExpiryReason(voucher, activeIds, now);
    if (!reason) continue;

    // Existing lbbs-sync supports EXPIRE_VOUCHER, removing local user/cookie
    // and active session. Idempotency prevents duplicate commands across polls.
    const { error: queueError } = await admin.from("hotspot_router_commands").upsert({
      router_id: auth.router.id,
      voucher_id: voucher.id,
      command_type: "EXPIRE_VOUCHER",
      payload: { source: "router_reconciliation", reason },
      idempotency_key: "expire:" + voucher.id,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (queueError) {
      console.error("[wifi/reconcile] No se pudo programar expiración.", { code: queueError.code });
      return NextResponse.json({ error: "No se pudo programar la desconexión." }, { status: 503 });
    }
    // For absent RouterOS sessions: use the existing signed-router LOGOUT RPC.
    // It records the genuine state transition, so Dashboard no longer reports
    // disconnected devices as online. Reconciliation never fabricates a LOGIN.
    if (reason === "session_missing") {
      if (!voucher.device_mac) {
        console.error("[wifi/reconcile] Voucher active lacks a device MAC.");
        return NextResponse.json({ error: "Sesión incompleta." }, { status: 503 });
      }
      const { error: eventError } = await admin.rpc("record_hotspot_session_event", {
        p_router_id: auth.router.id,
        p_voucher_id: voucher.id,
        p_event: "LOGOUT",
        p_mac: voucher.device_mac,
        p_ip: voucher.device_ip,
        p_payload: { source: "router_active_snapshot", reason: "keepalive_expired" },
      });
      if (eventError) {
        console.error("[wifi/reconcile] No se pudo registrar LOGOUT.", { code: eventError.code });
        return NextResponse.json({ error: "No se pudo cerrar la sesión." }, { status: 503 });
      }
      loggedOut++;
    }

    queued++;
  }
  return NextResponse.json({ ok: true, queued, loggedOut });
}
