import { randomInt, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const macPattern = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const codePattern = /^\d{6}$/;
const db = () => getSupabaseAdmin();

function hashCode(code: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(code, salt, 64).toString("hex")}`;
}

export function verifyStaffCode(code: string, stored: string) {
  if (!codePattern.test(code)) return false;
  const [algorithm, salt, expected] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !expected || !/^[0-9a-f]{128}$/.test(expected)) return false;
  const actual = scryptSync(code, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

async function authenticate() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  return null;
}

export async function GET(request: Request) {
  const rejected = await authenticate();
  if (rejected) return rejected;
  const branchId = new URL(request.url).searchParams.get("branchId");
  if (!branchId || !uuid.test(branchId)) return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
  const { data: credentials, error } = await db().from("hotspot_staff_credentials")
    .select("id,employee_id,branch_id,code_last2,is_enabled,created_at,updated_at,revoked_at")
    .eq("branch_id", branchId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "No se pudieron consultar las credenciales Staff." }, { status: 500 });
  const employeeIds = (credentials ?? []).map(row => row.employee_id);
  const credentialIds = (credentials ?? []).map(row => row.id);
  const [employees, devices] = await Promise.all([
    employeeIds.length ? db().from("employees").select("id,full_name,document_type,document_number,status").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    credentialIds.length ? db().from("hotspot_staff_devices").select("id,credential_id,mac_address,is_authorized,registered_at,revoked_at").in("credential_id", credentialIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (employees.error || devices.error) return NextResponse.json({ error: "No se pudieron consultar los datos Staff." }, { status: 500 });
  return NextResponse.json({ data: (credentials ?? []).map(row => ({
    ...row, employee: (employees.data ?? []).find(e => e.id === row.employee_id) ?? null,
    devices: (devices.data ?? []).filter(d => d.credential_id === row.id),
  })) });
}

export async function POST(request: Request) {
  const rejected = await authenticate();
  if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  const branchId = body?.branchId;
  const employeeId = body?.employeeId;
  if (!uuid.test(branchId ?? "") || !uuid.test(employeeId ?? "")) return NextResponse.json({ error: "Empleado o sede inválidos." }, { status: 400 });
  const { data: employee, error: employeeError } = await db().from("employees")
    .select("id,branch_id,status,document_type,document_number").eq("id", employeeId).eq("branch_id", branchId).maybeSingle();
  if (employeeError || !employee || employee.status !== "active" || !employee.document_number || !["DNI","CE"].includes((employee.document_type ?? "").toUpperCase())) {
    return NextResponse.json({ error: "El empleado debe estar activo, pertenecer a la sede y tener DNI o CE registrado." }, { status: 400 });
  }
  const { data: existing } = await db().from("hotspot_staff_credentials").select("id").eq("employee_id", employeeId).maybeSingle();
  if (existing) return NextResponse.json({ error: "El empleado ya tiene una credencial. Usa la rotación de código." }, { status: 409 });
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  const { data, error } = await db().from("hotspot_staff_credentials").insert({
    employee_id: employeeId, branch_id: branchId, code_hash: hashCode(code), code_last2: code.slice(-2),
  }).select("id,employee_id,branch_id,code_last2,is_enabled").single();
  if (error) return NextResponse.json({ error: "No se pudo emitir la credencial." }, { status: 500 });
  return NextResponse.json({ data, code, warning: "El código se muestra una sola vez; el acceso aún no se provisiona en MikroTik." }, { status: 201 });
}

export async function PATCH(request: Request) {
  const rejected = await authenticate();
  if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!uuid.test(body?.credentialId ?? "")) return NextResponse.json({ error: "Credencial inválida." }, { status: 400 });
  const { data: current } = await db().from("hotspot_staff_credentials").select("id,branch_id").eq("id", body.credentialId).maybeSingle();
  if (!current || !uuid.test(body?.branchId ?? "") || current.branch_id !== body.branchId) return NextResponse.json({ error: "Credencial no pertenece a la sede." }, { status: 404 });
  if (body.action === "rotate") {
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const { error } = await db().from("hotspot_staff_credentials").update({
      code_hash: hashCode(code), code_last2: code.slice(-2), updated_at: new Date().toISOString(),
    }).eq("id", current.id);
    return error ? NextResponse.json({ error: "No se pudo rotar el código." }, { status: 500 }) : NextResponse.json({ ok: true, code });
  }
  if (body.action === "disable" || body.action === "enable") {
    const enabled = body.action === "enable";
    const { error } = await db().from("hotspot_staff_credentials").update({
      is_enabled: enabled, revoked_at: enabled ? null : new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", current.id);
    return error ? NextResponse.json({ error: "No se pudo actualizar el acceso." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (body.action === "revoke_device") {
    const mac = typeof body.mac === "string" ? body.mac.toUpperCase() : "";
    if (!macPattern.test(mac)) return NextResponse.json({ error: "MAC inválida." }, { status: 400 });
    const { error } = await db().from("hotspot_staff_devices").update({ is_authorized: false, revoked_at: new Date().toISOString() }).eq("credential_id", current.id).eq("mac_address", mac);
    return error ? NextResponse.json({ error: "No se pudo revocar el dispositivo." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Acción no admitida." }, { status: 400 });
}
