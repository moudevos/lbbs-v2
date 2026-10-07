import { NextResponse } from "next/server";

import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mac = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

export async function POST(request: Request) {
  const authenticated = await authenticateRouter(request);
  if (!authenticated.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: authenticated.status });
  const body = await request.json().catch(() => null);
  if (!uuid.test(body?.voucherId ?? "") || !mac.test(body?.mac ?? "") || !["LOGIN", "LOGOUT"].includes(body?.event)) {
    return NextResponse.json({ error: "Evento invÃ¡lido." }, { status: 400 });
  }
  const ip = typeof body.ip === "string" && body.ip.length <= 45 ? body.ip : null;
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};
  const { data, error } = await getSupabaseAdmin().rpc("record_hotspot_session_event", {
    p_router_id: authenticated.router.id, p_voucher_id: body.voucherId, p_event: body.event,
    p_mac: body.mac, p_ip: ip, p_payload: metadata,
  });
  if (error) return NextResponse.json({ error: "No se pudo registrar el evento." }, { status: 400 });
  const event = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({ status: event?.status, sessionExpiresAt: event?.session_expires_at });
}
