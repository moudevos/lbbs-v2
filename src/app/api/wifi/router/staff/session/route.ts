import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { staffEnabled, staffMac } from "@/lib/hotspot/staff-provisioning";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  if (!staffEnabled()) return NextResponse.json({ error: "Staff no habilitado." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const event = body?.event;
  const credentialId = body?.credentialId;
  const deviceId = body?.deviceId;
  const mac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";
  const key = typeof body?.sessionKey === "string" ? body.sessionKey : "";

  if (!["LOGIN","LOGOUT"].includes(event) || !uuid.test(credentialId ?? "") ||
      !uuid.test(deviceId ?? "") || !staffMac.test(mac) ||
      (event === "LOGIN" && (key.length < 10 || key.length > 160)))
    return NextResponse.json({ error: "Evento Staff inválido." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: credential, error: cError } = await admin.from("hotspot_staff_credentials")
    .select("id,is_enabled,employee_id").eq("id", credentialId)
    .eq("branch_id", auth.router.branch_id).maybeSingle();
  if (cError || !credential) return NextResponse.json({ error: "Credencial fuera de sede." }, { status: 403 });
  const { data: employee } = await admin.from("employees")
    .select("id,status,branch_id").eq("id", credential.employee_id).maybeSingle();
  const { data: device } = await admin.from("hotspot_staff_devices")
    .select("id,is_authorized").eq("id", deviceId).eq("credential_id", credentialId)
    .eq("mac_address", mac).maybeSingle();
  if (!device) return NextResponse.json({ error: "Dispositivo desconocido." }, { status: 403 });

  if (event === "LOGIN") {
    if (!credential.is_enabled || employee?.status !== "active" ||
        employee.branch_id !== auth.router.branch_id || !device.is_authorized)
      return NextResponse.json({ error: "Staff revocado." }, { status: 403 });
    // The (router_id, router_session_key) uniqueness index is PARTIAL.
    // Supabase upsert(... onConflict=...) cannot infer that partial index.
    // INSERT + handling 23505 preserves idempotency without a 42P10 failure.
    const { error } = await admin.from("hotspot_staff_sessions").insert({
      credential_id: credentialId, device_id: device.id,
      router_id: auth.router.id, router_session_key: key,
    });
    if (error && error.code !== "23505")
      return NextResponse.json({ error: "No se registró el inicio." }, { status: 500 });
  } else {
    // RouterOS on-logout cannot recover the random LOGIN key after reboot.
    // Close only currently open sessions of the exact device on the same router.
    const { error } = await admin.from("hotspot_staff_sessions")
      .update({ ended_at: new Date().toISOString(), end_reason: "LOGOUT" })
      .eq("router_id", auth.router.id).eq("credential_id", credentialId)
      .eq("device_id", device.id).is("ended_at", null);
    if (error) return NextResponse.json({ error: "No se registró el cierre." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
