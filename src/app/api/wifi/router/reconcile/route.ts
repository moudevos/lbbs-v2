import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";


// Hotfix: one missing RouterOS snapshot is not sufficient to revoke a voucher.
// Keep the absolute three-hour limit until the grace state machine is reliable.
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

// Self-contained route: the live production branch does not include
// src/lib/hotspot/session-policy.ts (do not deploy unrelated WiFi files).
type ExpiryReason = "absolute_deadline" | "session_missing";

function customerExpiryReason(
  voucher: Pick<Voucher, "id" | "session_expires_at">,
  observedActive: ReadonlySet<string>,
  now: number,
): ExpiryReason | null {
  if (!voucher.session_expires_at || !Number.isFinite(Date.parse(voucher.session_expires_at))) {
    return "absolute_deadline";
  }
  if (Date.parse(voucher.session_expires_at) <= now) return "absolute_deadline";
  if (!observedActive.has(voucher.id.toLowerCase())) return "session_missing";
  return null;
}

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

  // A missing RouterOS snapshot cannot cause user expiration, even for
  // historically failed commands. Retry logic is disabled until presence
  // observations are durable and we can prove a sustained disconnection.
  const now = Date.now();
  let queued = 0;
  let deferredMissing = 0;
  for (const voucher of (data ?? []) as Voucher[]) {
    if (voucher.revocation_requested_at) continue; // Dashboard REVOKE wins.
    const reason = customerExpiryReason(voucher, activeIds, now);
    if (reason === "session_missing") {
      // FAIL-SAFE: do not revoke from a single incomplete/stale RouterOS snapshot.
      // The same applies to historically active vouchers omitted in the current scan.
      // Absence-based revocation is intentionally disabled until a durable
      // observed-present -> sustained-missing transition has been validated.
      deferredMissing++;
      continue;
    }
    if (reason !== "absolute_deadline") continue;

    // Fixed server-side deadline (first LOGIN + 3 hours) remains enforceable.
    const { error: queueError } = await admin.from("hotspot_router_commands").upsert({
      router_id: auth.router.id,
      voucher_id: voucher.id,
      command_type: "EXPIRE_VOUCHER",
      payload: { source: "router_reconciliation", reason: "absolute_deadline" },
      idempotency_key: "expire:" + voucher.id,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (queueError) {
      console.error("[wifi/reconcile] No se pudo programar vencimiento absoluto.", { code: queueError.code });
      return NextResponse.json({ error: "No se pudo programar el vencimiento." }, { status: 503 });
    }
    queued++;
  }
  return NextResponse.json({ ok: true, queued, loggedOut: 0, deferredMissing });
}
