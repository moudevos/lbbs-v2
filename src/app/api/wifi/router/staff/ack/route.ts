import { NextResponse } from "next/server";
import { authenticateRouter } from "@/lib/hotspot/router-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStaffDesired, staffEnabled } from "@/lib/hotspot/staff-provisioning";

export async function POST(request: Request) {
  const auth = await authenticateRouter(request);
  if (!auth.ok) return NextResponse.json({ error: "Router no autorizado." }, { status: auth.status });
  if (!staffEnabled()) return NextResponse.json({ error: "Staff disabled." }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (typeof body?.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision) ||
      body?.complete !== true)
    return NextResponse.json({ error: "Invalid Staff ACK." }, { status: 400 });
  try {
    const snapshot = await getStaffDesired(auth.router);
    if (snapshot.revision !== body.revision)
      return NextResponse.json({ error: "Snapshot changed, sync again." }, { status: 409 });
    const { error } = await getSupabaseAdmin().from("hotspot_staff_sync_state_v41")
      .upsert({
        router_id: auth.router.id, revision: snapshot.revision,
        synced_at: new Date().toISOString(),
      }, { onConflict: "router_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Staff ACK could not be recorded." }, { status: 503 });
  }
}
