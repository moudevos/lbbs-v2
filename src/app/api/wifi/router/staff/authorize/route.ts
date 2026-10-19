import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const macPattern = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function verify(code: string, stored: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  return timingSafeEqual(scryptSync(code, salt, 64), Buffer.from(hash, "hex"));
}

const deny = () => NextResponse.json({ error: "Acceso Staff no autorizado." }, { status: 403 });

export async function POST(request: Request) {
  // Disabled until router-side Staff captive installer is explicitly enabled.
  if (process.env.LBBS_STAFF_ROUTER_AUTH_ENABLED !== "true") {
    return NextResponse.json({ error: "Autenticación Staff aún no habilitada." }, { status: 503 });
  }
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const type = typeof body?.documentType === "string" ? body.documentType.toUpperCase() : "";
  const document = typeof body?.documentNumber === "string" ? body.documentNumber.trim().toUpperCase() : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const mac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";
  if (!["DNI", "CE"].includes(type) || !/^[A-Z0-9]{8,12}$/.test(document) ||
      (type === "DNI" && !/^\d{8}$/.test(document)) || !/^\d{6}$/.test(code) ||
      !macPattern.test(mac) || !uuidPattern.test(auth.router.branch_id)) return deny();

  const admin = getSupabaseAdmin();
  const { data: employee } = await admin.from("employees")
    .select("id").eq("branch_id", auth.router.branch_id)
    .ilike("document_type", type).eq("document_number", document)
    .eq("status", "active").maybeSingle();
  if (!employee) return deny();
  const { data: credential } = await admin.from("hotspot_staff_credentials")
    .select("id,code_hash,is_enabled").eq("employee_id", employee.id)
    .eq("branch_id", auth.router.branch_id).maybeSingle();
  const valid = Boolean(credential?.is_enabled && verify(code, credential.code_hash));
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  // Both identity and MAC are independently rate-limited per authenticated router.
  const [byDocument, byDevice] = await Promise.all([
    admin.rpc("staff_auth_attempt", { p_router: auth.router.id, p_subject: hash(type + ":" + document), p_valid: valid }),
    admin.rpc("staff_auth_attempt", { p_router: auth.router.id, p_subject: hash("MAC:" + mac), p_valid: valid }),
  ]);
  if (byDocument.error || byDevice.error || !byDocument.data || !byDevice.data || !valid || !credential) return deny();

  const { data, error } = await admin.rpc("authorize_hotspot_staff_device", {
    p_credential_id: credential.id, p_mac: mac,
  });
  if (error || !data?.length) return deny();

  // This endpoint verifies identity and reserves a device slot. It does not
  // install RouterOS users or open a captive session.
  return NextResponse.json({ authorized: true, provisioned: false, deviceCount: data[0].device_count });
}
