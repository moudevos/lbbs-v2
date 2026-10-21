import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { captiveJson, captiveOptions } from "@/lib/hotspot/cors";
import {
  getStaffDesired, normalizeStaffDocument, staffAttemptKey,
  staffEnabled, staffMac, verifyStaffPin,
} from "@/lib/hotspot/staff-provisioning";

const headers = { "Cache-Control": "no-store" };
const deny = () => captiveJson({ error: "Credenciales o dispositivo no autorizados." }, {
  status: 403, headers,
});
export function OPTIONS() { return captiveOptions(); }

export async function POST(request: Request) {
  if (!staffEnabled()) return captiveJson({ error: "WiFi Staff aún no está habilitado." },
    { status: 503, headers });
  const body = await request.json().catch(() => null);
  const identity = normalizeStaffDocument(body?.documentType, body?.documentNumber);
  const pin = body?.code;
  const mac = typeof body?.mac === "string" ? body.mac.trim().toUpperCase() : "";
  const routerIdentifier = typeof body?.routerIdentifier === "string" ? body.routerIdentifier : "";
  const ip = typeof body?.ip === "string" ? body.ip.trim() : "";
  if (!identity || !staffMac.test(mac) || !/^10\.10\.20\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/.test(ip) || !/^[a-zA-Z0-9-]{6,80}$/.test(routerIdentifier) ||
      typeof pin !== "string" || !/^\d{6}$/.test(pin)) return deny();

  const admin = getSupabaseAdmin();
  const { data: router } = await admin.from("hotspot_routers")
    .select("id,branch_id,status,is_active")
    .eq("identifier", routerIdentifier).eq("status", "active").eq("is_active", true)
    .maybeSingle();
  if (!router) return deny();

  const { data: employee, error: employeeError } = await admin.from("employees")
    .select("id").eq("branch_id", router.branch_id)
    .ilike("document_type", identity.type)
    .eq("document_number", identity.document).eq("status", "active").maybeSingle();
  if (employeeError) return captiveJson({ error: "No se pudo validar Staff." },
    { status: 503, headers });

  const { data: credential, error: credentialError } = employee
    ? await admin.from("hotspot_staff_credentials")
        .select("id,code_hash,is_enabled").eq("branch_id", router.branch_id)
        .eq("employee_id", employee.id).maybeSingle()
    : { data: null, error: null };
  if (credentialError) return captiveJson({ error: "No se pudo validar Staff." },
    { status: 503, headers });
  const pinValid = Boolean(credential?.is_enabled && verifyStaffPin(pin, credential.code_hash));
  // Rate limit BOTH identity and MAC, including invalid PIN, before returning any secret.
  const [identityLimit, macLimit] = await Promise.all([
    admin.rpc("staff_auth_attempt", {
      p_router: router.id, p_subject: staffAttemptKey(identity.type + ":" + identity.document),
      p_valid: pinValid,
    }),
    admin.rpc("staff_auth_attempt", {
      p_router: router.id, p_subject: staffAttemptKey("MAC:" + mac),
      p_valid: pinValid,
    }),
  ]);
  if (identityLimit.error || macLimit.error)
    return captiveJson({ error: "No se pudo validar Staff." }, { status: 503, headers });
  if (!identityLimit.data || !macLimit.data || !pinValid || !credential) return deny();

  // Auto-trust ONLY a physically observed hotspot host from the authenticated
  // MikroTik's Staff bridge. Browser MAC/IP alone never grants a slot.
  // This RPC locks the credential: parallel first/second logins cannot exceed 2.
  // An admin-revoked MAC is deliberately NOT auto-reactivated.
  const enrollment = await admin.rpc("enroll_hotspot_staff_seen_device_v42", {
    p_router_id: router.id, p_credential_id: credential.id, p_mac: mac, p_ip: ip,
  });
  if (enrollment.error) {
    if (["23514", "23505"].includes(enrollment.error.code))
      return captiveJson({
        error: "Dispositivo no autorizado, no detectado en la red o límite de dos equipos alcanzado. Contacta al administrador.",
      }, { status: 403, headers });
    return captiveJson({ error: "No se pudo comprobar el dispositivo Staff." },
      { status: 503, headers });
  }
  const device = Array.isArray(enrollment.data) ? enrollment.data[0] : null;
  if (!device?.device_id) return deny();

  try {
    const desired = await getStaffDesired(router);
    const record = desired.devices.find(d => d.deviceId === device.device_id &&
      d.credentialId === credential.id && d.mac === mac);
    if (!record) return deny();
    const { data: state, error: stateError } = await admin.from("hotspot_staff_sync_state_v41")
      .select("revision,synced_at").eq("router_id", router.id).maybeSingle();
    if (stateError) throw stateError;
    // Only release a local CHAP credential after the router has ACKed
    // the SAME current roster (new code/device/revocations force resync).
    if (!state || state.revision !== desired.revision ||
        Date.now() - new Date(state.synced_at).getTime() > 120_000)
      return captiveJson({ error: "El dispositivo aún se está sincronizando. Intenta nuevamente." },
        { status: 409, headers });
    return captiveJson({
      status: "ready", username: record.username, password: record.password,
    }, { headers });
  } catch {
    return captiveJson({ error: "No se pudo preparar el acceso Staff." },
      { status: 503, headers });
  }
}
