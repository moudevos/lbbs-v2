import "server-only";

import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Separate secret from Clientes. A missing key means NO credentials can be issued.
function signingKey(): Buffer {
  const raw = process.env.HOTSPOT_STAFF_PROVISIONING_KEY;
  if (!raw) throw new Error("Staff provisioning key not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Staff provisioning key must be 32 bytes");
  return key;
}

export function staffEnabled() {
  return process.env.LBBS_STAFF_ROUTER_AUTH_ENABLED === "true";
}

export function normalizeStaffDocument(type: unknown, value: unknown) {
  const kind = typeof type === "string" ? type.trim().toUpperCase() : "";
  const document = typeof value === "string" ? value.replace(/\s/g, "").toUpperCase() : "";
  if (kind === "DNI" && /^\d{8}$/.test(document)) return { type: "DNI", document };
  if ((kind === "CE" || kind === "CEX") && /^[A-Z0-9]{9,12}$/.test(document))
    return { type: "CE", document };
  return null;
}

export const staffMac = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
export function verifyStaffPin(code: unknown, stored: string) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") ||
      !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const digest = scryptSync(code, salt, 64);
  return timingSafeEqual(digest, Buffer.from(hash, "hex"));
}

export function staffAttemptKey(text: string) {
  // Pseudonymization only; do not log the original document or MAC.
  return createHash("sha256").update(text).digest("hex");
}

type ProvisionedStaffDevice = {
  deviceId: string;
  credentialId: string;
  mac: string;
  username: string;
  password: string;
  profile: "lbbs-staff-user-profile";
};

// Server-only deterministic secret for a registered device. PIN rotation
// changes code_hash => router password changes on next sync.
function passwordFor(routerId: string, deviceId: string, codeHash: string) {
  return createHmac("sha256", signingKey())
    .update(["LBBS-STAFF-CHAP-V1", routerId, deviceId, codeHash].join(":"))
    .digest("hex").slice(0, 40);
}

export async function getStaffDesired(router: { id: string; branch_id: string }) {
  const admin = getSupabaseAdmin();
  const { data: credentials, error } = await admin.from("hotspot_staff_credentials")
    .select("id,employee_id,branch_id,code_hash,is_enabled")
    .eq("branch_id", router.branch_id);
  if (error) throw new Error("Staff credentials unavailable");

  const employeesIds = (credentials ?? []).map(c => c.employee_id);
  const { data: employees, error: employeesError } = employeesIds.length
    ? await admin.from("employees").select("id,branch_id,status").in("id", employeesIds)
    : { data: [], error: null };
  if (employeesError) throw new Error("Staff employees unavailable");

  const liveEmployees = new Set((employees ?? [])
    .filter(e => e.branch_id === router.branch_id && e.status === "active").map(e => e.id));
  const enabled = (credentials ?? []).filter(c => c.is_enabled &&
    c.branch_id === router.branch_id && liveEmployees.has(c.employee_id));
  const ids = enabled.map(c => c.id);
  const { data: devices, error: deviceError } = ids.length
    ? await admin.from("hotspot_staff_devices")
        .select("id,credential_id,mac_address,is_authorized").in("credential_id", ids)
    : { data: [], error: null };
  if (deviceError) throw new Error("Staff devices unavailable");

  // Must never publish a partial desired snapshot: fail closed.
  const authorized = (devices ?? []).filter(d => d.is_authorized);
  const count = new Map<string, number>();
  for (const d of authorized) count.set(d.credential_id, (count.get(d.credential_id) ?? 0) + 1);
  if ([...count.values()].some(n => n > 2)) throw new Error("Staff device limit violated");

  const byId = new Map(enabled.map(c => [c.id, c]));
  const listed: ProvisionedStaffDevice[] = authorized.map(d => {
    const credential = byId.get(d.credential_id);
    const mac = d.mac_address?.trim().toUpperCase();
    if (!credential || !staffMac.test(mac ?? "")) throw new Error("Staff device is invalid");
    return {
      deviceId: d.id, credentialId: credential.id, mac,
      username: "sf_" + d.id.replace(/-/g, ""),
      password: passwordFor(router.id, d.id, credential.code_hash),
      profile: "lbbs-staff-user-profile",
    };
  }).sort((a, b) => a.deviceId.localeCompare(b.deviceId));

  const revision = createHash("sha256")
    .update(JSON.stringify(listed)).digest("hex");
  return { revision, devices: listed };
}
