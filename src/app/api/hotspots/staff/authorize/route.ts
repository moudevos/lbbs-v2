import { timingSafeEqual, scryptSync } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";

const docPattern = /^[A-Z0-9]{8,12}$/;
const macPattern = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const fail = () => captiveJson({ error: "Credenciales no válidas o acceso no autorizado." }, { status: 403 });

export function OPTIONS() { return captiveOptions(); }

function verify(code: string, stored: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  return timingSafeEqual(scryptSync(code, salt, 64), Buffer.from(hash, "hex"));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const documentType = typeof body?.documentType === "string" ? body.documentType.toUpperCase() : "";
  const documentNumber = typeof body?.documentNumber === "string" ? body.documentNumber.trim().toUpperCase() : "";
  const code = typeof body?.code === "string" ? body.code : "";
  const mac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";
  const branchId = typeof body?.branchId === "string" ? body.branchId : "";
  if (!["DNI", "CE"].includes(documentType) || !docPattern.test(documentNumber) ||
      (documentType === "DNI" && !/^\d{8}$/.test(documentNumber)) ||
      !/^\d{6}$/.test(code) || !macPattern.test(mac) ||
      !/^[0-9a-f-]{36}$/i.test(branchId)) return fail();

  const admin = getSupabaseAdmin();
  const { data: employee } = await admin.from("employees")
    .select("id,branch_id,status").eq("branch_id", branchId)
    .ilike("document_type", documentType).eq("document_number", documentNumber)
    .eq("status", "active").maybeSingle();
  if (!employee) return fail();
  const { data: credential } = await admin.from("hotspot_staff_credentials")
    .select("id,code_hash,is_enabled").eq("employee_id", employee.id).eq("branch_id", branchId).maybeSingle();
  if (!credential?.is_enabled || !verify(code, credential.code_hash)) return fail();

  // No router commands or active sessions are created here. This stage only
  // registers a verified device, subject to the transactional two-device cap.
  const { data, error } = await admin.rpc("authorize_hotspot_staff_device", {
    p_credential_id: credential.id, p_mac: mac,
  });
  if (error || !data?.length) return captiveJson({ error: "No se pudo autorizar el dispositivo. Verifica el límite de dos equipos." }, { status: 409 });
  return captiveJson({ authorized: true, deviceCount: data[0].device_count, provisioned: false });
}
