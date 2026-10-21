import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getStaffDesired, staffEnabled } from "@/lib/hotspot/staff-provisioning";

// Read-only, router-authenticated diagnostics. Do not return credentials,
// MAC addresses, employee information, secrets or environment variable values.
export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Router no autorizado." },
      { status: auth.status, headers: { "Cache-Control": "no-store" } });
  }

  let state: "ready" | "flag_disabled" | "provisioning_key_invalid" | "snapshot_unavailable";
  let deviceCount: number | null = null;
  const key = process.env.HOTSPOT_STAFF_PROVISIONING_KEY;
  const keyValid = typeof key === "string" && /^[a-zA-Z0-9+/]{43}=$/.test(key) &&
    Buffer.from(key, "base64").length === 32;

  if (!staffEnabled()) {
    state = "flag_disabled";
  } else if (!keyValid) {
    state = "provisioning_key_invalid";
  } else {
    try {
      const snapshot = await getStaffDesired(auth.router);
      deviceCount = snapshot.devices.length;
      state = "ready";
    } catch {
      state = "snapshot_unavailable";
    }
  }

  return NextResponse.json({ mode: "staff-health-v1", state, deviceCount }, {
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
}
