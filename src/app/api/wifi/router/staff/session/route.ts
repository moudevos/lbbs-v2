import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
const mac = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const uuid = /^[0-9a-f-]{36}$/i;
export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  if (process.env.LBBS_STAFF_ROUTER_AUTH_ENABLED !== "true")
    return NextResponse.json({ error: "Staff no habilitado." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const event = body?.event;
  const credentialId = body?.credentialId;
  const deviceMac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";
  const key = typeof body?.sessionKey === "string" ? body.sessionKey : "";
  if (!["LOGIN", "LOGOUT"].includes(event) || !uuid.test(credentialId ?? "") ||
      !mac.test(deviceMac) || key.length < 1 || key.length > 160)
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: credential } = await db.from("hotspot_staff_credentials")
    .select("id,is_enabled").eq("id", credentialId).eq("branch_id", auth.router.branch_id).maybeSingle();
  if (!credential) return NextResponse.json({ error: "Sede no autorizada." }, { status: 403 });
  const { data: device } = await db.from("hotspot_staff_devices")
    .select("id,is_authorized").eq("credential_id", credentialId).eq("mac_address", deviceMac).maybeSingle();
  if (!device) return NextResponse.json({ error: "Dispositivo desconocido." }, { status: 403 });
  if (event === "LOGIN") {
    if (!credential.is_enabled || !device.is_authorized)
      return NextResponse.json({ error: "Credencial o dispositivo revocado." }, { status: 403 });
    const { error } = await db.from("hotspot_staff_sessions").upsert({
      credential_id: credentialId, device_id: device.id, router_id: auth.router.id,
      router_session_key: key,
    }, { onConflict: "router_id,router_session_key", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: "No se registró la sesión." }, { status: 500 });
  } else {
    const { error } = await db.from("hotspot_staff_sessions")
      .update({ ended_at: new Date().toISOString(), end_reason: "LOGOUT" })
      .eq("router_id", auth.router.id).eq("router_session_key", key)
      .eq("credential_id", credentialId).is("ended_at", null);
    if (error) return NextResponse.json({ error: "No se registró la salida." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
