import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getStaffDesired, staffEnabled } from "@/lib/hotspot/staff-provisioning";

export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  if (!staffEnabled())
    return NextResponse.json({ error: "Staff provisioning disabled." }, { status: 503 });
  try {
    const snapshot = await getStaffDesired(auth.router);
    // Secrets returned ONLY to the authenticated router over TLS. Never logged.
    return NextResponse.json({ mode: "staff-v41", ...snapshot }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Staff snapshot unavailable." }, { status: 503 });
  }
}
