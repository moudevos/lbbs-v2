import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Read-only reconciliation endpoint. Never returns employee documents, PINs or hashes.
// RouterOS must not enable Staff access solely from this snapshot.
export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  const admin = getSupabaseAdmin();
  const { data: credentials, error } = await admin.from("hotspot_staff_credentials")
    .select("id,is_enabled,employee_id").eq("branch_id", auth.router.branch_id);
  if (error) return NextResponse.json({ error: "No se pudo consultar Staff." }, { status: 500 });
  const employeeIds = (credentials ?? []).map(c => c.employee_id);
  const { data: employees, error: employeeError } = employeeIds.length
    ? await admin.from("employees").select("id,status").in("id", employeeIds)
    : { data: [], error: null };
  if (employeeError) return NextResponse.json({ error: "No se pudo verificar el personal." }, { status: 500 });
  const active = new Set((employees ?? []).filter(e => e.status === "active").map(e => e.id));
  const ids = (credentials ?? []).map(c => c.id);
  const { data: devices, error: deviceError } = ids.length
    ? await admin.from("hotspot_staff_devices").select("credential_id,mac_address,is_authorized").in("credential_id", ids)
    : { data: [], error: null };
  if (deviceError) return NextResponse.json({ error: "No se pudieron consultar dispositivos." }, { status: 500 });
  const enabled = new Set((credentials ?? []).filter(c => c.is_enabled && active.has(c.employee_id)).map(c => c.id));
  return NextResponse.json({
    revision: new Date().toISOString(),
    devices: (devices ?? []).filter(d => d.is_authorized && enabled.has(d.credential_id))
      .map(d => ({ credentialId: d.credential_id, mac: d.mac_address })),
    mode: "read-only",
  });
}
